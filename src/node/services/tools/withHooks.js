/**
 * Higher-order function that wraps a tool with hook support.
 *
 * Hook priority (new → legacy):
 * - Pre-execution: tool_pre → tool_hook (if no tool_pre)
 * - Post-execution: tool_post → tool_hook (only if tool_hook was used for pre)
 *
 * New model (tool_pre/tool_post):
 * - tool_pre: runs before tool, exit 0 = allow, non-zero = block
 * - tool_post: runs after tool with result in MUX_TOOL_RESULT/MUX_TOOL_RESULT_PATH
 *
 * Legacy model (tool_hook): single hook with marker protocol (echo $MUX_EXEC)
 */
import { cloneToolPreservingDescriptors } from "@/common/utils/tools/cloneToolPreservingDescriptors";
import { getHookPath, getPreHookPath, getPostHookPath, runWithHook, runPreHook, runPostHook, } from "@/node/services/hooks";
import { log } from "@/node/services/log";
const HOOK_OUTPUT_MAX_CHARS = 64 * 1024;
function truncateHookOutput(output) {
    if (output.length <= HOOK_OUTPUT_MAX_CHARS) {
        return output;
    }
    return output.slice(0, HOOK_OUTPUT_MAX_CHARS) + "\n\n[hook_output truncated]";
}
/**
 * Wrap a tool to execute within hook context if hooks exist.
 *
 * Hook priority:
 * - Pre: tool_pre (new) → tool_hook (legacy)
 * - Post: tool_post (new) → tool_hook (only if used for pre)
 */
export function withHooks(toolName, tool, config) {
    // Access the tool as a record to get its properties.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const toolRecord = tool;
    const originalExecute = toolRecord.execute;
    if (typeof originalExecute !== "function") {
        return tool;
    }
    const executeFn = originalExecute;
    // Avoid mutating cached tools in place (e.g. MCP tools cached per workspace).
    // Repeated getToolsForModel() calls should not stack wrappers.
    const wrappedTool = cloneToolPreservingDescriptors(tool);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wrappedToolRecord = wrappedTool;
    wrappedToolRecord.execute = async (args, options) => {
        // Find hooks (checked per call - hooks can be added/removed dynamically)
        const [preHookPath, postHookPath, legacyHookPath] = await Promise.all([
            getPreHookPath(config.runtime, config.cwd),
            getPostHookPath(config.runtime, config.cwd),
            getHookPath(config.runtime, config.cwd),
        ]);
        // No hooks at all - execute tool directly
        if (!preHookPath && !postHookPath && !legacyHookPath) {
            return executeFn.call(tool, args, options);
        }
        // Extract abort signal from tool options (if present)
        const abortSignal = options && typeof options === "object" && "abortSignal" in options
            ? options.abortSignal
            : undefined;
        const toolInput = JSON.stringify(args);
        const hookContext = {
            tool: toolName,
            toolInput,
            toolInputValue: args,
            workspaceId: config.workspaceId,
            projectDir: config.cwd,
            runtimeTempDir: config.runtimeTempDir,
            env: config.env,
            abortSignal,
        };
        // Use new model (tool_pre/tool_post) if tool_pre exists
        if (preHookPath) {
            return executeWithNewHooks(config.runtime, preHookPath, postHookPath, hookContext, toolName, () => executeFn.call(tool, args, options));
        }
        // Fall back to legacy model (tool_hook) if it exists
        if (legacyHookPath) {
            return executeWithLegacyHook(config.runtime, legacyHookPath, hookContext, toolName, () => executeFn.call(tool, args, options));
        }
        // Only post hook exists (no pre) - execute tool then run post
        const result = (await executeFn.call(tool, args, options));
        if (postHookPath) {
            const postStart = Date.now();
            const postResult = await runPostHook(config.runtime, postHookPath, hookContext, result);
            const hookDurationMs = Date.now() - postStart;
            if (postResult.output) {
                return appendHookOutput(result, truncateHookOutput(postResult.output), hookDurationMs, postHookPath);
            }
        }
        return result;
    };
    return wrappedTool;
}
/** Execute tool with new pre/post hook model */
async function executeWithNewHooks(runtime, preHookPath, postHookPath, context, toolName, executeTool) {
    log.debug("[withHooks] Running tool with pre/post hooks", {
        toolName,
        preHookPath,
        postHookPath,
    });
    const hookStart = Date.now();
    // Run pre-hook
    const preResult = await runPreHook(runtime, preHookPath, context);
    // Pre-hook blocked tool
    if (!preResult.allowed) {
        const output = truncateHookOutput(preResult.output || `Tool blocked by pre-hook (exit ${preResult.exitCode})`);
        log.debug("[withHooks] Pre-hook blocked tool", { toolName, output });
        const errorResult = { error: output };
        return errorResult;
    }
    // Execute tool
    const result = await executeTool();
    // Run post-hook if exists
    if (postHookPath) {
        const postResult = await runPostHook(runtime, postHookPath, context, result);
        const hookDurationMs = Date.now() - hookStart;
        let hookOutput = postResult.output;
        if (!postResult.success && !hookOutput) {
            hookOutput = `Post-hook failed (exit code ${postResult.exitCode})`;
        }
        if (hookOutput) {
            hookOutput = truncateHookOutput(hookOutput);
            log.debug("[withHooks] Post-hook produced output", {
                toolName,
                success: postResult.success,
                output: hookOutput,
            });
            return appendHookOutput(result, hookOutput, hookDurationMs, postHookPath);
        }
    }
    return result;
}
/** Execute tool with legacy tool_hook model */
async function executeWithLegacyHook(runtime, hookPath, context, toolName, executeTool) {
    log.debug("[withHooks] Running tool with legacy hook", { toolName, hookPath });
    const hookStart = Date.now();
    const { result, hook } = await runWithHook(runtime, hookPath, context, () => Promise.resolve(executeTool()), {
        slowThresholdMs: 10000,
        onSlowHook: (phase, elapsedMs) => {
            const seconds = (elapsedMs / 1000).toFixed(1);
            log.warn(`[withHooks] Slow ${phase}-hook for ${toolName}: ${seconds}s`);
            console.warn(`⚠️  Slow tool hook (${phase}): ${toolName} took ${seconds}s`);
        },
    });
    const hookDurationMs = Date.now() - hookStart;
    // Hook blocked tool execution (exited before $MUX_EXEC)
    if (!hook.toolExecuted) {
        const blockOutput = truncateHookOutput([hook.stdoutBeforeExec, hook.stderr].filter(Boolean).join("\n").trim());
        log.debug("[withHooks] Hook blocked tool execution", { toolName, output: blockOutput });
        const errorResult = {
            error: blockOutput || "Tool blocked by hook (exited before $MUX_EXEC)",
        };
        return errorResult;
    }
    // Combine stdout and stderr for hook output
    let hookOutput = [hook.stdout, hook.stderr].filter(Boolean).join("\n").trim();
    if (!hook.success && !hookOutput) {
        hookOutput = `Tool hook failed (exit code ${hook.exitCode})`;
    }
    if (hookOutput) {
        hookOutput = truncateHookOutput(hookOutput);
        log.debug("[withHooks] Hook produced output", {
            toolName,
            success: hook.success,
            output: hookOutput,
        });
        return appendHookOutput(result, hookOutput, hookDurationMs, hookPath);
    }
    // Note: result could be TResult or AsyncIterable<TResult>
    return result;
}
/** Check if a value is an AsyncIterable (streaming result) */
function isAsyncIterable(value) {
    return (typeof value === "object" &&
        value !== null &&
        Symbol.asyncIterator in value &&
        typeof value[Symbol.asyncIterator] === "function");
}
/**
 * Append hook output to tool result.
 * This lets the LLM see hook feedback (errors, formatter notifications) alongside the tool result.
 *
 * Note: AsyncIterable (streaming) results are wrapped to preserve the iterator while attaching hook_output.
 */
function appendHookOutput(result, output, durationMs, hookPath) {
    if (result === undefined) {
        const errorResult = {
            error: output,
            hook_output: output,
            hook_duration_ms: durationMs,
            hook_path: hookPath,
        };
        return errorResult;
    }
    // AsyncIterable (streaming) results: preserve streaming while attaching hook_output.
    if (isAsyncIterable(result)) {
        const iterable = result;
        const iteratorFn = iterable[Symbol.asyncIterator].bind(iterable);
        const wrappedIterable = {
            hook_output: output,
            hook_duration_ms: durationMs,
            hook_path: hookPath,
            [Symbol.asyncIterator]: iteratorFn,
        };
        return wrappedIterable;
    }
    // If result is an object, add hook_output field
    if (typeof result === "object" && result !== null) {
        const withOutput = {
            ...result,
            hook_output: output,
            hook_duration_ms: durationMs,
            hook_path: hookPath,
        };
        return withOutput;
    }
    // For primitive results, wrap in object
    const wrapped = {
        result,
        hook_output: output,
        hook_duration_ms: durationMs,
        hook_path: hookPath,
    };
    return wrapped;
}
//# sourceMappingURL=withHooks.js.map