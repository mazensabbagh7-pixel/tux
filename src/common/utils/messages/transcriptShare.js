function isFailedOutput(output) {
    if (typeof output !== "object" || output === null)
        return false;
    if ("success" in output && output.success === false)
        return true;
    if ("error" in output && output.error)
        return true;
    return false;
}
/**
 * chat.jsonl can contain *streaming deltas* (especially in older history), which means assistant
 * messages may have thousands of tiny {type:"text"|"reasoning"} parts.
 *
 * For sharing, we compact adjacent text/reasoning runs into a single part each to drastically
 * reduce file size.
 */
function mergeAdjacentTextAndReasoningPartsForSharing(parts) {
    if (parts.length <= 1)
        return parts;
    const merged = [];
    let pendingTexts = [];
    let pendingTextTimestamp;
    let pendingReasonings = [];
    let pendingReasoningTimestamp;
    const flushText = () => {
        if (pendingTexts.length === 0) {
            return;
        }
        const text = pendingTexts.join("");
        if (pendingTextTimestamp === undefined) {
            merged.push({ type: "text", text });
        }
        else {
            merged.push({ type: "text", text, timestamp: pendingTextTimestamp });
        }
        pendingTexts = [];
        pendingTextTimestamp = undefined;
    };
    const flushReasoning = () => {
        if (pendingReasonings.length === 0) {
            return;
        }
        const text = pendingReasonings.join("");
        if (pendingReasoningTimestamp === undefined) {
            merged.push({ type: "reasoning", text });
        }
        else {
            merged.push({ type: "reasoning", text, timestamp: pendingReasoningTimestamp });
        }
        pendingReasonings = [];
        pendingReasoningTimestamp = undefined;
    };
    for (const part of parts) {
        if (part.type === "text") {
            flushReasoning();
            pendingTexts.push(part.text);
            pendingTextTimestamp ?? (pendingTextTimestamp = part.timestamp);
        }
        else if (part.type === "reasoning") {
            flushText();
            pendingReasonings.push(part.text);
            pendingReasoningTimestamp ?? (pendingReasoningTimestamp = part.timestamp);
        }
        else {
            // Tool/file part - flush and keep as-is.
            flushText();
            flushReasoning();
            merged.push(part);
        }
    }
    flushText();
    flushReasoning();
    return merged;
}
function compactMessagePartsForSharing(messages) {
    return messages.map((msg) => {
        const parts = mergeAdjacentTextAndReasoningPartsForSharing(msg.parts);
        if (parts === msg.parts) {
            return msg;
        }
        return {
            ...msg,
            parts,
        };
    });
}
function stripNestedToolCallOutput(call) {
    if (call.state !== "output-available") {
        return call;
    }
    const failed = isFailedOutput(call.output);
    const { output: _output, ...rest } = call;
    return {
        ...rest,
        state: "output-redacted",
        ...(failed && { failed }),
    };
}
// Tools whose output is preserved even when stripping — their output IS the content
// (plan text, sub-agent reports) and can't be reconstructed from disk.
const PRESERVE_OUTPUT_TOOLS = new Set([
    "propose_plan",
    "task",
    "task_await",
    "task_list",
    "task_terminate",
    "task_apply_git_patch",
]);
function stripToolPartOutput(part) {
    const nestedCalls = part.nestedCalls?.map(stripNestedToolCallOutput);
    if (PRESERVE_OUTPUT_TOOLS.has(part.toolName)) {
        return nestedCalls ? { ...part, nestedCalls } : part;
    }
    if (part.state !== "output-available") {
        return nestedCalls ? { ...part, nestedCalls } : part;
    }
    const failed = isFailedOutput(part.output);
    const { output: _output, ...rest } = part;
    return {
        ...rest,
        state: "output-redacted",
        ...(failed && { failed }),
        nestedCalls,
    };
}
function stripToolOutputsForSharing(messages) {
    return messages.map((msg) => {
        if (msg.role !== "assistant") {
            return msg;
        }
        const parts = msg.parts.map((part) => {
            if (part.type !== "dynamic-tool") {
                return part;
            }
            return stripToolPartOutput(part);
        });
        return {
            ...msg,
            parts,
        };
    });
}
function isRecord(value) {
    return value !== null && typeof value === "object";
}
function inlinePlanContentForSharing(messages, planSnapshot) {
    return messages.map((msg) => {
        if (msg.role !== "assistant") {
            return msg;
        }
        let changed = false;
        const parts = msg.parts.map((part) => {
            if (part.type !== "dynamic-tool") {
                return part;
            }
            if (part.toolName !== "propose_plan" || part.state !== "output-available") {
                return part;
            }
            if (!isRecord(part.output)) {
                return part;
            }
            const output = part.output;
            if (output.success !== true) {
                return part;
            }
            if (typeof output.planPath !== "string") {
                return part;
            }
            // For shared transcripts, inline plan content into completed propose_plan tool calls.
            // We intentionally do not try to match `planSnapshot.path` to `output.planPath` — tool output
            // often uses `~/.mux/...` while the snapshot path is resolved, and path normalization is
            // brittle across platforms.
            if ("planContent" in output) {
                return part;
            }
            changed = true;
            return {
                ...part,
                output: {
                    ...output,
                    planContent: planSnapshot.content,
                },
            };
        });
        return changed ? { ...msg, parts } : msg;
    });
}
/**
 * Build a JSONL transcript (one message per line, trailing newline) suitable for sharing.
 *
 * NOTE: This preserves chat.jsonl-compatible message structure (tool calls, files, etc), but
 * compacts adjacent text/reasoning deltas into a single part each to keep shared transcripts small.
 */
export function buildChatJsonlForSharing(messages, options = {}) {
    if (messages.length === 0)
        return "";
    const includeToolOutput = options.includeToolOutput ?? true;
    const withPlanInlined = options.planSnapshot
        ? inlinePlanContentForSharing(messages, options.planSnapshot)
        : messages;
    const sanitized = includeToolOutput
        ? withPlanInlined
        : stripToolOutputsForSharing(withPlanInlined);
    const compacted = compactMessagePartsForSharing(sanitized);
    return (compacted
        .map((msg) => {
        if (options.workspaceId === undefined) {
            return msg;
        }
        return {
            ...msg,
            workspaceId: options.workspaceId,
        };
    })
        .map((msg) => JSON.stringify(msg))
        .join("\n") + "\n");
}
//# sourceMappingURL=transcriptShare.js.map