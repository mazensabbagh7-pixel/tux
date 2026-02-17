import { sliceMessagesFromLatestCompactionBoundary } from "@/common/utils/messages/compactionBoundary";
const TOKENIZER_CANCELLED_MESSAGE = "Cancelled by newer request";
let globalTokenStatsRequestId = 0;
const latestRequestByWorkspace = new Map();
async function calculateTokenStatsLatest(workspaceId, messages, model) {
    const orpcClient = window.__ORPC_CLIENT__;
    if (!orpcClient) {
        throw new Error("ORPC client not initialized");
    }
    const requestId = ++globalTokenStatsRequestId;
    latestRequestByWorkspace.set(workspaceId, requestId);
    try {
        const stats = await orpcClient.tokenizer.calculateStats({ workspaceId, messages, model });
        const latestRequestId = latestRequestByWorkspace.get(workspaceId);
        if (latestRequestId !== requestId) {
            throw new Error(TOKENIZER_CANCELLED_MESSAGE);
        }
        return stats;
    }
    catch (error) {
        if (error instanceof Error) {
            throw error;
        }
        throw new Error(String(error));
    }
}
// Timeout for Web Worker calculations (60 seconds - generous but responsive)
const CALCULATION_TIMEOUT_MS = 60000;
/**
 * Manages consumer token calculations for workspaces.
 *
 * Responsibilities:
 * - Debounces rapid calculation requests (e.g., multiple tool-call-end events)
 * - Caches calculated results to avoid redundant work (source of truth)
 * - Tracks calculation state per workspace
 * - Executes Web Worker tokenization calculations
 * - Handles cleanup and disposal
 *
 * Architecture:
 * - Single responsibility: consumer tokenization calculations
 * - Owns the source-of-truth cache (calculated consumer data)
 * - WorkspaceStore orchestrates (decides when to calculate)
 * - This manager executes (performs calculations, manages cache)
 *
 * Dual-Cache Design:
 * - WorkspaceConsumerManager.cache: Source of truth for calculated data
 * - WorkspaceStore.consumersStore (MapStore): Subscription management only
 *   (components subscribe to workspace changes, delegates to manager for state)
 */
export class WorkspaceConsumerManager {
    constructor(onCalculationComplete) {
        // Track scheduled calculations (in debounce window, not yet executing)
        this.scheduledCalcs = new Set();
        // Track executing calculations (Web Worker running)
        this.pendingCalcs = new Set();
        // Track workspaces that need recalculation after current one completes
        this.needsRecalc = new Map();
        // Cache calculated consumer data (persists across bumps)
        this.cache = new Map();
        // Debounce timers for consumer calculations (prevents rapid-fire during tool sequences)
        this.debounceTimers = new Map();
        // Track pending store notifications to avoid duplicate bumps within the same tick
        this.pendingNotifications = new Set();
        this.onCalculationComplete = onCalculationComplete;
    }
    /**
     * Get cached state without side effects.
     * Returns null if no cache exists.
     */
    getCachedState(workspaceId) {
        return this.cache.get(workspaceId) ?? null;
    }
    /**
     * Check if calculation is pending or scheduled for workspace.
     */
    isPending(workspaceId) {
        return this.scheduledCalcs.has(workspaceId) || this.pendingCalcs.has(workspaceId);
    }
    /**
     * Get current state synchronously without triggering calculations.
     * Returns cached result if available, otherwise returns default state.
     *
     * Note: This is called from WorkspaceStore.getWorkspaceConsumers(),
     * which handles the lazy trigger logic separately.
     */
    getStateSync(workspaceId) {
        const cached = this.cache.get(workspaceId);
        if (cached) {
            return cached;
        }
        // Default state while scheduled/calculating or before first calculation
        return {
            consumers: [],
            tokenizerName: "",
            totalTokens: 0,
            isCalculating: this.scheduledCalcs.has(workspaceId) || this.pendingCalcs.has(workspaceId),
        };
    }
    /**
     * Hydrate consumer breakdown from a persisted cache (session-usage.json).
     * Skips hydration if a calculation is already scheduled/running.
     */
    hydrateFromCache(workspaceId, state) {
        if (this.pendingCalcs.has(workspaceId) || this.scheduledCalcs.has(workspaceId)) {
            return;
        }
        this.cache.set(workspaceId, { ...state, isCalculating: false });
        this.notifyStoreAsync(workspaceId);
    }
    /**
     * Schedule a consumer calculation (debounced).
     * Batches rapid events (e.g., multiple tool-call-end) into single calculation.
     * Marks as "calculating" immediately to prevent UI flash.
     *
     * If a calculation is already running, marks workspace for recalculation
     * after the current one completes.
     */
    scheduleCalculation(workspaceId, aggregator) {
        // Clear existing timer for this workspace
        const existingTimer = this.debounceTimers.get(workspaceId);
        if (existingTimer) {
            clearTimeout(existingTimer);
        }
        // If already executing, queue a follow-up recalculation
        if (this.pendingCalcs.has(workspaceId)) {
            this.needsRecalc.set(workspaceId, aggregator);
            return;
        }
        // Mark as scheduled immediately (triggers "Calculating..." UI, prevents flash)
        const isNewSchedule = !this.scheduledCalcs.has(workspaceId);
        this.scheduledCalcs.add(workspaceId);
        // Notify store if newly scheduled (triggers UI update)
        if (isNewSchedule) {
            this.notifyStoreAsync(workspaceId);
        }
        // Set new timer (150ms - imperceptible to humans, batches rapid events)
        const timer = setTimeout(() => {
            this.debounceTimers.delete(workspaceId);
            this.scheduledCalcs.delete(workspaceId); // Move from scheduled to pending
            this.executeCalculation(workspaceId, aggregator);
        }, 150);
        this.debounceTimers.set(workspaceId, timer);
    }
    /**
     * Execute background consumer calculation.
     * Only one calculation per workspace at a time.
     */
    executeCalculation(workspaceId, aggregator) {
        // Skip if already calculating
        if (this.pendingCalcs.has(workspaceId)) {
            return;
        }
        this.pendingCalcs.add(workspaceId);
        // Mark as calculating and notify store
        this.notifyStoreAsync(workspaceId);
        // Run in next tick to avoid blocking caller
        void (async () => {
            try {
                // Only count tokens for the current compaction epoch — pre-boundary
                // messages carry stale context and inflate the consumer breakdown.
                const messages = sliceMessagesFromLatestCompactionBoundary(aggregator.getAllMessages());
                const model = aggregator.getCurrentModel() ?? "unknown";
                // Calculate in piscina pool with timeout protection
                const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Calculation timeout")), CALCULATION_TIMEOUT_MS));
                const fullStats = await Promise.race([
                    calculateTokenStatsLatest(workspaceId, messages, model),
                    timeoutPromise,
                ]);
                // Store result in cache
                this.cache.set(workspaceId, {
                    consumers: fullStats.consumers,
                    tokenizerName: fullStats.tokenizerName,
                    totalTokens: fullStats.totalTokens,
                    isCalculating: false,
                    topFilePaths: fullStats.topFilePaths,
                });
                // Notify store to trigger re-render
                this.notifyStoreAsync(workspaceId);
            }
            catch (error) {
                // Cancellations are expected during rapid events - don't cache, don't log
                // This allows lazy trigger to retry on next access
                if (error instanceof Error && error.message === TOKENIZER_CANCELLED_MESSAGE) {
                    return;
                }
                // Real errors (including timeout): log and cache empty result
                console.error(`[WorkspaceConsumerManager] Calculation failed for ${workspaceId}:`, error);
                this.cache.set(workspaceId, {
                    consumers: [],
                    tokenizerName: "",
                    totalTokens: 0,
                    isCalculating: false,
                });
                this.notifyStoreAsync(workspaceId);
            }
            finally {
                this.pendingCalcs.delete(workspaceId);
                // If recalculation was requested while we were running, schedule it now
                const needsRecalcAggregator = this.needsRecalc.get(workspaceId);
                if (needsRecalcAggregator) {
                    this.needsRecalc.delete(workspaceId);
                    this.scheduleCalculation(workspaceId, needsRecalcAggregator);
                }
            }
        })();
    }
    notifyStoreAsync(workspaceId) {
        if (this.pendingNotifications.has(workspaceId)) {
            return;
        }
        this.pendingNotifications.add(workspaceId);
        const schedule = typeof queueMicrotask === "function"
            ? queueMicrotask
            : (callback) => {
                void Promise.resolve().then(callback);
            };
        schedule(() => {
            this.pendingNotifications.delete(workspaceId);
            this.onCalculationComplete(workspaceId);
        });
    }
    /**
     * Remove workspace state and cleanup timers.
     */
    removeWorkspace(workspaceId) {
        // Clear debounce timer
        const timer = this.debounceTimers.get(workspaceId);
        if (timer) {
            clearTimeout(timer);
            this.debounceTimers.delete(workspaceId);
        }
        // Clean up state
        this.cache.delete(workspaceId);
        this.scheduledCalcs.delete(workspaceId);
        this.pendingCalcs.delete(workspaceId);
        this.needsRecalc.delete(workspaceId);
        this.pendingNotifications.delete(workspaceId);
    }
    /**
     * Cleanup all resources.
     */
    dispose() {
        // Clear all debounce timers
        for (const timer of this.debounceTimers.values()) {
            clearTimeout(timer);
        }
        this.debounceTimers.clear();
        // Clear state
        this.cache.clear();
        this.scheduledCalcs.clear();
        this.pendingCalcs.clear();
        this.needsRecalc.clear();
        this.pendingNotifications.clear();
    }
}
//# sourceMappingURL=WorkspaceConsumerManager.js.map