import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { GlobalWindow } from "happy-dom";
import React from "react";
import { APIProvider } from "@/browser/contexts/API";
import { PolicyProvider } from "@/browser/contexts/PolicyContext";
import { useContextSwitchWarning } from "./useContextSwitchWarning";
import { getEffectiveContextLimit } from "@/browser/utils/compaction/contextLimit";
import { recordWorkspaceModelChange, setWorkspaceModelWithOrigin, } from "@/browser/utils/modelChange";
async function* emptyStream() {
    // no-op
}
function createStubApiClient() {
    // Avoid mock.module (global) by injecting a minimal client through providers.
    // Keep this stub local unless other tests need the same wiring.
    return {
        providers: {
            getConfig: () => Promise.resolve(null),
            onConfigChanged: () => Promise.resolve(emptyStream()),
        },
        policy: {
            get: () => Promise.resolve({ status: { state: "disabled" }, policy: null }),
            onChanged: () => Promise.resolve(emptyStream()),
        },
    };
}
const stubClient = createStubApiClient();
const wrapper = (props) => React.createElement(APIProvider, { client: stubClient }, React.createElement(PolicyProvider, null, props.children));
const createPolicyChurnClient = () => {
    const policyEventResolvers = [];
    const triggerPolicyEvent = () => {
        const resolve = policyEventResolvers.shift();
        if (resolve) {
            resolve();
        }
    };
    async function* policyEvents() {
        for (let i = 0; i < 2; i++) {
            await new Promise((resolve) => policyEventResolvers.push(resolve));
            yield {};
        }
    }
    const client = {
        providers: {
            getConfig: () => Promise.resolve(null),
            onConfigChanged: () => Promise.resolve(emptyStream()),
        },
        policy: {
            get: () => Promise.resolve({
                status: { state: "enforced" },
                policy: {
                    policyFormatVersion: "0.1",
                    providerAccess: null,
                    mcp: { allowUserDefined: { stdio: true, remote: true } },
                    runtimes: null,
                },
            }),
            onChanged: () => Promise.resolve(policyEvents()),
        },
    };
    return { client, triggerPolicyEvent };
};
const buildUsage = (tokens, model) => ({
    totalTokens: tokens,
    lastContextUsage: {
        input: { tokens },
        cached: { tokens: 0 },
        cacheCreate: { tokens: 0 },
        output: { tokens: 0 },
        reasoning: { tokens: 0 },
        model,
    },
});
const buildAssistantMessage = (model) => ({
    type: "assistant",
    id: "assistant-1",
    historyId: "history-1",
    content: "ok",
    historySequence: 1,
    isStreaming: false,
    isPartial: false,
    isCompacted: false,
    isIdleCompacted: false,
    model,
});
const buildSendOptions = (model) => ({
    model,
    agentId: "exec",
});
describe("useContextSwitchWarning", () => {
    beforeEach(() => {
        globalThis.window = new GlobalWindow();
        globalThis.document = globalThis.window.document;
        globalThis.localStorage = globalThis.window.localStorage;
        globalThis.localStorage.clear();
    });
    afterEach(() => {
        cleanup();
        globalThis.window = undefined;
        globalThis.document = undefined;
        globalThis.localStorage = undefined;
    });
    test("does not warn on initial load without a user switch", async () => {
        const model = "openai:gpt-5.2-codex";
        const props = {
            workspaceId: "workspace-1",
            messages: [buildAssistantMessage(model)],
            pendingModel: model,
            use1M: false,
            workspaceUsage: buildUsage(260000, model),
            api: undefined,
            pendingSendOptions: buildSendOptions(model),
        };
        const { result } = renderHook((hookProps) => useContextSwitchWarning(hookProps), {
            initialProps: props,
            wrapper,
        });
        await waitFor(() => expect(result.current.warning).toBeNull());
    });
    test("warns when the user switches to a smaller context model", async () => {
        const previousModel = "anthropic:claude-sonnet-4-5";
        const nextModel = "openai:gpt-5.2-codex";
        const props = {
            workspaceId: "workspace-2",
            messages: [buildAssistantMessage(previousModel)],
            pendingModel: previousModel,
            use1M: false,
            workspaceUsage: buildUsage(260000, previousModel),
            api: undefined,
            pendingSendOptions: buildSendOptions(previousModel),
        };
        const { result, rerender } = renderHook((hookProps) => useContextSwitchWarning(hookProps), { initialProps: props, wrapper });
        act(() => {
            recordWorkspaceModelChange(props.workspaceId, nextModel, "user");
            rerender({
                ...props,
                pendingModel: nextModel,
                pendingSendOptions: buildSendOptions(nextModel),
            });
        });
        await waitFor(() => expect(result.current.warning?.targetModel).toBe(nextModel));
    });
    test("warns when gateway model strings are normalized for explicit switches", async () => {
        const previousModel = "anthropic:claude-sonnet-4-5";
        const nextModel = "openai:gpt-5.2-codex";
        const gatewayModel = "mux-gateway:openai/gpt-5.2-codex";
        const limit = getEffectiveContextLimit(nextModel, false);
        expect(limit).not.toBeNull();
        if (!limit)
            return;
        const tokens = Math.floor(limit * 1.05);
        const props = {
            workspaceId: "workspace-11",
            messages: [buildAssistantMessage(previousModel)],
            pendingModel: previousModel,
            use1M: false,
            workspaceUsage: buildUsage(tokens, previousModel),
            api: undefined,
            pendingSendOptions: buildSendOptions(previousModel),
        };
        const { result, rerender } = renderHook((hookProps) => useContextSwitchWarning(hookProps), { initialProps: props, wrapper });
        act(() => {
            setWorkspaceModelWithOrigin(props.workspaceId, nextModel, "user");
            rerender({
                ...props,
                pendingModel: gatewayModel,
                pendingSendOptions: buildSendOptions(nextModel),
            });
        });
        await waitFor(() => expect(result.current.warning?.targetModel).toBe(gatewayModel));
    });
    test("does not loop when policy refreshes with identical values", async () => {
        const consoleError = console.error;
        const errorMessages = [];
        console.error = (...args) => {
            errorMessages.push(args.map((arg) => String(arg)).join(" "));
            consoleError(...args);
        };
        try {
            const { client, triggerPolicyEvent } = createPolicyChurnClient();
            const policyWrapper = (props) => React.createElement(APIProvider, { client }, React.createElement(PolicyProvider, null, props.children));
            const previousModel = "anthropic:claude-sonnet-4-5";
            const nextModel = "openai:gpt-5.2-codex";
            const limit = getEffectiveContextLimit(nextModel, false);
            expect(limit).not.toBeNull();
            if (!limit)
                return;
            const tokens = Math.floor(limit * 1.05);
            const props = {
                workspaceId: "workspace-12",
                messages: [buildAssistantMessage(previousModel)],
                pendingModel: previousModel,
                use1M: false,
                workspaceUsage: buildUsage(tokens, previousModel),
                api: undefined,
                pendingSendOptions: buildSendOptions(previousModel),
            };
            const { result, rerender } = renderHook((hookProps) => useContextSwitchWarning(hookProps), { initialProps: props, wrapper: policyWrapper });
            act(() => {
                setWorkspaceModelWithOrigin(props.workspaceId, nextModel, "user");
                rerender({
                    ...props,
                    pendingModel: nextModel,
                    pendingSendOptions: buildSendOptions(nextModel),
                });
            });
            await waitFor(() => expect(result.current.warning?.targetModel).toBe(nextModel));
            act(() => {
                triggerPolicyEvent();
                triggerPolicyEvent();
            });
            await waitFor(() => expect(result.current.warning?.targetModel).toBe(nextModel));
            expect(errorMessages.some((message) => message.includes("Maximum update depth exceeded"))).toBe(false);
        }
        finally {
            console.error = consoleError;
        }
    });
    test("warns when an agent-driven model change overflows context", async () => {
        const previousModel = "anthropic:claude-sonnet-4-5";
        const nextModel = "openai:gpt-5.2-codex";
        const limit = getEffectiveContextLimit(nextModel, false);
        expect(limit).not.toBeNull();
        if (!limit)
            return;
        const tokens = Math.floor(limit * 1.05);
        const props = {
            workspaceId: "workspace-9",
            messages: [buildAssistantMessage(previousModel)],
            pendingModel: previousModel,
            use1M: false,
            workspaceUsage: buildUsage(tokens, previousModel),
            api: undefined,
            pendingSendOptions: buildSendOptions(previousModel),
        };
        const { result, rerender } = renderHook((hookProps) => useContextSwitchWarning(hookProps), { initialProps: props, wrapper });
        act(() => {
            setWorkspaceModelWithOrigin(props.workspaceId, nextModel, "agent");
            rerender({
                ...props,
                pendingModel: nextModel,
                pendingSendOptions: buildSendOptions(nextModel),
            });
        });
        await waitFor(() => expect(result.current.warning?.targetModel).toBe(nextModel));
    });
    test("does not warn when the model changes via sync", async () => {
        const previousModel = "anthropic:claude-sonnet-4-5";
        const nextModel = "openai:gpt-5.2-codex";
        const props = {
            workspaceId: "workspace-3",
            messages: [buildAssistantMessage(previousModel)],
            pendingModel: previousModel,
            use1M: false,
            workspaceUsage: buildUsage(260000, previousModel),
            api: undefined,
            pendingSendOptions: buildSendOptions(previousModel),
        };
        const { result, rerender } = renderHook((hookProps) => useContextSwitchWarning(hookProps), { initialProps: props, wrapper });
        act(() => {
            rerender({
                ...props,
                pendingModel: nextModel,
                pendingSendOptions: buildSendOptions(nextModel),
            });
        });
        await waitFor(() => expect(result.current.warning).toBeNull());
    });
    test("does not re-warn without a new explicit change entry", async () => {
        const previousModel = "anthropic:claude-sonnet-4-5";
        const nextModel = "openai:gpt-5.2-codex";
        const props = {
            workspaceId: "workspace-10",
            messages: [buildAssistantMessage(previousModel)],
            pendingModel: previousModel,
            use1M: false,
            workspaceUsage: buildUsage(260000, previousModel),
            api: undefined,
            pendingSendOptions: buildSendOptions(previousModel),
        };
        const { result, rerender } = renderHook((hookProps) => useContextSwitchWarning(hookProps), { initialProps: props, wrapper });
        act(() => {
            recordWorkspaceModelChange(props.workspaceId, nextModel, "user");
            rerender({
                ...props,
                pendingModel: nextModel,
                pendingSendOptions: buildSendOptions(nextModel),
            });
        });
        await waitFor(() => expect(result.current.warning?.targetModel).toBe(nextModel));
        act(() => {
            rerender({
                ...props,
                pendingModel: previousModel,
                pendingSendOptions: buildSendOptions(previousModel),
            });
        });
        await waitFor(() => expect(result.current.warning).toBeNull());
        act(() => {
            rerender({
                ...props,
                pendingModel: nextModel,
                pendingSendOptions: buildSendOptions(nextModel),
            });
        });
        await waitFor(() => expect(result.current.warning).toBeNull());
    });
    test("clears stale warning when user switches with zero tokens", async () => {
        const previousModel = "anthropic:claude-sonnet-4-5";
        const nextModel = "openai:gpt-5.2-codex";
        const finalModel = "anthropic:claude-sonnet-4-5";
        const props = {
            workspaceId: "workspace-6",
            messages: [buildAssistantMessage(previousModel)],
            pendingModel: previousModel,
            use1M: false,
            workspaceUsage: buildUsage(260000, previousModel),
            api: undefined,
            pendingSendOptions: buildSendOptions(previousModel),
        };
        const { result, rerender } = renderHook((hookProps) => useContextSwitchWarning(hookProps), { initialProps: props, wrapper });
        act(() => {
            recordWorkspaceModelChange(props.workspaceId, nextModel, "user");
            rerender({
                ...props,
                pendingModel: nextModel,
                pendingSendOptions: buildSendOptions(nextModel),
            });
        });
        await waitFor(() => expect(result.current.warning?.targetModel).toBe(nextModel));
        act(() => {
            rerender({
                ...props,
                pendingModel: nextModel,
                pendingSendOptions: buildSendOptions(nextModel),
                workspaceUsage: buildUsage(0, nextModel),
            });
        });
        act(() => {
            recordWorkspaceModelChange(props.workspaceId, finalModel, "user");
            rerender({
                ...props,
                pendingModel: finalModel,
                pendingSendOptions: buildSendOptions(finalModel),
                workspaceUsage: buildUsage(0, finalModel),
            });
        });
        await waitFor(() => expect(result.current.warning).toBeNull());
    });
    test("warns after deferred switch once usage loads", async () => {
        const previousModel = "anthropic:claude-sonnet-4-5";
        const nextModel = "openai:gpt-5.2-codex";
        const limit = getEffectiveContextLimit(nextModel, false);
        expect(limit).not.toBeNull();
        if (!limit)
            return;
        const tokens = Math.floor(limit * 1.05);
        const props = {
            workspaceId: "workspace-7",
            messages: [buildAssistantMessage(previousModel)],
            pendingModel: previousModel,
            use1M: false,
            workspaceUsage: buildUsage(0, previousModel),
            api: undefined,
            pendingSendOptions: buildSendOptions(previousModel),
        };
        const { result, rerender } = renderHook((hookProps) => useContextSwitchWarning(hookProps), { initialProps: props, wrapper });
        act(() => {
            recordWorkspaceModelChange(props.workspaceId, nextModel, "user");
            rerender({
                ...props,
                pendingModel: nextModel,
                pendingSendOptions: buildSendOptions(nextModel),
            });
        });
        await waitFor(() => expect(result.current.warning).toBeNull());
        act(() => {
            rerender({
                ...props,
                pendingModel: nextModel,
                pendingSendOptions: buildSendOptions(nextModel),
                workspaceUsage: buildUsage(tokens, previousModel),
            });
        });
        await waitFor(() => expect(result.current.warning?.targetModel).toBe(nextModel));
    });
    test("does not warn when deferred switch diverges on sync update", async () => {
        const previousModel = "anthropic:claude-sonnet-4-5";
        const nextModel = "openai:gpt-5.2-codex";
        const limit = getEffectiveContextLimit(nextModel, false);
        expect(limit).not.toBeNull();
        if (!limit)
            return;
        const tokens = Math.floor(limit * 1.05);
        const props = {
            workspaceId: "workspace-8",
            messages: [buildAssistantMessage(previousModel)],
            pendingModel: previousModel,
            use1M: false,
            workspaceUsage: buildUsage(0, previousModel),
            api: undefined,
            pendingSendOptions: buildSendOptions(previousModel),
        };
        const { result, rerender } = renderHook((hookProps) => useContextSwitchWarning(hookProps), { initialProps: props, wrapper });
        act(() => {
            recordWorkspaceModelChange(props.workspaceId, nextModel, "user");
            rerender({
                ...props,
                pendingModel: nextModel,
                pendingSendOptions: buildSendOptions(nextModel),
            });
        });
        await waitFor(() => expect(result.current.warning).toBeNull());
        act(() => {
            rerender({
                ...props,
                pendingModel: previousModel,
                pendingSendOptions: buildSendOptions(previousModel),
            });
        });
        await waitFor(() => expect(result.current.warning).toBeNull());
        act(() => {
            rerender({
                ...props,
                pendingModel: nextModel,
                pendingSendOptions: buildSendOptions(nextModel),
                workspaceUsage: buildUsage(tokens, nextModel),
            });
        });
        await waitFor(() => expect(result.current.warning).toBeNull());
    });
    test("warns when 1M is toggled off and context no longer fits", async () => {
        const model = "anthropic:claude-sonnet-4-5";
        const baseLimit = getEffectiveContextLimit(model, false);
        expect(baseLimit).not.toBeNull();
        if (!baseLimit)
            return;
        const tokens = Math.floor(baseLimit * 1.05);
        const props = {
            workspaceId: "workspace-4",
            messages: [buildAssistantMessage(model)],
            pendingModel: model,
            use1M: true,
            workspaceUsage: buildUsage(tokens, model),
            api: undefined,
            pendingSendOptions: buildSendOptions(model),
        };
        const { result, rerender } = renderHook((hookProps) => useContextSwitchWarning(hookProps), { initialProps: props, wrapper });
        await waitFor(() => expect(result.current.warning).toBeNull());
        act(() => {
            rerender({
                ...props,
                use1M: false,
            });
        });
        await waitFor(() => expect(result.current.warning?.targetModel).toBe(model));
    });
    test("does not warn when 1M toggle does not change the limit", async () => {
        const model = "openai:gpt-5.2-codex";
        const limit = getEffectiveContextLimit(model, false);
        expect(limit).not.toBeNull();
        if (!limit)
            return;
        const tokens = Math.floor(limit * 0.95);
        const props = {
            workspaceId: "workspace-5",
            messages: [buildAssistantMessage(model)],
            pendingModel: model,
            use1M: false,
            workspaceUsage: buildUsage(tokens, model),
            api: undefined,
            pendingSendOptions: buildSendOptions(model),
        };
        const { result, rerender } = renderHook((hookProps) => useContextSwitchWarning(hookProps), { initialProps: props, wrapper });
        await waitFor(() => expect(result.current.warning).toBeNull());
        act(() => {
            rerender({
                ...props,
                use1M: true,
            });
        });
        await waitFor(() => expect(result.current.warning).toBeNull());
    });
});
//# sourceMappingURL=useContextSwitchWarning.test.js.map