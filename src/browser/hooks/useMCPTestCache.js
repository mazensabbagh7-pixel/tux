import { useCallback, useEffect, useMemo, useState } from "react";
import { getMCPTestResultsKey } from "@/common/constants/storage";
import { readPersistedState, updatePersistedState } from "@/browser/hooks/usePersistedState";
/**
 * Hook for managing MCP server test results cache.
 * Persists results to localStorage, shared across Settings and WorkspaceMCPModal.
 */
export function useMCPTestCache(projectPath) {
    const storageKey = useMemo(() => (projectPath ? getMCPTestResultsKey(projectPath) : ""), [projectPath]);
    const [cache, setCache] = useState(() => storageKey ? readPersistedState(storageKey, {}) : {});
    // Reload cache when project changes
    useEffect(() => {
        if (storageKey) {
            setCache(readPersistedState(storageKey, {}));
        }
        else {
            setCache({});
        }
    }, [storageKey]);
    /** Update cache with a test result */
    const setResult = useCallback((name, result) => {
        const entry = { result, testedAt: Date.now() };
        setCache((prev) => {
            const next = { ...prev, [name]: entry };
            if (storageKey)
                updatePersistedState(storageKey, next);
            return next;
        });
    }, [storageKey]);
    /** Clear cached result for a server */
    const clearResult = useCallback((name) => {
        setCache((prev) => {
            const next = { ...prev };
            delete next[name];
            if (storageKey)
                updatePersistedState(storageKey, next);
            return next;
        });
    }, [storageKey]);
    /** Get tools for a server (returns null if not cached or failed) */
    const getTools = useCallback((name) => {
        const cached = cache[name];
        if (cached?.result.success) {
            return cached.result.tools;
        }
        return null;
    }, [cache]);
    /** Reload cache from storage (useful when opening modal) */
    const reload = useCallback(() => {
        if (storageKey) {
            setCache(readPersistedState(storageKey, {}));
        }
    }, [storageKey]);
    return { cache, setResult, clearResult, getTools, reload };
}
//# sourceMappingURL=useMCPTestCache.js.map