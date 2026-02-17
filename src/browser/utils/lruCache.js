/**
 * Generic LRU cache backed by localStorage.
 *
 * Uses per-entry storage keys for efficient single-entry updates,
 * and a separate index array for LRU eviction tracking.
 *
 * Pattern extracted from fileContentCache.ts and sharedUrlCache.ts.
 */
import { readPersistedState, updatePersistedState } from "@/browser/hooks/usePersistedState";
/**
 * Create an LRU cache backed by localStorage.
 *
 * @example
 * ```ts
 * const cache = createLRUCache<{ name: string }>({
 *   entryPrefix: "user:",
 *   indexKey: "userIndex",
 *   maxEntries: 100,
 *   ttlMs: 60 * 60 * 1000, // 1 hour
 * });
 *
 * cache.set("123", { name: "Alice" });
 * const user = cache.get("123"); // { name: "Alice" }
 * ```
 */
export function createLRUCache(options) {
    const { entryPrefix, indexKey, maxEntries = 50, ttlMs } = options;
    function fullKey(key) {
        return `${entryPrefix}${key}`;
    }
    function getEntry(key) {
        const entry = readPersistedState(fullKey(key), null);
        if (!entry)
            return null;
        // Check TTL if configured
        if (ttlMs && Date.now() - entry.cachedAt > ttlMs) {
            remove(key);
            return null;
        }
        return entry;
    }
    function get(key) {
        return getEntry(key)?.data ?? null;
    }
    function set(key, data) {
        const fk = fullKey(key);
        const entry = { data, cachedAt: Date.now() };
        updatePersistedState(fk, () => entry, null);
        // Update LRU index
        updatePersistedState(indexKey, (prev) => {
            // Remove existing occurrence and add to end (most recent)
            const filtered = prev.filter((k) => k !== fk);
            filtered.push(fk);
            // Evict oldest entries if over limit
            if (filtered.length > maxEntries) {
                const toRemove = filtered.splice(0, filtered.length - maxEntries);
                for (const oldKey of toRemove) {
                    updatePersistedState(oldKey, () => null, null);
                }
            }
            return filtered;
        }, []);
    }
    function update(key, updater) {
        const entry = getEntry(key);
        if (!entry)
            return false;
        const fk = fullKey(key);
        const updated = { data: updater(entry.data), cachedAt: entry.cachedAt };
        updatePersistedState(fk, () => updated, null);
        return true;
    }
    function remove(key) {
        const fk = fullKey(key);
        updatePersistedState(fk, () => null, null);
        updatePersistedState(indexKey, (prev) => prev.filter((k) => k !== fk), []);
    }
    return { get, getEntry, set, update, remove };
}
//# sourceMappingURL=lruCache.js.map