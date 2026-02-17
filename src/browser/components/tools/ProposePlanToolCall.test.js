import { jsx as _jsx } from "react/jsx-runtime";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { GlobalWindow } from "happy-dom";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { AgentProvider } from "@/browser/contexts/AgentContext";
import { updatePersistedState } from "@/browser/hooks/usePersistedState";
import { AGENT_AI_DEFAULTS_KEY, getAgentIdKey, getModelKey, getThinkingLevelKey, } from "@/common/constants/storage";
import { TooltipProvider } from "../ui/tooltip";
import { ProposePlanToolCall } from "./ProposePlanToolCall";
let mockApi = null;
let startHereCalls = [];
const useStartHereMock = mock((workspaceId, content, isCompacted, options) => {
    startHereCalls.push({ workspaceId, content, isCompacted, options });
    return {
        openModal: () => undefined,
        isStartingHere: false,
        buttonLabel: "Start Here",
        buttonEmoji: "",
        disabled: false,
        modal: null,
    };
});
void mock.module("@/browser/hooks/useStartHere", () => ({
    useStartHere: useStartHereMock,
}));
void mock.module("@/browser/contexts/API", () => ({
    useAPI: () => ({ api: mockApi, status: "connected", error: null }),
}));
void mock.module("@/browser/hooks/useOpenInEditor", () => ({
    useOpenInEditor: () => () => Promise.resolve({ success: true }),
}));
void mock.module("@/browser/contexts/WorkspaceContext", () => ({
    useWorkspaceContext: () => ({
        workspaceMetadata: new Map(),
    }),
}));
void mock.module("@/browser/contexts/TelemetryEnabledContext", () => ({
    useLinkSharingEnabled: () => true,
}));
const TEST_AGENTS = [
    {
        id: "exec",
        scope: "built-in",
        name: "Exec",
        uiSelectable: true,
        subagentRunnable: true,
        aiDefaults: {
            model: "openai:gpt-5.2",
            thinkingLevel: "low",
        },
    },
    {
        id: "plan",
        scope: "built-in",
        name: "Plan",
        uiSelectable: true,
        subagentRunnable: true,
        aiDefaults: {
            model: "anthropic:claude-sonnet-4-5",
            thinkingLevel: "high",
        },
    },
    {
        id: "orchestrator",
        scope: "built-in",
        name: "Orchestrator",
        uiSelectable: true,
        subagentRunnable: true,
        base: "exec",
        aiDefaults: {
            model: "openai:gpt-5.2-pro",
            thinkingLevel: "medium",
        },
    },
];
const noop = () => {
    // intentional noop for tests
};
function renderToolCall(content, agentId = "plan") {
    return render(_jsx(AgentProvider, { value: {
            agentId,
            setAgentId: noop,
            currentAgent: TEST_AGENTS.find((entry) => entry.id === agentId),
            agents: TEST_AGENTS,
            loaded: true,
            loadFailed: false,
            refresh: () => Promise.resolve(),
            refreshing: false,
            disableWorkspaceAgents: false,
            setDisableWorkspaceAgents: noop,
        }, children: _jsx(TooltipProvider, { children: content }) }));
}
describe("ProposePlanToolCall", () => {
    let originalWindow;
    let originalDocument;
    beforeEach(() => {
        startHereCalls = [];
        mockApi = null;
        // Save original globals
        originalWindow = globalThis.window;
        originalDocument = globalThis.document;
        // Set up test globals
        globalThis.window = new GlobalWindow();
        globalThis.document = globalThis.window.document;
    });
    afterEach(() => {
        cleanup();
        // Restore original globals instead of setting to undefined
        globalThis.window = originalWindow;
        globalThis.document = originalDocument;
    });
    test("does not claim plan is in chat when Start Here content is a placeholder", () => {
        const planPath = "~/.mux/plans/demo/ws-123.md";
        renderToolCall(_jsx(ProposePlanToolCall, { args: {}, result: {
                success: true,
                planPath,
            }, workspaceId: "ws-123", isLatest: false }));
        expect(startHereCalls.length).toBe(1);
        expect(startHereCalls[0]?.content).toContain("*Plan saved to");
        expect(startHereCalls[0]?.content).not.toContain("Note: This chat already contains the full plan");
        expect(startHereCalls[0]?.content).toContain("Read the plan file below");
    });
    test("keeps plan file on disk and includes plan path note in Start Here content", () => {
        const planPath = "~/.mux/plans/demo/ws-123.md";
        renderToolCall(_jsx(ProposePlanToolCall, { args: {}, result: {
                success: true,
                planPath,
                // Old-format chat history may include planContent; this is the easiest path to
                // ensure the rendered Start Here message includes the full plan + the path note.
                planContent: "# My Plan\n\nDo the thing.",
            }, workspaceId: "ws-123", isLatest: false }));
        expect(startHereCalls.length).toBe(1);
        expect(startHereCalls[0]?.options).toEqual({ sourceAgentId: "plan" });
        expect(startHereCalls[0]?.isCompacted).toBe(false);
        // The Start Here message should explicitly tell the user the plan file remains on disk.
        expect(startHereCalls[0]?.content).toContain("*Plan file preserved at:*");
        expect(startHereCalls[0]?.content).toContain("Note: This chat already contains the full plan");
        expect(startHereCalls[0]?.content).toContain(planPath);
    });
    test("switches to exec and sends a message when clicking Implement", async () => {
        const workspaceId = "ws-123";
        const planPath = "~/.mux/plans/demo/ws-123.md";
        const planModel = "anthropic:claude-sonnet-4-5";
        const planThinking = "high";
        const execModel = "openai:gpt-5.2";
        const execThinking = "low";
        // Start in plan mode.
        window.localStorage.setItem(getAgentIdKey(workspaceId), JSON.stringify("plan"));
        updatePersistedState(getModelKey(workspaceId), planModel);
        updatePersistedState(getThinkingLevelKey(workspaceId), planThinking);
        updatePersistedState(AGENT_AI_DEFAULTS_KEY, {
            exec: { modelString: execModel, thinkingLevel: execThinking },
        });
        const sendMessageCalls = [];
        mockApi = {
            config: {
                getConfig: () => Promise.resolve({
                    taskSettings: { maxParallelAgentTasks: 3, maxTaskNestingDepth: 3 },
                    agentAiDefaults: {},
                    subagentAiDefaults: {},
                }),
            },
            workspace: {
                getPlanContent: () => Promise.resolve({
                    success: true,
                    data: { content: "# My Plan\n\nDo the thing.", path: planPath },
                }),
                replaceChatHistory: (_args) => Promise.resolve({ success: true, data: undefined }),
                sendMessage: (args) => {
                    sendMessageCalls.push(args);
                    return Promise.resolve({ success: true, data: undefined });
                },
            },
        };
        const view = renderToolCall(_jsx(ProposePlanToolCall, { args: {}, status: "completed", result: {
                success: true,
                planPath,
                planContent: "# My Plan\n\nDo the thing.",
            }, workspaceId: workspaceId, isLatest: true }));
        fireEvent.click(view.getByRole("button", { name: "Implement" }));
        await waitFor(() => expect(sendMessageCalls.length).toBe(1));
        expect(sendMessageCalls[0]?.message).toBe("Implement the plan");
        expect(sendMessageCalls[0]?.options.agentId).toBe("exec");
        expect(sendMessageCalls[0]?.options.model).toBe(execModel);
        expect(sendMessageCalls[0]?.options.thinkingLevel).toBe(execThinking);
        // Clicking Implement should switch the workspace agent to exec.
        //
        // Note: some tests in this repo mock the `usePersistedState` module globally. In that case,
        // `updatePersistedState` won't actually write to localStorage here, so we assert the call.
        const agentKey = getAgentIdKey(workspaceId);
        const modelKey = getModelKey(workspaceId);
        const thinkingKey = getThinkingLevelKey(workspaceId);
        const updatePersistedStateMaybeMock = updatePersistedState;
        if (updatePersistedStateMaybeMock.mock) {
            expect(updatePersistedState).toHaveBeenCalledWith(agentKey, "exec");
            expect(updatePersistedState).toHaveBeenCalledWith(modelKey, execModel);
            expect(updatePersistedState).toHaveBeenCalledWith(thinkingKey, execThinking);
        }
        else {
            expect(JSON.parse(window.localStorage.getItem(agentKey))).toBe("exec");
            expect(JSON.parse(window.localStorage.getItem(modelKey))).toBe(execModel);
            expect(JSON.parse(window.localStorage.getItem(thinkingKey))).toBe(execThinking);
        }
    });
    test("replaces chat history before implementing when setting enabled", async () => {
        const workspaceId = "ws-123";
        const planPath = "~/.mux/plans/demo/ws-123.md";
        // Start in plan mode.
        window.localStorage.setItem(getAgentIdKey(workspaceId), JSON.stringify("plan"));
        const calls = [];
        const replaceChatHistoryCalls = [];
        const sendMessageCalls = [];
        mockApi = {
            config: {
                getConfig: () => Promise.resolve({
                    taskSettings: {
                        maxParallelAgentTasks: 3,
                        maxTaskNestingDepth: 3,
                        proposePlanImplementReplacesChatHistory: true,
                    },
                    agentAiDefaults: {},
                    subagentAiDefaults: {},
                }),
            },
            workspace: {
                getPlanContent: () => Promise.resolve({
                    success: true,
                    data: { content: "# My Plan\n\nDo the thing.", path: planPath },
                }),
                replaceChatHistory: (args) => {
                    calls.push("replaceChatHistory");
                    replaceChatHistoryCalls.push(args);
                    return Promise.resolve({ success: true, data: undefined });
                },
                sendMessage: (args) => {
                    calls.push("sendMessage");
                    sendMessageCalls.push(args);
                    return Promise.resolve({ success: true, data: undefined });
                },
            },
        };
        const view = renderToolCall(_jsx(ProposePlanToolCall, { args: {}, status: "completed", result: {
                success: true,
                planPath,
                planContent: "# My Plan\n\nDo the thing.",
            }, workspaceId: workspaceId, isLatest: true }));
        fireEvent.click(view.getByRole("button", { name: "Implement" }));
        await waitFor(() => expect(sendMessageCalls.length).toBe(1));
        expect(replaceChatHistoryCalls.length).toBe(1);
        expect(calls).toEqual(["replaceChatHistory", "sendMessage"]);
        const replaceArgs = replaceChatHistoryCalls[0];
        expect(replaceArgs?.deletePlanFile).toBe(false);
        expect(replaceArgs?.mode).toBe("append-compaction-boundary");
        const summaryMessage = replaceArgs?.summaryMessage;
        expect(summaryMessage.role).toBe("assistant");
        expect(summaryMessage.parts?.[0]?.text).toContain("Note: This chat already contains the full plan");
        expect(summaryMessage.metadata?.agentId).toBe("plan");
        expect(summaryMessage.parts?.[0]?.text).toContain("*Plan file preserved at:*");
        expect(summaryMessage.parts?.[0]?.text).toContain(planPath);
    });
    test("switches to orchestrator and sends a message when clicking Start Orchestrator", async () => {
        const workspaceId = "ws-123";
        const planPath = "~/.mux/plans/demo/ws-123.md";
        const planModel = "anthropic:claude-sonnet-4-5";
        const planThinking = "high";
        const orchestratorModel = "openai:gpt-5.2-pro";
        const orchestratorThinking = "medium";
        // Start in plan mode.
        window.localStorage.setItem(getAgentIdKey(workspaceId), JSON.stringify("plan"));
        updatePersistedState(getModelKey(workspaceId), planModel);
        updatePersistedState(getThinkingLevelKey(workspaceId), planThinking);
        updatePersistedState(AGENT_AI_DEFAULTS_KEY, {
            orchestrator: { modelString: orchestratorModel, thinkingLevel: orchestratorThinking },
        });
        const replaceChatHistoryCalls = [];
        const sendMessageCalls = [];
        mockApi = {
            config: {
                getConfig: () => Promise.resolve({
                    taskSettings: { maxParallelAgentTasks: 3, maxTaskNestingDepth: 3 },
                    agentAiDefaults: {},
                    subagentAiDefaults: {},
                }),
            },
            workspace: {
                getPlanContent: () => Promise.resolve({
                    success: true,
                    data: { content: "# My Plan\n\nDo the thing.", path: planPath },
                }),
                replaceChatHistory: (args) => {
                    replaceChatHistoryCalls.push(args);
                    return Promise.resolve({ success: true, data: undefined });
                },
                sendMessage: (args) => {
                    sendMessageCalls.push(args);
                    return Promise.resolve({ success: true, data: undefined });
                },
            },
        };
        const view = renderToolCall(_jsx(ProposePlanToolCall, { args: {}, status: "completed", result: {
                success: true,
                planPath,
                planContent: "# My Plan\n\nDo the thing.",
            }, workspaceId: workspaceId, isLatest: true }));
        fireEvent.click(view.getByRole("button", { name: "Start Orchestrator" }));
        await waitFor(() => expect(sendMessageCalls.length).toBe(1));
        expect(sendMessageCalls[0]?.message).toBe("Start orchestrating the implementation of this plan.");
        expect(sendMessageCalls[0]?.options.agentId).toBe("orchestrator");
        expect(sendMessageCalls[0]?.options.model).toBe(orchestratorModel);
        expect(sendMessageCalls[0]?.options.thinkingLevel).toBe(orchestratorThinking);
        expect(replaceChatHistoryCalls.length).toBe(0);
        // Clicking Start Orchestrator should switch the workspace agent to orchestrator.
        const agentKey = getAgentIdKey(workspaceId);
        const modelKey = getModelKey(workspaceId);
        const thinkingKey = getThinkingLevelKey(workspaceId);
        const updatePersistedStateMaybeMock = updatePersistedState;
        if (updatePersistedStateMaybeMock.mock) {
            expect(updatePersistedState).toHaveBeenCalledWith(agentKey, "orchestrator");
            expect(updatePersistedState).toHaveBeenCalledWith(modelKey, orchestratorModel);
            expect(updatePersistedState).toHaveBeenCalledWith(thinkingKey, orchestratorThinking);
        }
        else {
            expect(JSON.parse(window.localStorage.getItem(agentKey))).toBe("orchestrator");
            expect(JSON.parse(window.localStorage.getItem(modelKey))).toBe(orchestratorModel);
            expect(JSON.parse(window.localStorage.getItem(thinkingKey))).toBe(orchestratorThinking);
        }
    });
    test("replaces chat history before starting orchestrator when setting enabled", async () => {
        const workspaceId = "ws-123";
        const planPath = "~/.mux/plans/demo/ws-123.md";
        // Start in plan mode.
        window.localStorage.setItem(getAgentIdKey(workspaceId), JSON.stringify("plan"));
        const calls = [];
        const replaceChatHistoryCalls = [];
        const sendMessageCalls = [];
        mockApi = {
            config: {
                getConfig: () => Promise.resolve({
                    taskSettings: {
                        maxParallelAgentTasks: 3,
                        maxTaskNestingDepth: 3,
                        proposePlanImplementReplacesChatHistory: true,
                    },
                    agentAiDefaults: {},
                    subagentAiDefaults: {},
                }),
            },
            workspace: {
                getPlanContent: () => Promise.resolve({
                    success: true,
                    data: { content: "# My Plan\n\nDo the thing.", path: planPath },
                }),
                replaceChatHistory: (args) => {
                    calls.push("replaceChatHistory");
                    replaceChatHistoryCalls.push(args);
                    return Promise.resolve({ success: true, data: undefined });
                },
                sendMessage: (args) => {
                    calls.push("sendMessage");
                    sendMessageCalls.push(args);
                    return Promise.resolve({ success: true, data: undefined });
                },
            },
        };
        const view = renderToolCall(_jsx(ProposePlanToolCall, { args: {}, status: "completed", result: {
                success: true,
                planPath,
                planContent: "# My Plan\n\nDo the thing.",
            }, workspaceId: workspaceId, isLatest: true }));
        fireEvent.click(view.getByRole("button", { name: "Start Orchestrator" }));
        await waitFor(() => expect(sendMessageCalls.length).toBe(1));
        expect(sendMessageCalls[0]?.message).toBe("Start orchestrating the implementation of this plan.");
        expect(sendMessageCalls[0]?.options.agentId).toBe("orchestrator");
        expect(replaceChatHistoryCalls.length).toBe(1);
        expect(calls).toEqual(["replaceChatHistory", "sendMessage"]);
        const replaceArgs = replaceChatHistoryCalls[0];
        expect(replaceArgs?.deletePlanFile).toBe(false);
        expect(replaceArgs?.mode).toBe("append-compaction-boundary");
        const summaryMessage = replaceArgs?.summaryMessage;
        expect(summaryMessage.role).toBe("assistant");
        expect(summaryMessage.parts?.[0]?.text).toContain("Note: This chat already contains the full plan");
        expect(summaryMessage.parts?.[0]?.text).not.toContain("Orchestrator mode");
        expect(summaryMessage.metadata?.agentId).toBe("plan");
        expect(summaryMessage.parts?.[0]?.text).toContain("*Plan file preserved at:*");
        expect(summaryMessage.parts?.[0]?.text).toContain(planPath);
    });
});
//# sourceMappingURL=ProposePlanToolCall.test.js.map