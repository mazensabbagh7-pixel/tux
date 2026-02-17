import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { GlobalWindow } from "happy-dom";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import React from "react";
import { ThinkingProvider } from "./ThinkingContext";
import { useThinkingLevel } from "@/browser/hooks/useThinkingLevel";
import { getModelKey, getProjectScopeId, getThinkingLevelByModelKey, getThinkingLevelKey, } from "@/common/constants/storage";
const currentClientMock = {};
void mock.module("@/browser/contexts/API", () => ({
    useAPI: () => ({
        api: currentClientMock,
        status: "connected",
        error: null,
    }),
    APIProvider: ({ children }) => children,
}));
import { updatePersistedState } from "@/browser/hooks/usePersistedState";
// Setup basic DOM environment for testing-library
const dom = new GlobalWindow();
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access */
global.window = dom.window;
global.document = dom.window.document;
global.location = new URL("https://example.com/");
// Ensure globals exist for instanceof checks inside usePersistedState
globalThis.StorageEvent = dom.window.StorageEvent;
globalThis.CustomEvent = dom.window.CustomEvent;
global.console = console;
const TestComponent = (props) => {
    const [thinkingLevel] = useThinkingLevel();
    return (_jsxs("div", { "data-testid": "thinking", children: [thinkingLevel, ":", props.workspaceId] }));
};
describe("ThinkingContext", () => {
    // Make getDefaultModel deterministic.
    // (getDefaultModel reads from the global "model-default" localStorage key.)
    beforeEach(() => {
        window.localStorage.clear();
        window.localStorage.setItem("model-default", JSON.stringify("openai:default"));
    });
    afterEach(() => {
        cleanup();
    });
    test("switching models does not remount children", async () => {
        const workspaceId = "ws-1";
        updatePersistedState(getModelKey(workspaceId), "openai:gpt-5.2");
        updatePersistedState(getThinkingLevelKey(workspaceId), "high");
        let unmounts = 0;
        const Child = () => {
            React.useEffect(() => {
                return () => {
                    unmounts += 1;
                };
            }, []);
            const [thinkingLevel] = useThinkingLevel();
            return _jsx("div", { "data-testid": "child", children: thinkingLevel });
        };
        const view = render(_jsx(ThinkingProvider, { workspaceId: workspaceId, children: _jsx(Child, {}) }));
        await waitFor(() => {
            expect(view.getByTestId("child").textContent).toBe("high");
        });
        act(() => {
            updatePersistedState(getModelKey(workspaceId), "anthropic:claude-3.5");
        });
        // Thinking is workspace-scoped (not per-model), so switching models should not change it.
        await waitFor(() => {
            expect(view.getByTestId("child").textContent).toBe("high");
        });
        expect(unmounts).toBe(0);
    });
    test("migrates legacy per-model thinking to the workspace-scoped key", async () => {
        const workspaceId = "ws-1";
        updatePersistedState(getModelKey(workspaceId), "openai:gpt-5.2");
        updatePersistedState(getThinkingLevelByModelKey("openai:gpt-5.2"), "low");
        const view = render(_jsx(ThinkingProvider, { workspaceId: workspaceId, children: _jsx(TestComponent, { workspaceId: workspaceId }) }));
        await waitFor(() => {
            expect(view.getByTestId("thinking").textContent).toBe("low:ws-1");
        });
        // Migration should have populated the new workspace-scoped key.
        const persisted = window.localStorage.getItem(getThinkingLevelKey(workspaceId));
        expect(persisted).toBeTruthy();
        expect(JSON.parse(persisted)).toBe("low");
        // Switching models should not change the workspace-scoped value.
        act(() => {
            updatePersistedState(getModelKey(workspaceId), "anthropic:claude-3.5");
        });
        await waitFor(() => {
            expect(view.getByTestId("thinking").textContent).toBe("low:ws-1");
        });
    });
    test("cycles thinking level via keybind in project-scoped (creation) flow", async () => {
        const projectPath = "/Users/dev/my-project";
        // Force a model with a multi-level thinking policy.
        updatePersistedState(getModelKey(getProjectScopeId(projectPath)), "openai:gpt-4.1");
        const ProjectChild = () => {
            const [thinkingLevel] = useThinkingLevel();
            return _jsx("div", { "data-testid": "thinking-project", children: thinkingLevel });
        };
        const view = render(_jsx(ThinkingProvider, { projectPath: projectPath, children: _jsx(ProjectChild, {}) }));
        await waitFor(() => {
            expect(view.getByTestId("thinking-project").textContent).toBe("off");
        });
        act(() => {
            window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "T", ctrlKey: true, shiftKey: true }));
        });
        await waitFor(() => {
            expect(view.getByTestId("thinking-project").textContent).toBe("low");
        });
    });
});
//# sourceMappingURL=ThinkingContext.test.js.map