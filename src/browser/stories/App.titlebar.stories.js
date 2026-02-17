import { jsx as _jsx } from "react/jsx-runtime";
/**
 * Title bar stories - demonstrates title bar layout variants
 */
import React from "react";
import { appMeta, AppWithMocks } from "./meta.js";
import { createMockORPCClient } from "@/browser/stories/mocks/orpc";
export default {
    ...appMeta,
    title: "App/TitleBar",
};
/**
 * macOS desktop mode with traffic lights inset.
 * Logo is stacked above version to fit in constrained space.
 */
export const MacOSDesktop = {
    decorators: [
        (Story) => {
            // Save and restore window.api to prevent leaking to other stories
            const originalApiRef = React.useRef(window.api);
            window.api = {
                platform: "darwin",
                versions: {
                    node: "20.0.0",
                    chrome: "120.0.0",
                    electron: "28.0.0",
                },
                // This function's presence triggers isDesktopMode() → true
                getIsRosetta: () => Promise.resolve(false),
            };
            // Cleanup on unmount
            React.useEffect(() => {
                const savedApi = originalApiRef.current;
                return () => {
                    window.api = savedApi;
                };
            }, []);
            return _jsx(Story, {});
        },
    ],
    render: () => (_jsx(AppWithMocks, { setup: () => createMockORPCClient({
            projects: new Map(),
            workspaces: [],
        }) })),
};
//# sourceMappingURL=App.titlebar.stories.js.map