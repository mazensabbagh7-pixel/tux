import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React from "react";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { GlobalWindow } from "happy-dom";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { AgentProvider } from "@/browser/contexts/AgentContext";
import { TooltipProvider } from "@/browser/components/ui/tooltip";
import { AgentModePicker } from "./AgentModePicker";
const BUILT_INS = [
    {
        id: "exec",
        scope: "built-in",
        name: "Exec",
        uiSelectable: true,
        subagentRunnable: false,
    },
    {
        id: "plan",
        scope: "built-in",
        name: "Plan",
        uiSelectable: true,
        subagentRunnable: false,
        base: "plan",
    },
];
const HIDDEN_AGENT = {
    id: "explore",
    scope: "built-in",
    name: "Explore",
    uiSelectable: false,
    subagentRunnable: true,
    base: "exec",
};
const CUSTOM_AGENT = {
    id: "review",
    scope: "project",
    name: "Review",
    description: "Review changes",
    uiSelectable: true,
    subagentRunnable: false,
};
// Default context value properties shared by all test harnesses
const noop = () => {
    // intentional noop for tests
};
const defaultContextProps = {
    currentAgent: undefined,
    disableWorkspaceAgents: false,
    setDisableWorkspaceAgents: noop,
};
describe("AgentModePicker", () => {
    beforeEach(() => {
        globalThis.window = new GlobalWindow();
        globalThis.document = globalThis.window.document;
        globalThis.window.localStorage.clear();
    });
    afterEach(() => {
        cleanup();
        globalThis.window = undefined;
        globalThis.document = undefined;
    });
    test("renders a stable label for explore before agent definitions load", () => {
        function Harness() {
            const [agentId, setAgentId] = React.useState("explore");
            return (_jsx(AgentProvider, { value: {
                    agentId,
                    setAgentId,
                    agents: [],
                    loaded: false,
                    loadFailed: false,
                    refresh: () => Promise.resolve(),
                    refreshing: false,
                    ...defaultContextProps,
                }, children: _jsx(TooltipProvider, { children: _jsx(AgentModePicker, {}) }) }));
        }
        const { getByText } = render(_jsx(Harness, {}));
        // Regression: avoid "explore" -> "Explore" flicker while agents load.
        expect(getByText("Explore")).toBeTruthy();
    });
    // TODO: Fix flaky test - keyboard events don't reliably trigger state changes in happy-dom
    test.skip("Escape closes the picker without changing selection", async () => {
        function Harness() {
            const [agentId, setAgentId] = React.useState("plan");
            return (_jsx(AgentProvider, { value: {
                    agentId,
                    setAgentId,
                    agents: [...BUILT_INS, CUSTOM_AGENT],
                    loaded: true,
                    loadFailed: false,
                    refresh: () => Promise.resolve(),
                    refreshing: false,
                    ...defaultContextProps,
                }, children: _jsx(TooltipProvider, { children: _jsxs("div", { children: [_jsx("div", { "data-testid": "agentId", children: agentId }), _jsx(AgentModePicker, {})] }) }) }));
        }
        const { getByPlaceholderText, getByTestId, getByLabelText, queryByPlaceholderText } = render(_jsx(Harness, {}));
        // Open the picker via click (more reliable than custom event in tests)
        fireEvent.click(getByLabelText("Select agent"));
        await waitFor(() => {
            expect(getByPlaceholderText("Search agents…")).toBeTruthy();
        });
        fireEvent.keyDown(getByPlaceholderText("Search agents…"), { key: "Escape" });
        // Escape should close the picker without changing the agent
        await waitFor(() => {
            expect(queryByPlaceholderText("Search agents…")).toBeNull();
        }, { timeout: 1000 });
        expect(getByTestId("agentId").textContent).toBe("plan");
    });
    // TODO: Fix flaky test - ArrowUp behavior depends on highlight state timing
    test.skip("ArrowUp closes the picker without selecting an agent", async () => {
        function Harness() {
            const [agentId, setAgentId] = React.useState("exec");
            return (_jsx(AgentProvider, { value: {
                    agentId,
                    setAgentId,
                    agents: [...BUILT_INS, CUSTOM_AGENT],
                    loaded: true,
                    loadFailed: false,
                    refresh: () => Promise.resolve(),
                    refreshing: false,
                    ...defaultContextProps,
                }, children: _jsx(TooltipProvider, { children: _jsxs("div", { children: [_jsx("div", { "data-testid": "agentId", children: agentId }), _jsx(AgentModePicker, {})] }) }) }));
        }
        const { getByPlaceholderText, getByTestId, getByLabelText, queryByPlaceholderText } = render(_jsx(Harness, {}));
        // Open the dropdown via the trigger button
        fireEvent.click(getByLabelText("Select agent"));
        await waitFor(() => {
            expect(getByPlaceholderText("Search agents…")).toBeTruthy();
        });
        fireEvent.keyDown(getByPlaceholderText("Search agents…"), { key: "ArrowUp" });
        await waitFor(() => {
            expect(queryByPlaceholderText("Search agents…")).toBeNull();
        });
        expect(getByTestId("agentId").textContent).toBe("exec");
    });
    test("shows a non-selectable active agent in the dropdown trigger", async () => {
        function Harness() {
            const [agentId, setAgentId] = React.useState("explore");
            return (_jsx(AgentProvider, { value: {
                    agentId,
                    setAgentId,
                    agents: [...BUILT_INS, HIDDEN_AGENT, CUSTOM_AGENT],
                    loaded: true,
                    loadFailed: false,
                    refresh: () => Promise.resolve(),
                    refreshing: false,
                    ...defaultContextProps,
                }, children: _jsx(TooltipProvider, { children: _jsxs("div", { children: [_jsx("div", { "data-testid": "agentId", children: agentId }), _jsx(AgentModePicker, {})] }) }) }));
        }
        const { getAllByText, getByLabelText, getByPlaceholderText } = render(_jsx(Harness, {}));
        // The trigger button should show the current agent name "Explore"
        const triggerButton = getByLabelText("Select agent");
        expect(triggerButton.textContent).toContain("Explore");
        // Open dropdown
        fireEvent.click(triggerButton);
        await waitFor(() => {
            expect(getByPlaceholderText("Search agents…")).toBeTruthy();
        });
        // Explore should not appear as a selectable option in the dropdown (only in trigger).
        // The text "Explore" appears once in trigger, so if dropdown opened it should still be just one.
        expect(getAllByText("Explore").length).toBe(1);
    });
    test("selects a custom agent from the dropdown", async () => {
        function Harness() {
            const [agentId, setAgentId] = React.useState("exec");
            return (_jsx(AgentProvider, { value: {
                    agentId,
                    setAgentId,
                    agents: [...BUILT_INS, CUSTOM_AGENT],
                    loaded: true,
                    loadFailed: false,
                    refresh: () => Promise.resolve(),
                    refreshing: false,
                    ...defaultContextProps,
                }, children: _jsx(TooltipProvider, { children: _jsxs("div", { children: [_jsx("div", { "data-testid": "agentId", children: agentId }), _jsx(AgentModePicker, {})] }) }) }));
        }
        const { getByPlaceholderText, getByTestId, getByText, getByLabelText } = render(_jsx(Harness, {}));
        // Open picker via dropdown trigger
        fireEvent.click(getByLabelText("Select agent"));
        await waitFor(() => {
            expect(getByPlaceholderText("Search agents…")).toBeTruthy();
        });
        // Pick the custom agent
        fireEvent.click(getByText("Review"));
        await waitFor(() => {
            expect(getByTestId("agentId").textContent).toBe("review");
        });
    });
});
//# sourceMappingURL=AgentModePicker.test.js.map