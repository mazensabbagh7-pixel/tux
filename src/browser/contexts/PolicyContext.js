import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useAPI } from "@/browser/contexts/API";
const PolicyContext = createContext(null);
// User request: keep churn guard while still surfacing updated policy reasons.
const getPolicySignature = (response) => JSON.stringify({ status: response.status, policy: response.policy });
export function PolicyProvider(props) {
    const apiState = useAPI();
    const api = apiState.api;
    const [response, setResponse] = useState(null);
    const [loading, setLoading] = useState(true);
    const refresh = useCallback(async () => {
        if (!api) {
            setResponse(null);
            setLoading(false);
            return;
        }
        try {
            const next = await api.policy.get();
            // User request: avoid churn from identical payloads while letting reason updates through.
            setResponse((prev) => {
                if (!prev) {
                    return next;
                }
                if (getPolicySignature(prev) === getPolicySignature(next)) {
                    return prev;
                }
                return next;
            });
        }
        catch {
            setResponse((prev) => (prev ? null : prev));
        }
        finally {
            setLoading(false);
        }
    }, [api]);
    useEffect(() => {
        if (!api) {
            setResponse(null);
            setLoading(false);
            return;
        }
        const abortController = new AbortController();
        const signal = abortController.signal;
        void refresh();
        (async () => {
            try {
                const iterator = await api.policy.onChanged(undefined, { signal });
                for await (const _ of iterator) {
                    if (signal.aborted) {
                        break;
                    }
                    void refresh();
                }
            }
            catch {
                // Expected on unmount.
            }
        })();
        return () => abortController.abort();
    }, [api, refresh]);
    const source = response?.source ?? "none";
    const status = response?.status ?? { state: "disabled" };
    const policy = response?.policy ?? null;
    return (_jsx(PolicyContext.Provider, { value: { source, status, policy, loading, refresh }, children: props.children }));
}
export function usePolicy() {
    const ctx = useContext(PolicyContext);
    if (!ctx) {
        throw new Error("usePolicy must be used within a PolicyProvider");
    }
    return ctx;
}
//# sourceMappingURL=PolicyContext.js.map