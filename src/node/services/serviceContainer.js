import * as path from "path";
import * as fsPromises from "fs/promises";
import { MUX_HELP_CHAT_AGENT_ID, MUX_HELP_CHAT_WORKSPACE_ID, MUX_HELP_CHAT_WORKSPACE_NAME, MUX_HELP_CHAT_WORKSPACE_TITLE, } from "@/common/constants/muxChat";
import { getMuxHelpChatProjectPath } from "@/node/constants/muxChat";
import { createMuxMessage } from "@/common/types/message";
import { log } from "@/node/services/log";
import { createCoreServices } from "@/node/services/coreServices";
import { PTYService } from "@/node/services/ptyService";
import { ProjectService } from "@/node/services/projectService";
import { MuxGatewayOauthService } from "@/node/services/muxGatewayOauthService";
import { MuxGovernorOauthService } from "@/node/services/muxGovernorOauthService";
import { CodexOauthService } from "@/node/services/codexOauthService";
import { CopilotOauthService } from "@/node/services/copilotOauthService";
import { TerminalService } from "@/node/services/terminalService";
import { EditorService } from "@/node/services/editorService";
import { WindowService } from "@/node/services/windowService";
import { UpdateService } from "@/node/services/updateService";
import { TokenizerService } from "@/node/services/tokenizerService";
import { ServerService } from "@/node/services/serverService";
import { MenuEventService } from "@/node/services/menuEventService";
import { VoiceService } from "@/node/services/voiceService";
import { TelemetryService } from "@/node/services/telemetryService";
import { FeatureFlagService } from "@/node/services/featureFlagService";
import { SessionTimingService } from "@/node/services/sessionTimingService";
import { ExperimentsService } from "@/node/services/experimentsService";
import { WorkspaceMcpOverridesService } from "@/node/services/workspaceMcpOverridesService";
import { McpOauthService } from "@/node/services/mcpOauthService";
import { IdleCompactionService } from "@/node/services/idleCompactionService";
import { getSigningService } from "@/node/services/signingService";
import { coderService } from "@/node/services/coderService";
import { WorkspaceLifecycleHooks } from "@/node/services/workspaceLifecycleHooks";
import { createStartCoderOnUnarchiveHook, createStopCoderOnArchiveHook, } from "@/node/runtime/coderLifecycleHooks";
import { setGlobalCoderService } from "@/node/runtime/runtimeFactory";
import { PolicyService } from "@/node/services/policyService";
const MUX_HELP_CHAT_WELCOME_MESSAGE_ID = "mux-chat-welcome";
const MUX_HELP_CHAT_WELCOME_MESSAGE = `Hi, I'm Mux.

This is your built-in **Chat with Mux** workspace — a safe place to ask questions about Mux itself.

I can help you:
- Configure global agent behavior by editing **~/.mux/AGENTS.md** (I'll show a diff and ask before writing).
- Pick models/providers and explain Mux modes + tool policies.
- Troubleshoot common setup issues (keys, runtimes, workspaces, etc.).

Try asking:
- "What does AGENTS.md do?"
- "Help me write global instructions for code reviews"
- "How do I set up an OpenAI / Anthropic key in Mux?"
`;
/**
 * ServiceContainer - Central dependency container for all backend services.
 *
 * This class instantiates and wires together all services needed by the ORPC router.
 * Services are accessed via the ORPC context object.
 */
export class ServiceContainer {
    constructor(config) {
        this.config = config;
        // Cross-cutting services: created first so they can be passed to core
        // services via constructor params (no setter injection needed).
        this.policyService = new PolicyService(config);
        this.telemetryService = new TelemetryService(config.rootDir);
        this.experimentsService = new ExperimentsService({
            telemetryService: this.telemetryService,
            muxHome: config.rootDir,
        });
        this.sessionTimingService = new SessionTimingService(config, this.telemetryService);
        // Desktop passes WorkspaceMcpOverridesService explicitly so AIService uses
        // the persistent config rather than creating a default with an ephemeral one.
        this.workspaceMcpOverridesService = new WorkspaceMcpOverridesService(config);
        const core = createCoreServices({
            config,
            extensionMetadataPath: path.join(config.rootDir, "extensionMetadata.json"),
            workspaceMcpOverridesService: this.workspaceMcpOverridesService,
            policyService: this.policyService,
            telemetryService: this.telemetryService,
            experimentsService: this.experimentsService,
            sessionTimingService: this.sessionTimingService,
        });
        // Spread core services into class fields
        this.historyService = core.historyService;
        this.aiService = core.aiService;
        this.workspaceService = core.workspaceService;
        this.taskService = core.taskService;
        this.providerService = core.providerService;
        this.mcpConfigService = core.mcpConfigService;
        this.mcpServerManager = core.mcpServerManager;
        this.sessionUsageService = core.sessionUsageService;
        this.extensionMetadata = core.extensionMetadata;
        this.backgroundProcessManager = core.backgroundProcessManager;
        this.projectService = new ProjectService(config);
        // Idle compaction service - auto-compacts workspaces after configured idle period
        this.idleCompactionService = new IdleCompactionService(config, this.historyService, this.extensionMetadata, (workspaceId) => this.workspaceService.emitIdleCompactionNeeded(workspaceId));
        this.windowService = new WindowService();
        this.mcpOauthService = new McpOauthService(config, this.mcpConfigService, this.windowService, this.telemetryService);
        this.mcpServerManager.setMcpOauthService(this.mcpOauthService);
        this.muxGatewayOauthService = new MuxGatewayOauthService(this.providerService, this.windowService);
        this.muxGovernorOauthService = new MuxGovernorOauthService(config, this.windowService, this.policyService);
        this.codexOauthService = new CodexOauthService(config, this.providerService, this.windowService);
        this.aiService.setCodexOauthService(this.codexOauthService);
        this.copilotOauthService = new CopilotOauthService(this.providerService, this.windowService);
        // Terminal services - PTYService is cross-platform
        this.ptyService = new PTYService();
        this.terminalService = new TerminalService(config, this.ptyService);
        // Wire terminal service to workspace service for cleanup on removal
        this.workspaceService.setTerminalService(this.terminalService);
        // Editor service for opening workspaces in code editors
        this.editorService = new EditorService(config);
        this.updateService = new UpdateService();
        this.tokenizerService = new TokenizerService(this.sessionUsageService);
        this.serverService = new ServerService();
        this.menuEventService = new MenuEventService();
        this.voiceService = new VoiceService(config);
        this.featureFlagService = new FeatureFlagService(config, this.telemetryService);
        this.signingService = getSigningService();
        this.coderService = coderService;
        const workspaceLifecycleHooks = new WorkspaceLifecycleHooks();
        workspaceLifecycleHooks.registerBeforeArchive(createStopCoderOnArchiveHook({
            coderService: this.coderService,
            shouldStopOnArchive: () => this.config.loadConfigOrDefault().stopCoderWorkspaceOnArchive !== false,
        }));
        workspaceLifecycleHooks.registerAfterUnarchive(createStartCoderOnUnarchiveHook({
            coderService: this.coderService,
            shouldStopOnArchive: () => this.config.loadConfigOrDefault().stopCoderWorkspaceOnArchive !== false,
        }));
        this.workspaceService.setWorkspaceLifecycleHooks(workspaceLifecycleHooks);
        // Register globally so all createRuntime calls can create CoderSSHRuntime
        setGlobalCoderService(this.coderService);
        // Backend timing stats (behind feature flag).
        this.aiService.on("stream-start", (data) => this.sessionTimingService.handleStreamStart(data));
        this.aiService.on("stream-delta", (data) => this.sessionTimingService.handleStreamDelta(data));
        this.aiService.on("reasoning-delta", (data) => this.sessionTimingService.handleReasoningDelta(data));
        this.aiService.on("tool-call-start", (data) => this.sessionTimingService.handleToolCallStart(data));
        this.aiService.on("tool-call-delta", (data) => this.sessionTimingService.handleToolCallDelta(data));
        this.aiService.on("tool-call-end", (data) => this.sessionTimingService.handleToolCallEnd(data));
        this.aiService.on("stream-end", (data) => this.sessionTimingService.handleStreamEnd(data));
        this.aiService.on("stream-abort", (data) => this.sessionTimingService.handleStreamAbort(data));
    }
    async initialize() {
        await this.extensionMetadata.initialize();
        // Initialize telemetry service
        await this.telemetryService.initialize();
        // Initialize policy service (startup gating)
        await this.policyService.initialize();
        // Initialize feature flag state (don't block startup on network).
        this.featureFlagService
            .getStatsTabState()
            .then((state) => this.sessionTimingService.setStatsTabState(state))
            .catch(() => {
            // Ignore feature flag failures.
        });
        await this.experimentsService.initialize();
        await this.taskService.initialize();
        // Start idle compaction checker
        this.idleCompactionService.start();
        // Refresh Coder SSH config in background (handles binary path changes on restart)
        // Skip getCoderInfo() to avoid caching "unavailable" if coder isn't installed yet
        void this.coderService.ensureSSHConfig().catch(() => {
            // Ignore errors - coder may not be installed
        });
        // Ensure the built-in Chat with Mux system workspace exists.
        // Defensive: startup-time initialization must never crash the app.
        try {
            await this.ensureMuxChatWorkspace();
        }
        catch (error) {
            log.warn("[ServiceContainer] Failed to ensure Chat with Mux workspace", { error });
        }
    }
    async ensureMuxChatWorkspace() {
        const projectPath = getMuxHelpChatProjectPath(this.config.rootDir);
        // Ensure the directory exists (LocalRuntime uses project dir directly).
        await fsPromises.mkdir(projectPath, { recursive: true });
        await this.config.editConfig((config) => {
            // Dev builds can run with a different MUX_ROOT (for example ~/.mux-dev).
            // If config.json still has the built-in mux-chat workspace under an older root
            // (for example ~/.mux), the sidebar can show duplicate "Chat with Mux" entries.
            // Only treat entries as stale when they still look like a system Mux project so
            // we do not delete unrelated legacy user workspaces whose generated ID happened
            // to collide with "mux-chat" (e.g. project basename "mux" + workspace "chat").
            const staleProjectPaths = [];
            for (const [existingProjectPath, existingProjectConfig] of config.projects) {
                if (existingProjectPath === projectPath) {
                    continue;
                }
                const isSystemMuxProjectPath = path.basename(existingProjectPath) === "Mux" &&
                    path.basename(path.dirname(existingProjectPath)) === "system";
                if (!isSystemMuxProjectPath) {
                    continue;
                }
                existingProjectConfig.workspaces = existingProjectConfig.workspaces.filter((workspace) => {
                    const isMuxChatWorkspace = workspace.id === MUX_HELP_CHAT_WORKSPACE_ID;
                    if (!isMuxChatWorkspace) {
                        return true;
                    }
                    const looksLikeSystemMuxChat = workspace.agentId === MUX_HELP_CHAT_AGENT_ID ||
                        workspace.path === existingProjectPath ||
                        workspace.name === MUX_HELP_CHAT_WORKSPACE_NAME ||
                        workspace.title === MUX_HELP_CHAT_WORKSPACE_TITLE;
                    return !looksLikeSystemMuxChat;
                });
                if (existingProjectConfig.workspaces.length === 0) {
                    staleProjectPaths.push(existingProjectPath);
                }
            }
            for (const staleProjectPath of staleProjectPaths) {
                config.projects.delete(staleProjectPath);
            }
            let projectConfig = config.projects.get(projectPath);
            if (!projectConfig) {
                projectConfig = { workspaces: [] };
                config.projects.set(projectPath, projectConfig);
            }
            const existing = projectConfig.workspaces.find((w) => w.id === MUX_HELP_CHAT_WORKSPACE_ID);
            // Self-heal: enforce invariants for the system workspace and collapse duplicates
            // in the active system project down to exactly one mux-chat entry.
            const muxChatWorkspace = {
                ...existing,
                path: projectPath,
                id: MUX_HELP_CHAT_WORKSPACE_ID,
                name: MUX_HELP_CHAT_WORKSPACE_NAME,
                title: MUX_HELP_CHAT_WORKSPACE_TITLE,
                agentId: MUX_HELP_CHAT_AGENT_ID,
                createdAt: existing?.createdAt ?? new Date().toISOString(),
                runtimeConfig: { type: "local" },
                archivedAt: undefined,
                unarchivedAt: undefined,
            };
            projectConfig.workspaces = [
                ...projectConfig.workspaces.filter((workspace) => workspace.id !== MUX_HELP_CHAT_WORKSPACE_ID),
                muxChatWorkspace,
            ];
            return config;
        });
        await this.ensureMuxChatWelcomeMessage();
    }
    async ensureMuxChatWelcomeMessage() {
        // Only need to check if any history exists — avoid parsing the entire file
        if (await this.historyService.hasHistory(MUX_HELP_CHAT_WORKSPACE_ID)) {
            return;
        }
        const message = createMuxMessage(MUX_HELP_CHAT_WELCOME_MESSAGE_ID, "assistant", MUX_HELP_CHAT_WELCOME_MESSAGE, 
        // Note: This message should be visible in the UI, so it must NOT be marked synthetic.
        { timestamp: Date.now() });
        const appendResult = await this.historyService.appendToHistory(MUX_HELP_CHAT_WORKSPACE_ID, message);
        if (!appendResult.success) {
            log.warn("[ServiceContainer] Failed to seed mux-chat welcome message", {
                error: appendResult.error,
            });
        }
    }
    /**
     * Build the ORPCContext from this container's services.
     * Centralizes the ServiceContainer → ORPCContext mapping so callers
     * (desktop/main.ts, cli/server.ts) don't duplicate a 30-field spread.
     */
    toORPCContext() {
        return {
            config: this.config,
            aiService: this.aiService,
            projectService: this.projectService,
            workspaceService: this.workspaceService,
            taskService: this.taskService,
            providerService: this.providerService,
            muxGatewayOauthService: this.muxGatewayOauthService,
            muxGovernorOauthService: this.muxGovernorOauthService,
            codexOauthService: this.codexOauthService,
            copilotOauthService: this.copilotOauthService,
            terminalService: this.terminalService,
            editorService: this.editorService,
            windowService: this.windowService,
            updateService: this.updateService,
            tokenizerService: this.tokenizerService,
            serverService: this.serverService,
            menuEventService: this.menuEventService,
            voiceService: this.voiceService,
            mcpConfigService: this.mcpConfigService,
            mcpOauthService: this.mcpOauthService,
            workspaceMcpOverridesService: this.workspaceMcpOverridesService,
            mcpServerManager: this.mcpServerManager,
            featureFlagService: this.featureFlagService,
            sessionTimingService: this.sessionTimingService,
            telemetryService: this.telemetryService,
            experimentsService: this.experimentsService,
            sessionUsageService: this.sessionUsageService,
            policyService: this.policyService,
            signingService: this.signingService,
            coderService: this.coderService,
        };
    }
    /**
     * Shutdown services that need cleanup
     */
    async shutdown() {
        this.idleCompactionService.stop();
        await this.telemetryService.shutdown();
    }
    setProjectDirectoryPicker(picker) {
        this.projectService.setDirectoryPicker(picker);
    }
    setTerminalWindowManager(manager) {
        this.terminalService.setTerminalWindowManager(manager);
    }
    /**
     * Dispose all services. Called on app quit to clean up resources.
     * Terminates all background processes to prevent orphans.
     */
    async dispose() {
        this.policyService.dispose();
        this.mcpServerManager.dispose();
        await this.mcpOauthService.dispose();
        await this.muxGatewayOauthService.dispose();
        await this.muxGovernorOauthService.dispose();
        await this.codexOauthService.dispose();
        this.copilotOauthService.dispose();
        await this.backgroundProcessManager.terminateAll();
    }
}
//# sourceMappingURL=serviceContainer.js.map