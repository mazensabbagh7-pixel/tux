import { createMuxMessage, getCompactionFollowUpContent } from "@/common/types/message";
import { getToolOutputUiOnly } from "@/common/utils/tools/toolOutputUiOnly";
import { isInitStart, isInitOutput, isInitEnd, isMuxMessage } from "@/common/orpc/types";
import { INIT_HOOK_MAX_LINES } from "@/common/constants/toolLimits";
import { isDynamicToolPart } from "@/common/types/toolParts";
import { z } from "zod";
import { createDeltaStorage } from "./StreamingTPSCalculator";
import { computeRecencyTimestamp } from "./recency";
import { assert } from "@/common/utils/assert";
import { getStatusStateKey } from "@/common/constants/storage";
import { getFollowUpContentText } from "@/browser/utils/compaction/format";
// Maximum number of messages to display in the DOM for performance
// Full history is still maintained internally for token counting and stats
const AgentStatusSchema = z.object({
    emoji: z.string(),
    message: z.string(),
    url: z.string().optional(),
});
// Synthetic agent-skill snapshot messages include metadata.agentSkillSnapshot.
// We use this to keep the SkillIndicator in sync for /{skillName} invocations.
const AgentSkillSnapshotMetadataSchema = z.object({
    skillName: z.string().min(1),
    scope: z.enum(["project", "global", "built-in"]),
    sha256: z.string().optional(),
    frontmatterYaml: z.string().optional(),
});
/**
 * Maximum number of DisplayedMessages to render before truncation kicks in.
 * We keep all user prompts and structural markers, while allowing older assistant
 * content to collapse behind the history-hidden marker for faster initial paint.
 */
const MAX_DISPLAYED_MESSAGES = 64;
/**
 * Message types that are always preserved even in truncated history.
 * Older assistant/tool/reasoning rows may be omitted until the user clicks “Load all”.
 */
const ALWAYS_KEEP_MESSAGE_TYPES = new Set([
    "user",
    "stream-error",
    "compaction-boundary",
    "plan-display",
    "workspace-init",
]);
/**
 * Check if a tool result indicates success (for tools that return { success: boolean })
 */
function hasSuccessResult(result) {
    return (typeof result === "object" && result !== null && "success" in result && result.success === true);
}
/**
 * Check if a tool result indicates failure.
 * Handles both explicit failure ({ success: false }) and implicit failure ({ error: "..." })
 */
function hasFailureResult(result) {
    if (typeof result !== "object" || result === null)
        return false;
    // Explicit failure
    if ("success" in result && result.success === false)
        return true;
    // Implicit failure - error field present
    if ("error" in result && result.error)
        return true;
    return false;
}
/**
 * Merge adjacent text/reasoning parts using array accumulation + join().
 * Avoids O(n²) string allocations from repeated concatenation.
 * Tool parts are preserved as-is between merged text/reasoning runs.
 */
function mergeAdjacentParts(parts) {
    if (parts.length <= 1)
        return parts;
    const merged = [];
    let pendingTexts = [];
    let pendingTextTimestamp;
    let pendingReasonings = [];
    let pendingReasoningTimestamp;
    const flushText = () => {
        if (pendingTexts.length > 0) {
            merged.push({
                type: "text",
                text: pendingTexts.join(""),
                timestamp: pendingTextTimestamp,
            });
            pendingTexts = [];
            pendingTextTimestamp = undefined;
        }
    };
    const flushReasoning = () => {
        if (pendingReasonings.length > 0) {
            merged.push({
                type: "reasoning",
                text: pendingReasonings.join(""),
                timestamp: pendingReasoningTimestamp,
            });
            pendingReasonings = [];
            pendingReasoningTimestamp = undefined;
        }
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
            // Tool part - flush and keep as-is
            flushText();
            flushReasoning();
            merged.push(part);
        }
    }
    flushText();
    flushReasoning();
    return merged;
}
function extractAgentSkillSnapshotBody(snapshotText) {
    assert(typeof snapshotText === "string", "extractAgentSkillSnapshotBody requires snapshotText");
    // Expected format (backend):
    // <agent-skill ...>\n{body}\n</agent-skill>
    if (!snapshotText.startsWith("<agent-skill")) {
        return null;
    }
    const openTagEnd = snapshotText.indexOf(">\n");
    if (openTagEnd === -1) {
        return null;
    }
    const closeTag = "\n</agent-skill>";
    const closeTagStart = snapshotText.lastIndexOf(closeTag);
    if (closeTagStart === -1) {
        return null;
    }
    const bodyStart = openTagEnd + ">\n".length;
    if (closeTagStart < bodyStart) {
        return null;
    }
    // Be strict about trailing content: if we can't confidently extract the body,
    // avoid showing a misleading preview.
    const trailing = snapshotText.slice(closeTagStart + closeTag.length);
    if (trailing.trim().length > 0) {
        return null;
    }
    return snapshotText.slice(bodyStart, closeTagStart);
}
export class StreamingMessageAggregator {
    constructor(createdAt, workspaceId, unarchivedAt) {
        this.messages = new Map();
        this.activeStreams = new Map();
        // Derived value cache - invalidated as a unit on every mutation.
        // Adding a new cached value? Add it here and it will auto-invalidate.
        this.displayedMessageCache = new Map();
        this.messageVersions = new Map();
        this.cache = {};
        this.recencyTimestamp = null;
        // Delta history for token counting and TPS calculation
        this.deltaHistory = new Map();
        // Active stream usage tracking (updated on each usage-delta event)
        // Consolidates step-level (context window) and cumulative (cost) usage by messageId
        this.activeStreamUsage = new Map();
        // Current TODO list (updated when todo_write succeeds, cleared on stream end)
        // Stream-scoped: automatically reset when stream completes
        // On reload: only reconstructed if reconnecting to active stream
        this.currentTodos = [];
        // Current agent status (updated when status_set is called)
        // Unlike todos, this persists after stream completion to show last activity
        this.agentStatus = undefined;
        // Loaded skills (updated when agent_skill_read succeeds)
        // Persists after stream completion (like agentStatus) to show which skills were loaded
        // Keyed by skill name to avoid duplicates
        this.loadedSkills = new Map();
        // Cached array for getLoadedSkills() to preserve reference identity for memoization
        this.loadedSkillsCache = [];
        // Runtime skill load errors (updated when agent_skill_read fails)
        // Keyed by skill name; cleared when the skill is later loaded successfully
        this.skillLoadErrors = new Map();
        this.skillLoadErrorsCache = [];
        // Last URL set via status_set - kept in memory to reuse when later calls omit url
        this.lastStatusUrl = undefined;
        // Whether to disable DOM message capping for this workspace.
        // Controlled via the HistoryHiddenMessage “Load all” button.
        this.showAllMessages = false;
        // Workspace init hook state (ephemeral, not persisted to history)
        this.initState = null;
        // Throttle init-output cache invalidation to avoid re-render per line during fast streaming
        this.initOutputThrottleTimer = null;
        // Track when we're waiting for stream-start after user message
        // Prevents retry barrier flash during normal send flow
        // Stores timestamp of when user message was sent (null = no pending stream)
        // IMPORTANT: We intentionally keep this timestamp until a stream actually starts
        // (or the user retries) so retry UI/backoff logic doesn't misfire on send failures.
        this.pendingStreamStartTime = null;
        // Last observed stream-abort reason (used to gate auto-retry).
        this.lastAbortReason = null;
        // Current runtime status (set during ensureReady for Coder workspaces)
        // Used to show "Starting Coder workspace..." in StreamingBarrier
        this.runtimeStatus = null;
        // Pending compaction request metadata for the next stream (set when user message arrives).
        // Used to infer compaction state before stream-start arrives.
        this.pendingCompactionRequest = null;
        // Model used for the pending send (set on user message) so the "starting" UI
        // reflects one-shot/compaction overrides instead of stale localStorage values.
        this.pendingStreamModel = null;
        // Last completed stream timing stats (preserved after stream ends for display)
        // Unlike activeStreams, this persists until the next stream starts
        this.lastCompletedStreamStats = null;
        // Optimistic "interrupting" state: set before calling interruptStream
        // Shows "interrupting..." in StreamingBarrier until real stream-abort arrives
        this.interruptingMessageId = null;
        // Session-level timing stats: model -> stats (totals computed on-the-fly)
        this.sessionTimingStats = {};
        this.createdAt = createdAt;
        this.workspaceId = workspaceId;
        this.unarchivedAt = unarchivedAt;
        // Load persisted agent status from localStorage
        if (workspaceId) {
            const persistedStatus = this.loadPersistedAgentStatus();
            if (persistedStatus) {
                this.agentStatus = persistedStatus;
                this.lastStatusUrl = persistedStatus.url;
            }
        }
        this.updateRecency();
    }
    /** Update unarchivedAt timestamp (called when workspace is restored from archive) */
    setUnarchivedAt(unarchivedAt) {
        this.unarchivedAt = unarchivedAt;
        this.updateRecency();
    }
    /**
     * Disable the displayed message cap for this workspace.
     * Intended for user-triggered “Load all” UI.
     */
    setShowAllMessages(showAllMessages) {
        assert(typeof showAllMessages === "boolean", "setShowAllMessages requires boolean");
        if (this.showAllMessages === showAllMessages) {
            return;
        }
        this.showAllMessages = showAllMessages;
        this.invalidateCache();
    }
    /** Load persisted agent status from localStorage */
    loadPersistedAgentStatus() {
        if (!this.workspaceId)
            return undefined;
        try {
            const stored = localStorage.getItem(getStatusStateKey(this.workspaceId));
            if (!stored)
                return undefined;
            const parsed = AgentStatusSchema.safeParse(JSON.parse(stored));
            return parsed.success ? parsed.data : undefined;
        }
        catch {
            // Ignore localStorage errors or JSON parse failures
        }
        return undefined;
    }
    /** Persist agent status to localStorage */
    savePersistedAgentStatus(status) {
        if (!this.workspaceId)
            return;
        const parsed = AgentStatusSchema.safeParse(status);
        if (!parsed.success)
            return;
        try {
            localStorage.setItem(getStatusStateKey(this.workspaceId), JSON.stringify(parsed.data));
        }
        catch {
            // Ignore localStorage errors
        }
    }
    /** Remove persisted agent status from localStorage */
    clearPersistedAgentStatus() {
        if (!this.workspaceId)
            return;
        try {
            localStorage.removeItem(getStatusStateKey(this.workspaceId));
        }
        catch {
            // Ignore localStorage errors
        }
    }
    /** Clear all session timing stats (in-memory only). */
    clearSessionTimingStats() {
        this.sessionTimingStats = {};
        this.lastCompletedStreamStats = null;
    }
    updateStreamClock(context, serverTimestamp) {
        assert(context, "updateStreamClock requires context");
        assert(typeof serverTimestamp === "number", "updateStreamClock requires serverTimestamp");
        // Only update if this timestamp is >= the most recent one we've seen.
        // During stream replay, older historical parts may be re-emitted out of order.
        //
        // NOTE: This is a display-oriented clock translation (not true synchronization).
        // We refresh the offset whenever we see a newer backend timestamp. If the renderer clock
        // drifts significantly during a very long stream, the translated times may be off by a
        // small amount, which is acceptable for UI stats.
        if (serverTimestamp < context.lastServerTimestamp) {
            return;
        }
        context.lastServerTimestamp = serverTimestamp;
        context.clockOffsetMs = Date.now() - serverTimestamp;
    }
    translateServerTime(context, serverTimestamp) {
        assert(context, "translateServerTime requires context");
        assert(typeof serverTimestamp === "number", "translateServerTime requires serverTimestamp");
        return serverTimestamp + context.clockOffsetMs;
    }
    bumpMessageVersion(messageId) {
        const current = this.messageVersions.get(messageId) ?? 0;
        this.messageVersions.set(messageId, current + 1);
    }
    markMessageDirty(messageId) {
        this.bumpMessageVersion(messageId);
        this.invalidateCache();
    }
    deleteMessage(messageId) {
        const didDelete = this.messages.delete(messageId);
        if (didDelete) {
            this.displayedMessageCache.delete(messageId);
            this.messageVersions.delete(messageId);
            // Clean up token tracking state to prevent memory leaks
            this.deltaHistory.delete(messageId);
            this.activeStreamUsage.delete(messageId);
        }
        return didDelete;
    }
    invalidateCache() {
        this.cache = {};
        this.updateRecency();
    }
    /**
     * Recompute and cache recency from current messages.
     * Called automatically when messages change.
     */
    updateRecency() {
        const messages = this.getAllMessages();
        this.recencyTimestamp = computeRecencyTimestamp(messages, this.createdAt, this.unarchivedAt);
    }
    /**
     * Get the current recency timestamp (O(1) accessor).
     * Used for workspace sorting by last user interaction.
     */
    getRecencyTimestamp() {
        return this.recencyTimestamp;
    }
    /**
     * Check if two TODO lists are equal (deep comparison).
     * Prevents unnecessary re-renders when todo_write is called with identical content.
     */
    todosEqual(a, b) {
        if (a.length !== b.length)
            return false;
        return a.every((todoA, i) => {
            const todoB = b[i];
            return todoA.content === todoB.content && todoA.status === todoB.status;
        });
    }
    /**
     * Get the current TODO list.
     * Updated whenever todo_write succeeds.
     */
    getCurrentTodos() {
        return this.currentTodos;
    }
    /**
     * Get the current agent status.
     * Updated whenever status_set is called.
     * Persists after stream completion (unlike todos).
     */
    getAgentStatus() {
        return this.agentStatus;
    }
    /**
     * Get the list of loaded skills for this workspace.
     * Updated whenever agent_skill_read succeeds.
     * Persists after stream completion (like agentStatus).
     * Returns a stable array reference for memoization (only changes when skills change).
     */
    getLoadedSkills() {
        return this.loadedSkillsCache;
    }
    /**
     * Get runtime skill load errors (agent_skill_read failures).
     * Errors are cleared for a skill when it later loads successfully.
     * Returns a stable array reference for memoization.
     */
    getSkillLoadErrors() {
        return this.skillLoadErrorsCache;
    }
    /**
     * Check if there's an executing ask_user_question tool awaiting user input.
     * Used to show "Awaiting your input" instead of "streaming..." in the UI.
     */
    hasAwaitingUserQuestion() {
        // Only treat the workspace as "awaiting input" when the *latest* displayed
        // message is an executing ask_user_question tool.
        //
        // This avoids false positives from stale historical partials if the user
        // continued the chat after skipping/canceling the questions.
        const displayed = this.getDisplayedMessages();
        const last = displayed[displayed.length - 1];
        if (last?.type !== "tool") {
            return false;
        }
        return last.toolName === "ask_user_question" && last.status === "executing";
    }
    /**
     * Extract compaction summary text from a completed assistant message.
     * Used when a compaction stream completes to get the summary for history replacement.
     * @param messageId The ID of the assistant message to extract text from
     * @returns The concatenated text from all text parts, or undefined if message not found
     */
    getCompactionSummary(messageId) {
        const message = this.messages.get(messageId);
        if (!message)
            return undefined;
        // Concatenate all text parts (ignore tool calls and reasoning)
        return message.parts
            .filter((part) => part.type === "text")
            .map((part) => part.text)
            .join("");
    }
    /**
     * Clean up stream-scoped state when stream ends (normally or abnormally).
     * Called by handleStreamEnd, handleStreamAbort, and handleStreamError.
     *
     * Clears:
     * - Active stream tracking (this.activeStreams)
     * - Current TODOs (this.currentTodos) - reconstructed from history on reload
     * - Transient agentStatus (from displayStatus) - restored to persisted value
     *
     * Preserves:
     * - lastCompletedStreamStats - timing stats from this stream for display after completion
     */
    cleanupStreamState(messageId) {
        // Clear optimistic interrupt flag if this stream was being interrupted.
        // This handles cases where streams end normally or with errors (not just abort).
        if (this.interruptingMessageId === messageId) {
            this.interruptingMessageId = null;
        }
        // Capture timing stats before removing the stream context
        const context = this.activeStreams.get(messageId);
        if (context) {
            const endTime = Date.now();
            const message = this.messages.get(messageId);
            // Prefer backend-provided duration (computed in the same clock domain as tool/delta timestamps).
            // Fall back to renderer-based timing translated into the renderer clock.
            const durationMsFromMetadata = message?.metadata?.duration;
            const fallbackStartTime = this.translateServerTime(context, context.serverStartTime);
            const fallbackDurationMs = Math.max(0, endTime - fallbackStartTime);
            const durationMs = typeof durationMsFromMetadata === "number" && Number.isFinite(durationMsFromMetadata)
                ? durationMsFromMetadata
                : fallbackDurationMs;
            const ttftMs = context.serverFirstTokenTime !== null
                ? Math.max(0, context.serverFirstTokenTime - context.serverStartTime)
                : null;
            // Get output tokens from cumulative usage (if available).
            // Fall back to message metadata for abort/error cases where clearTokenState was
            // called before cleanupStreamState (e.g., stream abort event handler ordering).
            const cumulativeUsage = this.activeStreamUsage.get(messageId)?.cumulative.usage;
            const metadataUsage = message?.metadata?.usage;
            const outputTokens = cumulativeUsage?.outputTokens ?? metadataUsage?.outputTokens ?? 0;
            const reasoningTokens = cumulativeUsage?.reasoningTokens ?? metadataUsage?.reasoningTokens ?? 0;
            // Account for in-progress tool calls (can happen on abort/error)
            let totalToolExecutionMs = context.toolExecutionMs;
            if (context.pendingToolStarts.size > 0) {
                const serverEndTime = context.serverStartTime + durationMs;
                for (const toolStartTime of context.pendingToolStarts.values()) {
                    const toolMs = serverEndTime - toolStartTime;
                    if (toolMs > 0) {
                        totalToolExecutionMs += toolMs;
                    }
                }
            }
            // Streaming duration excludes TTFT and tool execution - used for avg tok/s
            const streamingMs = Math.max(0, durationMs - (ttftMs ?? 0) - totalToolExecutionMs);
            const mode = message?.metadata?.mode ?? context.mode;
            // Store last completed stream stats (include durations anchored in the renderer clock)
            const startTime = endTime - durationMs;
            const firstTokenTime = ttftMs !== null ? startTime + ttftMs : null;
            this.lastCompletedStreamStats = {
                startTime,
                endTime,
                firstTokenTime,
                toolExecutionMs: totalToolExecutionMs,
                model: context.model,
                outputTokens,
                reasoningTokens,
                streamingMs,
                mode,
            };
            // Use composite key model:mode for per-model+mode stats
            // Old data (no mode) will just use model as key, maintaining backward compat
            const statsKey = mode ? `${context.model}:${mode}` : context.model;
            // Accumulate into per-model stats (totals computed on-the-fly in getSessionTimingStats)
            const modelStats = this.sessionTimingStats[statsKey] ?? {
                totalDurationMs: 0,
                totalToolExecutionMs: 0,
                totalTtftMs: 0,
                ttftCount: 0,
                responseCount: 0,
                totalOutputTokens: 0,
                totalReasoningTokens: 0,
                totalStreamingMs: 0,
            };
            modelStats.totalDurationMs += durationMs;
            modelStats.totalToolExecutionMs += totalToolExecutionMs;
            modelStats.responseCount += 1;
            modelStats.totalOutputTokens += outputTokens;
            modelStats.totalReasoningTokens += reasoningTokens;
            modelStats.totalStreamingMs += streamingMs;
            if (ttftMs !== null) {
                modelStats.totalTtftMs += ttftMs;
                modelStats.ttftCount += 1;
            }
            this.sessionTimingStats[statsKey] = modelStats;
        }
        this.activeStreams.delete(messageId);
        // Clear todos when stream ends - they're stream-scoped state
        // On reload, todos will be reconstructed from completed tool_write calls in history
        this.currentTodos = [];
        // Restore persisted status - clears transient displayStatus, preserves status_set values
        this.agentStatus = this.loadPersistedAgentStatus();
    }
    /**
     * Compact a message's parts array by merging adjacent text/reasoning parts.
     * Called when streaming ends to convert thousands of delta parts into single strings.
     * This reduces memory from O(deltas) small objects to O(content_types) merged objects.
     */
    /**
     * Extract the final response text from a message (text after the last tool call).
     * Used for notification body content.
     */
    extractFinalResponseText(message) {
        if (!message)
            return "";
        const parts = message.parts;
        const lastToolIndex = parts.findLastIndex((part) => part.type === "dynamic-tool");
        const textPartsAfterTools = lastToolIndex >= 0 ? parts.slice(lastToolIndex + 1) : parts;
        return textPartsAfterTools
            .filter((part) => part.type === "text")
            .map((part) => part.text)
            .join("")
            .trim();
    }
    compactMessageParts(message) {
        message.parts = mergeAdjacentParts(message.parts);
    }
    addMessage(message) {
        const existing = this.messages.get(message.id);
        if (existing) {
            const existingParts = Array.isArray(existing.parts) ? existing.parts.length : 0;
            const incomingParts = Array.isArray(message.parts) ? message.parts.length : 0;
            // Prefer richer content when duplicates arrive (e.g., placeholder vs completed message)
            if (incomingParts < existingParts) {
                return;
            }
        }
        // Just store the message - backend assigns historySequence
        this.messages.set(message.id, message);
        this.markMessageDirty(message.id);
    }
    /**
     * Remove a message from the aggregator.
     * Used for dismissing ephemeral messages like /plan output.
     * Rebuilds detected links to remove any that only existed in the removed message.
     */
    removeMessage(messageId) {
        if (this.deleteMessage(messageId)) {
            this.invalidateCache();
        }
    }
    /**
     * Load historical messages in batch, preserving their historySequence numbers.
     * This is more efficient than calling addMessage() repeatedly.
     *
     * @param messages - Historical messages to load
     * @param hasActiveStream - Whether there's an active stream in buffered events (for reconnection scenario)
     */
    loadHistoricalMessages(messages, hasActiveStream = false) {
        // Clear existing state to prevent stale messages from persisting.
        // This method replaces all messages, not merges them.
        this.messages.clear();
        this.displayedMessageCache.clear();
        this.messageVersions.clear();
        this.deltaHistory.clear();
        this.activeStreamUsage.clear();
        this.loadedSkills.clear();
        this.loadedSkillsCache = [];
        this.skillLoadErrors.clear();
        this.skillLoadErrorsCache = [];
        // Add all messages to the map
        for (const message of messages) {
            this.messages.set(message.id, message);
        }
        // Use "streaming" context if there's an active stream (reconnection), otherwise "historical"
        const context = hasActiveStream ? "streaming" : "historical";
        // Sort messages in chronological order for processing
        const chronologicalMessages = [...messages].sort((a, b) => (a.metadata?.historySequence ?? 0) - (b.metadata?.historySequence ?? 0));
        // Replay historical messages in order to reconstruct derived state
        for (const message of chronologicalMessages) {
            this.maybeTrackLoadedSkillFromAgentSkillSnapshot(message.metadata?.agentSkillSnapshot);
            if (message.role === "user") {
                // Mirror live behavior: clear stream-scoped state on new user turn
                // but keep persisted status for fallback on reload.
                this.currentTodos = [];
                this.agentStatus = undefined;
                continue;
            }
            if (message.role === "assistant") {
                for (const part of message.parts) {
                    if (isDynamicToolPart(part) && part.state === "output-available") {
                        this.processToolResult(part.toolName, part.input, part.output, context);
                    }
                }
            }
        }
        // If history was compacted away from the last status_set, fall back to persisted status
        if (!this.agentStatus) {
            const persistedStatus = this.loadPersistedAgentStatus();
            if (persistedStatus) {
                this.agentStatus = persistedStatus;
                this.lastStatusUrl = persistedStatus.url;
            }
        }
        this.invalidateCache();
    }
    getAllMessages() {
        var _a;
        (_a = this.cache).allMessages ?? (_a.allMessages = Array.from(this.messages.values()).sort((a, b) => (a.metadata?.historySequence ?? 0) - (b.metadata?.historySequence ?? 0)));
        return this.cache.allMessages;
    }
    // Efficient methods to check message state without creating arrays
    getMessageCount() {
        return this.messages.size;
    }
    hasMessages() {
        return this.messages.size > 0;
    }
    clearLastAbortReason() {
        this.lastAbortReason = null;
    }
    getLastAbortReason() {
        return this.lastAbortReason;
    }
    getPendingStreamStartTime() {
        return this.pendingStreamStartTime;
    }
    /**
     * Get the current runtime status (for Coder workspace starting UX).
     * Returns null if no runtime status is active.
     */
    getRuntimeStatus() {
        return this.runtimeStatus;
    }
    /**
     * Handle runtime-status event (emitted during ensureReady for Coder workspaces).
     * Used to show "Starting Coder workspace..." in StreamingBarrier.
     */
    handleRuntimeStatus(status) {
        // Clear status when ready/error or set new status
        if (status.phase === "ready" || status.phase === "error") {
            this.runtimeStatus = null;
        }
        else {
            this.runtimeStatus = status;
        }
    }
    getPendingStreamModel() {
        if (this.pendingStreamStartTime === null)
            return null;
        return this.pendingStreamModel;
    }
    getLatestCompactionRequest() {
        if (this.pendingCompactionRequest) {
            return this.pendingCompactionRequest;
        }
        const messages = this.getAllMessages();
        for (let i = messages.length - 1; i >= 0; i--) {
            const message = messages[i];
            if (message.role !== "user")
                continue;
            const muxMetadata = message.metadata?.muxMetadata;
            if (muxMetadata?.type === "compaction-request") {
                return muxMetadata.parsed;
            }
            return null;
        }
        return null;
    }
    setPendingStreamStartTime(time) {
        this.pendingStreamStartTime = time;
        if (time === null) {
            this.pendingCompactionRequest = null;
            this.pendingStreamModel = null;
        }
    }
    /**
     * Get timing statistics for the active stream (if any).
     * Returns null if no active stream exists.
     * Includes live token count and TPS for real-time display.
     */
    getActiveStreamTimingStats() {
        // Get the first (and typically only) active stream
        const entries = Array.from(this.activeStreams.entries());
        if (entries.length === 0)
            return null;
        const [messageId, context] = entries[0];
        const now = Date.now();
        const startTime = this.translateServerTime(context, context.serverStartTime);
        const firstTokenTime = context.serverFirstTokenTime !== null
            ? this.translateServerTime(context, context.serverFirstTokenTime)
            : null;
        // Include time from currently-executing tools (not just completed ones)
        let totalToolMs = context.toolExecutionMs;
        for (const toolStartServerTime of context.pendingToolStarts.values()) {
            const toolStartTime = this.translateServerTime(context, toolStartServerTime);
            totalToolMs += Math.max(0, now - toolStartTime);
        }
        return {
            startTime,
            firstTokenTime,
            toolExecutionMs: totalToolMs,
            model: context.model,
            liveTokenCount: this.getStreamingTokenCount(messageId),
            liveTPS: this.getStreamingTPS(messageId),
            mode: context.mode,
        };
    }
    /**
     * Get timing statistics from the last completed stream.
     * Returns null if no stream has completed yet in this session.
     * Unlike getActiveStreamTimingStats, this includes endTime and token counts.
     */
    getLastCompletedStreamStats() {
        return this.lastCompletedStreamStats;
    }
    /**
     * Get aggregate timing statistics across all completed streams in this session.
     * Totals are computed on-the-fly from per-model data.
     * Returns null if no streams have completed yet.
     *
     * Session timing keys use format "model" or "model:mode" (e.g., "claude-opus-4:plan").
     * The byModelAndMode map preserves this structure for mode breakdown display.
     */
    getSessionTimingStats() {
        const modelEntries = Object.entries(this.sessionTimingStats);
        if (modelEntries.length === 0)
            return null;
        // Aggregate totals from per-model stats
        let totalDurationMs = 0;
        let totalToolExecutionMs = 0;
        let totalStreamingMs = 0;
        let totalTtftMs = 0;
        let ttftCount = 0;
        let responseCount = 0;
        let totalOutputTokens = 0;
        let totalReasoningTokens = 0;
        const byModel = {};
        for (const [key, stats] of modelEntries) {
            // Parse composite key: "model" or "model:mode"
            // Model names can contain colons (e.g., "mux-gateway:provider/model")
            // so we look for ":plan" or ":exec" suffix specifically
            let mode;
            if (key.endsWith(":plan")) {
                mode = "plan";
            }
            else if (key.endsWith(":exec")) {
                mode = "exec";
            }
            // Accumulate totals
            totalDurationMs += stats.totalDurationMs;
            totalToolExecutionMs += stats.totalToolExecutionMs;
            totalStreamingMs += stats.totalStreamingMs ?? 0;
            totalTtftMs += stats.totalTtftMs;
            ttftCount += stats.ttftCount;
            responseCount += stats.responseCount;
            totalOutputTokens += stats.totalOutputTokens;
            totalReasoningTokens += stats.totalReasoningTokens;
            // Convert to display format (with computed average)
            // Keep composite key as-is - StatsTab will parse/aggregate as needed
            byModel[key] = {
                totalDurationMs: stats.totalDurationMs,
                totalToolExecutionMs: stats.totalToolExecutionMs,
                totalStreamingMs: stats.totalStreamingMs ?? 0,
                averageTtftMs: stats.ttftCount > 0 ? stats.totalTtftMs / stats.ttftCount : null,
                responseCount: stats.responseCount,
                totalOutputTokens: stats.totalOutputTokens,
                totalReasoningTokens: stats.totalReasoningTokens,
                mode,
            };
        }
        return {
            totalDurationMs,
            totalToolExecutionMs,
            totalStreamingMs,
            averageTtftMs: ttftCount > 0 ? totalTtftMs / ttftCount : null,
            responseCount,
            totalOutputTokens,
            totalReasoningTokens,
            byModel,
        };
    }
    getActiveStreams() {
        return Array.from(this.activeStreams.values());
    }
    /**
     * Get the messageId of the first active stream (for token tracking)
     * Returns undefined if no streams are active
     */
    getActiveStreamMessageId() {
        return this.activeStreams.keys().next().value;
    }
    /**
     * Mark the current active stream as "interrupting" (transient state).
     * Called before interruptStream so UI shows "interrupting..." immediately.
     * Cleared when real stream-abort arrives, at which point "interrupted" shows.
     */
    setInterrupting() {
        const activeMessageId = this.getActiveStreamMessageId();
        if (activeMessageId) {
            this.interruptingMessageId = activeMessageId;
            this.invalidateCache();
        }
    }
    /**
     * Check if a message is in the "interrupting" transient state.
     */
    isInterrupting(messageId) {
        return this.interruptingMessageId === messageId;
    }
    /**
     * Check if any stream is currently being interrupted.
     */
    hasInterruptingStream() {
        return this.interruptingMessageId !== null;
    }
    isCompacting() {
        for (const context of this.activeStreams.values()) {
            if (context.isCompacting) {
                return true;
            }
        }
        return false;
    }
    getCurrentModel() {
        // If there's an active stream, return its model
        for (const context of this.activeStreams.values()) {
            return context.model;
        }
        // Otherwise, return the model from the most recent assistant message
        const messages = this.getAllMessages();
        for (let i = messages.length - 1; i >= 0; i--) {
            const message = messages[i];
            if (message.role === "assistant" && message.metadata?.model) {
                return message.metadata.model;
            }
        }
        return undefined;
    }
    /**
     * Returns the effective thinking level for the current or most recent stream.
     * This reflects the actual level used after model policy clamping, not the
     * user-configured level.
     */
    getCurrentThinkingLevel() {
        // If there's an active stream, return its thinking level
        for (const context of this.activeStreams.values()) {
            return context.thinkingLevel;
        }
        // Only check the most recent assistant message to avoid returning
        // stale values from older turns where settings may have differed.
        // If it lacks thinkingLevel (e.g. error/abort), return undefined so
        // callers fall back to localStorage.
        const messages = this.getAllMessages();
        for (let i = messages.length - 1; i >= 0; i--) {
            const message = messages[i];
            if (message.role === "assistant") {
                return message.metadata?.thinkingLevel;
            }
        }
        return undefined;
    }
    clearActiveStreams() {
        const activeMessageIds = Array.from(this.activeStreams.keys());
        this.activeStreams.clear();
        // Clear optimistic interrupt flag since all streams are cleared
        this.interruptingMessageId = null;
        if (activeMessageIds.length > 0) {
            for (const messageId of activeMessageIds) {
                this.bumpMessageVersion(messageId);
            }
            this.invalidateCache();
        }
    }
    clear() {
        this.messages.clear();
        this.activeStreams.clear();
        this.displayedMessageCache.clear();
        this.messageVersions.clear();
        this.interruptingMessageId = null;
        this.lastAbortReason = null;
        this.invalidateCache();
    }
    /**
     * Remove messages with specific historySequence numbers
     * Used when backend truncates history
     */
    handleDeleteMessage(deleteMsg) {
        const sequencesToDelete = new Set(deleteMsg.historySequences);
        // Remove messages that match the historySequence numbers
        for (const [messageId, message] of this.messages.entries()) {
            const historySeq = message.metadata?.historySequence;
            if (historySeq !== undefined && sequencesToDelete.has(historySeq)) {
                this.deleteMessage(messageId);
            }
        }
        this.invalidateCache();
    }
    // Unified event handlers that encapsulate all complex logic
    handleStreamStart(data) {
        // Detect compaction via stream mode (most authoritative).
        // For backwards compat (older stream-start events without mode), fall back to the
        // triggering compaction request metadata (pending or last user message).
        const compactionRequest = this.getLatestCompactionRequest();
        const isCompacting = data.mode === "compact" || compactionRequest !== null;
        // Capture compaction-continue metadata before clearing pending request state.
        const hasCompactionContinue = Boolean(compactionRequest?.followUpContent);
        // Clear pending stream start timestamp - stream has started
        this.setPendingStreamStartTime(null);
        this.lastAbortReason = null;
        // Clear runtime status - runtime is ready now that stream has started
        this.runtimeStatus = null;
        // NOTE: We do NOT clear agentStatus or currentTodos here.
        // They are cleared when a new user message arrives (see handleMessage),
        // ensuring consistent behavior whether loading from history or processing live events.
        const now = Date.now();
        const context = {
            serverStartTime: data.startTime,
            clockOffsetMs: now - data.startTime,
            lastServerTimestamp: data.startTime,
            isComplete: false,
            isCompacting,
            hasCompactionContinue,
            model: data.model,
            routedThroughGateway: data.routedThroughGateway,
            serverFirstTokenTime: null,
            toolExecutionMs: 0,
            pendingToolStarts: new Map(),
            mode: data.mode,
            thinkingLevel: data.thinkingLevel,
        };
        // Use messageId as key - ensures only ONE stream per message
        // If called twice (e.g., during replay), second call safely overwrites first
        this.activeStreams.set(data.messageId, context);
        // Create initial streaming message with empty parts (deltas will append)
        const streamingMessage = createMuxMessage(data.messageId, "assistant", "", {
            historySequence: data.historySequence,
            timestamp: Date.now(),
            model: data.model,
            routedThroughGateway: data.routedThroughGateway,
            mode: data.mode,
            thinkingLevel: data.thinkingLevel,
        });
        this.messages.set(data.messageId, streamingMessage);
        this.markMessageDirty(data.messageId);
    }
    handleStreamDelta(data) {
        const message = this.messages.get(data.messageId);
        if (!message)
            return;
        const context = this.activeStreams.get(data.messageId);
        if (context) {
            this.updateStreamClock(context, data.timestamp);
            // Track first token time (only for non-empty deltas)
            if (data.delta.length > 0 && context.serverFirstTokenTime === null) {
                context.serverFirstTokenTime = data.timestamp;
            }
        }
        // Append each delta as a new part (merging happens at display time)
        message.parts.push({
            type: "text",
            text: data.delta,
            timestamp: data.timestamp,
        });
        // Track delta for token counting and TPS calculation
        this.trackDelta(data.messageId, data.tokens, data.timestamp, "text");
        this.markMessageDirty(data.messageId);
    }
    handleStreamEnd(data) {
        // Direct lookup by messageId - O(1) instead of O(n) find
        const activeStream = this.activeStreams.get(data.messageId);
        if (activeStream) {
            // Normal streaming case: we've been tracking this stream from the start
            const message = this.messages.get(data.messageId);
            if (message?.metadata) {
                // Transparent metadata merge - backend fields flow through automatically
                const updatedMetadata = {
                    ...message.metadata,
                    ...data.metadata,
                };
                const durationMs = data.metadata.duration;
                if (typeof durationMs === "number" && Number.isFinite(durationMs)) {
                    this.updateStreamClock(activeStream, activeStream.serverStartTime + durationMs);
                }
                message.metadata = updatedMetadata;
                // Update tool parts with their results if provided
                if (data.parts) {
                    // Sync up the tool results from the backend's parts array
                    for (const backendPart of data.parts) {
                        if (backendPart.type === "dynamic-tool" && backendPart.state === "output-available") {
                            // Find and update existing tool part
                            const toolPart = message.parts.find((part) => part.type === "dynamic-tool" && part.toolCallId === backendPart.toolCallId);
                            if (toolPart) {
                                // Update with result from backend
                                toolPart.output = backendPart.output;
                                toolPart.state = "output-available";
                            }
                        }
                    }
                }
                // Compact parts to merge adjacent text/reasoning deltas into single strings
                // This reduces memory from thousands of small delta objects to a few merged objects
                this.compactMessageParts(message);
            }
            // Capture compaction info before cleanup (cleanup removes the stream context)
            const compaction = activeStream.isCompacting
                ? { hasContinueMessage: activeStream.hasCompactionContinue }
                : undefined;
            // Clean up stream-scoped state (active stream tracking, TODOs)
            this.cleanupStreamState(data.messageId);
            // Notify on normal stream completion (skip replay-only reconstruction)
            // isFinal = true when this was the last active stream (assistant done with all work)
            if (this.workspaceId && this.onResponseComplete) {
                const isFinal = this.activeStreams.size === 0;
                const finalText = this.extractFinalResponseText(message);
                this.onResponseComplete(this.workspaceId, data.messageId, isFinal, finalText, compaction);
            }
        }
        else {
            // Reconnection case: user reconnected after stream completed
            // We reconstruct the entire message from the stream-end event
            // The backend now sends us the parts array with proper temporal ordering
            // Backend MUST provide historySequence in metadata
            // Create the complete message
            const message = {
                id: data.messageId,
                role: "assistant",
                metadata: {
                    ...data.metadata,
                    timestamp: data.metadata.timestamp ?? Date.now(),
                },
                parts: data.parts,
            };
            this.messages.set(data.messageId, message);
            // Clean up stream-scoped state (active stream tracking, TODOs)
            this.cleanupStreamState(data.messageId);
        }
        // Assistant message is now stable (completed or reconnected) - invalidate all caches.
        this.markMessageDirty(data.messageId);
    }
    handleStreamAbort(data) {
        // Clear pending stream start timestamp - abort can arrive before stream-start.
        // This ensures StreamingBarrier exits the "starting..." phase immediately.
        this.setPendingStreamStartTime(null);
        this.lastAbortReason = {
            reason: data.abortReason ?? "system",
            at: Date.now(),
        };
        // Clear "interrupting" state - stream is now fully "interrupted"
        if (this.interruptingMessageId === data.messageId) {
            this.interruptingMessageId = null;
        }
        // Direct lookup by messageId
        // Clear runtime status (ensureReady is no longer relevant once stream aborts)
        this.runtimeStatus = null;
        const activeStream = this.activeStreams.get(data.messageId);
        if (activeStream) {
            // Mark the message as interrupted and merge metadata (consistent with handleStreamEnd)
            const message = this.messages.get(data.messageId);
            if (message?.metadata) {
                message.metadata = {
                    ...message.metadata,
                    partial: true,
                    ...data.metadata, // Spread abort metadata (usage, duration)
                };
                // Compact parts even on abort - still reduces memory for partial messages
                this.compactMessageParts(message);
            }
            // Clean up stream-scoped state (active stream tracking, TODOs)
            this.cleanupStreamState(data.messageId);
            // Assistant message is now stable (aborted) - invalidate all caches.
            this.markMessageDirty(data.messageId);
        }
    }
    handleStreamError(data) {
        // Clear pending stream start timestamp - error arrived before/instead of stream-start.
        // This ensures StreamingBarrier exits the "starting..." phase immediately.
        this.setPendingStreamStartTime(null);
        // Direct lookup by messageId
        // Clear runtime status - runtime start/ensureReady failed
        this.runtimeStatus = null;
        const activeStream = this.activeStreams.get(data.messageId);
        if (activeStream) {
            // Mark the message with error metadata
            const message = this.messages.get(data.messageId);
            if (message?.metadata) {
                message.metadata.partial = true;
                message.metadata.error = data.error;
                message.metadata.errorType = data.errorType;
                // Compact parts even on error - still reduces memory for partial messages
                this.compactMessageParts(message);
            }
            // Clean up stream-scoped state (active stream tracking, TODOs)
            this.cleanupStreamState(data.messageId);
            // Assistant message is now stable (errored) - invalidate all caches.
            this.markMessageDirty(data.messageId);
        }
        else {
            // Pre-stream error (e.g., API key not configured before streaming starts)
            // Create a synthetic error message since there's no active stream to attach to
            // Get the highest historySequence from existing messages so this appears at the end
            const maxSequence = Math.max(0, ...Array.from(this.messages.values()).map((m) => m.metadata?.historySequence ?? 0));
            const errorMessage = {
                id: data.messageId,
                role: "assistant",
                parts: [],
                metadata: {
                    partial: true,
                    error: data.error,
                    errorType: data.errorType,
                    timestamp: Date.now(),
                    historySequence: maxSequence + 1,
                },
            };
            this.messages.set(data.messageId, errorMessage);
            this.markMessageDirty(data.messageId);
        }
    }
    handleToolCallStart(data) {
        const message = this.messages.get(data.messageId);
        if (!message)
            return;
        // If this is a nested call (from PTC code_execution), add to parent's nestedCalls
        if (data.parentToolCallId) {
            const parentPart = message.parts.find((part) => part.type === "dynamic-tool" && part.toolCallId === data.parentToolCallId);
            if (parentPart) {
                // Initialize nestedCalls array if needed
                parentPart.nestedCalls ?? (parentPart.nestedCalls = []);
                parentPart.nestedCalls.push({
                    toolCallId: data.toolCallId,
                    toolName: data.toolName,
                    state: "input-available",
                    input: data.args,
                    timestamp: data.timestamp,
                });
                this.markMessageDirty(data.messageId);
                return;
            }
        }
        // Check if this tool call already exists to prevent duplicates
        const existingToolPart = message.parts.find((part) => part.type === "dynamic-tool" && part.toolCallId === data.toolCallId);
        if (existingToolPart) {
            console.warn(`Tool call ${data.toolCallId} already exists, skipping duplicate`);
            return;
        }
        // Track tool start time for execution duration calculation
        const context = this.activeStreams.get(data.messageId);
        if (context) {
            this.updateStreamClock(context, data.timestamp);
            context.pendingToolStarts.set(data.toolCallId, data.timestamp);
        }
        // Add tool part to maintain temporal order
        const toolPart = {
            type: "dynamic-tool",
            toolCallId: data.toolCallId,
            toolName: data.toolName,
            state: "input-available",
            input: data.args,
            timestamp: data.timestamp,
        };
        message.parts.push(toolPart);
        // Track tokens for tool input
        this.trackDelta(data.messageId, data.tokens, data.timestamp, "tool-args");
        this.markMessageDirty(data.messageId);
    }
    handleToolCallDelta(data) {
        // Track delta for token counting and TPS calculation
        this.trackDelta(data.messageId, data.tokens, data.timestamp, "tool-args");
        // Tool deltas are for display - args are in dynamic-tool part
    }
    trackLoadedSkill(skill) {
        const existing = this.loadedSkills.get(skill.name);
        if (existing?.name === skill.name &&
            existing.description === skill.description &&
            existing.scope === skill.scope) {
            return;
        }
        this.loadedSkills.set(skill.name, skill);
        // Preserve a stable array reference for getLoadedSkills(): only replace when it changes.
        this.loadedSkillsCache = Array.from(this.loadedSkills.values());
        // A successful load supersedes any previous error for this skill
        if (this.skillLoadErrors.delete(skill.name)) {
            this.skillLoadErrorsCache = Array.from(this.skillLoadErrors.values());
        }
    }
    trackSkillLoadError(name, error) {
        const existing = this.skillLoadErrors.get(name);
        if (existing?.error === error)
            return;
        this.skillLoadErrors.set(name, { name, error });
        this.skillLoadErrorsCache = Array.from(this.skillLoadErrors.values());
        // A failed load supersedes any earlier success (skill may have been
        // edited/deleted since the previous successful read)
        if (this.loadedSkills.delete(name)) {
            this.loadedSkillsCache = Array.from(this.loadedSkills.values());
        }
    }
    maybeTrackLoadedSkillFromAgentSkillSnapshot(snapshot) {
        const parsed = AgentSkillSnapshotMetadataSchema.safeParse(snapshot);
        if (!parsed.success) {
            return;
        }
        const { skillName, scope } = parsed.data;
        // Don't override an existing entry (e.g. from agent_skill_read) with a placeholder description.
        if (this.loadedSkills.has(skillName)) {
            return;
        }
        this.trackLoadedSkill({
            name: skillName,
            description: `(loaded via /${skillName})`,
            scope,
        });
    }
    /**
     * Process a completed tool call's result to update derived state.
     * Called for both live tool-call-end events and historical tool parts.
     *
     * This is the single source of truth for updating state from tool results,
     * ensuring consistency whether processing live events or historical messages.
     *
     * @param toolName - Name of the tool that was called
     * @param input - Tool input arguments
     * @param output - Tool output result
     * @param context - Whether this is from live streaming or historical reload
     */
    processToolResult(toolName, input, output, context) {
        // Update TODO state if this was a successful todo_write
        // TODOs are stream-scoped: only update during live streaming, not on historical reload
        if (toolName === "todo_write" && hasSuccessResult(output) && context === "streaming") {
            const args = input;
            // Only update if todos actually changed (prevents flickering from reference changes)
            if (!this.todosEqual(this.currentTodos, args.todos)) {
                this.currentTodos = args.todos;
            }
        }
        // Update agent status if this was a successful status_set
        // agentStatus persists: update both during streaming and on historical reload
        // Use output instead of input to get the truncated message
        if (toolName === "status_set" && hasSuccessResult(output)) {
            const result = output;
            // Use the provided URL, or fall back to the last URL ever set
            const url = result.url ?? this.lastStatusUrl;
            if (url) {
                this.lastStatusUrl = url;
            }
            this.agentStatus = {
                emoji: result.emoji,
                message: result.message,
                url,
            };
            this.savePersistedAgentStatus(this.agentStatus);
        }
        // Handle browser notifications when Electron wasn't available
        if (toolName === "notify" && hasSuccessResult(output)) {
            const result = output;
            const uiOnlyNotify = getToolOutputUiOnly(output)?.notify;
            const legacyNotify = output;
            const notifiedVia = uiOnlyNotify?.notifiedVia ?? legacyNotify.notifiedVia;
            const workspaceId = uiOnlyNotify?.workspaceId ?? legacyNotify.workspaceId;
            if (notifiedVia === "browser") {
                this.sendBrowserNotification(result.title, result.message, workspaceId);
            }
        }
        // Track loaded skills when agent_skill_read succeeds
        // Skills persist: update both during streaming and on historical reload
        if (toolName === "agent_skill_read" && hasSuccessResult(output)) {
            const result = output;
            const skill = result.skill;
            this.trackLoadedSkill({
                name: skill.frontmatter.name,
                description: skill.frontmatter.description,
                scope: skill.scope,
            });
        }
        // Track runtime skill load errors when agent_skill_read fails
        if (toolName === "agent_skill_read" && hasFailureResult(output)) {
            const args = input;
            const errorResult = output;
            if (args?.name) {
                this.trackSkillLoadError(args.name, errorResult.error ?? "Unknown error");
            }
        }
        // Link extraction is derived from message history (see computeLinksFromMessages()).
        // When a tool output becomes available, handleToolCallEnd invalidates the link cache.
    }
    /**
     * Send a browser notification using the Web Notifications API
     * Only called when Electron notifications are unavailable.
     * Clicking the notification navigates to the workspace.
     */
    sendBrowserNotification(title, body, workspaceId) {
        if (!("Notification" in window))
            return;
        const showNotification = () => {
            const notification = new Notification(title, { body });
            if (workspaceId) {
                notification.onclick = () => {
                    // Focus the window and navigate to the workspace
                    window.focus();
                    this.onNavigateToWorkspace?.(workspaceId);
                };
            }
        };
        if (Notification.permission === "granted") {
            showNotification();
        }
        else if (Notification.permission !== "denied") {
            void Notification.requestPermission().then((perm) => {
                if (perm === "granted") {
                    showNotification();
                }
            });
        }
    }
    handleToolCallEnd(data) {
        // Track tool execution duration
        const context = this.activeStreams.get(data.messageId);
        if (context) {
            this.updateStreamClock(context, data.timestamp);
            const startTime = context.pendingToolStarts.get(data.toolCallId);
            if (startTime !== undefined) {
                // Clamp to non-negative to handle out-of-order timestamps during replay
                context.toolExecutionMs += Math.max(0, data.timestamp - startTime);
                context.pendingToolStarts.delete(data.toolCallId);
            }
        }
        const message = this.messages.get(data.messageId);
        if (message) {
            // If nested, update in parent's nestedCalls array
            if (data.parentToolCallId) {
                const parentIndex = message.parts.findIndex((part) => part.type === "dynamic-tool" && part.toolCallId === data.parentToolCallId);
                const parentPart = message.parts[parentIndex];
                if (parentPart?.nestedCalls) {
                    const nestedIndex = parentPart.nestedCalls.findIndex((nc) => nc.toolCallId === data.toolCallId);
                    if (nestedIndex !== -1) {
                        // Create new objects to trigger React re-render (immutable update pattern)
                        const updatedNestedCalls = parentPart.nestedCalls.map((nc, i) => i === nestedIndex
                            ? { ...nc, state: "output-available", output: data.result }
                            : nc);
                        message.parts[parentIndex] = { ...parentPart, nestedCalls: updatedNestedCalls };
                        this.markMessageDirty(data.messageId);
                        return;
                    }
                }
            }
            // Find the specific tool part by its ID and update it with the result
            // We don't move it - it stays in its original temporal position
            const toolPart = message.parts.find((part) => part.type === "dynamic-tool" && part.toolCallId === data.toolCallId);
            if (toolPart) {
                // Type assertion needed because TypeScript can't narrow the discriminated union
                toolPart.state = "output-available";
                toolPart.output = data.result;
                // Process tool result to update derived state (todos, agentStatus, etc.)
                // This is from a live stream, so use "streaming" context
                this.processToolResult(data.toolName, toolPart.input, data.result, "streaming");
                // Tool output is now stable - invalidate all caches.
                this.markMessageDirty(data.messageId);
            }
            else {
                // Tool part not found (shouldn't happen normally) - still invalidate display cache.
                this.markMessageDirty(data.messageId);
            }
        }
    }
    handleReasoningDelta(data) {
        const message = this.messages.get(data.messageId);
        if (!message)
            return;
        const context = this.activeStreams.get(data.messageId);
        if (context) {
            this.updateStreamClock(context, data.timestamp);
            // Track first token time (reasoning also counts as first token)
            if (data.delta.length > 0 && context.serverFirstTokenTime === null) {
                context.serverFirstTokenTime = data.timestamp;
            }
        }
        // Append each delta as a new part (merging happens at display time)
        message.parts.push({
            type: "reasoning",
            text: data.delta,
            timestamp: data.timestamp,
        });
        // Track delta for token counting and TPS calculation
        this.trackDelta(data.messageId, data.tokens, data.timestamp, "reasoning");
        this.markMessageDirty(data.messageId);
    }
    handleReasoningEnd(_data) {
        // Reasoning-end is just a signal - no state to update
        // Streaming status is inferred from activeStreams in getDisplayedMessages
        this.invalidateCache();
    }
    handleMessage(data) {
        // Handle init hook events (ephemeral, not persisted to history)
        if (isInitStart(data)) {
            this.initState = {
                status: "running",
                hookPath: data.hookPath,
                lines: [],
                exitCode: null,
                startTime: data.timestamp,
                endTime: null,
            };
            this.invalidateCache();
            return;
        }
        if (isInitOutput(data)) {
            if (!this.initState) {
                console.error("Received init-output without init-start", { data });
                return;
            }
            if (!data.line) {
                console.error("Received init-output with missing line field", { data });
                return;
            }
            const line = data.line.trimEnd();
            const isError = data.isError === true;
            // Truncation: keep only the most recent MAX_LINES (matches backend)
            if (this.initState.lines.length >= INIT_HOOK_MAX_LINES) {
                this.initState.lines.shift(); // Drop oldest line
                this.initState.truncatedLines = (this.initState.truncatedLines ?? 0) + 1;
            }
            this.initState.lines.push({ line, isError });
            // Throttle cache invalidation during fast streaming to avoid re-render per line
            this.initOutputThrottleTimer ?? (this.initOutputThrottleTimer = setTimeout(() => {
                this.initOutputThrottleTimer = null;
                this.invalidateCache();
            }, StreamingMessageAggregator.INIT_OUTPUT_THROTTLE_MS));
            return;
        }
        if (isInitEnd(data)) {
            if (!this.initState) {
                console.error("Received init-end without init-start", { data });
                return;
            }
            this.initState.exitCode = data.exitCode;
            this.initState.status = data.exitCode === 0 ? "success" : "error";
            this.initState.endTime = data.timestamp;
            // Use backend truncation count if larger (covers replay of old data)
            if (data.truncatedLines && data.truncatedLines > (this.initState.truncatedLines ?? 0)) {
                this.initState.truncatedLines = data.truncatedLines;
            }
            // Cancel any pending throttled update and flush immediately
            if (this.initOutputThrottleTimer) {
                clearTimeout(this.initOutputThrottleTimer);
                this.initOutputThrottleTimer = null;
            }
            // Reset pending stream start time so the grace period starts fresh after init completes.
            // This prevents false retry barriers for slow init (e.g., Coder workspace provisioning).
            if (this.pendingStreamStartTime !== null) {
                this.setPendingStreamStartTime(Date.now());
            }
            this.invalidateCache();
            return;
        }
        // Handle regular messages (user messages, historical messages)
        // Check if it's a MuxMessage (has role property but no type)
        if (isMuxMessage(data)) {
            const incomingMessage = data;
            // Smart replacement logic for edits:
            // If a message arrives with a historySequence that already exists,
            // it means history was truncated (edit operation). Remove the existing
            // message at that sequence and all subsequent messages, then add the new one.
            const incomingSequence = incomingMessage.metadata?.historySequence;
            if (incomingSequence !== undefined) {
                // Check if there's already a message with this sequence
                for (const [_id, msg] of this.messages.entries()) {
                    const existingSequence = msg.metadata?.historySequence;
                    if (existingSequence !== undefined && existingSequence >= incomingSequence) {
                        // Found a conflict - remove this message and all after it
                        const messagesToRemove = [];
                        for (const [removeId, removeMsg] of this.messages.entries()) {
                            const removeSeq = removeMsg.metadata?.historySequence;
                            if (removeSeq !== undefined && removeSeq >= incomingSequence) {
                                messagesToRemove.push(removeId);
                            }
                        }
                        for (const removeId of messagesToRemove) {
                            this.deleteMessage(removeId);
                        }
                        break; // Found and handled the conflict
                    }
                }
            }
            // When a compaction boundary arrives during a live session, prune messages
            // older than the penultimate boundary so the UI matches what a fresh load
            // would show (emitHistoricalEvents reads from skip=1, the penultimate boundary).
            // The user sees the previous epoch + current epoch; older epochs are pruned.
            // Without this, all pre-boundary messages persist until the next page refresh.
            // TODO: support paginated history loading so users can view older epochs on demand.
            if (this.isCompactionBoundarySummaryMessage(incomingMessage)) {
                this.pruneBeforePenultimateBoundary(incomingMessage);
            }
            // Now add the new message
            this.addMessage(incomingMessage);
            this.maybeTrackLoadedSkillFromAgentSkillSnapshot(incomingMessage.metadata?.agentSkillSnapshot);
            // If this is a user message, clear derived state and record timestamp
            if (incomingMessage.role === "user") {
                const muxMeta = incomingMessage.metadata?.muxMetadata;
                // Always clear todos (stream-scoped state)
                this.currentTodos = [];
                // Capture pending compaction metadata for pre-stream UI ("starting" phase).
                const muxMetadata = incomingMessage.metadata?.muxMetadata;
                this.pendingCompactionRequest =
                    muxMetadata?.type === "compaction-request" ? muxMetadata.parsed : null;
                this.pendingStreamModel = muxMetadata?.requestedModel ?? null;
                if (muxMeta?.displayStatus) {
                    // Background operation - show requested status (don't persist)
                    this.agentStatus = muxMeta.displayStatus;
                }
                else {
                    // Normal user turn - clear status
                    this.agentStatus = undefined;
                    this.clearPersistedAgentStatus();
                }
                this.lastAbortReason = null;
                this.setPendingStreamStartTime(Date.now());
            }
        }
    }
    isCompactionBoundarySummaryMessage(message) {
        const muxMeta = message.metadata?.muxMetadata;
        return (message.role === "assistant" &&
            (message.metadata?.compactionBoundary === true || muxMeta?.type === "compaction-summary"));
    }
    /**
     * Keep the previous epoch visible: when the new (Nth) boundary arrives,
     * find the penultimate (N-1) boundary among existing messages and prune
     * everything before it. This matches the backend's getHistoryFromLatestBoundary
     * which reads from the n-1 boundary.
     *
     * If only one boundary exists (the incoming one), nothing is pruned — the
     * user sees their full first-epoch history.
     */
    pruneBeforePenultimateBoundary(_incomingBoundary) {
        // Find the penultimate boundary among the *existing* messages (before adding
        // the incoming one). With the incoming boundary about to become the latest,
        // the existing latest boundary becomes the penultimate one.
        let penultimateBoundarySeq;
        for (const [, msg] of this.messages.entries()) {
            if (!this.isCompactionBoundarySummaryMessage(msg))
                continue;
            const seq = msg.metadata?.historySequence;
            if (seq === undefined)
                continue;
            // The highest-sequence boundary in existing messages is the one that
            // will become the penultimate once the incoming boundary is added.
            if (penultimateBoundarySeq === undefined || seq > penultimateBoundarySeq) {
                penultimateBoundarySeq = seq;
            }
        }
        // No existing boundary → this is the first compaction, nothing to prune
        if (penultimateBoundarySeq === undefined)
            return;
        const toRemove = [];
        for (const [id, msg] of this.messages.entries()) {
            const seq = msg.metadata?.historySequence;
            if (seq !== undefined && seq < penultimateBoundarySeq) {
                toRemove.push(id);
            }
        }
        for (const id of toRemove) {
            this.deleteMessage(id);
        }
        if (toRemove.length > 0) {
            this.invalidateCache();
        }
    }
    createCompactionBoundaryRow(message, historySequence) {
        assert(message.role === "assistant", "compaction boundaries must belong to assistant summaries");
        const rawCompactionEpoch = message.metadata?.compactionEpoch;
        const compactionEpoch = typeof rawCompactionEpoch === "number" &&
            Number.isInteger(rawCompactionEpoch) &&
            rawCompactionEpoch > 0
            ? rawCompactionEpoch
            : undefined;
        // Self-healing read path: malformed persisted compactionEpoch should not crash transcript rendering.
        return {
            type: "compaction-boundary",
            id: `${message.id}-compaction-boundary`,
            historySequence,
            position: "start",
            compactionEpoch,
        };
    }
    buildDisplayedMessagesForMessage(message, agentSkillSnapshot) {
        const displayedMessages = [];
        const baseTimestamp = message.metadata?.timestamp;
        const historySequence = message.metadata?.historySequence ?? 0;
        // Check for plan-display messages (ephemeral /plan output)
        const muxMeta = message.metadata?.muxMetadata;
        if (muxMeta?.type === "plan-display") {
            const content = message.parts
                .filter((p) => p.type === "text")
                .map((p) => p.text)
                .join("");
            displayedMessages.push({
                type: "plan-display",
                id: message.id,
                historyId: message.id,
                content,
                path: muxMeta.path,
                historySequence,
            });
            return displayedMessages;
        }
        if (message.role === "user") {
            // User messages: combine all text parts into single block, extract attachments
            const partsContent = message.parts
                .filter((p) => p.type === "text")
                .map((p) => p.text)
                .join("");
            const fileParts = message.parts
                .filter((p) => p.type === "file")
                .map((p) => ({
                url: typeof p.url === "string" ? p.url : "",
                mediaType: p.mediaType,
                filename: p.filename,
            }));
            // Extract slash command from muxMetadata (present for /compact, /skill, etc.)
            let rawCommand = muxMeta && "rawCommand" in muxMeta ? muxMeta.rawCommand : undefined;
            const agentSkill = muxMeta?.type === "agent-skill"
                ? {
                    skillName: muxMeta.skillName,
                    scope: muxMeta.scope,
                    snapshot: agentSkillSnapshot,
                }
                : undefined;
            const compactionFollowUp = getCompactionFollowUpContent(muxMeta);
            const compactionRequest = muxMeta?.type === "compaction-request"
                ? {
                    parsed: {
                        model: muxMeta.parsed.model,
                        maxOutputTokens: muxMeta.parsed.maxOutputTokens,
                        followUpContent: compactionFollowUp,
                    },
                }
                : undefined;
            // Reconstruct full rawCommand if follow-up text isn't already included
            if (rawCommand && compactionRequest?.parsed.followUpContent && !rawCommand.includes("\n")) {
                const followUpText = getFollowUpContentText(compactionRequest.parsed.followUpContent);
                if (followUpText) {
                    rawCommand = `${rawCommand}\n${followUpText}`;
                }
            }
            // Content is rawCommand (what user typed) or parts (normal message)
            const content = rawCommand ?? partsContent;
            // commandPrefix comes directly from metadata - no reconstruction needed
            const commandPrefix = muxMeta?.commandPrefix;
            // Extract reviews from muxMetadata for rich UI display (orthogonal to message type)
            const reviews = muxMeta?.reviews;
            displayedMessages.push({
                type: "user",
                id: message.id,
                historyId: message.id,
                content,
                commandPrefix,
                fileParts: fileParts.length > 0 ? fileParts : undefined,
                historySequence,
                isSynthetic: message.metadata?.synthetic === true ? true : undefined,
                timestamp: baseTimestamp,
                agentSkill,
                compactionRequest,
                reviews,
            });
            return displayedMessages;
        }
        if (message.role === "assistant") {
            // Assistant messages: each part becomes a separate DisplayedMessage
            // Use streamSequence to order parts within this message
            let streamSeq = 0;
            // Check if this message has an active stream (for inferring streaming status)
            // Direct Map.has() check - O(1) instead of O(n) iteration
            const hasActiveStream = this.activeStreams.has(message.id);
            // isPartial from metadata (set by stream-abort event)
            const isPartial = message.metadata?.partial === true;
            // Merge adjacent text/reasoning parts for display
            const mergedParts = mergeAdjacentParts(message.parts);
            // Find the last part that will produce a DisplayedMessage
            // (reasoning, text parts with content, OR tool parts)
            let lastPartIndex = -1;
            for (let i = mergedParts.length - 1; i >= 0; i--) {
                const part = mergedParts[i];
                if (part.type === "reasoning" ||
                    (part.type === "text" && part.text) ||
                    isDynamicToolPart(part)) {
                    lastPartIndex = i;
                    break;
                }
            }
            const isCompactionBoundarySummary = this.isCompactionBoundarySummaryMessage(message);
            if (isCompactionBoundarySummary) {
                displayedMessages.push(this.createCompactionBoundaryRow(message, historySequence));
            }
            mergedParts.forEach((part, partIndex) => {
                const isLastPart = partIndex === lastPartIndex;
                // Part is streaming if: active stream exists AND this is the last part
                const isStreaming = hasActiveStream && isLastPart;
                if (part.type === "reasoning") {
                    // Reasoning part - shows thinking/reasoning content
                    displayedMessages.push({
                        type: "reasoning",
                        id: `${message.id}-${partIndex}`,
                        historyId: message.id,
                        content: part.text,
                        historySequence,
                        streamSequence: streamSeq++,
                        isStreaming,
                        isPartial,
                        isLastPartOfMessage: isLastPart,
                        timestamp: part.timestamp ?? baseTimestamp,
                    });
                }
                else if (part.type === "text" && part.text) {
                    // Skip empty text parts
                    displayedMessages.push({
                        type: "assistant",
                        id: `${message.id}-${partIndex}`,
                        historyId: message.id,
                        content: part.text,
                        historySequence,
                        streamSequence: streamSeq++,
                        isStreaming,
                        isPartial,
                        isLastPartOfMessage: isLastPart,
                        // Support both new enum ("user"|"idle") and legacy boolean (true)
                        isCompacted: !!message.metadata?.compacted,
                        isIdleCompacted: message.metadata?.compacted === "idle",
                        model: message.metadata?.model,
                        routedThroughGateway: message.metadata?.routedThroughGateway,
                        mode: message.metadata?.mode,
                        agentId: message.metadata?.agentId ?? message.metadata?.mode,
                        timestamp: part.timestamp ?? baseTimestamp,
                    });
                }
                else if (isDynamicToolPart(part)) {
                    // Determine status based on part state and result
                    let status;
                    if (part.state === "output-available") {
                        // Check if result indicates failure (for tools that return { success: boolean })
                        status = hasFailureResult(part.output) ? "failed" : "completed";
                    }
                    else if (part.state === "output-redacted") {
                        status = part.failed ? "failed" : "redacted";
                    }
                    else if (part.state === "input-available") {
                        // Most unfinished tool calls in partial messages represent an interruption.
                        // ask_user_question is different: it's intentionally waiting on user input,
                        // so after restart we should keep it answerable ("executing") instead of
                        // showing retry/auto-resume UX.
                        if (part.toolName === "ask_user_question") {
                            status = "executing";
                        }
                        else if (isPartial) {
                            status = "interrupted";
                        }
                        else {
                            status = "executing";
                        }
                    }
                    else {
                        status = "pending";
                    }
                    // For code_execution, use streaming nestedCalls if present, or reconstruct from result
                    let nestedCalls = part.nestedCalls;
                    if (!nestedCalls &&
                        part.toolName === "code_execution" &&
                        part.state === "output-available") {
                        // Reconstruct nestedCalls from result.toolCalls (for historical replay)
                        const result = part.output;
                        if (result?.toolCalls) {
                            nestedCalls = result.toolCalls.map((tc, idx) => ({
                                toolCallId: `${part.toolCallId}-nested-${idx}`,
                                toolName: tc.toolName,
                                input: tc.args,
                                output: tc.result ?? (tc.error ? { error: tc.error } : undefined),
                                state: "output-available",
                                timestamp: part.timestamp,
                            }));
                        }
                    }
                    displayedMessages.push({
                        type: "tool",
                        id: `${message.id}-${partIndex}`,
                        historyId: message.id,
                        toolCallId: part.toolCallId,
                        toolName: part.toolName,
                        args: part.input,
                        result: part.state === "output-available" ? part.output : undefined,
                        status,
                        isPartial,
                        historySequence,
                        streamSequence: streamSeq++,
                        isLastPartOfMessage: isLastPart,
                        timestamp: part.timestamp ?? baseTimestamp,
                        nestedCalls,
                    });
                }
            });
            // Create stream-error DisplayedMessage if message has error metadata
            // This happens after all parts are displayed, so error appears at the end
            if (message.metadata?.error) {
                displayedMessages.push({
                    type: "stream-error",
                    id: `${message.id}-error`,
                    historyId: message.id,
                    error: message.metadata.error,
                    errorType: message.metadata.errorType ?? "unknown",
                    historySequence,
                    model: message.metadata.model,
                    routedThroughGateway: message.metadata?.routedThroughGateway,
                    timestamp: baseTimestamp,
                });
            }
        }
        return displayedMessages;
    }
    /**
     * After filtering older tool/reasoning parts, recompute which part is the
     * last visible block for each assistant message. This keeps meta rows and
     * interrupted barriers accurate after truncation.
     */
    normalizeLastPartFlags(messages) {
        const seenHistoryIds = new Set();
        let didChange = false;
        const normalized = messages.slice();
        for (let i = messages.length - 1; i >= 0; i--) {
            const msg = messages[i];
            if (!("isLastPartOfMessage" in msg) || typeof msg.historyId !== "string") {
                continue;
            }
            const shouldBeLast = !seenHistoryIds.has(msg.historyId);
            seenHistoryIds.add(msg.historyId);
            if (msg.isLastPartOfMessage !== shouldBeLast) {
                normalized[i] = { ...msg, isLastPartOfMessage: shouldBeLast };
                didChange = true;
            }
        }
        return didChange ? normalized : messages;
    }
    /**
     * Transform MuxMessages into DisplayedMessages for UI consumption
     * This splits complex messages with multiple parts into separate UI blocks
     * while preserving temporal ordering through sequence numbers
     *
     * IMPORTANT: Result is cached to ensure stable references for React.
     * Cache is invalidated whenever messages change (via invalidateCache()).
     */
    getDisplayedMessages() {
        if (!this.cache.displayedMessages) {
            const displayedMessages = [];
            const allMessages = this.getAllMessages();
            const showSyntheticMessages = typeof window !== "undefined" && window.api?.debugLlmRequest === true;
            // Synthetic agent-skill snapshot messages are hidden from the transcript unless
            // debugLlmRequest is enabled. We still want to surface their content in the UI by
            // attaching the resolved snapshot (frontmatterYaml + body) to the *subsequent*
            // /{skillName} invocation message.
            const latestAgentSkillSnapshotByKey = new Map();
            for (const message of allMessages) {
                const snapshotMeta = message.metadata?.agentSkillSnapshot;
                if (snapshotMeta) {
                    const parsed = AgentSkillSnapshotMetadataSchema.safeParse(snapshotMeta);
                    if (parsed.success) {
                        const snapshotText = message.parts
                            .filter((p) => p.type === "text")
                            .map((p) => p.text)
                            .join("");
                        const body = extractAgentSkillSnapshotBody(snapshotText);
                        if (body !== null) {
                            const key = `${parsed.data.scope}:${parsed.data.skillName}`;
                            latestAgentSkillSnapshotByKey.set(key, {
                                sha256: parsed.data.sha256,
                                frontmatterYaml: parsed.data.frontmatterYaml,
                                body,
                            });
                        }
                    }
                }
                const isSynthetic = message.metadata?.synthetic === true;
                const isUiVisibleSynthetic = message.metadata?.uiVisible === true;
                // Synthetic messages are typically for model context only.
                // Show them only in debug mode, or when explicitly marked as UI-visible.
                if (isSynthetic && !showSyntheticMessages && !isUiVisibleSynthetic) {
                    continue;
                }
                const muxMeta = message.metadata?.muxMetadata;
                const agentSkillSnapshotKey = message.role === "user" && muxMeta?.type === "agent-skill"
                    ? `${muxMeta.scope}:${muxMeta.skillName}`
                    : undefined;
                const agentSkillSnapshot = agentSkillSnapshotKey
                    ? latestAgentSkillSnapshotByKey.get(agentSkillSnapshotKey)
                    : undefined;
                const agentSkillSnapshotForDisplay = agentSkillSnapshot
                    ? { frontmatterYaml: agentSkillSnapshot.frontmatterYaml, body: agentSkillSnapshot.body }
                    : undefined;
                const agentSkillSnapshotCacheKey = agentSkillSnapshot
                    ? `${agentSkillSnapshot.sha256 ?? ""}\n${agentSkillSnapshot.frontmatterYaml ?? ""}`
                    : undefined;
                const version = this.messageVersions.get(message.id) ?? 0;
                const cached = this.displayedMessageCache.get(message.id);
                const canReuse = cached?.version === version &&
                    cached.agentSkillSnapshotCacheKey === agentSkillSnapshotCacheKey;
                const messageDisplay = canReuse
                    ? cached.messages
                    : this.buildDisplayedMessagesForMessage(message, agentSkillSnapshotForDisplay);
                if (!canReuse) {
                    this.displayedMessageCache.set(message.id, {
                        version,
                        agentSkillSnapshotCacheKey,
                        messages: messageDisplay,
                    });
                }
                if (messageDisplay.length > 0) {
                    displayedMessages.push(...messageDisplay);
                }
            }
            let resultMessages = displayedMessages;
            // Limit messages for DOM performance (unless explicitly disabled).
            // Strategy: keep user prompts + structural markers while allowing older assistant/tool/
            // reasoning rows to collapse behind a history-hidden marker.
            // Full history is still maintained internally for token counting.
            if (!this.showAllMessages && displayedMessages.length > MAX_DISPLAYED_MESSAGES) {
                // Split into "old" (candidates for filtering) and "recent" (always keep intact)
                const recentMessages = displayedMessages.slice(-MAX_DISPLAYED_MESSAGES);
                const oldMessages = displayedMessages.slice(0, -MAX_DISPLAYED_MESSAGES);
                const omittedMessageCounts = { tool: 0, reasoning: 0 };
                let hiddenCount = 0;
                let insertionIndex = null;
                const filteredOldMessages = [];
                for (const msg of oldMessages) {
                    if (ALWAYS_KEEP_MESSAGE_TYPES.has(msg.type)) {
                        filteredOldMessages.push(msg);
                        continue;
                    }
                    if (msg.type === "tool") {
                        omittedMessageCounts.tool += 1;
                    }
                    else if (msg.type === "reasoning") {
                        omittedMessageCounts.reasoning += 1;
                    }
                    hiddenCount += 1;
                    insertionIndex ?? (insertionIndex = filteredOldMessages.length);
                }
                const hasOmissions = hiddenCount > 0;
                if (hasOmissions) {
                    const insertAt = insertionIndex ?? filteredOldMessages.length;
                    const messagesWithMarker = [...filteredOldMessages];
                    messagesWithMarker.splice(insertAt, 0, {
                        type: "history-hidden",
                        id: "history-hidden",
                        hiddenCount,
                        historySequence: -1, // Non-persisted marker for truncated history
                        omittedMessageCounts,
                    });
                    resultMessages = this.normalizeLastPartFlags([...messagesWithMarker, ...recentMessages]);
                }
                else {
                    resultMessages = [...filteredOldMessages, ...recentMessages];
                }
            }
            // Add init state if present (ephemeral, appears at top)
            if (this.initState) {
                const durationMs = this.initState.endTime !== null
                    ? this.initState.endTime - this.initState.startTime
                    : null;
                const initMessage = {
                    type: "workspace-init",
                    id: "workspace-init",
                    historySequence: -1, // Appears before all history
                    status: this.initState.status,
                    hookPath: this.initState.hookPath,
                    lines: [...this.initState.lines], // Shallow copy for React.memo change detection
                    exitCode: this.initState.exitCode,
                    timestamp: this.initState.startTime,
                    durationMs,
                    truncatedLines: this.initState.truncatedLines,
                };
                resultMessages = [initMessage, ...resultMessages];
            }
            // Return the full array
            this.cache.displayedMessages = resultMessages;
        }
        return this.cache.displayedMessages;
    }
    /**
     * Get the toolCallId of the latest foreground bash that is currently executing.
     * Used by BashToolCall for auto-expand/collapse behavior.
     * Result is cached until the next mutation.
     */
    getLatestStreamingBashToolCallId() {
        if (this.cache.latestStreamingBashToolCallId === undefined) {
            const messages = this.getDisplayedMessages();
            let result = null;
            for (let i = messages.length - 1; i >= 0; i--) {
                const msg = messages[i];
                if (msg.type === "tool" && msg.toolName === "bash" && msg.status === "executing") {
                    const args = msg.args;
                    if (!args?.run_in_background) {
                        result = msg.toolCallId;
                        break;
                    }
                }
            }
            this.cache.latestStreamingBashToolCallId = result;
        }
        return this.cache.latestStreamingBashToolCallId;
    }
    /**
     * Track a delta for token counting and TPS calculation
     */
    trackDelta(messageId, tokens, timestamp, type) {
        let storage = this.deltaHistory.get(messageId);
        if (!storage) {
            storage = createDeltaStorage();
            this.deltaHistory.set(messageId, storage);
        }
        storage.addDelta({ tokens, timestamp, type });
    }
    /**
     * Get streaming token count (sum of all deltas)
     */
    getStreamingTokenCount(messageId) {
        const storage = this.deltaHistory.get(messageId);
        return storage ? storage.getTokenCount() : 0;
    }
    /**
     * Get tokens-per-second rate (10-second trailing window)
     */
    getStreamingTPS(messageId) {
        const storage = this.deltaHistory.get(messageId);
        return storage ? storage.calculateTPS(Date.now()) : 0;
    }
    /**
     * Clear delta history for a message
     */
    clearTokenState(messageId) {
        this.deltaHistory.delete(messageId);
        this.activeStreamUsage.delete(messageId);
    }
    /**
     * Handle usage-delta event: update usage tracking for active stream
     */
    handleUsageDelta(data) {
        this.activeStreamUsage.set(data.messageId, {
            step: { usage: data.usage, providerMetadata: data.providerMetadata },
            cumulative: {
                usage: data.cumulativeUsage,
                providerMetadata: data.cumulativeProviderMetadata,
            },
        });
    }
    /**
     * Get active stream usage for context window display (last step's inputTokens = context size)
     */
    getActiveStreamUsage(messageId) {
        return this.activeStreamUsage.get(messageId)?.step.usage;
    }
    /**
     * Get step provider metadata for context window cache display
     */
    getActiveStreamStepProviderMetadata(messageId) {
        return this.activeStreamUsage.get(messageId)?.step.providerMetadata;
    }
    /**
     * Get active stream cumulative usage for cost display (sum of all steps)
     */
    getActiveStreamCumulativeUsage(messageId) {
        return this.activeStreamUsage.get(messageId)?.cumulative.usage;
    }
    /**
     * Get cumulative provider metadata for cost display (with accumulated cache creation tokens)
     */
    getActiveStreamCumulativeProviderMetadata(messageId) {
        return this.activeStreamUsage.get(messageId)?.cumulative.providerMetadata;
    }
}
StreamingMessageAggregator.INIT_OUTPUT_THROTTLE_MS = 100;
//# sourceMappingURL=StreamingMessageAggregator.js.map