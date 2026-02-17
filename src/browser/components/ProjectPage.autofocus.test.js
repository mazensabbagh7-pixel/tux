import { jsx as _jsx } from "react/jsx-runtime";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { GlobalWindow } from "happy-dom";
import { RouterProvider } from "@/browser/contexts/RouterContext";
import { SettingsProvider } from "@/browser/contexts/SettingsContext";
import { cleanup, render, waitFor } from "@testing-library/react";
let focusMock = null;
let readyCalls = 0;
void mock.module("@/browser/contexts/API", () => ({
    useAPI: () => ({
        api: null,
        status: "connecting",
        error: null,
        authenticate: () => undefined,
        retry: () => undefined,
    }),
}));
// Mock useProvidersConfig to return a configured provider so ChatInput renders
void mock.module("@/browser/hooks/useProvidersConfig", () => ({
    useProvidersConfig: () => ({
        config: { anthropic: { apiKeySet: true, isEnabled: true, isConfigured: true } },
        loading: false,
        error: null,
    }),
}));
// Mock ConfiguredProvidersBar to avoid tooltip/context dependencies
void mock.module("./ConfiguredProvidersBar", () => ({
    ConfiguredProvidersBar: () => _jsx("div", { "data-testid": "ConfiguredProvidersBarMock" }),
}));
// Mock ChatInput to simulate the old (buggy) behavior where onReady can fire again
// on unrelated re-renders (e.g. workspace list updates).
void mock.module("./ChatInput/index", () => ({
    ChatInput: (props) => {
        useEffect(() => {
            readyCalls += 1;
            props.onReady?.({
                focus: () => {
                    if (!focusMock) {
                        throw new Error("focusMock not initialized");
                    }
                    focusMock();
                },
                restoreText: () => undefined,
                restoreDraft: () => undefined,
                appendText: () => undefined,
                prependText: () => undefined,
            });
        }, [props]);
        return _jsx("div", { "data-testid": "ChatInputMock" });
    },
}));
import { ProjectPage } from "./ProjectPage";
describe("ProjectPage", () => {
    beforeEach(() => {
        const dom = new GlobalWindow();
        globalThis.window = dom;
        globalThis.document = globalThis.window.document;
        readyCalls = 0;
        focusMock = mock(() => undefined);
    });
    afterEach(() => {
        cleanup();
        focusMock = null;
        globalThis.window = undefined;
        globalThis.document = undefined;
    });
    test("auto-focuses the creation input only once even if ChatInput re-initializes", async () => {
        const baseProps = {
            projectPath: "/projects/demo",
            projectName: "demo",
            leftSidebarCollapsed: true,
            onToggleLeftSidebarCollapsed: () => undefined,
            onWorkspaceCreated: () => undefined,
        };
        const { rerender } = render(_jsx(RouterProvider, { children: _jsx(SettingsProvider, { children: _jsx(ProjectPage, { ...baseProps }) }) }));
        await waitFor(() => expect(readyCalls).toBe(1));
        await waitFor(() => expect(focusMock).toHaveBeenCalledTimes(1));
        // Simulate an unrelated App re-render that changes an inline callback identity.
        rerender(_jsx(RouterProvider, { children: _jsx(SettingsProvider, { children: _jsx(ProjectPage, { ...baseProps, onWorkspaceCreated: () => undefined }) }) }));
        await waitFor(() => expect(readyCalls).toBe(2));
        // Focus should not be re-triggered (would move caret to end).
        expect(focusMock).toHaveBeenCalledTimes(1);
    });
});
//# sourceMappingURL=ProjectPage.autofocus.test.js.map