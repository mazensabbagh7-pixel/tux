import { jsx as _jsx } from "react/jsx-runtime";
import { useRef } from "react";
import { AppLoader } from "../components/AppLoader";
import { SELECTED_WORKSPACE_KEY, UI_THEME_KEY } from "@/common/constants/storage";
// ═══════════════════════════════════════════════════════════════════════════════
// META CONFIG
// ═══════════════════════════════════════════════════════════════════════════════
export const appMeta = {
    title: "App",
    component: AppLoader,
    parameters: {
        layout: "fullscreen",
        backgrounds: {
            default: "dark",
            values: [
                { name: "dark", value: "#1e1e1e" },
                { name: "light", value: "#f5f6f8" },
            ],
        },
        chromatic: { delay: 500 },
    },
};
/** Wrapper that runs setup once and passes the client to AppLoader */
function resetStorybookPersistedStateForStory() {
    // Storybook/Chromatic can preserve localStorage across story captures.
    // Reset persisted state so each story starts from a known route + theme.
    if (typeof localStorage !== "undefined") {
        localStorage.removeItem(SELECTED_WORKSPACE_KEY);
        localStorage.setItem(UI_THEME_KEY, JSON.stringify("dark"));
    }
}
function getStorybookStoryId() {
    if (typeof window === "undefined") {
        return null;
    }
    const params = new URLSearchParams(window.location.search);
    return params.get("id") ?? params.get("path");
}
export const AppWithMocks = ({ setup }) => {
    const lastStoryIdRef = useRef(null);
    const clientRef = useRef(null);
    const storyId = getStorybookStoryId();
    const shouldReset = clientRef.current === null || lastStoryIdRef.current !== storyId;
    if (shouldReset) {
        resetStorybookPersistedStateForStory();
        lastStoryIdRef.current = storyId;
        clientRef.current = null;
    }
    clientRef.current ?? (clientRef.current = setup());
    // Key by storyId to force full remount between stories.
    // Without this, RouterProvider keeps its initial route and APIProvider
    // doesn't re-initialize, causing flaky "loading page vs left screen" states.
    return _jsx(AppLoader, { client: clientRef.current }, storyId);
};
//# sourceMappingURL=meta.js.map