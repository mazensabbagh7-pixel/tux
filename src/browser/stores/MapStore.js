/**
 * Integrated versioned cache store with reactive subscriptions.
 *
 * Combines versioning, lazy caching, and change notifications into one tool:
 * - Version-based cache keys ensure automatic invalidation
 * - Lazy computation via get(key, compute) for derived state
 * - Global and per-key subscriptions for selective re-renders
 * - Explicit change signaling via bump() - no hidden equality checks
 *
 * Used by WorkspaceStore and GitStatusStore for state management.
 *
 * Design:
 * - bump(key) increments version and notifies subscribers
 * - get(key, compute) returns cached value for current version
 * - Cache keys are "{key}:{version}" for automatic invalidation
 * - Old cache entries naturally garbage collected as versions advance
 */
export class MapStore {
    constructor() {
        this.versions = new Map();
        this.cache = new Map();
        this.global = new Set();
        this.perKey = new Map();
        // DEV-mode guard: track render depth to catch bump() during render
        this.renderDepth = 0;
        /**
         * Subscribe to any change (global).
         * Cheap with useSyncExternalStore due to snapshot comparison.
         */
        this.subscribeAny = (l) => {
            this.global.add(l);
            return () => this.global.delete(l);
        };
    }
    /**
     * Get value for a key with lazy computation.
     * Computation only runs if:
     * - Version changed since last get() for this key
     * - Value was never computed for this version
     *
     * Returns cached value for current version.
     *
     * IMPORTANT: This is a pure getter - no side effects.
     * Does not modify versions map (only bump() does that).
     * Safe to call during React render.
     */
    get(key, compute) {
        // DEV-mode: Track render depth to detect bump() during render
        // eslint-disable-next-line no-restricted-globals, no-restricted-syntax
        if (process.env.NODE_ENV !== "production") {
            this.renderDepth++;
            try {
                return this.getImpl(key, compute);
            }
            finally {
                this.renderDepth--;
            }
        }
        return this.getImpl(key, compute);
    }
    getImpl(key, compute) {
        const version = this.versions.get(key) ?? 0;
        const cacheKey = this.makeCacheKey(key, version);
        if (!this.cache.has(cacheKey)) {
            this.cache.set(cacheKey, compute());
        }
        return this.cache.get(cacheKey);
    }
    /**
     * Check if key has been bumped (has versioned state).
     * Returns false for keys that were only get() without bump().
     */
    has(key) {
        return this.versions.has(key);
    }
    /**
     * Bump version for a key, invalidating cache and notifying subscribers.
     *
     * ⚠️ **IMPORTANT**: Only call outside React render phase!
     *
     * Safe contexts:
     * - IPC message handlers (queueMicrotask ensures async)
     * - setTimeout/setInterval callbacks
     * - User event handlers (onClick, etc.)
     *
     * Unsafe contexts:
     * - Constructor
     * - Component render
     * - useEffect/useLayoutEffect (during setup phase)
     * - Synchronous initialization code
     *
     * Why? bump() triggers subscriptions, which can cause React to detect
     * nested state updates and throw "Maximum update depth exceeded".
     *
     * @example
     * ```typescript
     * // ❌ BAD - During initialization
     * addWorkspace(id: string) {
     *   this.aggregators.set(id, new Aggregator());
     *   this.states.bump(id);  // INFINITE LOOP!
     * }
     *
     * // ✅ GOOD - In IPC handler
     * handleMessage(id: string, data: Message) {
     *   this.aggregator.get(id).addMessage(data);
     *   this.states.bump(id);  // Safe - async context
     * }
     * ```
     */
    bump(key) {
        // DEV-mode guard: detect bump() during render
        // eslint-disable-next-line no-restricted-globals, no-restricted-syntax
        if (process.env.NODE_ENV !== "production" && this.renderDepth > 0) {
            const error = new Error(`[MapStore] bump() called during render! This will cause infinite loops.\n` +
                `Key: ${String(key)}\n` +
                `This usually means you're calling bump() in a constructor, useEffect, or other ` +
                `synchronous initialization code. Move bump() calls to async contexts like IPC handlers.`);
            console.error(error);
            throw error;
        }
        const current = this.versions.get(key) ?? 0;
        this.versions.set(key, current + 1);
        // Notify subscribers
        for (const l of this.global)
            l();
        const ks = this.perKey.get(key);
        if (ks) {
            for (const l of ks)
                l();
        }
    }
    /**
     * Delete a key (clears version and all cached values).
     */
    delete(key) {
        if (!this.versions.has(key))
            return;
        // Clear all cached values for this key
        const keyStr = String(key);
        for (const cacheKey of Array.from(this.cache.keys())) {
            if (cacheKey.startsWith(`${keyStr}:`)) {
                this.cache.delete(cacheKey);
            }
        }
        this.versions.delete(key);
        // Notify
        for (const l of this.global)
            l();
        const ks = this.perKey.get(key);
        if (ks) {
            for (const l of ks)
                l();
        }
    }
    /**
     * Clear all data.
     */
    clear() {
        this.versions.clear();
        this.cache.clear();
        for (const l of this.global)
            l();
    }
    /**
     * Subscribe to changes for a specific key (precise).
     * Saves snapshot calls - only notified when this key changes.
     */
    subscribeKey(key, l) {
        let set = this.perKey.get(key);
        if (!set)
            this.perKey.set(key, (set = new Set()));
        set.add(l);
        return () => {
            set.delete(l);
            if (!set.size)
                this.perKey.delete(key);
        };
    }
    /**
     * Check if there are subscribers for a specific key.
     */
    hasKeySubscribers(key) {
        return this.perKey.has(key);
    }
    makeCacheKey(key, version) {
        return `${String(key)}:${version}`;
    }
}
//# sourceMappingURL=MapStore.js.map