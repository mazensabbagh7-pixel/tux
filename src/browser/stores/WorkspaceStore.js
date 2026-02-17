import assert from "@/common/utils/assert";
import { applyWorkspaceChatEventToAggregator } from "@/browser/utils/messages/applyWorkspaceChatEventToAggregator";
import { StreamingMessageAggregator, } from "@/browser/utils/messages/StreamingMessageAggregator";
import { updatePersistedState } from "@/browser/hooks/usePersistedState";
import { isAbortError } from "@/browser/utils/isAbortError";
import { getRetryStateKey } from "@/common/constants/storage";
import { BASH_TRUNCATE_MAX_TOTAL_BYTES } from "@/common/constants/toolLimits";
import { CUSTOM_EVENTS, createCustomEvent } from "@/common/constants/events";
import { useCallback, useSyncExternalStore } from "react";
import { isCaughtUpMessage, isStreamError, isDeleteMessage, isBashOutputEvent, isTaskCreatedEvent, isMuxMessage, isQueuedMessageChanged, isRestoreToInput, } from "@/common/orpc/types";
import { MapStore } from "./MapStore";
import { createDisplayUsage } from "@/common/utils/tokens/displayUsage";
import { isDurableCompactionBoundaryMarker } from "@/common/utils/messages/compactionBoundary";
import { WorkspaceConsumerManager } from "./WorkspaceConsumerManager";
import { sumUsageHistory } from "@/common/utils/tokens/usageAggregator";
import { normalizeGatewayModel } from "@/common/utils/ai/models";
import { createFreshRetryState } from "@/browser/utils/messages/retryState";
import { appendLiveBashOutputChunk, } from "@/browser/utils/messages/liveBashOutputBuffer";
import { trackStreamCompleted } from "@/common/telemetry";
function createInitialChatTransientState() {
    return {
        caughtUp: false,
        historicalMessages: [],
        pendingStreamEvents: [],
        replayingHistory: false,
        queuedMessage: null,
        liveBashOutput: new Map(),
        liveTaskIds: new Map(),
    };
}
const ON_CHAT_RETRY_BASE_MS = 250;
const ON_CHAT_RETRY_MAX_MS = 5000;
// Stall detection: server sends heartbeats every 5s, so if we don't receive any events
// (including heartbeats) for 10s, the connection is likely dead. This handles half-open
// WebSocket paths (e.g., some WSL localhost forwarding setups).
const ON_CHAT_STALL_TIMEOUT_MS = 10000;
const ON_CHAT_STALL_CHECK_INTERVAL_MS = 2000;
function isIteratorValidationFailed(error) {
    return (error instanceof Error &&
        error.code === "EVENT_ITERATOR_VALIDATION_FAILED");
}
/**
 * Extract a human-readable summary from an iterator validation error.
 * ORPC wraps Zod issues in error.cause with { issues: [...], data: ... }
 */
function formatValidationError(error) {
    const cause = error.cause;
    if (!cause) {
        return "Unknown validation error (no cause)";
    }
    const issues = cause.issues ?? [];
    if (issues.length === 0) {
        return `Unknown validation error (no issues). Data: ${JSON.stringify(cause.data)}`;
    }
    // Format issues like: "type: Invalid discriminator value" or "metadata.usage.inputTokens: Expected number"
    const issuesSummary = issues
        .slice(0, 3) // Limit to first 3 issues
        .map((issue) => {
        const path = issue.path?.join(".") ?? "(root)";
        const message = issue.message ?? "Unknown issue";
        return `${path}: ${message}`;
    })
        .join("; ");
    const moreCount = issues.length > 3 ? ` (+${issues.length - 3} more)` : "";
    // Include the event type if available
    const data = cause.data;
    const eventType = data?.type ? ` [event: ${data.type}]` : "";
    return `${issuesSummary}${moreCount}${eventType}`;
}
function calculateOnChatBackoffMs(attempt) {
    return Math.min(ON_CHAT_RETRY_BASE_MS * 2 ** attempt, ON_CHAT_RETRY_MAX_MS);
}
function getMaxHistorySequence(messages) {
    let max;
    for (const message of messages) {
        const seq = message.metadata?.historySequence;
        if (typeof seq !== "number") {
            continue;
        }
        if (max === undefined || seq > max) {
            max = seq;
        }
    }
    return max;
}
/**
 * External store for workspace aggregators and streaming state.
 *
 * This store lives outside React's lifecycle and manages all workspace
 * message aggregation and IPC subscriptions. Components subscribe to
 * specific workspaces via useSyncExternalStore, ensuring only relevant
 * components re-render when workspace state changes.
 */
export class WorkspaceStore {
    constructor(onModelUsed) {
        // Per-workspace state (lazy computed on get)
        this.states = new MapStore();
        // Derived aggregate state (computed from multiple workspaces)
        this.derived = new MapStore();
        // Usage and consumer stores (two-store approach for CostsTab optimization)
        this.usageStore = new MapStore();
        this.client = null;
        this.clientChangeController = new AbortController();
        // Workspaces that need a clean history replay once a new iterator is established.
        // We keep the existing UI visible until the replay can actually start.
        this.pendingReplayReset = new Set();
        this.consumersStore = new MapStore();
        // Supporting data structures
        this.aggregators = new Map();
        this.ipcUnsubscribers = new Map();
        // Per-workspace ephemeral chat state (buffering, queued message, live bash output, etc.)
        this.chatTransientState = new Map();
        this.workspaceMetadata = new Map(); // Store metadata for name lookup
        // Workspace timing stats snapshots (from workspace.stats.subscribe)
        this.statsEnabled = false;
        this.workspaceStats = new Map();
        this.statsStore = new MapStore();
        this.statsUnsubscribers = new Map();
        // Per-workspace listener refcount for useWorkspaceStatsSnapshot().
        // Used to only subscribe to backend stats when something in the UI is actually reading them.
        this.statsListenerCounts = new Map();
        // Cumulative session usage (from session-usage.json)
        this.sessionUsage = new Map();
        // Idle compaction notification callbacks (called when backend signals idle compaction needed)
        this.idleCompactionCallbacks = new Set();
        // Global callback for navigating to a workspace (set by App, used for notification clicks)
        this.navigateToWorkspaceCallback = null;
        // Global callback when a response completes (for "notify on response" feature)
        // isFinal is true when no more active streams remain (assistant done with all work)
        // finalText is the text content after any tool calls (for notification body)
        // compaction is provided when this was a compaction stream (includes continue metadata)
        this.responseCompleteCallback = null;
        // Tracks when a file-modifying tool (file_edit_*, bash) last completed per workspace.
        // ReviewPanel subscribes to trigger diff refresh. Two structures:
        // - timestamps: actual Date.now() values for cache invalidation checks
        // - subscriptions: MapStore for per-workspace subscription support
        this.fileModifyingToolMs = new Map();
        this.fileModifyingToolSubs = new MapStore();
        // Idle callback handles for high-frequency delta events to reduce re-renders during streaming.
        // Data is always updated immediately in the aggregator; only UI notification is scheduled.
        // Using requestIdleCallback adapts to actual CPU availability rather than a fixed timer.
        this.deltaIdleHandles = new Map();
        /**
         * Map of event types to their handlers. This is the single source of truth for:
         * 1. Which events should be buffered during replay (the keys)
         * 2. How to process those events (the values)
         *
         * By keeping check and processing in one place, we make it structurally impossible
         * to buffer an event type without having a handler for it.
         */
        this.bufferedEventHandlers = {
            "stream-start": (workspaceId, aggregator, data) => {
                applyWorkspaceChatEventToAggregator(aggregator, data);
                if (this.onModelUsed) {
                    this.onModelUsed(data.model);
                }
                // Don't reset retry state here - stream might still fail after starting
                // Retry state will be reset on stream-end (successful completion)
                this.states.bump(workspaceId);
                // Bump usage store so liveUsage is recomputed with new activeStreamId
                this.usageStore.bump(workspaceId);
            },
            "stream-delta": (workspaceId, aggregator, data) => {
                applyWorkspaceChatEventToAggregator(aggregator, data);
                this.scheduleIdleStateBump(workspaceId);
            },
            "stream-end": (workspaceId, aggregator, data) => {
                const streamEndData = data;
                applyWorkspaceChatEventToAggregator(aggregator, streamEndData);
                // Track stream completion telemetry
                this.trackStreamCompletedTelemetry(streamEndData, false);
                // Reset retry state on successful stream completion
                updatePersistedState(getRetryStateKey(workspaceId), createFreshRetryState());
                // Update local session usage (mirrors backend's addUsage)
                const model = streamEndData.metadata?.model;
                const rawUsage = streamEndData.metadata?.usage;
                const providerMetadata = streamEndData.metadata?.providerMetadata;
                if (model && rawUsage) {
                    const usage = createDisplayUsage(rawUsage, model, providerMetadata);
                    if (usage) {
                        const normalizedModel = normalizeGatewayModel(model);
                        const current = this.sessionUsage.get(workspaceId) ?? {
                            byModel: {},
                            version: 1,
                        };
                        const existing = current.byModel[normalizedModel];
                        // CRITICAL: Accumulate, don't overwrite (same logic as backend)
                        current.byModel[normalizedModel] = existing ? sumUsageHistory([existing, usage]) : usage;
                        current.lastRequest = { model: normalizedModel, usage, timestamp: Date.now() };
                        this.sessionUsage.set(workspaceId, current);
                    }
                }
                // Flush any pending debounced bump before final bump to avoid double-bump
                this.cancelPendingIdleBump(workspaceId);
                this.states.bump(workspaceId);
                this.checkAndBumpRecencyIfChanged();
                this.finalizeUsageStats(workspaceId, streamEndData.metadata);
            },
            "stream-abort": (workspaceId, aggregator, data) => {
                const streamAbortData = data;
                applyWorkspaceChatEventToAggregator(aggregator, streamAbortData);
                // Track stream interruption telemetry (get model from aggregator)
                const model = aggregator.getCurrentModel();
                if (model) {
                    this.trackStreamCompletedTelemetry({
                        metadata: {
                            model,
                            usage: streamAbortData.metadata?.usage,
                            duration: streamAbortData.metadata?.duration,
                        },
                    }, true);
                }
                // Flush any pending debounced bump before final bump to avoid double-bump
                this.cancelPendingIdleBump(workspaceId);
                this.states.bump(workspaceId);
                this.dispatchResumeCheck(workspaceId);
                this.finalizeUsageStats(workspaceId, streamAbortData.metadata);
            },
            "tool-call-start": (workspaceId, aggregator, data) => {
                applyWorkspaceChatEventToAggregator(aggregator, data);
                this.states.bump(workspaceId);
            },
            "tool-call-delta": (workspaceId, aggregator, data) => {
                applyWorkspaceChatEventToAggregator(aggregator, data);
                this.scheduleIdleStateBump(workspaceId);
            },
            "tool-call-end": (workspaceId, aggregator, data) => {
                const toolCallEnd = data;
                // Cleanup live bash output once the real tool result contains output.
                // If output is missing (e.g. tmpfile overflow), keep the tail buffer so the UI still shows something.
                if (toolCallEnd.toolName === "bash") {
                    const transient = this.chatTransientState.get(workspaceId);
                    if (transient) {
                        const output = toolCallEnd.result?.output;
                        if (typeof output === "string") {
                            transient.liveBashOutput.delete(toolCallEnd.toolCallId);
                        }
                        else {
                            // If we keep the tail buffer, ensure we don't get stuck in "filtering" UI state.
                            const prev = transient.liveBashOutput.get(toolCallEnd.toolCallId);
                            if (prev?.phase === "filtering") {
                                const next = appendLiveBashOutputChunk(prev, { text: "", isError: false, phase: "output" }, BASH_TRUNCATE_MAX_TOTAL_BYTES);
                                if (next !== prev) {
                                    transient.liveBashOutput.set(toolCallEnd.toolCallId, next);
                                }
                            }
                        }
                    }
                }
                // Cleanup ephemeral taskId storage once the actual tool result is available.
                if (toolCallEnd.toolName === "task") {
                    const transient = this.chatTransientState.get(workspaceId);
                    transient?.liveTaskIds.delete(toolCallEnd.toolCallId);
                }
                applyWorkspaceChatEventToAggregator(aggregator, data);
                this.states.bump(workspaceId);
                this.consumerManager.scheduleCalculation(workspaceId, aggregator);
                // Track file-modifying tools for ReviewPanel diff refresh.
                const shouldTriggerReviewPanelRefresh = toolCallEnd.toolName.startsWith("file_edit_") || toolCallEnd.toolName === "bash";
                if (shouldTriggerReviewPanelRefresh) {
                    this.fileModifyingToolMs.set(workspaceId, Date.now());
                    this.fileModifyingToolSubs.bump(workspaceId);
                }
            },
            "reasoning-delta": (workspaceId, aggregator, data) => {
                applyWorkspaceChatEventToAggregator(aggregator, data);
                this.scheduleIdleStateBump(workspaceId);
            },
            "reasoning-end": (workspaceId, aggregator, data) => {
                applyWorkspaceChatEventToAggregator(aggregator, data);
                this.states.bump(workspaceId);
            },
            "runtime-status": (workspaceId, aggregator, data) => {
                applyWorkspaceChatEventToAggregator(aggregator, data);
                this.states.bump(workspaceId);
            },
            "session-usage-delta": (workspaceId, _aggregator, data) => {
                const usageDelta = data;
                const current = this.sessionUsage.get(workspaceId) ?? {
                    byModel: {},
                    version: 1,
                };
                for (const [model, usage] of Object.entries(usageDelta.byModelDelta)) {
                    const existing = current.byModel[model];
                    current.byModel[model] = existing ? sumUsageHistory([existing, usage]) : usage;
                }
                this.sessionUsage.set(workspaceId, current);
                this.usageStore.bump(workspaceId);
            },
            "usage-delta": (workspaceId, aggregator, data) => {
                applyWorkspaceChatEventToAggregator(aggregator, data);
                this.usageStore.bump(workspaceId);
            },
            "init-start": (workspaceId, aggregator, data) => {
                applyWorkspaceChatEventToAggregator(aggregator, data);
                this.states.bump(workspaceId);
            },
            "init-output": (workspaceId, aggregator, data) => {
                applyWorkspaceChatEventToAggregator(aggregator, data);
                // Init output can be very high-frequency (e.g. installs, rsync). Like stream/tool deltas,
                // we update aggregator state immediately but coalesce UI bumps to keep the renderer responsive.
                this.scheduleIdleStateBump(workspaceId);
            },
            "init-end": (workspaceId, aggregator, data) => {
                applyWorkspaceChatEventToAggregator(aggregator, data);
                // Avoid a double-bump if an init-output idle bump is pending.
                this.cancelPendingIdleBump(workspaceId);
                this.states.bump(workspaceId);
            },
            "queued-message-changed": (workspaceId, _aggregator, data) => {
                if (!isQueuedMessageChanged(data))
                    return;
                // Create QueuedMessage once here instead of on every render
                // Use displayText which handles slash commands (shows /compact instead of expanded prompt)
                // Show queued message if there's text OR attachments OR reviews (support review-only queued messages)
                const hasContent = data.queuedMessages.length > 0 ||
                    (data.fileParts?.length ?? 0) > 0 ||
                    (data.reviews?.length ?? 0) > 0;
                const queuedMessage = hasContent
                    ? {
                        id: `queued-${workspaceId}`,
                        content: data.displayText,
                        fileParts: data.fileParts,
                        reviews: data.reviews,
                        hasCompactionRequest: data.hasCompactionRequest,
                    }
                    : null;
                this.assertChatTransientState(workspaceId).queuedMessage = queuedMessage;
                this.states.bump(workspaceId);
            },
            "restore-to-input": (_workspaceId, _aggregator, data) => {
                if (!isRestoreToInput(data))
                    return;
                // Use UPDATE_CHAT_INPUT event with mode="replace"
                window.dispatchEvent(createCustomEvent(CUSTOM_EVENTS.UPDATE_CHAT_INPUT, {
                    text: data.text,
                    mode: "replace",
                    fileParts: data.fileParts,
                    reviews: data.reviews,
                }));
            },
        };
        // Cache of last known recency per workspace (for change detection)
        this.recencyCache = new Map();
        // Store workspace metadata for aggregator creation (ensures createdAt never lost)
        this.workspaceCreatedAt = new Map();
        // Track previous sidebar state per workspace (to prevent unnecessary bumps)
        this.previousSidebarValues = new Map();
        /**
         * Subscribe to store changes (any workspace).
         * Delegates to MapStore's subscribeAny.
         */
        this.subscribe = this.states.subscribeAny;
        /**
         * Subscribe to derived state changes (recency, etc.).
         * Use for hooks that depend on derived.bump() rather than states.bump().
         */
        this.subscribeDerived = this.derived.subscribeAny;
        /**
         * Subscribe to changes for a specific workspace.
         * Only notified when this workspace's state changes.
         */
        this.subscribeKey = (workspaceId, listener) => {
            return this.states.subscribeKey(workspaceId, listener);
        };
        // Cache sidebar state objects to return stable references
        this.sidebarStateCache = new Map();
        // Map from workspaceId -> the WorkspaceState reference used to compute sidebarStateCache.
        // React's useSyncExternalStore may call getSnapshot() multiple times per render; this
        // ensures getWorkspaceSidebarState() returns a referentially stable snapshot for a given
        // MapStore version even when timingStats would otherwise change via Date.now().
        this.sidebarStateSourceState = new Map();
        this.onModelUsed = onModelUsed;
        // Initialize consumer calculation manager
        this.consumerManager = new WorkspaceConsumerManager((workspaceId) => {
            this.consumersStore.bump(workspaceId);
        });
        // Note: We DON'T auto-check recency on every state bump.
        // Instead, checkAndBumpRecencyIfChanged() is called explicitly after
        // message completion events (not on deltas) to prevent App.tsx re-renders.
    }
    setStatsEnabled(enabled) {
        if (this.statsEnabled === enabled) {
            return;
        }
        this.statsEnabled = enabled;
        if (!enabled) {
            for (const unsubscribe of this.statsUnsubscribers.values()) {
                unsubscribe();
            }
            this.statsUnsubscribers.clear();
            this.workspaceStats.clear();
            this.statsStore.clear();
            // Clear is a global notification only. Bump any subscribed workspace IDs so
            // useSyncExternalStore subscribers re-render and drop stale snapshots.
            for (const workspaceId of this.statsListenerCounts.keys()) {
                this.statsStore.bump(workspaceId);
            }
            return;
        }
        // Enable subscriptions for any workspaces that already have UI consumers.
        for (const workspaceId of this.statsListenerCounts.keys()) {
            this.subscribeToStats(workspaceId);
        }
    }
    setClient(client) {
        if (this.client === client) {
            return;
        }
        // Drop stats subscriptions before swapping clients so reconnects resubscribe cleanly.
        for (const unsubscribe of this.statsUnsubscribers.values()) {
            unsubscribe();
        }
        this.statsUnsubscribers.clear();
        this.client = client;
        this.clientChangeController.abort();
        this.clientChangeController = new AbortController();
        for (const workspaceId of this.ipcUnsubscribers.keys()) {
            this.pendingReplayReset.add(workspaceId);
        }
        if (!client) {
            return;
        }
        // If timing stats are enabled, re-subscribe any workspaces that already have UI consumers.
        if (this.statsEnabled) {
            for (const workspaceId of this.statsListenerCounts.keys()) {
                this.subscribeToStats(workspaceId);
            }
        }
    }
    /**
     * Set the callback for navigating to a workspace (used for notification clicks)
     */
    setNavigateToWorkspace(callback) {
        this.navigateToWorkspaceCallback = callback;
        // Update existing aggregators with the callback
        for (const aggregator of this.aggregators.values()) {
            aggregator.onNavigateToWorkspace = callback;
        }
    }
    navigateToWorkspace(workspaceId) {
        this.navigateToWorkspaceCallback?.(workspaceId);
    }
    /**
     * Set the callback for when a response completes (used for "notify on response" feature).
     * isFinal is true when no more active streams remain (assistant done with all work).
     * finalText is the text content after any tool calls (for notification body).
     * compaction is provided when this was a compaction stream (includes continue metadata).
     */
    setOnResponseComplete(callback) {
        this.responseCompleteCallback = callback;
        // Update existing aggregators with the callback
        for (const aggregator of this.aggregators.values()) {
            aggregator.onResponseComplete = callback;
        }
    }
    /**
     * Dispatch resume check event for a workspace.
     * Triggers useResumeManager to check if interrupted stream can be resumed.
     */
    dispatchResumeCheck(workspaceId) {
        if (typeof window === "undefined") {
            return;
        }
        window.dispatchEvent(createCustomEvent(CUSTOM_EVENTS.RESUME_CHECK_REQUESTED, { workspaceId }));
    }
    /**
     * Schedule a state bump during browser idle time.
     * Instead of updating UI on every delta, wait until the browser has spare capacity.
     * This adapts to actual CPU availability - fast machines update more frequently,
     * slow machines naturally throttle without dropping data.
     *
     * Data is always updated immediately in the aggregator - only UI notification is deferred.
     */
    scheduleIdleStateBump(workspaceId) {
        // Skip if already scheduled
        if (this.deltaIdleHandles.has(workspaceId)) {
            return;
        }
        // requestIdleCallback is not available in some environments (e.g. Node-based unit tests).
        // Fall back to a regular timeout so we still throttle bumps.
        if (typeof requestIdleCallback !== "function") {
            const handle = setTimeout(() => {
                this.deltaIdleHandles.delete(workspaceId);
                this.states.bump(workspaceId);
            }, 0);
            this.deltaIdleHandles.set(workspaceId, handle);
            return;
        }
        const handle = requestIdleCallback(() => {
            this.deltaIdleHandles.delete(workspaceId);
            this.states.bump(workspaceId);
        }, { timeout: 100 } // Force update within 100ms even if browser stays busy
        );
        this.deltaIdleHandles.set(workspaceId, handle);
    }
    /**
     * Defer the caught-up usage bump until idle time so first transcript paint is not blocked
     * by a second full ChatPane pass that only refreshes usage-derived UI.
     */
    scheduleCaughtUpUsageBump(workspaceId) {
        const bumpUsage = () => {
            const transient = this.chatTransientState.get(workspaceId);
            if (!transient?.caughtUp || !this.aggregators.has(workspaceId)) {
                return;
            }
            this.usageStore.bump(workspaceId);
        };
        if (typeof requestIdleCallback !== "function") {
            setTimeout(bumpUsage, 0);
            return;
        }
        requestIdleCallback(bumpUsage, { timeout: 100 });
    }
    /**
     * Subscribe to backend timing stats snapshots for a workspace.
     */
    subscribeToStats(workspaceId) {
        if (!this.client || !this.statsEnabled) {
            return;
        }
        // Only subscribe when we have at least one UI consumer.
        if (!this.ipcUnsubscribers.has(workspaceId)) {
            return;
        }
        if ((this.statsListenerCounts.get(workspaceId) ?? 0) <= 0) {
            return;
        }
        // Skip if already subscribed
        if (this.statsUnsubscribers.has(workspaceId)) {
            return;
        }
        const controller = new AbortController();
        const { signal } = controller;
        let iterator = null;
        (async () => {
            try {
                const subscribedIterator = await this.client.workspace.stats.subscribe({ workspaceId }, { signal });
                iterator = subscribedIterator;
                for await (const snapshot of subscribedIterator) {
                    if (signal.aborted)
                        break;
                    queueMicrotask(() => {
                        if (signal.aborted) {
                            return;
                        }
                        this.workspaceStats.set(workspaceId, snapshot);
                        this.statsStore.bump(workspaceId);
                    });
                }
            }
            catch (error) {
                if (signal.aborted || isAbortError(error))
                    return;
                console.warn(`[WorkspaceStore] Error in stats subscription for ${workspaceId}:`, error);
            }
        })();
        this.statsUnsubscribers.set(workspaceId, () => {
            controller.abort();
            void iterator?.return?.();
        });
    }
    /**
     * Cancel any pending idle state bump for a workspace.
     * Used when immediate state visibility is needed (e.g., stream-end).
     * Just cancels the callback - the caller will bump() immediately after.
     */
    cancelPendingIdleBump(workspaceId) {
        const handle = this.deltaIdleHandles.get(workspaceId);
        if (handle) {
            if (typeof cancelIdleCallback === "function") {
                cancelIdleCallback(handle);
            }
            else {
                clearTimeout(handle);
            }
            this.deltaIdleHandles.delete(workspaceId);
        }
    }
    /**
     * Track stream completion telemetry
     */
    trackStreamCompletedTelemetry(data, wasInterrupted) {
        const { metadata } = data;
        const durationSecs = metadata.duration ? metadata.duration / 1000 : 0;
        const outputTokens = metadata.usage?.outputTokens ?? 0;
        // trackStreamCompleted handles rounding internally
        trackStreamCompleted(metadata.model, wasInterrupted, durationSecs, outputTokens);
    }
    /**
     * Check if any workspace's recency changed and bump global recency if so.
     * Uses cached recency values from aggregators for O(1) comparison per workspace.
     */
    checkAndBumpRecencyIfChanged() {
        let recencyChanged = false;
        for (const workspaceId of this.aggregators.keys()) {
            const aggregator = this.aggregators.get(workspaceId);
            const currentRecency = aggregator.getRecencyTimestamp();
            const cachedRecency = this.recencyCache.get(workspaceId);
            if (currentRecency !== cachedRecency) {
                this.recencyCache.set(workspaceId, currentRecency);
                recencyChanged = true;
            }
        }
        if (recencyChanged) {
            this.derived.bump("recency");
        }
    }
    cleanupStaleLiveBashOutput(workspaceId, aggregator) {
        const perWorkspace = this.chatTransientState.get(workspaceId)?.liveBashOutput;
        if (!perWorkspace || perWorkspace.size === 0)
            return;
        const activeToolCallIds = new Set();
        for (const msg of aggregator.getDisplayedMessages()) {
            if (msg.type === "tool" && msg.toolName === "bash") {
                activeToolCallIds.add(msg.toolCallId);
            }
        }
        for (const toolCallId of Array.from(perWorkspace.keys())) {
            if (!activeToolCallIds.has(toolCallId)) {
                perWorkspace.delete(toolCallId);
            }
        }
    }
    getBashToolLiveOutput(workspaceId, toolCallId) {
        const state = this.chatTransientState.get(workspaceId)?.liveBashOutput.get(toolCallId);
        // Important: return the stored object reference so useSyncExternalStore sees a stable snapshot.
        // (Returning a fresh object every call can trigger an infinite re-render loop.)
        return state ?? null;
    }
    getTaskToolLiveTaskId(workspaceId, toolCallId) {
        const taskId = this.chatTransientState.get(workspaceId)?.liveTaskIds.get(toolCallId);
        return taskId ?? null;
    }
    /**
     * Assert that workspace exists and return its aggregator.
     * Centralized assertion for all workspace access methods.
     */
    assertGet(workspaceId) {
        const aggregator = this.aggregators.get(workspaceId);
        assert(aggregator, `Workspace ${workspaceId} not found - must call addWorkspace() first`);
        return aggregator;
    }
    assertChatTransientState(workspaceId) {
        const state = this.chatTransientState.get(workspaceId);
        assert(state, `Workspace ${workspaceId} not found - must call addWorkspace() first`);
        return state;
    }
    /**
     * Get state for a specific workspace.
     * Lazy computation - only runs when version changes.
     *
     * REQUIRES: Workspace must have been added via addWorkspace() first.
     */
    getWorkspaceState(workspaceId) {
        return this.states.get(workspaceId, () => {
            const aggregator = this.assertGet(workspaceId);
            const hasMessages = aggregator.hasMessages();
            const transient = this.assertChatTransientState(workspaceId);
            const activeStreams = aggregator.getActiveStreams();
            const messages = aggregator.getAllMessages();
            const metadata = this.workspaceMetadata.get(workspaceId);
            const pendingStreamStartTime = aggregator.getPendingStreamStartTime();
            const canInterrupt = activeStreams.length > 0;
            const isStreamStarting = pendingStreamStartTime !== null && !canInterrupt;
            // Live streaming stats
            const activeStreamMessageId = aggregator.getActiveStreamMessageId();
            const streamingTokenCount = activeStreamMessageId
                ? aggregator.getStreamingTokenCount(activeStreamMessageId)
                : undefined;
            const streamingTPS = activeStreamMessageId
                ? aggregator.getStreamingTPS(activeStreamMessageId)
                : undefined;
            return {
                name: metadata?.name ?? workspaceId, // Fall back to ID if metadata missing
                messages: aggregator.getDisplayedMessages(),
                queuedMessage: transient.queuedMessage,
                canInterrupt,
                isCompacting: aggregator.isCompacting(),
                isStreamStarting,
                awaitingUserQuestion: aggregator.hasAwaitingUserQuestion(),
                loading: !hasMessages && !transient.caughtUp,
                muxMessages: messages,
                currentModel: aggregator.getCurrentModel() ?? null,
                currentThinkingLevel: aggregator.getCurrentThinkingLevel() ?? null,
                recencyTimestamp: aggregator.getRecencyTimestamp(),
                todos: aggregator.getCurrentTodos(),
                loadedSkills: aggregator.getLoadedSkills(),
                skillLoadErrors: aggregator.getSkillLoadErrors(),
                lastAbortReason: aggregator.getLastAbortReason(),
                agentStatus: aggregator.getAgentStatus(),
                pendingStreamStartTime,
                pendingStreamModel: aggregator.getPendingStreamModel(),
                runtimeStatus: aggregator.getRuntimeStatus(),
                streamingTokenCount,
                streamingTPS,
            };
        });
    }
    /**
     * Get sidebar state for a workspace (subset of full state).
     * Returns cached reference if values haven't changed.
     * This is critical for useSyncExternalStore - must return stable references.
     */
    getWorkspaceSidebarState(workspaceId) {
        const fullState = this.getWorkspaceState(workspaceId);
        const isStarting = fullState.pendingStreamStartTime !== null && !fullState.canInterrupt;
        const cached = this.sidebarStateCache.get(workspaceId);
        if (cached && this.sidebarStateSourceState.get(workspaceId) === fullState) {
            return cached;
        }
        // Return cached if values match.
        // Note: timingStats/sessionStats are intentionally excluded - they change on every
        // streaming token and sidebar items don't use them. Components needing timing should
        // use useWorkspaceStatsSnapshot() which has its own subscription.
        if (cached?.canInterrupt === fullState.canInterrupt &&
            cached.isStarting === isStarting &&
            cached.awaitingUserQuestion === fullState.awaitingUserQuestion &&
            cached.currentModel === fullState.currentModel &&
            cached.recencyTimestamp === fullState.recencyTimestamp &&
            cached.loadedSkills === fullState.loadedSkills &&
            cached.skillLoadErrors === fullState.skillLoadErrors &&
            cached.agentStatus === fullState.agentStatus) {
            // Even if we re-use the cached object, mark it as derived from the current
            // WorkspaceState so repeated getSnapshot() reads during this render are stable.
            this.sidebarStateSourceState.set(workspaceId, fullState);
            return cached;
        }
        // Create and cache new state
        const newState = {
            canInterrupt: fullState.canInterrupt,
            isStarting,
            awaitingUserQuestion: fullState.awaitingUserQuestion,
            currentModel: fullState.currentModel,
            recencyTimestamp: fullState.recencyTimestamp,
            loadedSkills: fullState.loadedSkills,
            skillLoadErrors: fullState.skillLoadErrors,
            agentStatus: fullState.agentStatus,
        };
        this.sidebarStateCache.set(workspaceId, newState);
        this.sidebarStateSourceState.set(workspaceId, fullState);
        return newState;
    }
    /**
     * Clear timing stats for a workspace.
     *
     * - Clears backend-persisted timing file (session-timing.json) when available.
     * - Clears in-memory timing derived from StreamingMessageAggregator.
     */
    clearTimingStats(workspaceId) {
        if (this.client && this.statsEnabled) {
            this.client.workspace.stats
                .clear({ workspaceId })
                .then((result) => {
                if (!result.success) {
                    console.warn(`Failed to clear timing stats for ${workspaceId}:`, result.error);
                    return;
                }
                this.workspaceStats.delete(workspaceId);
                this.statsStore.bump(workspaceId);
            })
                .catch((error) => {
                console.warn(`Failed to clear timing stats for ${workspaceId}:`, error);
            });
        }
        const aggregator = this.aggregators.get(workspaceId);
        if (aggregator) {
            aggregator.clearSessionTimingStats();
            this.states.bump(workspaceId);
        }
    }
    /**
     * Get all workspace states as a Map.
     * Returns a new Map on each call - not cached/reactive.
     * Used by imperative code, not for React subscriptions.
     */
    getAllStates() {
        const allStates = new Map();
        for (const workspaceId of this.aggregators.keys()) {
            allStates.set(workspaceId, this.getWorkspaceState(workspaceId));
        }
        return allStates;
    }
    /**
     * Get recency timestamps for all workspaces (for sorting in command palette).
     * Derived on-demand from individual workspace states.
     */
    getWorkspaceRecency() {
        return this.derived.get("recency", () => {
            const timestamps = {};
            for (const workspaceId of this.aggregators.keys()) {
                const state = this.getWorkspaceState(workspaceId);
                if (state.recencyTimestamp !== null) {
                    timestamps[workspaceId] = state.recencyTimestamp;
                }
            }
            return timestamps;
        });
    }
    /**
     * Get aggregator for a workspace (used by components that need direct access).
     * Returns undefined if workspace does not exist.
     */
    getAggregator(workspaceId) {
        return this.aggregators.get(workspaceId);
    }
    /**
     * Clear stored abort reason so manual retries can re-enable auto-retry.
     */
    clearLastAbortReason(workspaceId) {
        const aggregator = this.aggregators.get(workspaceId);
        if (!aggregator) {
            return;
        }
        aggregator.clearLastAbortReason();
        this.states.bump(workspaceId);
    }
    /**
     * Mark the current active stream as "interrupting" (transient state).
     * Call this before invoking interruptStream so the UI shows "interrupting..."
     * immediately, avoiding a visual flash when the backend confirmation arrives.
     */
    setInterrupting(workspaceId) {
        const aggregator = this.aggregators.get(workspaceId);
        if (aggregator) {
            aggregator.setInterrupting();
            this.states.bump(workspaceId);
        }
    }
    getWorkspaceStatsSnapshot(workspaceId) {
        return this.statsStore.get(workspaceId, () => {
            return this.workspaceStats.get(workspaceId) ?? null;
        });
    }
    /**
     * Bump state for a workspace to trigger React re-renders.
     * Used by addEphemeralMessage for frontend-only messages.
     */
    bumpState(workspaceId) {
        this.states.bump(workspaceId);
    }
    /**
     * Get current TODO list for a workspace.
     * Returns empty array if workspace doesn't exist or has no TODOs.
     */
    getTodos(workspaceId) {
        const aggregator = this.aggregators.get(workspaceId);
        return aggregator ? aggregator.getCurrentTodos() : [];
    }
    /**
     * Extract usage from session-usage.json (no tokenization or message iteration).
     *
     * Returns empty state if workspace doesn't exist (e.g., creation mode).
     */
    getWorkspaceUsage(workspaceId) {
        return this.usageStore.get(workspaceId, () => {
            const aggregator = this.aggregators.get(workspaceId);
            if (!aggregator) {
                return { totalTokens: 0 };
            }
            const model = aggregator.getCurrentModel();
            const sessionData = this.sessionUsage.get(workspaceId);
            // Session total: sum all models from persisted data
            const sessionTotal = sessionData && Object.keys(sessionData.byModel).length > 0
                ? sumUsageHistory(Object.values(sessionData.byModel))
                : undefined;
            // Last request from persisted data
            const lastRequest = sessionData?.lastRequest;
            // Calculate total tokens from session total
            const totalTokens = sessionTotal
                ? sessionTotal.input.tokens +
                    sessionTotal.cached.tokens +
                    sessionTotal.cacheCreate.tokens +
                    sessionTotal.output.tokens +
                    sessionTotal.reasoning.tokens
                : 0;
            // Get last message's context usage — only search within the current
            // compaction epoch. Pre-boundary messages carry stale contextUsage from
            // before compaction; including them inflates the usage indicator and
            // triggers premature auto-compaction.
            const messages = aggregator.getAllMessages();
            const lastContextUsage = (() => {
                for (let i = messages.length - 1; i >= 0; i--) {
                    const msg = messages[i];
                    if (isDurableCompactionBoundaryMarker(msg))
                        break;
                    if (msg.role === "assistant") {
                        if (msg.metadata?.compacted)
                            continue;
                        const rawUsage = msg.metadata?.contextUsage;
                        const providerMeta = msg.metadata?.contextProviderMetadata ?? msg.metadata?.providerMetadata;
                        if (rawUsage) {
                            const msgModel = msg.metadata?.model ?? model ?? "unknown";
                            return createDisplayUsage(rawUsage, msgModel, providerMeta);
                        }
                    }
                }
                return undefined;
            })();
            // Live streaming data (unchanged)
            const activeStreamId = aggregator.getActiveStreamMessageId();
            const rawContextUsage = activeStreamId
                ? aggregator.getActiveStreamUsage(activeStreamId)
                : undefined;
            const rawStepProviderMetadata = activeStreamId
                ? aggregator.getActiveStreamStepProviderMetadata(activeStreamId)
                : undefined;
            const liveUsage = rawContextUsage && model
                ? createDisplayUsage(rawContextUsage, model, rawStepProviderMetadata)
                : undefined;
            const rawCumulativeUsage = activeStreamId
                ? aggregator.getActiveStreamCumulativeUsage(activeStreamId)
                : undefined;
            const rawCumulativeProviderMetadata = activeStreamId
                ? aggregator.getActiveStreamCumulativeProviderMetadata(activeStreamId)
                : undefined;
            const liveCostUsage = rawCumulativeUsage && model
                ? createDisplayUsage(rawCumulativeUsage, model, rawCumulativeProviderMetadata)
                : undefined;
            return { sessionTotal, lastRequest, lastContextUsage, totalTokens, liveUsage, liveCostUsage };
        });
    }
    tryHydrateConsumersFromSessionUsageCache(workspaceId, aggregator) {
        const usage = this.sessionUsage.get(workspaceId);
        const tokenStatsCache = usage?.tokenStatsCache;
        if (!tokenStatsCache) {
            return false;
        }
        const messages = aggregator.getAllMessages();
        if (messages.length === 0) {
            return false;
        }
        const model = aggregator.getCurrentModel() ?? "unknown";
        if (tokenStatsCache.model !== model) {
            return false;
        }
        if (tokenStatsCache.history.messageCount !== messages.length) {
            return false;
        }
        const cachedMaxSeq = tokenStatsCache.history.maxHistorySequence;
        const currentMaxSeq = getMaxHistorySequence(messages);
        // Fall back to messageCount matching if either side lacks historySequence metadata.
        if (cachedMaxSeq !== undefined &&
            currentMaxSeq !== undefined &&
            cachedMaxSeq !== currentMaxSeq) {
            return false;
        }
        this.consumerManager.hydrateFromCache(workspaceId, {
            consumers: tokenStatsCache.consumers,
            tokenizerName: tokenStatsCache.tokenizerName,
            totalTokens: tokenStatsCache.totalTokens,
            topFilePaths: tokenStatsCache.topFilePaths,
        });
        return true;
    }
    ensureConsumersCached(workspaceId, aggregator) {
        if (aggregator.getAllMessages().length === 0) {
            return;
        }
        const cached = this.consumerManager.getCachedState(workspaceId);
        const isPending = this.consumerManager.isPending(workspaceId);
        if (cached || isPending) {
            return;
        }
        if (this.tryHydrateConsumersFromSessionUsageCache(workspaceId, aggregator)) {
            return;
        }
        this.consumerManager.scheduleCalculation(workspaceId, aggregator);
    }
    /**
     * Get consumer breakdown (may be calculating).
     * Triggers lazy calculation if workspace is caught-up but no data exists.
     *
     * Architecture: Lazy trigger runs on EVERY access (outside MapStore.get())
     * so workspace switches trigger calculation even if MapStore has cached result.
     */
    getWorkspaceConsumers(workspaceId) {
        const aggregator = this.aggregators.get(workspaceId);
        const isCaughtUp = this.chatTransientState.get(workspaceId)?.caughtUp ?? false;
        // Lazy trigger check (runs on EVERY access, not just when MapStore recomputes)
        const cached = this.consumerManager.getCachedState(workspaceId);
        const isPending = this.consumerManager.isPending(workspaceId);
        if (!cached && !isPending && isCaughtUp) {
            if (aggregator && aggregator.getAllMessages().length > 0) {
                // Defer scheduling/hydration to avoid setState-during-render warning
                // queueMicrotask ensures this runs after current render completes
                queueMicrotask(() => {
                    this.ensureConsumersCached(workspaceId, aggregator);
                });
            }
        }
        // Return state (MapStore handles subscriptions, delegates to manager for actual state)
        return this.consumersStore.get(workspaceId, () => {
            return this.consumerManager.getStateSync(workspaceId);
        });
    }
    /**
     * Subscribe to usage store changes for a specific workspace.
     */
    subscribeUsage(workspaceId, listener) {
        return this.usageStore.subscribeKey(workspaceId, listener);
    }
    /**
     * Subscribe to backend timing stats snapshots for a specific workspace.
     */
    subscribeStats(workspaceId, listener) {
        const unsubscribeFromStore = this.statsStore.subscribeKey(workspaceId, listener);
        const previousCount = this.statsListenerCounts.get(workspaceId) ?? 0;
        const nextCount = previousCount + 1;
        this.statsListenerCounts.set(workspaceId, nextCount);
        if (previousCount === 0) {
            // Start the backend subscription only once we have an actual UI consumer.
            this.subscribeToStats(workspaceId);
        }
        return () => {
            unsubscribeFromStore();
            const currentCount = this.statsListenerCounts.get(workspaceId);
            if (!currentCount) {
                console.warn(`[WorkspaceStore] stats listener count underflow for ${workspaceId} (already 0)`);
                return;
            }
            if (currentCount === 1) {
                this.statsListenerCounts.delete(workspaceId);
                // No remaining listeners: stop the backend subscription and drop cached snapshot.
                const statsUnsubscribe = this.statsUnsubscribers.get(workspaceId);
                if (statsUnsubscribe) {
                    statsUnsubscribe();
                    this.statsUnsubscribers.delete(workspaceId);
                }
                this.workspaceStats.delete(workspaceId);
                // Clear MapStore caches for this workspace.
                // MapStore.delete() is version-gated, so bump first to ensure we clear even
                // if the key was only ever read (get()) and never bumped.
                this.statsStore.bump(workspaceId);
                this.statsStore.delete(workspaceId);
                return;
            }
            this.statsListenerCounts.set(workspaceId, currentCount - 1);
        };
    }
    /**
     * Subscribe to consumer store changes for a specific workspace.
     */
    subscribeConsumers(workspaceId, listener) {
        return this.consumersStore.subscribeKey(workspaceId, listener);
    }
    /**
     * Update usage and schedule consumer calculation after stream completion.
     *
     * CRITICAL ORDERING: This must be called AFTER the aggregator updates its messages.
     * If called before, the UI will re-render and read stale data from the aggregator,
     * causing a race condition where usage appears empty until refresh.
     *
     * Handles both:
     * - Instant usage display (from API metadata) - only if usage present
     * - Async consumer breakdown (tokenization via Web Worker) - normally scheduled,
     *   but skipped during history replay to avoid O(N) scheduling overhead
     */
    finalizeUsageStats(workspaceId, metadata) {
        // During history replay: only bump usage, skip scheduling (caught-up schedules once at end)
        if (this.chatTransientState.get(workspaceId)?.replayingHistory) {
            if (metadata?.usage) {
                this.usageStore.bump(workspaceId);
            }
            return;
        }
        // Normal real-time path: always bump usage.
        //
        // Even if total usage is missing (e.g. provider doesn't return it or it timed out),
        // we still need to recompute usage snapshots to:
        // - Clear liveUsage once the active stream ends
        // - Pick up lastContextUsage changes from merged message metadata
        this.usageStore.bump(workspaceId);
        // Always schedule consumer calculation (tool calls, text, etc. need tokenization)
        // Even streams without usage metadata need token counts recalculated
        const aggregator = this.aggregators.get(workspaceId);
        if (aggregator) {
            this.consumerManager.scheduleCalculation(workspaceId, aggregator);
        }
    }
    sleepWithAbort(timeoutMs, signal) {
        return new Promise((resolve) => {
            if (signal.aborted) {
                resolve();
                return;
            }
            const onAbort = () => {
                cleanup();
                resolve();
            };
            const timeout = setTimeout(() => {
                cleanup();
                resolve();
            }, timeoutMs);
            const cleanup = () => {
                clearTimeout(timeout);
                signal.removeEventListener("abort", onAbort);
            };
            signal.addEventListener("abort", onAbort, { once: true });
        });
    }
    isWorkspaceSubscribed(workspaceId) {
        return this.ipcUnsubscribers.has(workspaceId);
    }
    async waitForClient(signal) {
        while (!signal.aborted) {
            if (this.client) {
                return this.client;
            }
            // Wait for a client to be attached (e.g., initial connect or reconnect).
            await new Promise((resolve) => {
                if (signal.aborted) {
                    resolve();
                    return;
                }
                const clientChangeSignal = this.clientChangeController.signal;
                const onAbort = () => {
                    cleanup();
                    resolve();
                };
                const timeout = setTimeout(() => {
                    cleanup();
                    resolve();
                }, ON_CHAT_RETRY_BASE_MS);
                const cleanup = () => {
                    clearTimeout(timeout);
                    signal.removeEventListener("abort", onAbort);
                    clientChangeSignal.removeEventListener("abort", onAbort);
                };
                signal.addEventListener("abort", onAbort, { once: true });
                clientChangeSignal.addEventListener("abort", onAbort, { once: true });
            });
        }
        return null;
    }
    /**
     * Reset derived UI state for a workspace so a fresh onChat replay can rebuild it.
     *
     * This is used when an onChat subscription ends unexpectedly (MessagePort/WebSocket hiccup).
     * Without clearing, replayed history would be merged into stale state (loadHistoricalMessages
     * only adds/overwrites, it doesn't delete messages that disappeared due to compaction/truncation).
     */
    resetChatStateForReplay(workspaceId) {
        const aggregator = this.aggregators.get(workspaceId);
        if (!aggregator) {
            return;
        }
        // Clear any pending UI bumps from deltas - we're about to rebuild the message list.
        this.cancelPendingIdleBump(workspaceId);
        aggregator.clear();
        // Reset per-workspace transient state so the next replay rebuilds from the backend source of truth.
        this.chatTransientState.set(workspaceId, createInitialChatTransientState());
        this.states.bump(workspaceId);
        this.checkAndBumpRecencyIfChanged();
    }
    /**
     * Subscribe to workspace chat events (history replay + live streaming).
     * Retries on unexpected iterator termination to avoid requiring a full app restart.
     */
    async runOnChatSubscription(workspaceId, signal) {
        let attempt = 0;
        while (!signal.aborted) {
            const client = this.client ?? (await this.waitForClient(signal));
            if (!client || signal.aborted) {
                return;
            }
            // Allow us to abort only this subscription attempt (without unsubscribing the workspace).
            const attemptController = new AbortController();
            const onAbort = () => attemptController.abort();
            signal.addEventListener("abort", onAbort);
            const clientChangeSignal = this.clientChangeController.signal;
            const onClientChange = () => attemptController.abort();
            clientChangeSignal.addEventListener("abort", onClientChange, { once: true });
            let stallInterval = null;
            let lastChatEventAt = Date.now();
            try {
                const iterator = await client.workspace.onChat({ workspaceId }, { signal: attemptController.signal });
                if (this.pendingReplayReset.delete(workspaceId)) {
                    // Keep the existing UI visible until the replay can actually start.
                    this.resetChatStateForReplay(workspaceId);
                }
                // Stall watchdog: server sends heartbeats every 5s, so if we don't receive ANY events
                // (including heartbeats) for 10s, the connection is likely dead.
                stallInterval = setInterval(() => {
                    if (attemptController.signal.aborted)
                        return;
                    const elapsedMs = Date.now() - lastChatEventAt;
                    if (elapsedMs < ON_CHAT_STALL_TIMEOUT_MS)
                        return;
                    console.warn(`[WorkspaceStore] onChat appears stalled for ${workspaceId} (no events for ${elapsedMs}ms); retrying...`);
                    attemptController.abort();
                }, ON_CHAT_STALL_CHECK_INTERVAL_MS);
                for await (const data of iterator) {
                    if (signal.aborted) {
                        return;
                    }
                    lastChatEventAt = Date.now();
                    // Connection is alive again - don't carry old backoff into the next failure.
                    attempt = 0;
                    queueMicrotask(() => {
                        this.handleChatMessage(workspaceId, data);
                    });
                }
                // Iterator ended without an abort - treat as unexpected and retry.
                if (signal.aborted) {
                    return;
                }
                if (attemptController.signal.aborted) {
                    // e.g., stall watchdog fired
                    console.warn(`[WorkspaceStore] onChat subscription aborted for ${workspaceId}; retrying...`);
                }
                else {
                    console.warn(`[WorkspaceStore] onChat subscription ended unexpectedly for ${workspaceId}; retrying...`);
                }
            }
            catch (error) {
                // Suppress errors when subscription was intentionally cleaned up
                if (signal.aborted) {
                    return;
                }
                const abortError = isAbortError(error);
                if (attemptController.signal.aborted) {
                    if (!abortError) {
                        console.warn(`[WorkspaceStore] onChat subscription aborted for ${workspaceId}; retrying...`);
                    }
                }
                else if (isIteratorValidationFailed(error)) {
                    // EVENT_ITERATOR_VALIDATION_FAILED can happen when:
                    // 1. Schema validation fails (event doesn't match WorkspaceChatMessageSchema)
                    // 2. Workspace was removed on server side (iterator ends with error)
                    // 3. Connection dropped (WebSocket/MessagePort error)
                    // Only suppress if workspace no longer exists (was removed during the race)
                    if (!this.isWorkspaceSubscribed(workspaceId)) {
                        return;
                    }
                    // Log with detailed validation info for debugging schema mismatches
                    console.error(`[WorkspaceStore] Event validation failed for ${workspaceId}: ${formatValidationError(error)}`);
                }
                else if (!abortError) {
                    console.error(`[WorkspaceStore] Error in onChat subscription for ${workspaceId}:`, error);
                }
            }
            finally {
                signal.removeEventListener("abort", onAbort);
                clientChangeSignal.removeEventListener("abort", onClientChange);
                if (stallInterval) {
                    clearInterval(stallInterval);
                }
            }
            if (this.isWorkspaceSubscribed(workspaceId)) {
                this.pendingReplayReset.add(workspaceId);
            }
            const delayMs = calculateOnChatBackoffMs(attempt);
            attempt++;
            await this.sleepWithAbort(delayMs, signal);
            if (signal.aborted) {
                return;
            }
        }
    }
    /**
     * Add a workspace and subscribe to its IPC events.
     */
    /**
     * Imperative metadata lookup — no React subscription. Safe to call from
     * event handlers / callbacks without causing re-renders.
     */
    getWorkspaceMetadata(workspaceId) {
        return this.workspaceMetadata.get(workspaceId);
    }
    addWorkspace(metadata) {
        const workspaceId = metadata.id;
        // Skip if already subscribed
        if (this.ipcUnsubscribers.has(workspaceId)) {
            return;
        }
        // Store metadata for name lookup
        this.workspaceMetadata.set(workspaceId, metadata);
        // Backend guarantees createdAt via config.ts - this should never be undefined
        assert(metadata.createdAt, `Workspace ${workspaceId} missing createdAt - backend contract violated`);
        const aggregator = this.getOrCreateAggregator(workspaceId, metadata.createdAt, metadata.unarchivedAt);
        // Initialize recency cache and bump derived store immediately
        // This ensures UI sees correct workspace order before messages load
        const initialRecency = aggregator.getRecencyTimestamp();
        if (initialRecency !== null) {
            this.recencyCache.set(workspaceId, initialRecency);
            this.derived.bump("recency");
        }
        // Initialize transient chat state
        if (!this.chatTransientState.has(workspaceId)) {
            this.chatTransientState.set(workspaceId, createInitialChatTransientState());
        }
        // Clear stale streaming state
        aggregator.clearActiveStreams();
        // Subscribe to IPC events
        // Wrap in queueMicrotask to ensure IPC events don't update during React render
        const controller = new AbortController();
        const { signal } = controller;
        this.ipcUnsubscribers.set(workspaceId, () => controller.abort());
        // Fire and forget the subscription loop (retries on errors)
        void this.runOnChatSubscription(workspaceId, signal);
        // Fetch persisted session usage (fire-and-forget)
        this.client?.workspace
            .getSessionUsage({ workspaceId })
            .then((data) => {
            if (data) {
                this.sessionUsage.set(workspaceId, data);
                this.usageStore.bump(workspaceId);
            }
        })
            .catch((error) => {
            console.warn(`Failed to fetch session usage for ${workspaceId}:`, error);
        });
        // Stats snapshots are subscribed lazily via subscribeStats().
        if (this.statsEnabled) {
            this.subscribeToStats(workspaceId);
        }
        if (!this.client) {
            console.warn(`[WorkspaceStore] No ORPC client available for workspace ${workspaceId}`);
        }
    }
    /**
     * Remove a workspace and clean up subscriptions.
     */
    removeWorkspace(workspaceId) {
        // Clean up consumer manager state
        this.consumerManager.removeWorkspace(workspaceId);
        // Clean up idle callback to prevent stale callbacks
        this.cancelPendingIdleBump(workspaceId);
        const statsUnsubscribe = this.statsUnsubscribers.get(workspaceId);
        if (statsUnsubscribe) {
            statsUnsubscribe();
            this.statsUnsubscribers.delete(workspaceId);
        }
        // Unsubscribe from IPC
        const unsubscribe = this.ipcUnsubscribers.get(workspaceId);
        if (unsubscribe) {
            unsubscribe();
            this.ipcUnsubscribers.delete(workspaceId);
        }
        this.pendingReplayReset.delete(workspaceId);
        // Clean up state
        this.states.delete(workspaceId);
        this.usageStore.delete(workspaceId);
        this.consumersStore.delete(workspaceId);
        this.aggregators.delete(workspaceId);
        this.chatTransientState.delete(workspaceId);
        this.recencyCache.delete(workspaceId);
        this.previousSidebarValues.delete(workspaceId);
        this.sidebarStateCache.delete(workspaceId);
        this.sidebarStateSourceState.delete(workspaceId);
        this.workspaceCreatedAt.delete(workspaceId);
        this.workspaceStats.delete(workspaceId);
        this.statsStore.delete(workspaceId);
        this.sessionUsage.delete(workspaceId);
    }
    /**
     * Sync workspaces with metadata - add new, remove deleted.
     */
    syncWorkspaces(workspaceMetadata) {
        const metadataIds = new Set(Array.from(workspaceMetadata.values()).map((m) => m.id));
        const currentIds = new Set(this.ipcUnsubscribers.keys());
        // Add new workspaces
        for (const metadata of workspaceMetadata.values()) {
            if (!currentIds.has(metadata.id)) {
                this.addWorkspace(metadata);
            }
        }
        // Remove deleted workspaces
        for (const workspaceId of currentIds) {
            if (!metadataIds.has(workspaceId)) {
                this.removeWorkspace(workspaceId);
            }
        }
    }
    /**
     * Cleanup all subscriptions (call on unmount).
     */
    dispose() {
        // Clean up consumer manager
        this.consumerManager.dispose();
        for (const unsubscribe of this.statsUnsubscribers.values()) {
            unsubscribe();
        }
        this.statsUnsubscribers.clear();
        for (const unsubscribe of this.ipcUnsubscribers.values()) {
            unsubscribe();
        }
        this.ipcUnsubscribers.clear();
        this.pendingReplayReset.clear();
        this.states.clear();
        this.derived.clear();
        this.usageStore.clear();
        this.consumersStore.clear();
        this.aggregators.clear();
        this.chatTransientState.clear();
        this.workspaceStats.clear();
        this.statsStore.clear();
        this.statsListenerCounts.clear();
        this.sessionUsage.clear();
        this.recencyCache.clear();
        this.previousSidebarValues.clear();
        this.sidebarStateCache.clear();
        this.workspaceCreatedAt.clear();
    }
    /**
     * Subscribe to idle compaction events.
     * Callback is called when backend signals a workspace needs idle compaction.
     * Returns unsubscribe function.
     */
    onIdleCompactionNeeded(callback) {
        this.idleCompactionCallbacks.add(callback);
        return () => this.idleCompactionCallbacks.delete(callback);
    }
    /**
     * Notify all listeners that a workspace needs idle compaction.
     */
    notifyIdleCompactionNeeded(workspaceId) {
        for (const callback of this.idleCompactionCallbacks) {
            try {
                callback(workspaceId);
            }
            catch (error) {
                console.error("Error in idle compaction callback:", error);
            }
        }
    }
    /**
     * Subscribe to file-modifying tool completions.
     * @param listener Called with workspaceId when a file-modifying tool completes
     * @param workspaceId If provided, only notify for this workspace
     */
    subscribeFileModifyingTool(listener, workspaceId) {
        if (workspaceId) {
            // Per-workspace: wrap listener to match subscribeKey signature
            return this.fileModifyingToolSubs.subscribeKey(workspaceId, () => listener(workspaceId));
        }
        // All workspaces: subscribe to global notifications
        return this.fileModifyingToolSubs.subscribeAny(() => {
            // Notify for all workspaces that have pending changes
            for (const wsId of this.fileModifyingToolMs.keys()) {
                listener(wsId);
            }
        });
    }
    /**
     * Get when a file-modifying tool last completed for this workspace.
     * Returns undefined if no tools have completed since last clear.
     */
    getFileModifyingToolMs(workspaceId) {
        return this.fileModifyingToolMs.get(workspaceId);
    }
    /**
     * Clear the file-modifying tool timestamp after ReviewPanel has consumed it.
     */
    clearFileModifyingToolMs(workspaceId) {
        this.fileModifyingToolMs.delete(workspaceId);
    }
    /**
     * Simulate a file-modifying tool completion for testing.
     * Triggers the same subscription as a real tool-call-end for file_edit_* or bash.
     */
    simulateFileModifyingToolEnd(workspaceId) {
        this.fileModifyingToolMs.set(workspaceId, Date.now());
        this.fileModifyingToolSubs.bump(workspaceId);
    }
    // Private methods
    /**
     * Get or create aggregator for a workspace.
     *
     * REQUIRES: createdAt must be provided for new aggregators.
     * Backend guarantees every workspace has createdAt via config.ts.
     *
     * If aggregator already exists, createdAt is optional (it was already set during creation).
     */
    getOrCreateAggregator(workspaceId, createdAt, unarchivedAt) {
        if (!this.aggregators.has(workspaceId)) {
            // Create new aggregator with required createdAt and workspaceId for localStorage persistence
            const aggregator = new StreamingMessageAggregator(createdAt, workspaceId, unarchivedAt);
            // Wire up navigation callback for notification clicks
            if (this.navigateToWorkspaceCallback) {
                aggregator.onNavigateToWorkspace = this.navigateToWorkspaceCallback;
            }
            // Wire up response complete callback for "notify on response" feature
            if (this.responseCompleteCallback) {
                aggregator.onResponseComplete = this.responseCompleteCallback;
            }
            this.aggregators.set(workspaceId, aggregator);
            this.workspaceCreatedAt.set(workspaceId, createdAt);
        }
        else if (unarchivedAt) {
            // Update unarchivedAt on existing aggregator (e.g., after restore from archive)
            this.aggregators.get(workspaceId).setUnarchivedAt(unarchivedAt);
        }
        return this.aggregators.get(workspaceId);
    }
    /**
     * Check if data is a buffered event type by checking the handler map.
     * This ensures isStreamEvent() and processStreamEvent() can never fall out of sync.
     */
    isBufferedEvent(data) {
        return "type" in data && data.type in this.bufferedEventHandlers;
    }
    handleChatMessage(workspaceId, data) {
        // Aggregator must exist - IPC subscription happens in addWorkspace()
        const aggregator = this.assertGet(workspaceId);
        const transient = this.assertChatTransientState(workspaceId);
        if (isCaughtUpMessage(data)) {
            // Check if there's an active stream in buffered events (reconnection scenario)
            const pendingEvents = transient.pendingStreamEvents;
            const hasActiveStream = pendingEvents.some((event) => "type" in event && event.type === "stream-start");
            // Load historical messages first
            if (transient.historicalMessages.length > 0) {
                aggregator.loadHistoricalMessages(transient.historicalMessages, hasActiveStream);
                transient.historicalMessages.length = 0;
            }
            // Mark that we're replaying buffered history (prevents O(N) scheduling)
            transient.replayingHistory = true;
            // Process buffered stream events now that history is loaded
            for (const event of pendingEvents) {
                this.processStreamEvent(workspaceId, aggregator, event);
            }
            pendingEvents.length = 0;
            // Done replaying buffered events
            transient.replayingHistory = false;
            // Mark as caught up
            transient.caughtUp = true;
            this.states.bump(workspaceId);
            this.checkAndBumpRecencyIfChanged(); // Messages loaded, update recency
            // Usage-only updates can trigger an extra full ChatPane render right after catch-up.
            // Schedule this as idle follow-up so initial transcript paint wins the critical path.
            this.scheduleCaughtUpUsageBump(workspaceId);
            // Hydrate consumer breakdown from persisted cache when possible.
            // Fall back to tokenization when no cache (or stale cache) exists.
            if (aggregator.getAllMessages().length > 0) {
                this.ensureConsumersCached(workspaceId, aggregator);
            }
            return;
        }
        // Handle idle-compaction-needed event (workspace became eligible while connected)
        if ("type" in data && data.type === "idle-compaction-needed") {
            this.notifyIdleCompactionNeeded(workspaceId);
            return;
        }
        // Heartbeat events are no-ops for UI state - they exist only for connection liveness detection
        if ("type" in data && data.type === "heartbeat") {
            return;
        }
        // OPTIMIZATION: Buffer stream events until caught-up to reduce excess re-renders
        // When first subscribing to a workspace, we receive:
        // 1. Historical messages from chat.jsonl (potentially hundreds of messages)
        // 2. Partial stream state (if stream was interrupted)
        // 3. Active stream events (if currently streaming)
        //
        // Without buffering, each event would trigger a separate re-render as messages
        // arrive one-by-one over IPC. By buffering until "caught-up", we:
        // - Load all historical messages in one batch (O(1) render instead of O(N))
        // - Replay buffered stream events after history is loaded
        // - Provide correct context for stream continuation (history is complete)
        //
        // This is especially important for workspaces with long histories (100+ messages),
        // where unbuffered rendering would cause visible lag and UI stutter.
        if (!transient.caughtUp && this.isBufferedEvent(data)) {
            transient.pendingStreamEvents.push(data);
            return;
        }
        // Process event immediately (already caught up or not a stream event)
        this.processStreamEvent(workspaceId, aggregator, data);
    }
    processStreamEvent(workspaceId, aggregator, data) {
        // Handle non-buffered special events first
        if (isStreamError(data)) {
            const transient = this.assertChatTransientState(workspaceId);
            // Suppress side effects during buffered replay (we're just hydrating UI state), but allow
            // live errors to trigger mux-gateway session-expired handling even before we're "caught up".
            // In particular, mux-gateway 401s can surface as a pre-stream stream-error (before any
            // stream-start) during startup/reconnect.
            const allowSideEffects = !transient.replayingHistory;
            applyWorkspaceChatEventToAggregator(aggregator, data, { allowSideEffects });
            // Increment retry attempt counter when stream fails.
            updatePersistedState(getRetryStateKey(workspaceId), (prev) => {
                const newAttempt = prev.attempt + 1;
                console.debug(`[retry] ${workspaceId} stream-error: incrementing attempt ${prev.attempt} → ${newAttempt}`);
                return {
                    attempt: newAttempt,
                    retryStartTime: Date.now(),
                };
            }, { attempt: 0, retryStartTime: Date.now() });
            this.states.bump(workspaceId);
            this.dispatchResumeCheck(workspaceId);
            return;
        }
        if (isDeleteMessage(data)) {
            applyWorkspaceChatEventToAggregator(aggregator, data);
            this.cleanupStaleLiveBashOutput(workspaceId, aggregator);
            this.states.bump(workspaceId);
            this.checkAndBumpRecencyIfChanged();
            this.usageStore.bump(workspaceId);
            this.consumerManager.scheduleCalculation(workspaceId, aggregator);
            return;
        }
        if (isBashOutputEvent(data)) {
            const hasText = data.text.length > 0;
            const hasPhase = data.phase !== undefined;
            if (!hasText && !hasPhase)
                return;
            const transient = this.assertChatTransientState(workspaceId);
            const prev = transient.liveBashOutput.get(data.toolCallId);
            const next = appendLiveBashOutputChunk(prev, { text: data.text, isError: data.isError, phase: data.phase }, BASH_TRUNCATE_MAX_TOTAL_BYTES);
            // Avoid unnecessary re-renders if this event didn't change the stored state.
            if (next === prev)
                return;
            transient.liveBashOutput.set(data.toolCallId, next);
            // High-frequency: throttle UI updates like other delta-style events.
            this.scheduleIdleStateBump(workspaceId);
            return;
        }
        if (isTaskCreatedEvent(data)) {
            const transient = this.assertChatTransientState(workspaceId);
            // Avoid unnecessary re-renders if the taskId is unchanged.
            const prev = transient.liveTaskIds.get(data.toolCallId);
            if (prev === data.taskId)
                return;
            transient.liveTaskIds.set(data.toolCallId, data.taskId);
            // Low-frequency: bump immediately so the user can open the child workspace quickly.
            this.states.bump(workspaceId);
            return;
        }
        // Try buffered event handlers (single source of truth)
        if ("type" in data && data.type in this.bufferedEventHandlers) {
            this.bufferedEventHandlers[data.type](workspaceId, aggregator, data);
            return;
        }
        // Regular messages (MuxMessage without type field)
        if (isMuxMessage(data)) {
            const transient = this.assertChatTransientState(workspaceId);
            if (!transient.caughtUp) {
                // Buffer historical MuxMessages
                transient.historicalMessages.push(data);
            }
            else {
                // Process live events immediately (after history loaded)
                applyWorkspaceChatEventToAggregator(aggregator, data);
                this.states.bump(workspaceId);
                this.usageStore.bump(workspaceId);
                this.checkAndBumpRecencyIfChanged();
            }
            return;
        }
        // If we reach here, unknown message type - log for debugging
        if ("role" in data || "type" in data) {
            console.error("[WorkspaceStore] Unknown message type - not processed", {
                workspaceId,
                hasRole: "role" in data,
                hasType: "type" in data,
                type: "type" in data ? data.type : undefined,
                role: "role" in data ? data.role : undefined,
            });
        }
        // Note: Messages without role/type are silently ignored (expected for some IPC events)
    }
}
// ============================================================================
// React Integration with useSyncExternalStore
// ============================================================================
// Singleton store instance
let storeInstance = null;
/**
 * Get or create the singleton WorkspaceStore instance.
 */
function getStoreInstance() {
    storeInstance ?? (storeInstance = new WorkspaceStore(() => {
        // Model tracking callback - can hook into other systems if needed
    }));
    return storeInstance;
}
/**
 * Direct access to the singleton store instance.
 * Use this for non-hook subscriptions (e.g., in useEffect callbacks).
 */
export const workspaceStore = {
    onIdleCompactionNeeded: (callback) => getStoreInstance().onIdleCompactionNeeded(callback),
    subscribeFileModifyingTool: (listener, workspaceId) => getStoreInstance().subscribeFileModifyingTool(listener, workspaceId),
    getFileModifyingToolMs: (workspaceId) => getStoreInstance().getFileModifyingToolMs(workspaceId),
    clearFileModifyingToolMs: (workspaceId) => getStoreInstance().clearFileModifyingToolMs(workspaceId),
    /**
     * Simulate a file-modifying tool completion for testing.
     * Triggers the same subscription as a real tool-call-end for file_edit_* or bash.
     */
    simulateFileModifyingToolEnd: (workspaceId) => getStoreInstance().simulateFileModifyingToolEnd(workspaceId),
    /**
     * Get sidebar-specific state for a workspace.
     * Useful in tests for checking recencyTimestamp without hooks.
     */
    getWorkspaceSidebarState: (workspaceId) => getStoreInstance().getWorkspaceSidebarState(workspaceId),
};
/**
 * Hook to get state for a specific workspace.
 * Only re-renders when THIS workspace's state changes.
 *
 * Uses per-key subscription for surgical updates - only notified when
 * this specific workspace's state changes.
 */
export function useWorkspaceState(workspaceId) {
    const store = getStoreInstance();
    return useSyncExternalStore((listener) => store.subscribeKey(workspaceId, listener), () => store.getWorkspaceState(workspaceId));
}
/**
 * Hook to access the raw store for imperative operations.
 */
export function useWorkspaceStoreRaw() {
    return getStoreInstance();
}
/**
 * Hook to get workspace recency timestamps.
 * Subscribes to derived state since recency is updated via derived.bump("recency").
 */
export function useWorkspaceRecency() {
    const store = getStoreInstance();
    return useSyncExternalStore(store.subscribeDerived, () => store.getWorkspaceRecency());
}
/**
 * Hook to get sidebar-specific state for a workspace.
 * Only re-renders when sidebar-relevant fields change (not on every message).
 *
 * getWorkspaceSidebarState returns cached references, so this won't cause
 * unnecessary re-renders even when the subscription fires.
 */
export function useWorkspaceSidebarState(workspaceId) {
    const store = getStoreInstance();
    return useSyncExternalStore((listener) => store.subscribeKey(workspaceId, listener), () => store.getWorkspaceSidebarState(workspaceId));
}
/**
 * Hook to get UI-only live stdout/stderr for a running bash tool call.
 */
export function useBashToolLiveOutput(workspaceId, toolCallId) {
    const store = getStoreInstance();
    return useSyncExternalStore((listener) => {
        if (!workspaceId)
            return () => undefined;
        return store.subscribeKey(workspaceId, listener);
    }, () => {
        if (!workspaceId || !toolCallId)
            return null;
        return store.getBashToolLiveOutput(workspaceId, toolCallId);
    });
}
/**
 * Hook to get UI-only taskId for a running task tool call.
 *
 * This exists because foreground tasks (run_in_background=false) won't return a tool result
 * until the child workspace finishes, but we still want to expose the spawned taskId ASAP.
 */
export function useTaskToolLiveTaskId(workspaceId, toolCallId) {
    const store = getStoreInstance();
    return useSyncExternalStore((listener) => {
        if (!workspaceId)
            return () => undefined;
        return store.subscribeKey(workspaceId, listener);
    }, () => {
        if (!workspaceId || !toolCallId)
            return null;
        return store.getTaskToolLiveTaskId(workspaceId, toolCallId);
    });
}
/**
 * Hook to get the toolCallId of the latest streaming (executing) bash.
 * Returns null if no bash is currently streaming.
 * Used by BashToolCall to auto-expand/collapse.
 */
export function useLatestStreamingBashId(workspaceId) {
    const store = getStoreInstance();
    return useSyncExternalStore((listener) => {
        if (!workspaceId)
            return () => undefined;
        return store.subscribeKey(workspaceId, listener);
    }, () => {
        if (!workspaceId)
            return null;
        const aggregator = store.getAggregator(workspaceId);
        if (!aggregator)
            return null;
        // Aggregator caches the result, so this is O(1) on subsequent calls
        return aggregator.getLatestStreamingBashToolCallId();
    });
}
/**
 * Hook to get an aggregator for a workspace.
 */
export function useWorkspaceAggregator(workspaceId) {
    const store = useWorkspaceStoreRaw();
    return store.getAggregator(workspaceId);
}
/**
 * Disable the displayed message cap for a workspace and trigger a re-render.
 * Used by HistoryHiddenMessage “Load all”.
 */
export function showAllMessages(workspaceId) {
    assert(typeof workspaceId === "string" && workspaceId.length > 0, "showAllMessages requires workspaceId");
    const store = getStoreInstance();
    const aggregator = store.getAggregator(workspaceId);
    if (aggregator) {
        aggregator.setShowAllMessages(true);
        store.bumpState(workspaceId);
    }
}
/**
 * Add an ephemeral message to a workspace and trigger a re-render.
 * Used for displaying frontend-only messages like /plan output.
 */
export function addEphemeralMessage(workspaceId, message) {
    const store = getStoreInstance();
    const aggregator = store.getAggregator(workspaceId);
    if (aggregator) {
        aggregator.addMessage(message);
        store.bumpState(workspaceId);
    }
}
/**
 * Remove an ephemeral message from a workspace and trigger a re-render.
 * Used for dismissing frontend-only messages like /plan output.
 */
export function removeEphemeralMessage(workspaceId, messageId) {
    const store = getStoreInstance();
    const aggregator = store.getAggregator(workspaceId);
    if (aggregator) {
        aggregator.removeMessage(messageId);
        store.bumpState(workspaceId);
    }
}
/**
 * Hook for usage metadata (instant, no tokenization).
 * Updates immediately when usage metadata arrives from API responses.
 */
export function useWorkspaceUsage(workspaceId) {
    const store = getStoreInstance();
    return useSyncExternalStore((listener) => store.subscribeUsage(workspaceId, listener), () => store.getWorkspaceUsage(workspaceId));
}
/**
 * Hook for backend timing stats snapshots.
 */
export function useWorkspaceStatsSnapshot(workspaceId) {
    const store = getStoreInstance();
    // NOTE: subscribeStats() starts/stops a backend subscription; if React re-subscribes on every
    // render (because the subscribe callback is unstable), we can trigger an infinite loop.
    // This useCallback is for correctness, not performance.
    const subscribe = useCallback((listener) => store.subscribeStats(workspaceId, listener), [store, workspaceId]);
    const getSnapshot = useCallback(() => store.getWorkspaceStatsSnapshot(workspaceId), [store, workspaceId]);
    return useSyncExternalStore(subscribe, getSnapshot);
}
/**
 * Hook for consumer breakdown (lazy, with tokenization).
 * Updates after async Web Worker calculation completes.
 */
export function useWorkspaceConsumers(workspaceId) {
    const store = getStoreInstance();
    return useSyncExternalStore((listener) => store.subscribeConsumers(workspaceId, listener), () => store.getWorkspaceConsumers(workspaceId));
}
//# sourceMappingURL=WorkspaceStore.js.map