import { jsx as _jsx } from "react/jsx-runtime";
import { getAgentIdKey, getInputKey, getInputAttachmentsKey, getModelKey, getPendingScopeId, getPendingWorkspaceSendErrorKey, getProjectScopeId, getThinkingLevelKey, } from "@/common/constants/storage";
import { CODER_RUNTIME_PLACEHOLDER, } from "@/common/types/runtime";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { GlobalWindow } from "happy-dom";
import { useCreationWorkspace } from "./useCreationWorkspace";
const readPersistedStateCalls = [];
let persistedPreferences = {};
const readPersistedStateMock = mock((key, defaultValue) => {
    readPersistedStateCalls.push([key, defaultValue]);
    if (Object.prototype.hasOwnProperty.call(persistedPreferences, key)) {
        return persistedPreferences[key];
    }
    if (typeof window === "undefined" || !window.localStorage) {
        return defaultValue;
    }
    try {
        const storedValue = window.localStorage.getItem(key);
        if (storedValue === null || storedValue === "undefined") {
            return defaultValue;
        }
        return JSON.parse(storedValue);
    }
    catch {
        return defaultValue;
    }
});
const updatePersistedStateCalls = [];
const updatePersistedStateMock = mock((key, value) => {
    updatePersistedStateCalls.push([key, value]);
    if (typeof window === "undefined" || !window.localStorage) {
        return;
    }
    if (value === undefined || value === null) {
        window.localStorage.removeItem(key);
        return;
    }
    window.localStorage.setItem(key, JSON.stringify(value));
});
const readPersistedStringMock = mock((key) => {
    if (Object.prototype.hasOwnProperty.call(persistedPreferences, key)) {
        const value = persistedPreferences[key];
        return typeof value === "string" ? value : undefined;
    }
    if (typeof window === "undefined" || !window.localStorage) {
        return undefined;
    }
    const storedValue = window.localStorage.getItem(key);
    if (storedValue === null || storedValue === "undefined") {
        return undefined;
    }
    try {
        const parsed = JSON.parse(storedValue);
        if (typeof parsed === "string") {
            return parsed;
        }
    }
    catch {
        // Fall through to raw string.
    }
    return storedValue;
});
void mock.module("@/browser/hooks/usePersistedState", () => ({
    readPersistedState: readPersistedStateMock,
    readPersistedString: readPersistedStringMock,
    updatePersistedState: updatePersistedStateMock,
}));
let draftSettingsInvocations = [];
let draftSettingsState;
const useDraftWorkspaceSettingsMock = mock((projectPath, branches, recommendedTrunk) => {
    draftSettingsInvocations.push({ projectPath, branches, recommendedTrunk });
    if (!draftSettingsState) {
        throw new Error("Draft settings state not initialized");
    }
    return draftSettingsState.snapshot();
});
void mock.module("@/browser/hooks/useDraftWorkspaceSettings", () => ({
    useDraftWorkspaceSettings: useDraftWorkspaceSettingsMock,
}));
let currentORPCClient = null;
const noop = () => undefined;
const routerState = {
    currentWorkspaceId: null,
    currentProjectId: null,
    pendingDraftId: null,
};
void mock.module("@/browser/contexts/RouterContext", () => ({
    useRouter: () => ({
        navigateToWorkspace: noop,
        navigateToProject: noop,
        navigateToHome: noop,
        currentWorkspaceId: routerState.currentWorkspaceId,
        currentProjectId: routerState.currentProjectId,
        currentProjectPathFromState: null,
        pendingSectionId: null,
        pendingDraftId: routerState.pendingDraftId,
    }),
}));
void mock.module("@/browser/contexts/API", () => ({
    useAPI: () => {
        if (!currentORPCClient) {
            return { api: null, status: "connecting", error: null };
        }
        return {
            api: currentORPCClient,
            status: "connected",
            error: null,
        };
    },
}));
const TEST_PROJECT_PATH = "/projects/demo";
const FALLBACK_BRANCH = "main";
const TEST_WORKSPACE_ID = "ws-created";
function rejectNotImplemented(method) {
    return (..._args) => Promise.reject(new Error(`${method} is not implemented in useCreationWorkspace tests`));
}
function throwNotImplemented(method) {
    return (..._args) => {
        throw new Error(`${method} is not implemented in useCreationWorkspace tests`);
    };
}
const noopUnsubscribe = () => () => undefined;
const setupWindow = ({ listBranches, sendMessage, create, updateAgentAISettings, nameGeneration, } = {}) => {
    const listBranchesMock = listBranches ??
        mock(({ projectPath }) => {
            if (!projectPath) {
                throw new Error("listBranches mock requires projectPath");
            }
            return Promise.resolve({
                branches: [FALLBACK_BRANCH],
                recommendedTrunk: FALLBACK_BRANCH,
            });
        });
    const sendMessageMock = sendMessage ??
        mock(() => {
            const result = {
                success: true,
                data: {},
            };
            return Promise.resolve(result);
        });
    const createMock = create ??
        mock(() => {
            return Promise.resolve({
                success: true,
                metadata: TEST_METADATA,
            });
        });
    const updateAgentAISettingsMock = updateAgentAISettings ??
        mock(() => {
            return Promise.resolve({
                success: true,
                data: undefined,
            });
        });
    const nameGenerationMock = nameGeneration ??
        mock(() => {
            return Promise.resolve({
                success: true,
                data: {
                    name: "test-workspace",
                    modelUsed: "anthropic:claude-haiku-4-5",
                },
            });
        });
    currentORPCClient = {
        projects: {
            listBranches: (input) => listBranchesMock(input),
            runtimeAvailability: () => Promise.resolve({
                local: { available: true },
                worktree: { available: true },
                ssh: { available: true },
                docker: { available: true },
                devcontainer: { available: false, reason: "No devcontainer.json found" },
            }),
        },
        workspace: {
            sendMessage: (input) => sendMessageMock(input),
            create: (input) => createMock(input),
            updateAgentAISettings: (input) => updateAgentAISettingsMock(input),
        },
        nameGeneration: {
            generate: (input) => nameGenerationMock(input),
        },
    };
    const windowInstance = new GlobalWindow();
    globalThis.window = windowInstance;
    const windowWithApi = globalThis.window;
    const apiMock = {
        tokenizer: {
            countTokens: rejectNotImplemented("tokenizer.countTokens"),
            countTokensBatch: rejectNotImplemented("tokenizer.countTokensBatch"),
            calculateStats: rejectNotImplemented("tokenizer.calculateStats"),
        },
        providers: {
            setProviderConfig: rejectNotImplemented("providers.setProviderConfig"),
        },
        projects: {
            create: rejectNotImplemented("projects.create"),
            pickDirectory: rejectNotImplemented("projects.pickDirectory"),
            remove: rejectNotImplemented("projects.remove"),
            list: rejectNotImplemented("projects.list"),
            listBranches: (projectPath) => listBranchesMock({ projectPath }),
            secrets: {
                get: rejectNotImplemented("projects.secrets.get"),
                update: rejectNotImplemented("projects.secrets.update"),
            },
        },
        nameGeneration: {
            generate: (args) => nameGenerationMock(args),
        },
        workspace: {
            list: rejectNotImplemented("workspace.list"),
            create: (args) => createMock(args),
            updateAgentAISettings: (args) => updateAgentAISettingsMock(args),
            remove: rejectNotImplemented("workspace.remove"),
            rename: rejectNotImplemented("workspace.rename"),
            fork: rejectNotImplemented("workspace.fork"),
            sendMessage: (workspaceId, message, options) => sendMessageMock({ workspaceId, message, options }),
            resumeStream: rejectNotImplemented("workspace.resumeStream"),
            interruptStream: rejectNotImplemented("workspace.interruptStream"),
            clearQueue: rejectNotImplemented("workspace.clearQueue"),
            truncateHistory: rejectNotImplemented("workspace.truncateHistory"),
            replaceChatHistory: rejectNotImplemented("workspace.replaceChatHistory"),
            getInfo: rejectNotImplemented("workspace.getInfo"),
            executeBash: rejectNotImplemented("workspace.executeBash"),
            openTerminal: rejectNotImplemented("workspace.openTerminal"),
            onChat: (_workspaceId, _callback) => noopUnsubscribe(),
            onMetadata: (_callback) => noopUnsubscribe(),
            activity: {
                list: rejectNotImplemented("workspace.activity.list"),
                subscribe: (_callback) => noopUnsubscribe(),
            },
        },
        window: {
            setTitle: rejectNotImplemented("window.setTitle"),
        },
        terminal: {
            create: rejectNotImplemented("terminal.create"),
            close: rejectNotImplemented("terminal.close"),
            resize: rejectNotImplemented("terminal.resize"),
            sendInput: throwNotImplemented("terminal.sendInput"),
            onOutput: () => noopUnsubscribe(),
            onExit: () => noopUnsubscribe(),
            openWindow: rejectNotImplemented("terminal.openWindow"),
            closeWindow: rejectNotImplemented("terminal.closeWindow"),
        },
        update: {
            check: rejectNotImplemented("update.check"),
            download: rejectNotImplemented("update.download"),
            install: throwNotImplemented("update.install"),
            onStatus: () => noopUnsubscribe(),
        },
        platform: "linux",
        versions: {
            node: "0",
            chrome: "0",
            electron: "0",
        },
    };
    windowWithApi.api = apiMock;
    globalThis.document = windowInstance.document;
    globalThis.localStorage = windowInstance.localStorage;
    return {
        projectsApi: { listBranches: listBranchesMock },
        workspaceApi: {
            sendMessage: sendMessageMock,
            create: createMock,
        },
        nameGenerationApi: { generate: nameGenerationMock },
    };
};
const TEST_METADATA = {
    id: TEST_WORKSPACE_ID,
    name: "demo-branch",
    projectName: "Demo",
    projectPath: TEST_PROJECT_PATH,
    namedWorkspacePath: "/worktrees/demo/demo-branch",
    runtimeConfig: { type: "local", srcBaseDir: "/home/user/.mux/src" },
    createdAt: "2025-01-01T00:00:00.000Z",
};
describe("useCreationWorkspace", () => {
    beforeEach(() => {
        persistedPreferences = {};
        readPersistedStateCalls.length = 0;
        updatePersistedStateCalls.length = 0;
        draftSettingsInvocations = [];
        draftSettingsState = createDraftSettingsHarness();
    });
    afterEach(() => {
        cleanup();
        // Reset global window/document/localStorage between tests
        // @ts-expect-error - test cleanup
        globalThis.window = undefined;
        // @ts-expect-error - test cleanup
        globalThis.document = undefined;
        // @ts-expect-error - test cleanup
        globalThis.localStorage = undefined;
    });
    test("loads branches when projectPath is provided", async () => {
        const listBranchesMock = mock(() => Promise.resolve({
            branches: ["main", "dev"],
            recommendedTrunk: "dev",
        }));
        const { projectsApi } = setupWindow({ listBranches: listBranchesMock });
        const onWorkspaceCreated = mock((metadata) => metadata);
        const getHook = renderUseCreationWorkspace({
            projectPath: TEST_PROJECT_PATH,
            onWorkspaceCreated,
        });
        await waitFor(() => expect(projectsApi.listBranches.mock.calls.length).toBe(1));
        // ORPC uses object argument
        expect(projectsApi.listBranches.mock.calls[0][0]).toEqual({ projectPath: TEST_PROJECT_PATH });
        await waitFor(() => expect(getHook().branches).toEqual(["main", "dev"]));
        expect(draftSettingsInvocations[0]).toEqual({
            projectPath: TEST_PROJECT_PATH,
            branches: [],
            recommendedTrunk: null,
        });
        expect(draftSettingsInvocations.at(-1)).toEqual({
            projectPath: TEST_PROJECT_PATH,
            branches: ["main", "dev"],
            recommendedTrunk: "dev",
        });
        expect(getHook().trunkBranch).toBe(draftSettingsState.state.trunkBranch);
    });
    test("does not load branches when projectPath is empty", async () => {
        const listBranchesMock = mock(() => Promise.resolve({
            branches: ["main"],
            recommendedTrunk: "main",
        }));
        setupWindow({ listBranches: listBranchesMock });
        const onWorkspaceCreated = mock((metadata) => metadata);
        const getHook = renderUseCreationWorkspace({
            projectPath: "",
            onWorkspaceCreated,
        });
        await waitFor(() => expect(draftSettingsInvocations.length).toBeGreaterThan(0));
        expect(listBranchesMock.mock.calls.length).toBe(0);
        expect(getHook().branches).toEqual([]);
    });
    test("handleSend creates workspace and sends message on success", async () => {
        const listBranchesMock = mock(() => Promise.resolve({
            branches: ["main"],
            recommendedTrunk: "main",
        }));
        const sendMessageMock = mock((_args) => Promise.resolve({
            success: true,
            data: {},
        }));
        const createMock = mock((_args) => Promise.resolve({
            success: true,
            metadata: TEST_METADATA,
        }));
        const nameGenerationMock = mock((_args) => Promise.resolve({
            success: true,
            data: { name: "generated-name", modelUsed: "anthropic:claude-haiku-4-5" },
        }));
        const { workspaceApi, nameGenerationApi } = setupWindow({
            listBranches: listBranchesMock,
            sendMessage: sendMessageMock,
            create: createMock,
            nameGeneration: nameGenerationMock,
        });
        persistedPreferences[getAgentIdKey(getProjectScopeId(TEST_PROJECT_PATH))] = "plan";
        // Set model preference for the project scope (read by getSendOptionsFromStorage)
        persistedPreferences[getModelKey(getProjectScopeId(TEST_PROJECT_PATH))] = "gpt-4";
        draftSettingsState = createDraftSettingsHarness({
            selectedRuntime: { mode: "ssh", host: "example.com" },
            runtimeString: "ssh example.com",
            trunkBranch: "dev",
        });
        const onWorkspaceCreated = mock((metadata) => metadata);
        const getHook = renderUseCreationWorkspace({
            projectPath: TEST_PROJECT_PATH,
            onWorkspaceCreated,
            message: "launch workspace",
        });
        await waitFor(() => expect(getHook().branches).toEqual(["main"]));
        // Wait for name generation to trigger (happens on debounce)
        await waitFor(() => expect(nameGenerationApi.generate.mock.calls.length).toBe(1));
        let handleSendResult;
        await act(async () => {
            handleSendResult = await getHook().handleSend("launch workspace");
        });
        expect(handleSendResult).toEqual({ success: true });
        // workspace.create should be called with the generated name
        expect(workspaceApi.create.mock.calls.length).toBe(1);
        const createCall = workspaceApi.create.mock.calls[0];
        if (!createCall) {
            throw new Error("Expected workspace.create to be called at least once");
        }
        const [createRequest] = createCall;
        expect(createRequest?.branchName).toBe("generated-name");
        expect(createRequest?.trunkBranch).toBe("dev");
        expect(createRequest?.runtimeConfig).toEqual({
            type: "ssh",
            host: "example.com",
            srcBaseDir: "~/mux",
        });
        // workspace.sendMessage should be called with the created workspace ID
        expect(workspaceApi.sendMessage.mock.calls.length).toBe(1);
        const sendCall = workspaceApi.sendMessage.mock.calls[0];
        if (!sendCall) {
            throw new Error("Expected workspace.sendMessage to be called at least once");
        }
        const [sendRequest] = sendCall;
        expect(sendRequest?.workspaceId).toBe(TEST_WORKSPACE_ID);
        expect(sendRequest?.message).toBe("launch workspace");
        await waitFor(() => expect(onWorkspaceCreated.mock.calls.length).toBe(1));
        expect(onWorkspaceCreated.mock.calls[0][0]).toEqual(TEST_METADATA);
        const pendingScopeId = getPendingScopeId(TEST_PROJECT_PATH);
        const pendingInputKey = getInputKey(pendingScopeId);
        const pendingImagesKey = getInputAttachmentsKey(pendingScopeId);
        // Thinking is workspace-scoped, but this test doesn't set a project-scoped thinking preference.
        expect(updatePersistedStateCalls).toContainEqual([pendingInputKey, ""]);
        expect(updatePersistedStateCalls).toContainEqual([pendingImagesKey, undefined]);
    });
    test("handleSend returns failure when sendMessage fails and clears draft", async () => {
        const listBranchesMock = mock(() => Promise.resolve({
            branches: ["main"],
            recommendedTrunk: "main",
        }));
        const sendError = { type: "api_key_not_found", provider: "openai" };
        const sendMessageMock = mock((_args) => Promise.resolve({
            success: false,
            error: sendError,
        }));
        const createMock = mock((_args) => Promise.resolve({
            success: true,
            metadata: TEST_METADATA,
        }));
        const nameGenerationMock = mock((_args) => Promise.resolve({
            success: true,
            data: { name: "generated-name", modelUsed: "anthropic:claude-haiku-4-5" },
        }));
        setupWindow({
            listBranches: listBranchesMock,
            sendMessage: sendMessageMock,
            create: createMock,
            nameGeneration: nameGenerationMock,
        });
        draftSettingsState = createDraftSettingsHarness({ trunkBranch: "main" });
        const onWorkspaceCreated = mock((metadata) => metadata);
        const getHook = renderUseCreationWorkspace({
            projectPath: TEST_PROJECT_PATH,
            onWorkspaceCreated,
            message: "test message",
        });
        await waitFor(() => expect(getHook().branches).toEqual(["main"]));
        let handleSendResult;
        await act(async () => {
            handleSendResult = await getHook().handleSend("test message");
        });
        expect(handleSendResult).toEqual({ success: false, error: sendError });
        expect(onWorkspaceCreated.mock.calls.length).toBe(1);
        const pendingScopeId = getPendingScopeId(TEST_PROJECT_PATH);
        const pendingInputKey = getInputKey(pendingScopeId);
        const pendingImagesKey = getInputAttachmentsKey(pendingScopeId);
        const pendingErrorKey = getPendingWorkspaceSendErrorKey(TEST_WORKSPACE_ID);
        expect(updatePersistedStateCalls).toContainEqual([pendingInputKey, ""]);
        expect(updatePersistedStateCalls).toContainEqual([pendingImagesKey, undefined]);
        expect(updatePersistedStateCalls).toContainEqual([pendingErrorKey, sendError]);
    });
    test("onWorkspaceCreated is called before sendMessage resolves (no blocking)", async () => {
        // This test ensures we don't regress #1146 - the fix that makes workspace creation
        // navigate immediately without waiting for sendMessage to complete.
        // Regression occurred in #1896 when sendMessage became awaited again.
        const listBranchesMock = mock(() => Promise.resolve({
            branches: ["main"],
            recommendedTrunk: "main",
        }));
        let resolveSend;
        const sendMessageMock = mock((_args) => new Promise((resolve) => {
            resolveSend = resolve;
        }));
        const createMock = mock((_args) => Promise.resolve({
            success: true,
            metadata: TEST_METADATA,
        }));
        const nameGenerationMock = mock((_args) => Promise.resolve({
            success: true,
            data: { name: "generated-name", modelUsed: "anthropic:claude-haiku-4-5" },
        }));
        setupWindow({
            listBranches: listBranchesMock,
            sendMessage: sendMessageMock,
            create: createMock,
            nameGeneration: nameGenerationMock,
        });
        draftSettingsState = createDraftSettingsHarness({ trunkBranch: "main" });
        const onWorkspaceCreated = mock((metadata) => metadata);
        const getHook = renderUseCreationWorkspace({
            projectPath: TEST_PROJECT_PATH,
            onWorkspaceCreated,
            message: "test message",
        });
        await waitFor(() => expect(getHook().branches).toEqual(["main"]));
        let handleSendPromise;
        act(() => {
            handleSendPromise = getHook().handleSend("test message");
        });
        await waitFor(() => expect(onWorkspaceCreated.mock.calls.length).toBe(1));
        expect(onWorkspaceCreated.mock.calls[0][0]).toEqual(TEST_METADATA);
        resolveSend({ success: true, data: {} });
        const handleSendResult = await handleSendPromise;
        expect(handleSendResult).toEqual({ success: true });
    });
    test("handleSend surfaces backend errors and resets state", async () => {
        const createMock = mock((_args) => Promise.resolve({
            success: false,
            error: "backend exploded",
        }));
        const nameGenerationMock = mock((_args) => Promise.resolve({
            success: true,
            data: { name: "test-name", modelUsed: "anthropic:claude-haiku-4-5" },
        }));
        const { workspaceApi, nameGenerationApi } = setupWindow({
            create: createMock,
            nameGeneration: nameGenerationMock,
        });
        draftSettingsState = createDraftSettingsHarness({ trunkBranch: "dev" });
        const onWorkspaceCreated = mock((metadata) => metadata);
        const getHook = renderUseCreationWorkspace({
            projectPath: TEST_PROJECT_PATH,
            onWorkspaceCreated,
            message: "make workspace",
        });
        // Wait for name generation to trigger
        await waitFor(() => expect(nameGenerationApi.generate.mock.calls.length).toBe(1));
        await act(async () => {
            await getHook().handleSend("make workspace");
        });
        expect(workspaceApi.create.mock.calls.length).toBe(1);
        expect(onWorkspaceCreated.mock.calls.length).toBe(0);
        await waitFor(() => expect(getHook().toast?.message).toBe("backend exploded"));
        await waitFor(() => expect(getHook().isSending).toBe(false));
        // Side effect: send-options reader may migrate thinking level into the project scope.
        const thinkingKey = getThinkingLevelKey(getProjectScopeId(TEST_PROJECT_PATH));
        if (updatePersistedStateCalls.length > 0) {
            expect(updatePersistedStateCalls).toEqual([[thinkingKey, "off"]]);
        }
    });
});
function createDraftSettingsHarness(initial) {
    const state = {
        selectedRuntime: initial?.selectedRuntime ?? { mode: "local" },
        defaultRuntimeMode: initial?.defaultRuntimeMode ?? "worktree",
        trunkBranch: initial?.trunkBranch ?? "main",
        runtimeString: initial?.runtimeString,
        coderConfigFallback: initial?.coderConfigFallback ?? { existingWorkspace: false },
        sshHostFallback: initial?.sshHostFallback ?? "",
    };
    const setTrunkBranch = mock((branch) => {
        state.trunkBranch = branch;
    });
    const getRuntimeString = mock(() => state.runtimeString);
    const setSelectedRuntime = mock((runtime) => {
        state.selectedRuntime = runtime;
        if (runtime.mode === "ssh") {
            state.runtimeString = runtime.host ? `ssh ${runtime.host}` : "ssh";
        }
        else if (runtime.mode === "docker") {
            state.runtimeString = runtime.image ? `docker ${runtime.image}` : "docker";
        }
        else {
            state.runtimeString = undefined;
        }
    });
    const setDefaultRuntimeChoice = mock((choice) => {
        state.defaultRuntimeMode = choice;
        // Update selected runtime to match new default
        if (choice === "coder") {
            state.selectedRuntime = {
                mode: "ssh",
                host: CODER_RUNTIME_PLACEHOLDER,
                coder: { existingWorkspace: false },
            };
            state.runtimeString = `ssh ${CODER_RUNTIME_PLACEHOLDER}`;
            return;
        }
        if (choice === "ssh") {
            const host = state.selectedRuntime.mode === "ssh" ? state.selectedRuntime.host : "";
            state.selectedRuntime = { mode: "ssh", host };
            state.runtimeString = host ? `ssh ${host}` : "ssh";
        }
        else if (choice === "docker") {
            const image = state.selectedRuntime.mode === "docker" ? state.selectedRuntime.image : "";
            state.selectedRuntime = { mode: "docker", image };
            state.runtimeString = image ? `docker ${image}` : "docker";
        }
        else if (choice === "local") {
            state.selectedRuntime = { mode: "local" };
            state.runtimeString = undefined;
        }
        else {
            state.selectedRuntime = { mode: "worktree" };
            state.runtimeString = undefined;
        }
    });
    return {
        state,
        setSelectedRuntime,
        setDefaultRuntimeChoice,
        setTrunkBranch,
        getRuntimeString,
        snapshot() {
            const settings = {
                model: "gpt-4",
                thinkingLevel: "medium",
                agentId: "exec",
                selectedRuntime: state.selectedRuntime,
                defaultRuntimeMode: state.defaultRuntimeMode,
                trunkBranch: state.trunkBranch,
            };
            return {
                settings,
                coderConfigFallback: state.coderConfigFallback,
                sshHostFallback: state.sshHostFallback,
                setSelectedRuntime,
                setDefaultRuntimeChoice,
                setTrunkBranch,
                getRuntimeString,
            };
        },
    };
}
function renderUseCreationWorkspace(options) {
    const resultRef = { current: null };
    function Harness(props) {
        resultRef.current = useCreationWorkspace({
            ...props,
            message: props.message ?? "",
        });
        return null;
    }
    render(_jsx(Harness, { ...options }));
    return () => {
        if (!resultRef.current) {
            throw new Error("Hook result not initialized");
        }
        return resultRef.current;
    };
}
//# sourceMappingURL=useCreationWorkspace.test.js.map