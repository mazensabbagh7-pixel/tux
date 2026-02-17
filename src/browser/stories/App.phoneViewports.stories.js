import { jsx as _jsx } from "react/jsx-runtime";
/**
 * Phone viewport stories - catch responsive/layout regressions.
 *
 * These are full-app stories rendered inside fixed iPhone-sized containers, and
 * Chromatic is configured to snapshot both light and dark themes.
 */
import { appMeta, AppWithMocks } from "./meta.js";
import { createAssistantMessage, createUserMessage, STABLE_TIMESTAMP } from "./mockFactory";
import { setupSimpleChatStory } from "./storyHelpers";
import { blurActiveElement, waitForChatInputAutofocusDone, waitForScrollStabilization, } from "./storyPlayHelpers.js";
const IPHONE_16E = {
    // Source: https://ios-resolution.info/ (logical resolution)
    width: 390,
    height: 844,
};
// NOTE: Mux's mobile UI tweaks are gated on `@media (max-width: 768px) and (pointer: coarse)`.
// Chromatic can emulate touch via `hasTouch: true` in modes, which ensures the
// right sidebar is hidden and the mobile header/sidebar affordances are visible.
const IPHONE_17_PRO_MAX = {
    // Source: https://ios-resolution.info/ (logical resolution)
    width: 440,
    height: 956,
};
function IPhone16eDecorator(Story) {
    return (_jsx("div", { style: { width: IPHONE_16E.width, height: IPHONE_16E.height, overflow: "hidden" }, children: _jsx(Story, {}) }));
}
function IPhone17ProMaxDecorator(Story) {
    return (_jsx("div", { style: {
            width: IPHONE_17_PRO_MAX.width,
            height: IPHONE_17_PRO_MAX.height,
            overflow: "hidden",
        }, children: _jsx(Story, {}) }));
}
const MESSAGES = [
    createUserMessage("msg-1", "Smoke-test the UI at phone widths (sidebar, chat, overflow wrapping).", { historySequence: 1, timestamp: STABLE_TIMESTAMP - 120000 }),
    createAssistantMessage("msg-2", "Done. Pay extra attention to long paths like `src/browser/components/WorkspaceSidebar/WorkspaceSidebar.tsx` and whether they wrap without horizontal scrolling.", { historySequence: 2, timestamp: STABLE_TIMESTAMP - 110000 }),
    createUserMessage("msg-3", "Also check that buttons are still clickable and text isn’t clipped in light mode.", { historySequence: 3, timestamp: STABLE_TIMESTAMP - 100000 }),
];
export default {
    ...appMeta,
    title: "App/PhoneViewports",
};
async function stabilizePhoneViewportStory(canvasElement) {
    const storyRoot = document.getElementById("storybook-root") ?? canvasElement;
    await waitForChatInputAutofocusDone(storyRoot);
    await waitForScrollStabilization(storyRoot);
    blurActiveElement();
}
export const IPhone16e = {
    render: () => (_jsx(AppWithMocks, { setup: () => setupSimpleChatStory({
            workspaceId: "ws-iphone-16e",
            workspaceName: "mobile",
            projectName: "mux",
            messages: [...MESSAGES],
        }) })),
    decorators: [IPhone16eDecorator],
    parameters: {
        ...appMeta.parameters,
        chromatic: {
            ...(appMeta.parameters?.chromatic ?? {}),
            cropToViewport: true,
            modes: {
                dark: { theme: "dark", viewport: IPHONE_16E, hasTouch: true },
                light: { theme: "light", viewport: IPHONE_16E, hasTouch: true },
            },
        },
    },
    play: async ({ canvasElement }) => {
        await stabilizePhoneViewportStory(canvasElement);
    },
};
export const IPhone17ProMax = {
    render: () => (_jsx(AppWithMocks, { setup: () => setupSimpleChatStory({
            workspaceId: "ws-iphone-17-pro-max",
            workspaceName: "mobile",
            projectName: "mux",
            messages: [...MESSAGES],
        }) })),
    decorators: [IPhone17ProMaxDecorator],
    parameters: {
        ...appMeta.parameters,
        chromatic: {
            ...(appMeta.parameters?.chromatic ?? {}),
            cropToViewport: true,
            modes: {
                dark: { theme: "dark", viewport: IPHONE_17_PRO_MAX, hasTouch: true },
                light: { theme: "light", viewport: IPHONE_17_PRO_MAX, hasTouch: true },
            },
        },
    },
    play: async ({ canvasElement }) => {
        await stabilizePhoneViewportStory(canvasElement);
    },
};
//# sourceMappingURL=App.phoneViewports.stories.js.map