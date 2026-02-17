/**
 * Generic refresh controller with rate-limiting, trailing debounce, focus/visibility handling,
 * and in-flight guards.
 *
 * Handles common patterns for event-driven refresh:
 * - Rate-limits rapid trigger events (first event starts timer, subsequent coalesce)
 * - Applies trailing debounce after activity stops to capture final state
 * - Pauses refresh while document is hidden, flushes when visible
 * - Optionally triggers proactive refresh on focus (for catching external changes)
 * - Guards against concurrent refresh operations
 *
 * Used by GitStatusStore and ReviewPanel.
 */
/** Minimum ms between refresh executions - hard guard against loops */
const MIN_REFRESH_INTERVAL_MS = 500;
export class RefreshController {
    constructor(options) {
        this.debounceTimer = null;
        this.cooldownTimer = null;
        this.inFlight = false;
        this.pendingBecauseHidden = false;
        this.pendingBecauseInFlight = false;
        this.pendingBecausePaused = false;
        this.lastFocusRefreshMs = 0;
        this.disposed = false;
        // Track last refresh for debugging
        this._lastRefreshInfo = null;
        this.pendingTrigger = null;
        // Timestamp of last refresh START (not completion)
        this.lastRefreshStartMs = 0;
        // Track if listeners are bound (for cleanup)
        this.listenersBound = false;
        this.boundHandleVisibility = null;
        this.boundHandleFocus = null;
        this.onRefresh = options.onRefresh;
        this.onRefreshComplete = options.onRefreshComplete ?? null;
        this.debounceMs = options.debounceMs ?? 3000;
        this.priorityDebounceMs = options.priorityDebounceMs ?? this.debounceMs;
        this.refreshOnFocus = options.refreshOnFocus ?? false;
        this.focusDebounceMs = options.focusDebounceMs ?? 500;
        this.isPaused = options.isPaused ?? null;
        this.isManualBlockedFn = options.isManualBlocked ?? null;
        this.debugLabel = options.debugLabel ?? null;
    }
    updatePendingTrigger(trigger) {
        const priorities = {
            manual: 3,
            priority: 2,
            scheduled: 1,
            focus: 0,
            visibility: 0,
            unpaused: 0,
            "in-flight-followup": 0,
        };
        if (!this.pendingTrigger) {
            this.pendingTrigger = trigger;
            return;
        }
        if (priorities[trigger] >= priorities[this.pendingTrigger]) {
            this.pendingTrigger = trigger;
        }
    }
    debug(message) {
        if (this.debugLabel) {
            console.debug(`[RefreshController:${this.debugLabel}] ${message}`);
        }
    }
    /**
     * Schedule a rate-limited refresh with trailing debounce.
     *
     * Behavior (rate-limit + trailing debounce):
     * - First call starts timer for delayMs
     * - Subsequent calls mark "pending" but don't reset timer (rate-limit)
     * - When timer fires, refresh runs
     * - If calls came in during refresh, a trailing debounce timer starts after completion
     * - This captures final state after activity stops, while rate-limiting during constant activity
     */
    schedule() {
        this.scheduleWithDelay(this.debounceMs, "scheduled");
    }
    /**
     * Schedule with priority (shorter) rate limit. Used for active workspace.
     */
    schedulePriority() {
        this.scheduleWithDelay(this.priorityDebounceMs, "priority");
    }
    scheduleWithDelay(delayMs, trigger) {
        if (this.disposed)
            return;
        // Always update pending trigger (manual > priority > scheduled)
        this.updatePendingTrigger(trigger);
        // If refresh is in-flight, mark pending and let onComplete handle scheduling
        if (this.inFlight) {
            this.debug("in-flight, queueing for completion");
            this.pendingBecauseInFlight = true;
            return;
        }
        // Rate-limit: if timer already running, don't reset it
        if (this.debounceTimer) {
            this.debug("timer running, coalescing");
            return;
        }
        this.debug(`starting ${delayMs}ms timer (${trigger})`);
        this.debounceTimer = setTimeout(() => {
            this.debounceTimer = null;
            const t = this.pendingTrigger ?? trigger;
            this.pendingTrigger = null;
            this.debug(`timer fired, refreshing (${t})`);
            this.tryRefresh({ trigger: t });
        }, delayMs);
    }
    /**
     * Request immediate refresh, bypassing debounce and normal pause checks.
     * Use for manual refresh (user clicked button).
     *
     * Note: If isManualBlocked() returns true, the refresh is deferred (not executed).
     * This is for cases like composing a review note where any refresh would be disruptive.
     */
    requestImmediate() {
        if (this.disposed)
            return;
        // Check if manual refresh is blocked (e.g., composing review note)
        if (this.isManualBlockedFn?.()) {
            this.debug("manual refresh blocked, queueing");
            this.pendingBecausePaused = true;
            this.updatePendingTrigger("manual");
            return;
        }
        // Clear any pending debounce
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }
        this.tryRefresh({ bypassPause: true, bypassHidden: true, trigger: "manual" });
    }
    /**
     * Attempt refresh, respecting pause conditions.
     */
    tryRefresh(options) {
        if (this.disposed)
            return;
        const trigger = options?.trigger ?? this.pendingTrigger ?? "scheduled";
        const bypassHidden = (options?.bypassHidden ?? false) || trigger === "manual";
        const bypassPause = (options?.bypassPause ?? false) || trigger === "manual";
        const bypassMinInterval = (options?.bypassMinInterval ?? false) || trigger === "manual";
        // Hidden → queue for visibility (unless bypassed)
        if (!bypassHidden && typeof document !== "undefined" && document.hidden) {
            this.pendingBecauseHidden = true;
            this.updatePendingTrigger(trigger);
            return;
        }
        // Custom pause (e.g., user interacting) → queue for unpause
        // Bypassed for manual refresh (user explicitly requested)
        if (!bypassPause && this.isPaused?.()) {
            this.pendingBecausePaused = true;
            this.updatePendingTrigger(trigger);
            return;
        }
        // In-flight → queue for completion
        if (this.inFlight) {
            this.pendingBecauseInFlight = true;
            this.updatePendingTrigger(trigger);
            return;
        }
        // Hard guard: enforce minimum interval between refresh starts.
        // Rather than dropping the request, schedule it for the earliest allowed time.
        // Bypassed for manual refresh (user/component explicitly requested).
        if (!bypassMinInterval && this.lastRefreshStartMs > 0) {
            const now = Date.now();
            const elapsed = now - this.lastRefreshStartMs;
            if (elapsed < MIN_REFRESH_INTERVAL_MS) {
                this.updatePendingTrigger(trigger);
                if (this.cooldownTimer) {
                    this.debug("cooldown timer running, coalescing");
                    return;
                }
                const delayMs = MIN_REFRESH_INTERVAL_MS - elapsed;
                const t = this.pendingTrigger ?? trigger;
                this.debug(`cooldown: delaying ${delayMs}ms (${t})`);
                this.cooldownTimer = setTimeout(() => {
                    this.cooldownTimer = null;
                    const cooldownTrigger = this.pendingTrigger ?? t;
                    this.pendingTrigger = null;
                    this.tryRefresh({ trigger: cooldownTrigger });
                }, delayMs);
                return;
            }
        }
        this.executeRefresh(trigger);
    }
    /**
     * Execute the refresh, tracking in-flight state.
     */
    executeRefresh(trigger) {
        if (this.disposed)
            return;
        // Record refresh start; min-interval enforcement happens in tryRefresh().
        this.lastRefreshStartMs = Date.now();
        if (this.cooldownTimer) {
            clearTimeout(this.cooldownTimer);
            this.cooldownTimer = null;
        }
        this.inFlight = true;
        this.pendingTrigger = null;
        const maybePromise = this.onRefresh();
        const onComplete = () => {
            this.inFlight = false;
            this._lastRefreshInfo = { timestamp: Date.now(), trigger };
            // Notify listener (for React state updates)
            this.onRefreshComplete?.(this._lastRefreshInfo);
            // Process any queued refresh with trailing debounce.
            // This captures the final state after activity stops while still rate-limiting
            // during constant activity (since scheduleWithDelay won't reset the timer).
            if (this.pendingBecauseInFlight) {
                this.pendingBecauseInFlight = false;
                const followupTrigger = this.pendingTrigger ?? "in-flight-followup";
                this.pendingTrigger = null;
                this.scheduleWithDelay(this.debounceMs, followupTrigger);
            }
        };
        if (maybePromise instanceof Promise) {
            void maybePromise.finally(onComplete);
        }
        else {
            onComplete();
        }
    }
    /**
     * Handle focus/visibility return. Call from visibility/focus listeners.
     */
    handleReturn(trigger) {
        if (this.disposed)
            return;
        if (typeof document !== "undefined" && document.hidden)
            return;
        // Flush pending hidden refresh
        if (this.pendingBecauseHidden) {
            this.pendingBecauseHidden = false;
            const pendingTrigger = this.pendingTrigger ?? trigger;
            this.pendingTrigger = null;
            this.tryRefresh({ trigger: pendingTrigger });
            return; // Don't double-refresh with proactive
        }
        // Proactive refresh on focus (with debounce)
        if (this.refreshOnFocus) {
            const now = Date.now();
            if (now - this.lastFocusRefreshMs >= this.focusDebounceMs) {
                this.lastFocusRefreshMs = now;
                this.tryRefresh({ trigger });
            }
        }
    }
    /**
     * Notify that a pause condition has cleared (e.g., user stopped interacting).
     * Flushes any pending refresh that was deferred due to isPaused().
     */
    notifyUnpaused() {
        if (this.disposed)
            return;
        if (this.pendingBecausePaused) {
            this.pendingBecausePaused = false;
            const pendingTrigger = this.pendingTrigger ?? "unpaused";
            this.pendingTrigger = null;
            this.tryRefresh({ trigger: pendingTrigger });
        }
    }
    /**
     * Bind focus/visibility listeners. Call once after construction.
     * Safe to call in non-browser environments (no-op).
     */
    bindListeners() {
        if (this.listenersBound)
            return;
        if (typeof document === "undefined" || typeof window === "undefined")
            return;
        this.listenersBound = true;
        this.boundHandleVisibility = () => {
            if (document.visibilityState === "visible") {
                this.handleReturn("visibility");
            }
        };
        this.boundHandleFocus = () => {
            this.handleReturn("focus");
        };
        document.addEventListener("visibilitychange", this.boundHandleVisibility);
        window.addEventListener("focus", this.boundHandleFocus);
    }
    /**
     * Whether a refresh is currently in-flight.
     */
    get isRefreshing() {
        return this.inFlight;
    }
    /**
     * Whether manual refresh is currently blocked (e.g., user composing review note).
     * UI can use this to disable the refresh button.
     */
    get isManualBlocked() {
        return this.isManualBlockedFn?.() ?? false;
    }
    /**
     * Info about the last completed refresh (timestamp and trigger reason).
     * Useful for debugging refresh behavior.
     */
    get lastRefreshInfo() {
        return this._lastRefreshInfo;
    }
    /**
     * Clean up timers and listeners.
     */
    dispose() {
        this.disposed = true;
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }
        if (this.cooldownTimer) {
            clearTimeout(this.cooldownTimer);
            this.cooldownTimer = null;
        }
        if (this.listenersBound) {
            if (this.boundHandleVisibility) {
                document.removeEventListener("visibilitychange", this.boundHandleVisibility);
            }
            if (this.boundHandleFocus) {
                window.removeEventListener("focus", this.boundHandleFocus);
            }
            this.listenersBound = false;
        }
    }
}
//# sourceMappingURL=RefreshController.js.map