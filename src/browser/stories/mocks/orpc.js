import { DEFAULT_LAYOUT_PRESETS_CONFIG, normalizeLayoutPresetsConfig, } from "@/common/types/uiLayouts";
import { MUX_HELP_CHAT_AGENT_ID, MUX_HELP_CHAT_WORKSPACE_ID, MUX_HELP_CHAT_WORKSPACE_NAME, MUX_HELP_CHAT_WORKSPACE_TITLE, } from "@/common/constants/muxChat";
import { DEFAULT_RUNTIME_CONFIG } from "@/common/constants/workspace";
import { DEFAULT_TASK_SETTINGS, normalizeSubagentAiDefaults, normalizeTaskSettings, } from "@/common/types/tasks";
import { normalizeAgentAiDefaults } from "@/common/types/agentAiDefaults";
import { createAsyncMessageQueue } from "@/common/utils/asyncMessageQueue";
import { isWorkspaceArchived } from "@/common/utils/archive";
/**
 * Creates a mock ORPC client for Storybook.
 *
 * Usage:
 * ```tsx
 * const client = createMockORPCClient({
 *   projects: new Map([...]),
 *   workspaces: [...],
 *   onChat: (wsId, emit) => {
 *     emit({ type: "caught-up" });
 *     // optionally return cleanup function
 *   },
 * });
 *
 * return <AppLoader client={client} />;
 * ```
 */
export function createMockORPCClient(options = {}) {
    const { projects = new Map(), workspaces: inputWorkspaces = [], onChat, executeBash, providersConfig = { anthropic: { apiKeySet: true, isEnabled: true, isConfigured: true } }, providersList = [], onProjectRemove, backgroundProcesses = new Map(), sessionUsage = new Map(), lastLlmRequestSnapshots = new Map(), subagentTranscripts = new Map(), workspaceStatsSnapshots = new Map(), statsTabVariant = "control", globalSecrets = [], projectSecrets = new Map(), globalMcpServers = {}, mcpServers = new Map(), mcpOverrides = new Map(), mcpTestResults = new Map(), mcpOauthAuthStatus = new Map(), taskSettings: initialTaskSettings, subagentAiDefaults: initialSubagentAiDefaults, agentAiDefaults: initialAgentAiDefaults, stopCoderWorkspaceOnArchive: initialStopCoderWorkspaceOnArchive = true, agentDefinitions: initialAgentDefinitions, listBranches: customListBranches, gitInit: customGitInit, runtimeAvailability: customRuntimeAvailability, signingCapabilities: customSigningCapabilities, coderInfo = { state: "unavailable", reason: "missing" }, coderTemplates = [], coderPresets = new Map(), coderWorkspaces = [], coderTemplatesResult, coderPresetsResult = new Map(), coderWorkspacesResult, layoutPresets: initialLayoutPresets, agentSkills = [], invalidAgentSkills = [], muxGovernorUrl = null, muxGovernorEnrolled = false, policyResponse = {
        source: "none",
        status: { state: "disabled" },
        policy: null,
    }, logEntries = [], clearLogsResult = { success: true, error: null }, } = options;
    // Feature flags
    let statsTabOverride = "default";
    const getStatsTabState = () => {
        // Stats tab is default-on; keep override as a local kill switch.
        const enabled = statsTabOverride !== "off";
        return { enabled, variant: statsTabVariant, override: statsTabOverride };
    };
    // App now boots into the built-in mux-chat workspace by default.
    // Ensure Storybook mocks always include it so stories don't render "Workspace not found".
    const muxChatWorkspace = {
        id: MUX_HELP_CHAT_WORKSPACE_ID,
        name: MUX_HELP_CHAT_WORKSPACE_NAME,
        title: MUX_HELP_CHAT_WORKSPACE_TITLE,
        projectName: "Mux",
        projectPath: "/Users/dev/.mux/system/chat-with-mux",
        namedWorkspacePath: "/Users/dev/.mux/system/chat-with-mux",
        runtimeConfig: { type: "local" },
        agentId: MUX_HELP_CHAT_AGENT_ID,
    };
    const workspaces = inputWorkspaces.some((w) => w.id === MUX_HELP_CHAT_WORKSPACE_ID)
        ? inputWorkspaces
        : [muxChatWorkspace, ...inputWorkspaces];
    const workspaceMap = new Map(workspaces.map((w) => [w.id, w]));
    let createdWorkspaceCounter = 0;
    const agentDefinitions = initialAgentDefinitions ??
        [
            {
                id: "plan",
                scope: "built-in",
                name: "Plan",
                description: "Create a plan before coding",
                uiSelectable: true,
                subagentRunnable: false,
                base: "plan",
                uiColor: "var(--color-plan-mode)",
            },
            {
                id: "exec",
                scope: "built-in",
                name: "Exec",
                description: "Implement changes in the repository",
                uiSelectable: true,
                subagentRunnable: true,
                uiColor: "var(--color-exec-mode)",
            },
            {
                id: "compact",
                scope: "built-in",
                name: "Compact",
                description: "History compaction (internal)",
                uiSelectable: false,
                subagentRunnable: false,
            },
            {
                id: "explore",
                scope: "built-in",
                name: "Explore",
                description: "Read-only repository exploration",
                uiSelectable: false,
                subagentRunnable: true,
                base: "exec",
            },
            {
                id: "mux",
                scope: "built-in",
                name: "Mux",
                description: "Configure mux global behavior (system workspace)",
                uiSelectable: false,
                subagentRunnable: false,
            },
        ];
    let taskSettings = normalizeTaskSettings(initialTaskSettings ?? DEFAULT_TASK_SETTINGS);
    let agentAiDefaults = normalizeAgentAiDefaults(initialAgentAiDefaults ?? { ...(initialSubagentAiDefaults ?? {}) });
    let muxGatewayEnabled = undefined;
    let muxGatewayModels = undefined;
    let stopCoderWorkspaceOnArchive = initialStopCoderWorkspaceOnArchive;
    let globalSecretsState = [...globalSecrets];
    const globalMcpServersState = { ...globalMcpServers };
    const deriveSubagentAiDefaults = () => {
        const raw = {};
        for (const [agentId, entry] of Object.entries(agentAiDefaults)) {
            if (agentId === "plan" || agentId === "exec" || agentId === "compact") {
                continue;
            }
            raw[agentId] = entry;
        }
        return normalizeSubagentAiDefaults(raw);
    };
    let layoutPresets = initialLayoutPresets ?? DEFAULT_LAYOUT_PRESETS_CONFIG;
    let subagentAiDefaults = deriveSubagentAiDefaults();
    const mockStats = {
        consumers: [],
        totalTokens: 0,
        model: "mock-model",
        tokenizerName: "mock-tokenizer",
        usageHistory: [],
    };
    // MCP OAuth mock state (used by Settings → MCP OAuth UI)
    let mcpOauthFlowCounter = 0;
    const mcpOauthFlows = new Map();
    const getMcpServerUrl = (projectPath, serverName) => {
        const server = mcpServers.get(projectPath)?.[serverName] ?? globalMcpServersState[serverName];
        if (!server || server.transport === "stdio") {
            return undefined;
        }
        return server.url;
    };
    const getMcpOauthStatus = (projectPath, serverName) => {
        const serverUrl = getMcpServerUrl(projectPath, serverName);
        const status = serverUrl ? mcpOauthAuthStatus.get(serverUrl) : undefined;
        if (status) {
            return {
                ...status,
                // Prefer the stored serverUrl, but fall back to current config (helps stories stay minimal).
                serverUrl: status.serverUrl ?? serverUrl,
            };
        }
        return {
            serverUrl,
            isLoggedIn: false,
            hasRefreshToken: false,
        };
    };
    // Cast to ORPCClient - TypeScript can't fully validate the proxy structure
    return {
        tokenizer: {
            countTokens: () => Promise.resolve(0),
            countTokensBatch: (_input) => Promise.resolve(_input.texts.map(() => 0)),
            calculateStats: () => Promise.resolve(mockStats),
        },
        features: {
            getStatsTabState: () => Promise.resolve(getStatsTabState()),
            setStatsTabOverride: (input) => {
                statsTabOverride = input.override;
                return Promise.resolve(getStatsTabState());
            },
        },
        telemetry: {
            track: () => Promise.resolve(undefined),
            status: () => Promise.resolve({ enabled: true, explicit: false }),
        },
        splashScreens: {
            getViewedSplashScreens: () => Promise.resolve(["onboarding-wizard-v1"]),
            markSplashScreenViewed: () => Promise.resolve(undefined),
        },
        signing: {
            capabilities: () => Promise.resolve(customSigningCapabilities ?? {
                publicKey: "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIMockKey",
                githubUser: "mockuser",
                error: null,
            }),
            sign: () => Promise.resolve({
                signature: "mockSignature==",
                publicKey: "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIMockKey",
                githubUser: "mockuser",
            }),
            clearIdentityCache: () => Promise.resolve({ success: true }),
        },
        server: {
            getLaunchProject: () => Promise.resolve(null),
            getSshHost: () => Promise.resolve(null),
            setSshHost: () => Promise.resolve(undefined),
        },
        // Settings → Layouts (layout presets)
        // Stored in-memory for Storybook only.
        // Frontend code normalizes the response defensively, but we normalize here too so
        // stories remain stable even if they mutate the config.
        uiLayouts: {
            getAll: () => Promise.resolve(layoutPresets),
            saveAll: (input) => {
                layoutPresets = normalizeLayoutPresetsConfig(input.layoutPresets);
                return Promise.resolve(undefined);
            },
        },
        config: {
            getConfig: () => Promise.resolve({
                taskSettings,
                muxGatewayEnabled,
                muxGatewayModels,
                stopCoderWorkspaceOnArchive,
                agentAiDefaults,
                subagentAiDefaults,
                muxGovernorUrl,
                muxGovernorEnrolled,
            }),
            saveConfig: (input) => {
                taskSettings = normalizeTaskSettings(input.taskSettings);
                if (input.agentAiDefaults !== undefined) {
                    agentAiDefaults = normalizeAgentAiDefaults(input.agentAiDefaults);
                    subagentAiDefaults = deriveSubagentAiDefaults();
                }
                if (input.subagentAiDefaults !== undefined) {
                    subagentAiDefaults = normalizeSubagentAiDefaults(input.subagentAiDefaults);
                    const nextAgentAiDefaults = { ...agentAiDefaults };
                    for (const [agentType, entry] of Object.entries(subagentAiDefaults)) {
                        nextAgentAiDefaults[agentType] = entry;
                    }
                    agentAiDefaults = normalizeAgentAiDefaults(nextAgentAiDefaults);
                }
                return Promise.resolve(undefined);
            },
            updateAgentAiDefaults: (input) => {
                agentAiDefaults = normalizeAgentAiDefaults(input.agentAiDefaults);
                subagentAiDefaults = deriveSubagentAiDefaults();
                return Promise.resolve(undefined);
            },
            updateMuxGatewayPrefs: (input) => {
                muxGatewayEnabled = input.muxGatewayEnabled ? undefined : false;
                muxGatewayModels = input.muxGatewayModels.length > 0 ? input.muxGatewayModels : undefined;
                return Promise.resolve(undefined);
            },
            updateCoderPrefs: (input) => {
                stopCoderWorkspaceOnArchive = input.stopCoderWorkspaceOnArchive;
                return Promise.resolve(undefined);
            },
            unenrollMuxGovernor: () => Promise.resolve(undefined),
        },
        agents: {
            list: (_input) => Promise.resolve(agentDefinitions),
            get: (input) => {
                const descriptor = agentDefinitions.find((agent) => agent.id === input.agentId) ?? agentDefinitions[0];
                const agentPackage = {
                    id: descriptor.id,
                    scope: descriptor.scope,
                    frontmatter: {
                        name: descriptor.name,
                        description: descriptor.description,
                        base: descriptor.base,
                        ui: { selectable: descriptor.uiSelectable },
                        subagent: { runnable: descriptor.subagentRunnable },
                        ai: descriptor.aiDefaults,
                        tools: descriptor.tools,
                    },
                    body: "",
                };
                return Promise.resolve(agentPackage);
            },
        },
        agentSkills: {
            list: () => Promise.resolve(agentSkills),
            listDiagnostics: () => Promise.resolve({ skills: agentSkills, invalidSkills: invalidAgentSkills }),
            get: () => Promise.resolve({
                scope: "built-in",
                directoryName: "mock-skill",
                frontmatter: { name: "mock-skill", description: "Mock skill" },
                body: "",
            }),
        },
        providers: {
            list: () => Promise.resolve(providersList),
            getConfig: () => Promise.resolve(providersConfig),
            setProviderConfig: () => Promise.resolve({ success: true, data: undefined }),
            setModels: () => Promise.resolve({ success: true, data: undefined }),
        },
        muxGateway: {
            getAccountStatus: () => Promise.resolve({
                success: true,
                data: {
                    remaining_microdollars: 134598127,
                    ai_gateway_concurrent_requests_per_user: 20,
                },
            }),
        },
        general: {
            listDirectory: () => Promise.resolve({ entries: [], hasMore: false }),
            ping: (input) => Promise.resolve(`Pong: ${input}`),
            tick: async function* () {
                // No ticks in the mock, but keep the subscription open.
                yield* [];
                await new Promise(() => undefined);
            },
            subscribeLogs: async function* (input) {
                const LOG_LEVEL_PRIORITY = {
                    error: 0,
                    warn: 1,
                    info: 2,
                    debug: 3,
                };
                const minPriority = input.level != null ? (LOG_LEVEL_PRIORITY[input.level] ?? 3) : 3;
                const filtered = logEntries.filter((entry) => (LOG_LEVEL_PRIORITY[entry.level] ?? 3) <= minPriority);
                yield { type: "snapshot", epoch: 1, entries: filtered };
                await new Promise(() => undefined);
            },
            clearLogs: () => Promise.resolve(clearLogsResult),
        },
        secrets: {
            get: (input) => {
                const projectPath = typeof input?.projectPath === "string" ? input.projectPath.trim() : "";
                if (projectPath) {
                    return Promise.resolve(projectSecrets.get(projectPath) ?? []);
                }
                return Promise.resolve(globalSecretsState);
            },
            update: (input) => {
                const projectPath = typeof input.projectPath === "string" ? input.projectPath.trim() : "";
                if (projectPath) {
                    projectSecrets.set(projectPath, input.secrets);
                }
                else {
                    globalSecretsState = input.secrets;
                }
                return Promise.resolve({ success: true, data: undefined });
            },
        },
        mcp: {
            list: (input) => {
                const projectPath = typeof input?.projectPath === "string" ? input.projectPath.trim() : "";
                if (projectPath) {
                    return Promise.resolve(mcpServers.get(projectPath) ?? globalMcpServersState);
                }
                return Promise.resolve(globalMcpServersState);
            },
            add: (input) => {
                const transport = input.transport ?? "stdio";
                if (transport === "stdio") {
                    globalMcpServersState[input.name] = {
                        transport: "stdio",
                        command: input.command ?? "",
                        disabled: false,
                    };
                }
                else {
                    globalMcpServersState[input.name] = {
                        transport,
                        url: input.url ?? "",
                        headers: input.headers,
                        disabled: false,
                    };
                }
                return Promise.resolve({ success: true, data: undefined });
            },
            remove: (input) => {
                delete globalMcpServersState[input.name];
                return Promise.resolve({ success: true, data: undefined });
            },
            test: (input) => {
                if (input.name && mcpTestResults.has(input.name)) {
                    return Promise.resolve(mcpTestResults.get(input.name));
                }
                // Default: return empty tools.
                return Promise.resolve({ success: true, tools: [] });
            },
            setEnabled: (input) => {
                const server = globalMcpServersState[input.name];
                if (server) {
                    const disabled = !input.enabled;
                    if (server.transport === "stdio") {
                        globalMcpServersState[input.name] = { ...server, disabled };
                    }
                    else {
                        globalMcpServersState[input.name] = { ...server, disabled };
                    }
                }
                return Promise.resolve({ success: true, data: undefined });
            },
            setToolAllowlist: (input) => {
                const server = globalMcpServersState[input.name];
                if (server) {
                    if (server.transport === "stdio") {
                        globalMcpServersState[input.name] = { ...server, toolAllowlist: input.toolAllowlist };
                    }
                    else {
                        globalMcpServersState[input.name] = { ...server, toolAllowlist: input.toolAllowlist };
                    }
                }
                return Promise.resolve({ success: true, data: undefined });
            },
        },
        mcpOauth: {
            getAuthStatus: (input) => {
                const status = mcpOauthAuthStatus.get(input.serverUrl);
                return Promise.resolve(status ?? {
                    serverUrl: input.serverUrl,
                    isLoggedIn: false,
                    hasRefreshToken: false,
                });
            },
            startDesktopFlow: (input) => {
                mcpOauthFlowCounter += 1;
                const flowId = `mock-mcp-oauth-flow-${mcpOauthFlowCounter}`;
                mcpOauthFlows.set(flowId, {
                    projectPath: input.projectPath ?? "",
                    serverName: input.serverName,
                    pendingServerUrl: input.pendingServer?.url,
                });
                return Promise.resolve({
                    success: true,
                    data: {
                        flowId,
                        authorizeUrl: `https://example.com/oauth/authorize?flowId=${encodeURIComponent(flowId)}`,
                        redirectUri: "mux://oauth/callback",
                    },
                });
            },
            waitForDesktopFlow: (input) => {
                const flow = mcpOauthFlows.get(input.flowId);
                if (!flow) {
                    return Promise.resolve({ success: false, error: "OAuth flow not found." });
                }
                mcpOauthFlows.delete(input.flowId);
                const serverUrl = flow.pendingServerUrl ?? getMcpServerUrl(flow.projectPath, flow.serverName);
                if (serverUrl) {
                    mcpOauthAuthStatus.set(serverUrl, {
                        serverUrl,
                        isLoggedIn: true,
                        hasRefreshToken: true,
                        updatedAtMs: Date.now(),
                    });
                }
                return Promise.resolve({ success: true, data: undefined });
            },
            cancelDesktopFlow: (input) => {
                mcpOauthFlows.delete(input.flowId);
                return Promise.resolve(undefined);
            },
            startServerFlow: (input) => {
                mcpOauthFlowCounter += 1;
                const flowId = `mock-mcp-oauth-flow-${mcpOauthFlowCounter}`;
                mcpOauthFlows.set(flowId, {
                    projectPath: input.projectPath ?? "",
                    serverName: input.serverName,
                    pendingServerUrl: input.pendingServer?.url,
                });
                return Promise.resolve({
                    success: true,
                    data: {
                        flowId,
                        authorizeUrl: `https://example.com/oauth/authorize?flowId=${encodeURIComponent(flowId)}`,
                        redirectUri: "mux://oauth/callback",
                    },
                });
            },
            waitForServerFlow: (input) => {
                const flow = mcpOauthFlows.get(input.flowId);
                if (!flow) {
                    return Promise.resolve({ success: false, error: "OAuth flow not found." });
                }
                mcpOauthFlows.delete(input.flowId);
                const serverUrl = flow.pendingServerUrl ?? getMcpServerUrl(flow.projectPath, flow.serverName);
                if (serverUrl) {
                    mcpOauthAuthStatus.set(serverUrl, {
                        serverUrl,
                        isLoggedIn: true,
                        hasRefreshToken: true,
                        updatedAtMs: Date.now(),
                    });
                }
                return Promise.resolve({ success: true, data: undefined });
            },
            cancelServerFlow: (input) => {
                mcpOauthFlows.delete(input.flowId);
                return Promise.resolve(undefined);
            },
            logout: (input) => {
                mcpOauthAuthStatus.set(input.serverUrl, {
                    serverUrl: input.serverUrl,
                    isLoggedIn: false,
                    hasRefreshToken: false,
                    updatedAtMs: Date.now(),
                });
                return Promise.resolve({ success: true, data: undefined });
            },
        },
        projects: {
            list: () => Promise.resolve(Array.from(projects.entries())),
            create: () => Promise.resolve({
                success: true,
                data: { projectConfig: { workspaces: [] }, normalizedPath: "/mock/project" },
            }),
            pickDirectory: () => Promise.resolve(null),
            getDefaultProjectDir: () => Promise.resolve("~/.mux/projects"),
            setDefaultProjectDir: () => Promise.resolve(),
            clone: () => Promise.resolve((function* () {
                yield {
                    type: "progress",
                    line: "Cloning into '/mock/cloned-project'...\n",
                };
                yield {
                    type: "success",
                    projectConfig: { workspaces: [] },
                    normalizedPath: "/mock/cloned-project",
                };
            })()),
            listBranches: (input) => {
                if (customListBranches) {
                    return customListBranches(input);
                }
                return Promise.resolve({
                    branches: ["main", "develop", "feature/new-feature"],
                    recommendedTrunk: "main",
                });
            },
            runtimeAvailability: () => Promise.resolve(customRuntimeAvailability ?? {
                local: { available: true },
                worktree: { available: true },
                ssh: { available: true },
                docker: { available: true },
                devcontainer: { available: false, reason: "No devcontainer.json found" },
            }),
            gitInit: (input) => {
                if (customGitInit) {
                    return customGitInit(input);
                }
                return Promise.resolve({ success: true });
            },
            remove: (input) => {
                if (onProjectRemove) {
                    return Promise.resolve(onProjectRemove(input.projectPath));
                }
                return Promise.resolve({ success: true, data: undefined });
            },
            secrets: {
                get: (input) => Promise.resolve(projectSecrets.get(input.projectPath) ?? []),
                update: (input) => {
                    projectSecrets.set(input.projectPath, input.secrets);
                    return Promise.resolve({ success: true, data: undefined });
                },
            },
            mcp: {
                list: (input) => Promise.resolve(mcpServers.get(input.projectPath) ?? {}),
                add: () => Promise.resolve({ success: true, data: undefined }),
                remove: () => Promise.resolve({ success: true, data: undefined }),
                test: (input) => {
                    if (input.name && mcpTestResults.has(input.name)) {
                        return Promise.resolve(mcpTestResults.get(input.name));
                    }
                    // Default: return empty tools
                    return Promise.resolve({ success: true, tools: [] });
                },
                setEnabled: () => Promise.resolve({ success: true, data: undefined }),
                setToolAllowlist: () => Promise.resolve({ success: true, data: undefined }),
            },
            mcpOauth: {
                getAuthStatus: (input) => Promise.resolve(getMcpOauthStatus(input.projectPath, input.serverName)),
                startDesktopFlow: (input) => {
                    mcpOauthFlowCounter += 1;
                    const flowId = `mock-mcp-oauth-flow-${mcpOauthFlowCounter}`;
                    mcpOauthFlows.set(flowId, {
                        projectPath: input.projectPath,
                        serverName: input.serverName,
                    });
                    return Promise.resolve({
                        success: true,
                        data: {
                            flowId,
                            authorizeUrl: `https://example.com/oauth/authorize?flowId=${encodeURIComponent(flowId)}`,
                            redirectUri: "mux://oauth/callback",
                        },
                    });
                },
                waitForDesktopFlow: (input) => {
                    const flow = mcpOauthFlows.get(input.flowId);
                    if (!flow) {
                        return Promise.resolve({ success: false, error: "OAuth flow not found." });
                    }
                    mcpOauthFlows.delete(input.flowId);
                    const serverUrl = getMcpServerUrl(flow.projectPath, flow.serverName);
                    if (serverUrl) {
                        mcpOauthAuthStatus.set(serverUrl, {
                            serverUrl,
                            isLoggedIn: true,
                            hasRefreshToken: true,
                            updatedAtMs: Date.now(),
                        });
                    }
                    return Promise.resolve({ success: true, data: undefined });
                },
                cancelDesktopFlow: (input) => {
                    mcpOauthFlows.delete(input.flowId);
                    return Promise.resolve(undefined);
                },
                logout: (input) => {
                    const serverUrl = getMcpServerUrl(input.projectPath, input.serverName);
                    if (serverUrl) {
                        mcpOauthAuthStatus.set(serverUrl, {
                            serverUrl,
                            isLoggedIn: false,
                            hasRefreshToken: false,
                            updatedAtMs: Date.now(),
                        });
                    }
                    return Promise.resolve({ success: true, data: undefined });
                },
            },
            idleCompaction: {
                get: (input) => Promise.resolve({ hours: options.idleCompactionHours?.get(input.projectPath) ?? null }),
                set: (input) => {
                    if (options.idleCompactionHours) {
                        options.idleCompactionHours.set(input.projectPath, input.hours);
                    }
                    return Promise.resolve({ success: true, data: undefined });
                },
            },
        },
        workspace: {
            list: (input) => {
                if (input?.archived) {
                    return Promise.resolve(workspaces.filter((w) => isWorkspaceArchived(w.archivedAt, w.unarchivedAt)));
                }
                return Promise.resolve(workspaces.filter((w) => !isWorkspaceArchived(w.archivedAt, w.unarchivedAt)));
            },
            archive: () => Promise.resolve({ success: true }),
            unarchive: () => Promise.resolve({ success: true }),
            create: (input) => {
                createdWorkspaceCounter += 1;
                return Promise.resolve({
                    success: true,
                    metadata: {
                        id: `ws-created-${createdWorkspaceCounter}`,
                        name: input.branchName,
                        projectPath: input.projectPath,
                        projectName: input.projectPath.split("/").pop() ?? "project",
                        namedWorkspacePath: `/mock/workspace/${input.branchName}`,
                        runtimeConfig: DEFAULT_RUNTIME_CONFIG,
                    },
                });
            },
            remove: () => Promise.resolve({ success: true }),
            updateAgentAISettings: () => Promise.resolve({ success: true, data: undefined }),
            updateModeAISettings: () => Promise.resolve({ success: true, data: undefined }),
            updateTitle: () => Promise.resolve({ success: true, data: undefined }),
            rename: (input) => Promise.resolve({
                success: true,
                data: { newWorkspaceId: input.workspaceId },
            }),
            fork: () => Promise.resolve({ success: false, error: "Not implemented in mock" }),
            sendMessage: () => Promise.resolve({ success: true, data: undefined }),
            resumeStream: () => Promise.resolve({ success: true, data: undefined }),
            interruptStream: () => Promise.resolve({ success: true, data: undefined }),
            clearQueue: () => Promise.resolve({ success: true, data: undefined }),
            truncateHistory: () => Promise.resolve({ success: true, data: undefined }),
            replaceChatHistory: () => Promise.resolve({ success: true, data: undefined }),
            getInfo: (input) => Promise.resolve(workspaceMap.get(input.workspaceId) ?? null),
            getLastLlmRequest: (input) => Promise.resolve({
                success: true,
                data: lastLlmRequestSnapshots.get(input.workspaceId) ?? null,
            }),
            getSubagentTranscript: (input) => Promise.resolve(subagentTranscripts.get(input.taskId) ?? { messages: [] }),
            executeBash: async (input) => {
                if (executeBash) {
                    const result = await executeBash(input.workspaceId, input.script);
                    return { success: true, data: result };
                }
                return {
                    success: true,
                    data: { success: true, output: "", exitCode: 0, wall_duration_ms: 0 },
                };
            },
            onChat: async function* (input, options) {
                if (!onChat) {
                    // Default mock behavior: subscriptions should remain open.
                    // If this ends, WorkspaceStore will retry and reset state, which flakes stories.
                    const caughtUp = { type: "caught-up" };
                    yield caughtUp;
                    await new Promise((resolve) => {
                        if (options?.signal?.aborted) {
                            resolve();
                            return;
                        }
                        options?.signal?.addEventListener("abort", () => resolve(), { once: true });
                    });
                    return;
                }
                const { push, iterate, end } = createAsyncMessageQueue();
                // Call the user's onChat handler
                const cleanup = onChat(input.workspaceId, push);
                try {
                    yield* iterate();
                }
                finally {
                    end();
                    cleanup?.();
                }
            },
            onMetadata: async function* () {
                // No metadata updates in the mock, but keep the subscription open.
                yield* [];
                await new Promise(() => undefined);
            },
            activity: {
                list: () => Promise.resolve({}),
                subscribe: async function* () {
                    yield* [];
                    await new Promise(() => undefined);
                },
            },
            backgroundBashes: {
                subscribe: async function* (input) {
                    // Yield initial state
                    yield {
                        processes: backgroundProcesses.get(input.workspaceId) ?? [],
                        foregroundToolCallIds: [],
                    };
                    // Then hang forever (like a real subscription)
                    await new Promise(() => undefined);
                },
                terminate: () => Promise.resolve({ success: true, data: undefined }),
                getOutput: () => Promise.resolve({
                    success: true,
                    data: { status: "running", output: "", nextOffset: 0, truncatedStart: false },
                }),
                sendToBackground: () => Promise.resolve({ success: true, data: undefined }),
            },
            stats: {
                subscribe: async function* (input) {
                    const snapshot = workspaceStatsSnapshots.get(input.workspaceId);
                    if (snapshot) {
                        yield snapshot;
                    }
                    await new Promise(() => undefined);
                },
                clear: (input) => {
                    workspaceStatsSnapshots.delete(input.workspaceId);
                    return Promise.resolve({ success: true, data: undefined });
                },
            },
            getSessionUsage: (input) => Promise.resolve(sessionUsage.get(input.workspaceId)),
            getSessionUsageBatch: (input) => {
                const result = {};
                for (const id of input.workspaceIds) {
                    result[id] = sessionUsage.get(id);
                }
                return Promise.resolve(result);
            },
            mcp: {
                get: (input) => Promise.resolve(mcpOverrides.get(input.workspaceId) ?? {}),
                set: () => Promise.resolve({ success: true, data: undefined }),
            },
            getFileCompletions: (input) => {
                // Mock file paths for storybook - simulate typical project structure
                const mockPaths = [
                    "src/browser/components/ChatInput/index.tsx",
                    "src/browser/components/CommandSuggestions.tsx",
                    "src/browser/components/App.tsx",
                    "src/browser/hooks/usePersistedState.ts",
                    "src/browser/contexts/WorkspaceContext.tsx",
                    "src/common/utils/atMentions.ts",
                    "src/common/orpc/types.ts",
                    "src/node/services/workspaceService.ts",
                    "package.json",
                    "tsconfig.json",
                    "README.md",
                ];
                const query = input.query.toLowerCase();
                const filtered = mockPaths.filter((p) => p.toLowerCase().includes(query));
                return Promise.resolve({ paths: filtered.slice(0, input.limit ?? 20) });
            },
        },
        window: {
            setTitle: () => Promise.resolve(undefined),
        },
        coder: {
            getInfo: () => Promise.resolve(coderInfo),
            listTemplates: () => Promise.resolve(coderTemplatesResult ?? { ok: true, templates: coderTemplates }),
            listPresets: (input) => Promise.resolve(coderPresetsResult.get(input.template) ?? {
                ok: true,
                presets: coderPresets.get(input.template) ?? [],
            }),
            listWorkspaces: () => Promise.resolve(coderWorkspacesResult ?? { ok: true, workspaces: coderWorkspaces }),
        },
        nameGeneration: {
            generate: () => Promise.resolve({
                success: true,
                data: { name: "generated-workspace", title: "Generated Workspace", modelUsed: "mock" },
            }),
        },
        terminal: {
            listSessions: (_input) => Promise.resolve([]),
            create: () => Promise.resolve({
                sessionId: "mock-session",
                workspaceId: "mock-workspace",
                cols: 80,
                rows: 24,
            }),
            close: () => Promise.resolve(undefined),
            resize: () => Promise.resolve(undefined),
            sendInput: () => undefined,
            attach: async function* (_input) {
                yield { type: "screenState", data: "" };
                yield* [];
                await new Promise(() => undefined);
            },
            onExit: async function* () {
                yield* [];
                await new Promise(() => undefined);
            },
            openWindow: () => Promise.resolve(undefined),
            closeWindow: () => Promise.resolve(undefined),
            openNative: () => Promise.resolve(undefined),
        },
        update: {
            check: () => Promise.resolve(undefined),
            download: () => Promise.resolve(undefined),
            install: () => Promise.resolve(undefined),
            onStatus: async function* () {
                yield* [];
                await new Promise(() => undefined);
            },
        },
        policy: {
            get: () => Promise.resolve(policyResponse),
            onChanged: async function* () {
                yield* [];
                await new Promise(() => undefined);
            },
            refreshNow: () => Promise.resolve({ success: true, value: policyResponse }),
        },
        muxGovernorOauth: {
            startDesktopFlow: () => Promise.resolve({
                success: true,
                value: {
                    flowId: "mock-flow-id",
                    authorizeUrl: "https://governor.example.com/oauth/authorize",
                    redirectUri: "http://localhost:12345/callback",
                },
            }),
            waitForDesktopFlow: () => 
            // Never resolves - user would complete in browser
            new Promise(() => undefined),
            cancelDesktopFlow: () => Promise.resolve(undefined),
        },
    };
}
//# sourceMappingURL=orpc.js.map