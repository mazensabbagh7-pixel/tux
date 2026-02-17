import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useContext, useEffect, useState } from "react";
import { useAPI } from "@/browser/contexts/API";
function isStorybook() {
    if (typeof window === "undefined") {
        return false;
    }
    // Storybook preview iframe is usually /iframe.html, but test-runner debug URLs
    // (and sometimes the manager itself) use ?path=/story/... .
    if (window.location.pathname.endsWith("iframe.html")) {
        return true;
    }
    const params = new URLSearchParams(window.location.search);
    const path = params.get("path");
    if (path?.startsWith("/story/")) {
        return true;
    }
    // Some configurations pass story identity via ?id=...
    if (params.has("id")) {
        return true;
    }
    return false;
}
const FeatureFlagsContext = createContext(null);
export function useFeatureFlags() {
    const ctx = useContext(FeatureFlagsContext);
    if (!ctx)
        throw new Error("useFeatureFlags must be used within FeatureFlagsProvider");
    return ctx;
}
export function FeatureFlagsProvider(props) {
    const { api } = useAPI();
    const [statsTabState, setStatsTabState] = useState(() => {
        if (isStorybook()) {
            return { enabled: true };
        }
        return null;
    });
    const refreshStatsTabState = async () => {
        if (!api) {
            setStatsTabState({ enabled: false });
            return;
        }
        const state = await api.features.getStatsTabState();
        setStatsTabState({ enabled: state.enabled });
    };
    const setStatsTabEnabled = async (enabled) => {
        if (!api) {
            throw new Error("ORPC client not initialized");
        }
        const state = await api.features.setStatsTabOverride({
            // Default-on feature: "enabled" means clearing any local override.
            override: enabled ? "default" : "off",
        });
        setStatsTabState({ enabled: state.enabled });
    };
    useEffect(() => {
        if (isStorybook()) {
            return;
        }
        (async () => {
            try {
                if (!api) {
                    setStatsTabState({ enabled: false });
                    return;
                }
                const state = await api.features.getStatsTabState();
                setStatsTabState({ enabled: state.enabled });
            }
            catch {
                // Treat as disabled if we can't fetch.
                setStatsTabState({ enabled: false });
            }
        })();
    }, [api]);
    return (_jsx(FeatureFlagsContext.Provider, { value: { statsTabState, refreshStatsTabState, setStatsTabEnabled }, children: props.children }));
}
//# sourceMappingURL=FeatureFlagsContext.js.map