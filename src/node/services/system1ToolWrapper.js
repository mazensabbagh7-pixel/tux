/**
 * System1 bash output compaction: wraps bash/bash_output/task_await tools so
 * large outputs are automatically filtered by a lightweight "System 1" LLM
 * before being returned to the main conversation.
 *
 * Extracted from the ~660-line IIFE that lived inside AIService.streamMessage().
 */
import * as path from "path";
import { applySystem1KeepRangesToOutput, formatNumberedLinesForSystem1, formatSystem1BashFilterNotice, getHeuristicKeepRangesForBashOutput, splitBashOutputLines, } from "@/node/services/system1/bashOutputFiltering";
import { decideBashOutputCompaction } from "@/node/services/system1/bashCompactionPolicy";
import { truncateBashOutput } from "@/common/utils/truncateBashOutput";
import { runSystem1KeepRangesForBashOutput } from "@/node/services/system1/system1AgentRunner";
import { formatBashOutputReport, tryParseBashOutputReport, } from "@/node/services/tools/bashTaskReport";
import { DEFAULT_TASK_SETTINGS, SYSTEM1_BASH_OUTPUT_COMPACTION_LIMITS } from "@/common/types/tasks";
import { normalizeGatewayModel } from "@/common/utils/ai/models";
import { buildProviderOptions } from "@/common/utils/ai/providerOptions";
import { createDisplayUsage } from "@/common/utils/tokens/displayUsage";
import { enforceThinkingPolicy } from "@/common/utils/thinking/policy";
import { cloneToolPreservingDescriptors } from "@/common/utils/tools/cloneToolPreservingDescriptors";
import { log } from "./log";
/**
 * Wrap bash / bash_output / task_await tools with System1 output compaction.
 * Returns the wrapped tool map (or the originals unchanged if bash is missing).
 */
export function wrapToolsWithSystem1(opts) {
    const { tools } = opts;
    const baseBashTool = tools.bash;
    if (!baseBashTool)
        return tools;
    const bashExecuteFn = getExecuteFn(baseBashTool);
    if (!bashExecuteFn)
        return tools;
    const bashOutputExecuteFn = getExecuteFn(tools.bash_output);
    const taskAwaitExecuteFn = getExecuteFn(tools.task_await);
    // Resolve System1 model configuration
    const system1Ctx = buildSystem1ModelContext(opts);
    // Lazy-create and cache the System1 model for the duration of this stream.
    let cachedSystem1Model;
    let cachedSystem1ModelFailed = false;
    const getSystem1Model = async () => {
        if (!system1Ctx.modelString) {
            return { modelString: opts.effectiveModelString, model: opts.primaryModel };
        }
        if (cachedSystem1Model)
            return cachedSystem1Model;
        if (cachedSystem1ModelFailed)
            return undefined;
        const resolvedModelString = opts.resolveGatewayModelString(system1Ctx.modelString, undefined, system1Ctx.explicitGateway);
        const created = await opts.createModel(resolvedModelString, opts.muxProviderOptions);
        if (!created.success) {
            cachedSystem1ModelFailed = true;
            log.debug("[system1] Failed to create System 1 model", {
                workspaceId: opts.workspaceId,
                system1Model: system1Ctx.modelString,
                error: created.error,
            });
            return undefined;
        }
        cachedSystem1Model = { modelString: resolvedModelString, model: created.data };
        return cachedSystem1Model;
    };
    // Core filtering function shared by all three wrapped tools.
    const maybeFilter = (params) => maybeFilterBashOutput({
        ...params,
        opts,
        system1Ctx,
        getSystem1Model,
    });
    // Build wrapped tool map
    const wrappedTools = {
        ...tools,
        bash: wrapBashTool(baseBashTool, bashExecuteFn, maybeFilter, opts.workspaceId),
    };
    if (tools.bash_output && bashOutputExecuteFn) {
        wrappedTools.bash_output = wrapBashOutputTool(tools.bash_output, bashOutputExecuteFn, maybeFilter, opts.workspaceId);
    }
    if (tools.task_await && taskAwaitExecuteFn) {
        wrappedTools.task_await = wrapTaskAwaitTool(tools.task_await, taskAwaitExecuteFn, maybeFilter, opts.workspaceId);
    }
    return wrappedTools;
}
// ---------------------------------------------------------------------------
// Tool helpers (moved from module-level in aiService.ts)
// ---------------------------------------------------------------------------
/** Concatenate an extra note onto a tool result's existing note. */
function appendToolNote(existing, extra) {
    return existing ? `${existing}\n\n${extra}` : extra;
}
function getExecuteFn(tool) {
    if (!tool)
        return undefined;
    const record = tool;
    const execute = record.execute;
    return typeof execute === "function" ? execute : undefined;
}
function buildSystem1ModelContext(opts) {
    const raw = typeof opts.system1Model === "string" ? opts.system1Model.trim() : "";
    const modelString = raw ? normalizeGatewayModel(raw) : "";
    const explicitGateway = raw.startsWith("mux-gateway:");
    const effectiveModelForThinking = modelString || opts.modelString;
    const thinkingLevel = enforceThinkingPolicy(effectiveModelForThinking, opts.system1ThinkingLevel ?? "off");
    return { modelString, explicitGateway, thinkingLevel };
}
async function maybeFilterBashOutput(params) {
    const { opts, system1Ctx, getSystem1Model, ...filterParams } = params;
    if (typeof filterParams.output !== "string" || filterParams.output.length === 0) {
        return undefined;
    }
    // Hard truncation safety net — bounds output even when System1 is skipped.
    const hardTruncation = truncateBashOutput(filterParams.output);
    const returnHardTruncationIfNeeded = () => {
        if (!hardTruncation.truncated)
            return undefined;
        return {
            filteredOutput: hardTruncation.output,
            notice: `Output exceeded hard limits (${hardTruncation.originalLines} lines, ${hardTruncation.originalBytes} bytes). Showing last ${hardTruncation.output.split("\n").length} lines.`,
        };
    };
    let system1TimedOut = false;
    try {
        const taskSettings = opts.taskSettings;
        const minLines = taskSettings.bashOutputCompactionMinLines ??
            SYSTEM1_BASH_OUTPUT_COMPACTION_LIMITS.bashOutputCompactionMinLines.default;
        const minTotalBytes = taskSettings.bashOutputCompactionMinTotalBytes ??
            SYSTEM1_BASH_OUTPUT_COMPACTION_LIMITS.bashOutputCompactionMinTotalBytes.default;
        const userMaxKeptLines = taskSettings.bashOutputCompactionMaxKeptLines ??
            SYSTEM1_BASH_OUTPUT_COMPACTION_LIMITS.bashOutputCompactionMaxKeptLines.default;
        const heuristicFallbackEnabled = taskSettings.bashOutputCompactionHeuristicFallback ??
            DEFAULT_TASK_SETTINGS.bashOutputCompactionHeuristicFallback ??
            true;
        const timeoutMs = taskSettings.bashOutputCompactionTimeoutMs ??
            SYSTEM1_BASH_OUTPUT_COMPACTION_LIMITS.bashOutputCompactionTimeoutMs.default;
        const lines = splitBashOutputLines(filterParams.output);
        const bytes = Buffer.byteLength(filterParams.output, "utf-8");
        const decision = decideBashOutputCompaction({
            toolName: filterParams.toolName,
            script: filterParams.script,
            displayName: filterParams.displayName,
            planFilePath: opts.effectiveMode === "plan" ? opts.planFilePath : undefined,
            totalLines: lines.length,
            totalBytes: bytes,
            minLines,
            minTotalBytes,
            maxKeptLines: userMaxKeptLines,
        });
        const { triggeredByLines, triggeredByBytes } = decision;
        if (!triggeredByLines && !triggeredByBytes) {
            return returnHardTruncationIfNeeded();
        }
        if (!decision.shouldCompact) {
            log.debug("[system1] Skipping bash output compaction", {
                workspaceId: opts.workspaceId,
                toolName: filterParams.toolName,
                skipReason: decision.skipReason,
                intent: decision.intent,
                alreadyTargeted: decision.alreadyTargeted,
                displayName: filterParams.displayName,
                totalLines: lines.length,
                totalBytes: bytes,
                triggeredByLines,
                triggeredByBytes,
                minLines,
                minTotalBytes,
                userMaxKeptLines,
                heuristicFallbackEnabled,
                timeoutMs,
            });
            return returnHardTruncationIfNeeded();
        }
        const maxKeptLines = decision.effectiveMaxKeptLines;
        log.debug("[system1] Bash output compaction triggered", {
            workspaceId: opts.workspaceId,
            toolName: filterParams.toolName,
            intent: decision.intent,
            alreadyTargeted: decision.alreadyTargeted,
            displayName: filterParams.displayName,
            totalLines: lines.length,
            totalBytes: bytes,
            triggeredByLines,
            triggeredByBytes,
            minLines,
            minTotalBytes,
            userMaxKeptLines,
            maxKeptLines,
            heuristicFallbackEnabled,
            timeoutMs,
        });
        // Save full output to temp file for agent reference
        let fullOutputPath;
        try {
            const fileId = Math.random().toString(16).substring(2, 10);
            fullOutputPath = path.posix.join(opts.runtimeTempDir, `bash-full-${fileId}.txt`);
            const writer = opts.runtime.writeFile(fullOutputPath, filterParams.abortSignal);
            const writerInstance = writer.getWriter();
            await writerInstance.write(new TextEncoder().encode(filterParams.output));
            await writerInstance.close();
        }
        catch (error) {
            log.debug("[system1] Failed to save full bash output to temp file", {
                workspaceId: opts.workspaceId,
                error: error instanceof Error ? error.message : String(error),
            });
            fullOutputPath = undefined;
        }
        const system1 = await getSystem1Model();
        if (!system1)
            return undefined;
        const system1ProviderOptions = buildProviderOptions(system1.modelString, system1Ctx.thinkingLevel, undefined, undefined, opts.muxProviderOptions, opts.workspaceId);
        const numberedOutput = formatNumberedLinesForSystem1(lines);
        const startTimeMs = Date.now();
        if (typeof filterParams.toolCallId === "string" && filterParams.toolCallId.length > 0) {
            opts.emitBashOutput({
                type: "bash-output",
                workspaceId: opts.workspaceId,
                toolCallId: filterParams.toolCallId,
                phase: "filtering",
                text: "",
                isError: false,
                timestamp: Date.now(),
            });
        }
        let filterMethod = "system1";
        let keepRangesCount = 0;
        let finishReason;
        let lastErrorName;
        let lastErrorMessage;
        let applied = undefined;
        try {
            const keepRangesResult = await runSystem1KeepRangesForBashOutput({
                runtime: opts.runtime,
                agentDiscoveryPath: opts.agentDiscoveryPath,
                runtimeTempDir: opts.runtimeTempDir,
                model: system1.model,
                modelString: system1.modelString,
                providerOptions: system1ProviderOptions,
                displayName: filterParams.displayName,
                script: filterParams.script,
                numberedOutput,
                maxKeptLines,
                timeoutMs,
                abortSignal: filterParams.abortSignal,
                onTimeout: () => {
                    system1TimedOut = true;
                },
            });
            if (keepRangesResult) {
                finishReason = keepRangesResult.finishReason;
                keepRangesCount = keepRangesResult.keepRanges.length;
                // Track System 1 token usage in workspace costs.
                // Normalize the model string so gateway-routed models merge into the
                // same cost bucket as direct calls. Pass providerMetadata so cache
                // tokens and costsIncluded are honored.
                if (keepRangesResult.usage && opts.sessionUsageService) {
                    const normalizedModel = normalizeGatewayModel(system1.modelString);
                    const displayUsage = createDisplayUsage(keepRangesResult.usage, normalizedModel, keepRangesResult.providerMetadata);
                    if (displayUsage) {
                        void opts.sessionUsageService.recordUsage(opts.workspaceId, normalizedModel, displayUsage);
                    }
                }
                applied = applySystem1KeepRangesToOutput({
                    rawOutput: filterParams.output,
                    keepRanges: keepRangesResult.keepRanges,
                    maxKeptLines,
                });
            }
        }
        catch (error) {
            lastErrorName = error instanceof Error ? error.name : undefined;
            lastErrorMessage = error instanceof Error ? error.message : String(error);
        }
        if (!applied || applied.keptLines === 0) {
            const elapsedMs = Date.now() - startTimeMs;
            const upstreamAborted = filterParams.abortSignal?.aborted ?? false;
            log.debug("[system1] Failed to generate keep_ranges", {
                workspaceId: opts.workspaceId,
                toolName: filterParams.toolName,
                system1Model: system1.modelString,
                elapsedMs,
                timedOut: system1TimedOut,
                upstreamAborted,
                keepRangesCount,
                errorName: lastErrorName,
                error: lastErrorMessage,
            });
            if (!heuristicFallbackEnabled || upstreamAborted)
                return undefined;
            const heuristicKeepRanges = getHeuristicKeepRangesForBashOutput({ lines, maxKeptLines });
            keepRangesCount = heuristicKeepRanges.length;
            applied = applySystem1KeepRangesToOutput({
                rawOutput: filterParams.output,
                keepRanges: heuristicKeepRanges,
                maxKeptLines,
            });
            filterMethod = "heuristic";
        }
        if (!applied || applied.keptLines === 0) {
            log.debug("[system1] keep_ranges produced empty filtered output", {
                workspaceId: opts.workspaceId,
                toolName: filterParams.toolName,
                filterMethod,
                keepRangesCount,
                maxKeptLines,
                totalLines: lines.length,
            });
            return undefined;
        }
        const elapsedMs = Date.now() - startTimeMs;
        const trigger = [triggeredByLines ? "lines" : null, triggeredByBytes ? "bytes" : null]
            .filter(Boolean)
            .join("+");
        const notice = formatSystem1BashFilterNotice({
            keptLines: applied.keptLines,
            totalLines: applied.totalLines,
            trigger,
            fullOutputPath,
        });
        log.debug("[system1] Filtered bash tool output", {
            workspaceId: opts.workspaceId,
            toolName: filterParams.toolName,
            intent: decision.intent,
            alreadyTargeted: decision.alreadyTargeted,
            displayName: filterParams.displayName,
            userMaxKeptLines,
            maxKeptLines,
            system1Model: system1.modelString,
            filterMethod,
            keepRangesCount,
            finishReason,
            elapsedMs,
            keptLines: applied.keptLines,
            totalLines: applied.totalLines,
            totalBytes: bytes,
            triggeredByLines,
            triggeredByBytes,
            timeoutMs,
        });
        return { filteredOutput: applied.filteredOutput, notice };
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorName = error instanceof Error ? error.name : undefined;
        const upstreamAborted = filterParams.abortSignal?.aborted ?? false;
        const isAbortError = errorName === "AbortError";
        log.debug("[system1] Failed to filter bash tool output", {
            workspaceId: opts.workspaceId,
            toolName: filterParams.toolName,
            error: errorMessage,
            errorName,
            timedOut: system1TimedOut,
            upstreamAborted,
            isAbortError,
        });
        return returnHardTruncationIfNeeded();
    }
}
/**
 * Merge filtered output into a tool result, appending notice to the note field.
 * Returns undefined if the result wasn't filtered (caller should return original).
 */
function applyFilteredResult(result, filtered, outputField = "output") {
    if (!filtered)
        return undefined;
    const existingNote = result?.note;
    return {
        ...result,
        [outputField]: filtered.filteredOutput,
        note: appendToolNote(typeof existingNote === "string" ? existingNote : undefined, filtered.notice),
    };
}
function wrapBashTool(baseTool, executeFn, maybeFilter, workspaceId) {
    const wrapped = cloneToolPreservingDescriptors(baseTool);
    const record = wrapped;
    record.execute = async (args, options) => {
        const result = await executeFn.call(baseTool, args, options);
        try {
            const runInBackground = Boolean(args?.run_in_background) ||
                (result && typeof result === "object" && "backgroundProcessId" in result);
            if (runInBackground)
                return result;
            const output = result?.output;
            if (typeof output !== "string" || output.length === 0)
                return result;
            const displayName = typeof args?.display_name === "string"
                ? String(args.display_name).trim() || undefined
                : undefined;
            const script = typeof args?.script === "string"
                ? String(args.script)
                : "";
            const toolCallId = typeof options?.toolCallId === "string"
                ? options.toolCallId
                : undefined;
            const filtered = await maybeFilter({
                toolName: "bash",
                output,
                script,
                displayName,
                toolCallId,
                abortSignal: options?.abortSignal,
            });
            return applyFilteredResult(result, filtered) ?? result;
        }
        catch (error) {
            log.debug("[system1] Failed to filter bash tool output", {
                workspaceId,
                error: error instanceof Error ? error.message : String(error),
            });
            return result;
        }
    };
    return wrapped;
}
function wrapBashOutputTool(baseTool, executeFn, maybeFilter, workspaceId) {
    const wrapped = cloneToolPreservingDescriptors(baseTool);
    const record = wrapped;
    record.execute = async (args, options) => {
        const result = await executeFn.call(baseTool, args, options);
        try {
            const output = result?.output;
            if (typeof output !== "string" || output.length === 0)
                return result;
            const filtered = await maybeFilter({
                toolName: "bash_output",
                output,
                script: "",
                abortSignal: options?.abortSignal,
            });
            return applyFilteredResult(result, filtered) ?? result;
        }
        catch (error) {
            log.debug("[system1] Failed to filter bash_output tool output", {
                workspaceId,
                error: error instanceof Error ? error.message : String(error),
            });
            return result;
        }
    };
    return wrapped;
}
function wrapTaskAwaitTool(baseTool, executeFn, maybeFilter, workspaceId) {
    const wrapped = cloneToolPreservingDescriptors(baseTool);
    const record = wrapped;
    record.execute = async (args, options) => {
        const result = await executeFn.call(baseTool, args, options);
        try {
            const resultsValue = result?.results;
            if (!Array.isArray(resultsValue) || resultsValue.length === 0)
                return result;
            const abortSignal = options?.abortSignal;
            const filteredResults = await Promise.all(resultsValue.map(async (entry) => {
                if (!entry || typeof entry !== "object")
                    return entry;
                const taskId = entry.taskId;
                if (typeof taskId !== "string" || !taskId.startsWith("bash:"))
                    return entry;
                const status = entry.status;
                if (status === "running") {
                    const output = entry.output;
                    if (typeof output !== "string" || output.length === 0)
                        return entry;
                    const filtered = await maybeFilter({
                        toolName: "task_await",
                        output,
                        script: "",
                        abortSignal,
                    });
                    return applyFilteredResult(entry, filtered) ?? entry;
                }
                if (status === "completed") {
                    const reportMarkdown = entry.reportMarkdown;
                    if (typeof reportMarkdown !== "string" || reportMarkdown.length === 0)
                        return entry;
                    const parsed = tryParseBashOutputReport(reportMarkdown);
                    if (!parsed || parsed.output.length === 0)
                        return entry;
                    const filtered = await maybeFilter({
                        toolName: "task_await",
                        output: parsed.output,
                        script: "",
                        abortSignal,
                    });
                    if (!filtered)
                        return entry;
                    const existingNote = entry.note;
                    return {
                        ...entry,
                        reportMarkdown: formatBashOutputReport({
                            processId: parsed.processId,
                            status: parsed.status,
                            exitCode: parsed.exitCode,
                            output: filtered.filteredOutput,
                        }),
                        note: appendToolNote(typeof existingNote === "string" ? existingNote : undefined, filtered.notice),
                    };
                }
                return entry;
            }));
            return { ...result, results: filteredResults };
        }
        catch (error) {
            log.debug("[system1] Failed to filter task_await tool output", {
                workspaceId,
                error: error instanceof Error ? error.message : String(error),
            });
            return result;
        }
    };
    return wrapped;
}
//# sourceMappingURL=system1ToolWrapper.js.map