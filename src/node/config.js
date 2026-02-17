import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import * as jsonc from "jsonc-parser";
import writeFileAtomic from "write-file-atomic";
import { log } from "@/node/services/log";
import { secretsToRecord } from "@/common/types/secrets";
import { DEFAULT_TASK_SETTINGS, normalizeSubagentAiDefaults, normalizeTaskSettings, } from "@/common/types/tasks";
import { isLayoutPresetsConfigEmpty, normalizeLayoutPresetsConfig } from "@/common/types/uiLayouts";
import { normalizeAgentAiDefaults } from "@/common/types/agentAiDefaults";
import { DEFAULT_RUNTIME_CONFIG } from "@/common/constants/workspace";
import { isIncompatibleRuntimeConfig } from "@/common/utils/runtimeCompatibility";
import { getMuxHome } from "@/common/constants/paths";
import { PlatformPaths } from "@/common/utils/paths";
import { isValidModelFormat, normalizeGatewayModel } from "@/common/utils/ai/models";
import { stripTrailingSlashes } from "@/node/utils/pathUtils";
import { getContainerName as getDockerContainerName } from "@/node/runtime/DockerRuntime";
function parseOptionalNonEmptyString(value) {
    if (typeof value !== "string") {
        return undefined;
    }
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
}
function parseOptionalEnvBoolean(value) {
    if (typeof value !== "string") {
        return undefined;
    }
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
        return undefined;
    }
    if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") {
        return true;
    }
    if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") {
        return false;
    }
    return undefined;
}
function parseOptionalBoolean(value) {
    return typeof value === "boolean" ? value : undefined;
}
function parseOptionalStringArray(value) {
    if (!Array.isArray(value)) {
        return undefined;
    }
    return value.filter((item) => typeof item === "string");
}
function normalizeOptionalModelString(value) {
    if (typeof value !== "string") {
        return undefined;
    }
    const trimmed = value.trim();
    if (!trimmed) {
        return undefined;
    }
    // Reject malformed mux-gateway strings ("mux-gateway:provider" without "/model").
    if (trimmed.startsWith("mux-gateway:") && !trimmed.includes("/")) {
        return undefined;
    }
    const normalized = normalizeGatewayModel(trimmed);
    if (!isValidModelFormat(normalized)) {
        return undefined;
    }
    return normalized;
}
function normalizeOptionalModelStringArray(value) {
    if (!Array.isArray(value)) {
        return undefined;
    }
    const out = [];
    const seen = new Set();
    for (const item of value) {
        const normalized = normalizeOptionalModelString(item);
        if (!normalized)
            continue;
        if (seen.has(normalized))
            continue;
        seen.add(normalized);
        out.push(normalized);
    }
    return out;
}
function parseOptionalPort(value) {
    if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value)) {
        return undefined;
    }
    if (value < 0 || value > 65535) {
        return undefined;
    }
    return value;
}
/**
 * Config - Centralized configuration management
 *
 * Encapsulates all config paths and operations, making them dependency-injectable
 * and testable. Pass a custom rootDir for tests to avoid polluting ~/.mux
 */
export class Config {
    constructor(rootDir) {
        this.rootDir = rootDir ?? getMuxHome();
        this.sessionsDir = path.join(this.rootDir, "sessions");
        this.srcDir = path.join(this.rootDir, "src");
        this.configFile = path.join(this.rootDir, "config.json");
        this.providersFile = path.join(this.rootDir, "providers.jsonc");
        this.secretsFile = path.join(this.rootDir, "secrets.json");
    }
    loadConfigOrDefault() {
        try {
            if (fs.existsSync(this.configFile)) {
                const data = fs.readFileSync(this.configFile, "utf-8");
                const parsed = JSON.parse(data);
                // Config is stored as array of [path, config] pairs
                if (parsed.projects && Array.isArray(parsed.projects)) {
                    const rawPairs = parsed.projects;
                    // Migrate: normalize project paths by stripping trailing slashes
                    // This fixes configs created with paths like "/home/user/project/"
                    // Also filter out any malformed entries (null/undefined paths)
                    const normalizedPairs = rawPairs
                        .filter(([projectPath]) => {
                        if (!projectPath || typeof projectPath !== "string") {
                            log.warn("Filtering out project with invalid path", { projectPath });
                            return false;
                        }
                        return true;
                    })
                        .map(([projectPath, projectConfig]) => {
                        return [stripTrailingSlashes(projectPath), projectConfig];
                    });
                    const projectsMap = new Map(normalizedPairs);
                    const taskSettings = normalizeTaskSettings(parsed.taskSettings);
                    const muxGatewayEnabled = parseOptionalBoolean(parsed.muxGatewayEnabled);
                    const muxGatewayModels = parseOptionalStringArray(parsed.muxGatewayModels);
                    const defaultModel = normalizeOptionalModelString(parsed.defaultModel);
                    const hiddenModels = normalizeOptionalModelStringArray(parsed.hiddenModels);
                    const preferredCompactionModel = normalizeOptionalModelString(parsed.preferredCompactionModel);
                    const legacySubagentAiDefaults = normalizeSubagentAiDefaults(parsed.subagentAiDefaults);
                    // Default ON: store `false` only so config.json stays minimal.
                    const stopCoderWorkspaceOnArchive = parseOptionalBoolean(parsed.stopCoderWorkspaceOnArchive) === false ? false : undefined;
                    const agentAiDefaults = parsed.agentAiDefaults !== undefined
                        ? normalizeAgentAiDefaults(parsed.agentAiDefaults)
                        : normalizeAgentAiDefaults(legacySubagentAiDefaults);
                    const layoutPresetsRaw = normalizeLayoutPresetsConfig(parsed.layoutPresets);
                    const layoutPresets = isLayoutPresetsConfigEmpty(layoutPresetsRaw)
                        ? undefined
                        : layoutPresetsRaw;
                    return {
                        projects: projectsMap,
                        apiServerBindHost: parseOptionalNonEmptyString(parsed.apiServerBindHost),
                        apiServerServeWebUi: parseOptionalBoolean(parsed.apiServerServeWebUi)
                            ? true
                            : undefined,
                        apiServerPort: parseOptionalPort(parsed.apiServerPort),
                        mdnsAdvertisementEnabled: parseOptionalBoolean(parsed.mdnsAdvertisementEnabled),
                        mdnsServiceName: parseOptionalNonEmptyString(parsed.mdnsServiceName),
                        serverSshHost: parsed.serverSshHost,
                        defaultProjectDir: parseOptionalNonEmptyString(parsed.defaultProjectDir),
                        viewedSplashScreens: parsed.viewedSplashScreens,
                        layoutPresets,
                        taskSettings,
                        muxGatewayEnabled,
                        muxGatewayModels,
                        defaultModel,
                        hiddenModels,
                        preferredCompactionModel,
                        agentAiDefaults,
                        // Legacy fields are still parsed and returned for downgrade compatibility.
                        subagentAiDefaults: legacySubagentAiDefaults,
                        featureFlagOverrides: parsed.featureFlagOverrides,
                        useSSH2Transport: parseOptionalBoolean(parsed.useSSH2Transport),
                        muxGovernorUrl: parseOptionalNonEmptyString(parsed.muxGovernorUrl),
                        muxGovernorToken: parseOptionalNonEmptyString(parsed.muxGovernorToken),
                        stopCoderWorkspaceOnArchive,
                    };
                }
            }
        }
        catch (error) {
            log.error("Error loading config:", error);
        }
        // Return default config
        return {
            projects: new Map(),
            taskSettings: DEFAULT_TASK_SETTINGS,
            agentAiDefaults: {},
            subagentAiDefaults: {},
        };
    }
    async saveConfig(config) {
        try {
            if (!fs.existsSync(this.rootDir)) {
                fs.mkdirSync(this.rootDir, { recursive: true });
            }
            const data = {
                projects: Array.from(config.projects.entries()),
                taskSettings: config.taskSettings ?? DEFAULT_TASK_SETTINGS,
            };
            const muxGatewayEnabled = parseOptionalBoolean(config.muxGatewayEnabled);
            if (muxGatewayEnabled !== undefined) {
                data.muxGatewayEnabled = muxGatewayEnabled;
            }
            const muxGatewayModels = parseOptionalStringArray(config.muxGatewayModels);
            if (muxGatewayModels !== undefined) {
                data.muxGatewayModels = muxGatewayModels;
            }
            const defaultModel = normalizeOptionalModelString(config.defaultModel);
            if (defaultModel !== undefined) {
                data.defaultModel = defaultModel;
            }
            const hiddenModels = normalizeOptionalModelStringArray(config.hiddenModels);
            if (hiddenModels !== undefined) {
                data.hiddenModels = hiddenModels;
            }
            const preferredCompactionModel = normalizeOptionalModelString(config.preferredCompactionModel);
            if (preferredCompactionModel !== undefined) {
                data.preferredCompactionModel = preferredCompactionModel;
            }
            const apiServerBindHost = parseOptionalNonEmptyString(config.apiServerBindHost);
            if (apiServerBindHost) {
                data.apiServerBindHost = apiServerBindHost;
            }
            const apiServerServeWebUi = parseOptionalBoolean(config.apiServerServeWebUi);
            if (apiServerServeWebUi) {
                data.apiServerServeWebUi = true;
            }
            const apiServerPort = parseOptionalPort(config.apiServerPort);
            if (apiServerPort !== undefined) {
                data.apiServerPort = apiServerPort;
            }
            const mdnsAdvertisementEnabled = parseOptionalBoolean(config.mdnsAdvertisementEnabled);
            if (mdnsAdvertisementEnabled !== undefined) {
                data.mdnsAdvertisementEnabled = mdnsAdvertisementEnabled;
            }
            const mdnsServiceName = parseOptionalNonEmptyString(config.mdnsServiceName);
            if (mdnsServiceName) {
                data.mdnsServiceName = mdnsServiceName;
            }
            if (config.serverSshHost) {
                data.serverSshHost = config.serverSshHost;
            }
            const defaultProjectDir = parseOptionalNonEmptyString(config.defaultProjectDir);
            if (defaultProjectDir) {
                data.defaultProjectDir = defaultProjectDir;
            }
            if (config.featureFlagOverrides) {
                data.featureFlagOverrides = config.featureFlagOverrides;
            }
            if (config.layoutPresets) {
                const normalized = normalizeLayoutPresetsConfig(config.layoutPresets);
                if (!isLayoutPresetsConfigEmpty(normalized)) {
                    data.layoutPresets = normalized;
                }
            }
            if (config.viewedSplashScreens) {
                data.viewedSplashScreens = config.viewedSplashScreens;
            }
            if (config.agentAiDefaults && Object.keys(config.agentAiDefaults).length > 0) {
                data.agentAiDefaults = config.agentAiDefaults;
                const legacySubagent = {};
                for (const [id, entry] of Object.entries(config.agentAiDefaults)) {
                    if (id === "plan" || id === "exec" || id === "compact")
                        continue;
                    legacySubagent[id] = entry;
                }
                if (Object.keys(legacySubagent).length > 0) {
                    data.subagentAiDefaults = legacySubagent;
                }
            }
            else {
                // Legacy only.
                if (config.subagentAiDefaults && Object.keys(config.subagentAiDefaults).length > 0) {
                    data.subagentAiDefaults = config.subagentAiDefaults;
                }
            }
            if (config.useSSH2Transport !== undefined) {
                data.useSSH2Transport = config.useSSH2Transport;
            }
            const muxGovernorUrl = parseOptionalNonEmptyString(config.muxGovernorUrl);
            if (muxGovernorUrl) {
                data.muxGovernorUrl = muxGovernorUrl;
            }
            const muxGovernorToken = parseOptionalNonEmptyString(config.muxGovernorToken);
            if (muxGovernorToken) {
                data.muxGovernorToken = muxGovernorToken;
            }
            // Default ON: persist `false` only.
            if (config.stopCoderWorkspaceOnArchive === false) {
                data.stopCoderWorkspaceOnArchive = false;
            }
            await writeFileAtomic(this.configFile, JSON.stringify(data, null, 2), "utf-8");
        }
        catch (error) {
            log.error("Error saving config:", error);
        }
    }
    /**
     * Edit config atomically using a transformation function
     * @param fn Function that takes current config and returns modified config
     */
    async editConfig(fn) {
        const config = this.loadConfigOrDefault();
        const newConfig = fn(config);
        await this.saveConfig(newConfig);
    }
    /**
     * Cross-client feature flag overrides (shared via ~/.mux/config.json).
     */
    getFeatureFlagOverride(flagKey) {
        const config = this.loadConfigOrDefault();
        const override = config.featureFlagOverrides?.[flagKey];
        if (override === "on" || override === "off" || override === "default") {
            return override;
        }
        return "default";
    }
    async setFeatureFlagOverride(flagKey, override) {
        await this.editConfig((config) => {
            const next = { ...(config.featureFlagOverrides ?? {}) };
            if (override === "default") {
                delete next[flagKey];
            }
            else {
                next[flagKey] = override;
            }
            config.featureFlagOverrides = Object.keys(next).length > 0 ? next : undefined;
            return config;
        });
    }
    /**
     * mDNS advertisement enablement.
     *
     * - true: attempt to advertise (will warn if the API server is loopback-only)
     * - false: never advertise
     * - undefined: "auto" (advertise only when the API server is LAN-reachable)
     */
    getMdnsAdvertisementEnabled() {
        const envOverride = parseOptionalEnvBoolean(process.env.MUX_MDNS_ADVERTISE);
        if (envOverride !== undefined) {
            return envOverride;
        }
        const config = this.loadConfigOrDefault();
        return config.mdnsAdvertisementEnabled;
    }
    /** Optional DNS-SD service instance name override. */
    getMdnsServiceName() {
        const envName = parseOptionalNonEmptyString(process.env.MUX_MDNS_SERVICE_NAME);
        if (envName) {
            return envName;
        }
        const config = this.loadConfigOrDefault();
        return config.mdnsServiceName;
    }
    /**
     * Get the configured SSH hostname for this server (used for editor deep links in browser mode).
     */
    getServerSshHost() {
        const config = this.loadConfigOrDefault();
        return config.serverSshHost;
    }
    getProjectName(projectPath) {
        return PlatformPaths.getProjectName(projectPath);
    }
    /**
     * Generate a stable unique workspace ID.
     * Uses 10 random hex characters for readability while maintaining uniqueness.
     *
     * Example: "a1b2c3d4e5"
     */
    generateStableId() {
        // Generate 5 random bytes and convert to 10 hex chars
        return crypto.randomBytes(5).toString("hex");
    }
    /**
     * DEPRECATED: Generate legacy workspace ID from project and workspace paths.
     * This method is used only for legacy workspace migration to look up old workspaces.
     * New workspaces use generateStableId() which returns a random stable ID.
     *
     * DO NOT use this method or its format to construct workspace IDs anywhere in the codebase.
     * Workspace IDs are backend implementation details and must only come from backend operations.
     */
    generateLegacyId(projectPath, workspacePath) {
        const projectBasename = this.getProjectName(projectPath);
        const workspaceBasename = PlatformPaths.basename(workspacePath);
        return `${projectBasename}-${workspaceBasename}`;
    }
    /**
     * Get the workspace directory path for a given directory name.
     * The directory name is the workspace name (branch name).
     */
    /**
     * Add paths to WorkspaceMetadata to create FrontendWorkspaceMetadata.
     * Helper to avoid duplicating path computation logic.
     */
    addPathsToMetadata(metadata, workspacePath, _projectPath) {
        const result = {
            ...metadata,
            namedWorkspacePath: workspacePath,
        };
        // Check for incompatible runtime configs (from newer mux versions)
        if (isIncompatibleRuntimeConfig(metadata.runtimeConfig)) {
            result.incompatibleRuntime =
                "This workspace was created with a newer version of mux. " +
                    "Please upgrade mux to use this workspace.";
        }
        return result;
    }
    /**
     * Find a workspace path and project path by workspace ID
     * @returns Object with workspace and project paths, or null if not found
     */
    findWorkspace(workspaceId) {
        const config = this.loadConfigOrDefault();
        for (const [projectPath, project] of config.projects) {
            for (const workspace of project.workspaces) {
                // NEW FORMAT: Check config first (primary source of truth after migration)
                if (workspace.id === workspaceId) {
                    return { workspacePath: workspace.path, projectPath };
                }
                // LEGACY FORMAT: Fall back to metadata.json and legacy ID for unmigrated workspaces
                if (!workspace.id) {
                    // Extract workspace basename (could be stable ID or legacy name)
                    const workspaceBasename = workspace.path.split("/").pop() ?? workspace.path.split("\\").pop() ?? "unknown";
                    // Try loading metadata with basename as ID (works for old workspaces)
                    const metadataPath = path.join(this.getSessionDir(workspaceBasename), "metadata.json");
                    if (fs.existsSync(metadataPath)) {
                        try {
                            const data = fs.readFileSync(metadataPath, "utf-8");
                            const metadata = JSON.parse(data);
                            if (metadata.id === workspaceId) {
                                return { workspacePath: workspace.path, projectPath };
                            }
                        }
                        catch {
                            // Ignore parse errors, try legacy ID
                        }
                    }
                    // Try legacy ID format as last resort
                    const legacyId = this.generateLegacyId(projectPath, workspace.path);
                    if (legacyId === workspaceId) {
                        return { workspacePath: workspace.path, projectPath };
                    }
                }
            }
        }
        return null;
    }
    /**
     * Workspace Path Architecture:
     *
     * Workspace paths are computed on-demand from projectPath + workspace name using
     * config.getWorkspacePath(projectPath, directoryName). This ensures a single source of truth.
     *
     * - Worktree directory name: uses workspace.name (the branch name)
     * - Workspace ID: stable random identifier for identity and sessions (not used for directories)
     *
     * Backend: Uses getWorkspacePath(metadata.projectPath, metadata.name) for workspace directory paths
     * Frontend: Gets enriched metadata with paths via IPC (FrontendWorkspaceMetadata)
     *
     * WorkspaceMetadata.workspacePath is deprecated and will be removed. Use computed
     * paths from getWorkspacePath() or getWorkspacePaths() instead.
     */
    /**
     * Get the session directory for a specific workspace
     */
    getSessionDir(workspaceId) {
        return path.join(this.sessionsDir, workspaceId);
    }
    /**
     * Get all workspace metadata by loading config and metadata files.
     *
     * Returns FrontendWorkspaceMetadata with paths already computed.
     * This eliminates the need for separate "enrichment" - paths are computed
     * once during the loop when we already have all the necessary data.
     *
     * NEW BEHAVIOR: Config is the primary source of truth
     * - If workspace has id/name/createdAt in config, use those directly
     * - If workspace only has path, fall back to reading metadata.json
     * - Migrate old workspaces by copying metadata from files to config
     *
     * This centralizes workspace metadata in config.json and eliminates the need
     * for scattered metadata.json files (kept for backward compat with older versions).
     *
     * GUARANTEE: Every workspace returned will have a createdAt timestamp.
     * If missing from config or legacy metadata, a new timestamp is assigned and
     * saved to config for subsequent loads.
     */
    async getAllWorkspaceMetadata() {
        const config = this.loadConfigOrDefault();
        const workspaceMetadata = [];
        let configModified = false;
        for (const [projectPath, projectConfig] of config.projects) {
            // Validate project path is not empty (defensive check for corrupted config)
            if (!projectPath) {
                log.warn("Skipping project with empty path in config", {
                    workspaceCount: projectConfig.workspaces?.length ?? 0,
                });
                continue;
            }
            const projectName = this.getProjectName(projectPath);
            for (const workspace of projectConfig.workspaces) {
                // Extract workspace basename from path (could be stable ID or legacy name)
                const workspaceBasename = workspace.path.split("/").pop() ?? workspace.path.split("\\").pop() ?? "unknown";
                try {
                    // NEW FORMAT: If workspace has metadata in config, use it directly
                    if (workspace.id && workspace.name) {
                        const metadata = {
                            id: workspace.id,
                            name: workspace.name,
                            title: workspace.title,
                            projectName,
                            projectPath,
                            // GUARANTEE: All workspaces must have createdAt (assign now if missing)
                            createdAt: workspace.createdAt ?? new Date().toISOString(),
                            // GUARANTEE: All workspaces must have runtimeConfig (apply default if missing)
                            runtimeConfig: workspace.runtimeConfig ?? DEFAULT_RUNTIME_CONFIG,
                            aiSettings: workspace.aiSettings,
                            aiSettingsByAgent: workspace.aiSettingsByAgent ??
                                (workspace.aiSettings
                                    ? {
                                        plan: workspace.aiSettings,
                                        exec: workspace.aiSettings,
                                    }
                                    : undefined),
                            parentWorkspaceId: workspace.parentWorkspaceId,
                            agentType: workspace.agentType,
                            taskStatus: workspace.taskStatus,
                            reportedAt: workspace.reportedAt,
                            taskModelString: workspace.taskModelString,
                            taskThinkingLevel: workspace.taskThinkingLevel,
                            taskPrompt: workspace.taskPrompt,
                            taskTrunkBranch: workspace.taskTrunkBranch,
                            archivedAt: workspace.archivedAt,
                            unarchivedAt: workspace.unarchivedAt,
                            sectionId: workspace.sectionId,
                        };
                        // Migrate missing createdAt to config for next load
                        if (!workspace.createdAt) {
                            workspace.createdAt = metadata.createdAt;
                            configModified = true;
                        }
                        // Migrate missing runtimeConfig to config for next load
                        if (!workspace.aiSettingsByAgent) {
                            const derived = workspace.aiSettings
                                ? {
                                    plan: workspace.aiSettings,
                                    exec: workspace.aiSettings,
                                }
                                : undefined;
                            if (derived) {
                                workspace.aiSettingsByAgent = derived;
                                configModified = true;
                            }
                        }
                        if (!workspace.runtimeConfig) {
                            workspace.runtimeConfig = metadata.runtimeConfig;
                            configModified = true;
                        }
                        // Populate containerName for Docker workspaces (computed from project path and workspace name)
                        if (metadata.runtimeConfig?.type === "docker" &&
                            !metadata.runtimeConfig.containerName) {
                            metadata.runtimeConfig = {
                                ...metadata.runtimeConfig,
                                containerName: getDockerContainerName(projectPath, metadata.name),
                            };
                        }
                        workspaceMetadata.push(this.addPathsToMetadata(metadata, workspace.path, projectPath));
                        continue; // Skip metadata file lookup
                    }
                    // LEGACY FORMAT: Fall back to reading metadata.json
                    // Try legacy ID format first (project-workspace) - used by E2E tests and old workspaces
                    const legacyId = this.generateLegacyId(projectPath, workspace.path);
                    const metadataPath = path.join(this.getSessionDir(legacyId), "metadata.json");
                    let metadataFound = false;
                    if (fs.existsSync(metadataPath)) {
                        const data = fs.readFileSync(metadataPath, "utf-8");
                        const metadata = JSON.parse(data);
                        // Ensure required fields are present
                        if (!metadata.name)
                            metadata.name = workspaceBasename;
                        if (!metadata.projectPath)
                            metadata.projectPath = projectPath;
                        if (!metadata.projectName)
                            metadata.projectName = projectName;
                        // GUARANTEE: All workspaces must have createdAt
                        metadata.createdAt ?? (metadata.createdAt = new Date().toISOString());
                        // GUARANTEE: All workspaces must have runtimeConfig
                        metadata.runtimeConfig ?? (metadata.runtimeConfig = DEFAULT_RUNTIME_CONFIG);
                        // Preserve any config-only fields that may not exist in legacy metadata.json
                        metadata.aiSettingsByAgent ?? (metadata.aiSettingsByAgent = workspace.aiSettingsByAgent ??
                            (workspace.aiSettings
                                ? {
                                    plan: workspace.aiSettings,
                                    exec: workspace.aiSettings,
                                }
                                : undefined));
                        metadata.aiSettings ?? (metadata.aiSettings = workspace.aiSettings);
                        // Preserve tree/task metadata when present in config (metadata.json won't have it)
                        metadata.parentWorkspaceId ?? (metadata.parentWorkspaceId = workspace.parentWorkspaceId);
                        metadata.agentType ?? (metadata.agentType = workspace.agentType);
                        metadata.taskStatus ?? (metadata.taskStatus = workspace.taskStatus);
                        metadata.reportedAt ?? (metadata.reportedAt = workspace.reportedAt);
                        metadata.taskModelString ?? (metadata.taskModelString = workspace.taskModelString);
                        metadata.taskThinkingLevel ?? (metadata.taskThinkingLevel = workspace.taskThinkingLevel);
                        metadata.taskPrompt ?? (metadata.taskPrompt = workspace.taskPrompt);
                        metadata.taskTrunkBranch ?? (metadata.taskTrunkBranch = workspace.taskTrunkBranch);
                        // Preserve archived timestamps from config
                        metadata.archivedAt ?? (metadata.archivedAt = workspace.archivedAt);
                        metadata.unarchivedAt ?? (metadata.unarchivedAt = workspace.unarchivedAt);
                        // Preserve section assignment from config
                        metadata.sectionId ?? (metadata.sectionId = workspace.sectionId);
                        if (!workspace.aiSettingsByAgent && metadata.aiSettingsByAgent) {
                            workspace.aiSettingsByAgent = metadata.aiSettingsByAgent;
                            configModified = true;
                        }
                        // Migrate to config for next load
                        workspace.id = metadata.id;
                        workspace.name = metadata.name;
                        workspace.createdAt = metadata.createdAt;
                        workspace.runtimeConfig = metadata.runtimeConfig;
                        configModified = true;
                        workspaceMetadata.push(this.addPathsToMetadata(metadata, workspace.path, projectPath));
                        metadataFound = true;
                    }
                    // No metadata found anywhere - create basic metadata
                    if (!metadataFound) {
                        const legacyId = this.generateLegacyId(projectPath, workspace.path);
                        const metadata = {
                            id: legacyId,
                            name: workspaceBasename,
                            projectName,
                            projectPath,
                            // GUARANTEE: All workspaces must have createdAt
                            createdAt: new Date().toISOString(),
                            // GUARANTEE: All workspaces must have runtimeConfig
                            runtimeConfig: DEFAULT_RUNTIME_CONFIG,
                            aiSettings: workspace.aiSettings,
                            aiSettingsByAgent: workspace.aiSettingsByAgent ??
                                (workspace.aiSettings
                                    ? {
                                        plan: workspace.aiSettings,
                                        exec: workspace.aiSettings,
                                    }
                                    : undefined),
                            parentWorkspaceId: workspace.parentWorkspaceId,
                            agentType: workspace.agentType,
                            taskStatus: workspace.taskStatus,
                            reportedAt: workspace.reportedAt,
                            taskModelString: workspace.taskModelString,
                            taskThinkingLevel: workspace.taskThinkingLevel,
                            taskPrompt: workspace.taskPrompt,
                            taskTrunkBranch: workspace.taskTrunkBranch,
                            archivedAt: workspace.archivedAt,
                            unarchivedAt: workspace.unarchivedAt,
                            sectionId: workspace.sectionId,
                        };
                        // Save to config for next load
                        workspace.id = metadata.id;
                        workspace.name = metadata.name;
                        workspace.createdAt = metadata.createdAt;
                        workspace.runtimeConfig = metadata.runtimeConfig;
                        configModified = true;
                        workspaceMetadata.push(this.addPathsToMetadata(metadata, workspace.path, projectPath));
                    }
                }
                catch (error) {
                    log.error(`Failed to load/migrate workspace metadata:`, error);
                    // Fallback to basic metadata if migration fails
                    const legacyId = this.generateLegacyId(projectPath, workspace.path);
                    const metadata = {
                        id: legacyId,
                        name: workspaceBasename,
                        projectName,
                        projectPath,
                        // GUARANTEE: All workspaces must have createdAt (even in error cases)
                        createdAt: new Date().toISOString(),
                        // GUARANTEE: All workspaces must have runtimeConfig (even in error cases)
                        runtimeConfig: DEFAULT_RUNTIME_CONFIG,
                        aiSettings: workspace.aiSettings,
                        aiSettingsByAgent: workspace.aiSettingsByAgent ??
                            (workspace.aiSettings
                                ? {
                                    plan: workspace.aiSettings,
                                    exec: workspace.aiSettings,
                                }
                                : undefined),
                        parentWorkspaceId: workspace.parentWorkspaceId,
                        agentType: workspace.agentType,
                        taskStatus: workspace.taskStatus,
                        reportedAt: workspace.reportedAt,
                        taskModelString: workspace.taskModelString,
                        taskThinkingLevel: workspace.taskThinkingLevel,
                        taskPrompt: workspace.taskPrompt,
                        taskTrunkBranch: workspace.taskTrunkBranch,
                        sectionId: workspace.sectionId,
                    };
                    workspaceMetadata.push(this.addPathsToMetadata(metadata, workspace.path, projectPath));
                }
            }
        }
        // Save config if we migrated any workspaces
        if (configModified) {
            await this.saveConfig(config);
        }
        return workspaceMetadata;
    }
    /**
     * Add a workspace to config.json (single source of truth for workspace metadata).
     * Creates project entry if it doesn't exist.
     *
     * @param projectPath Absolute path to the project
     * @param metadata Workspace metadata to save
     */
    async addWorkspace(projectPath, metadata) {
        await this.editConfig((config) => {
            let project = config.projects.get(projectPath);
            if (!project) {
                project = { workspaces: [] };
                config.projects.set(projectPath, project);
            }
            // Check if workspace already exists (by ID)
            const existingIndex = project.workspaces.findIndex((w) => w.id === metadata.id);
            // Use provided namedWorkspacePath if available (runtime-aware),
            // otherwise fall back to worktree-style path for legacy compatibility
            const projectName = this.getProjectName(projectPath);
            const workspacePath = metadata.namedWorkspacePath ?? path.join(this.srcDir, projectName, metadata.name);
            const workspaceEntry = {
                path: workspacePath,
                id: metadata.id,
                name: metadata.name,
                title: metadata.title,
                createdAt: metadata.createdAt,
                aiSettingsByAgent: metadata.aiSettingsByAgent,
                runtimeConfig: metadata.runtimeConfig,
                aiSettings: metadata.aiSettings,
                parentWorkspaceId: metadata.parentWorkspaceId,
                agentType: metadata.agentType,
                agentId: metadata.agentId,
                taskStatus: metadata.taskStatus,
                reportedAt: metadata.reportedAt,
                taskModelString: metadata.taskModelString,
                taskThinkingLevel: metadata.taskThinkingLevel,
                taskPrompt: metadata.taskPrompt,
                taskTrunkBranch: metadata.taskTrunkBranch,
                archivedAt: metadata.archivedAt,
                unarchivedAt: metadata.unarchivedAt,
                sectionId: metadata.sectionId,
            };
            if (existingIndex >= 0) {
                // Update existing workspace
                project.workspaces[existingIndex] = workspaceEntry;
            }
            else {
                // Add new workspace
                project.workspaces.push(workspaceEntry);
            }
            return config;
        });
    }
    /**
     * Remove a workspace from config.json
     *
     * @param workspaceId ID of the workspace to remove
     */
    async removeWorkspace(workspaceId) {
        await this.editConfig((config) => {
            let workspaceFound = false;
            for (const [_projectPath, project] of config.projects) {
                const index = project.workspaces.findIndex((w) => w.id === workspaceId);
                if (index !== -1) {
                    project.workspaces.splice(index, 1);
                    workspaceFound = true;
                    // We don't break here in case duplicates exist (though they shouldn't)
                }
            }
            if (!workspaceFound) {
                log.warn(`Workspace ${workspaceId} not found in config during removal`);
            }
            return config;
        });
    }
    /**
     * Update workspace metadata fields (e.g., regenerate missing title/branch)
     * Used to fix incomplete metadata after errors or restarts
     */
    async updateWorkspaceMetadata(workspaceId, updates) {
        await this.editConfig((config) => {
            for (const [_projectPath, projectConfig] of config.projects) {
                const workspace = projectConfig.workspaces.find((w) => w.id === workspaceId);
                if (workspace) {
                    if (updates.name !== undefined)
                        workspace.name = updates.name;
                    if (updates.runtimeConfig !== undefined)
                        workspace.runtimeConfig = updates.runtimeConfig;
                    return config;
                }
            }
            throw new Error(`Workspace ${workspaceId} not found in config`);
        });
    }
    /**
     * Load providers configuration from JSONC file
     * Supports comments in JSONC format
     */
    loadProvidersConfig() {
        try {
            if (fs.existsSync(this.providersFile)) {
                const data = fs.readFileSync(this.providersFile, "utf-8");
                return jsonc.parse(data);
            }
        }
        catch (error) {
            log.error("Error loading providers config:", error);
        }
        return null;
    }
    /**
     * Save providers configuration to JSONC file
     * @param config The providers configuration to save
     */
    saveProvidersConfig(config) {
        try {
            if (!fs.existsSync(this.rootDir)) {
                fs.mkdirSync(this.rootDir, { recursive: true });
            }
            // Format with 2-space indentation for readability
            const jsonString = JSON.stringify(config, null, 2);
            // Add a comment header to the file
            const contentWithComments = `// Providers configuration for mux
// Configure your AI providers here
// Example:
// {
//   "anthropic": {
//     "apiKey": "sk-ant-..."
//   },
//   "openai": {
//     "apiKey": "sk-..."
//   },
//   "xai": {
//     "apiKey": "sk-xai-..."
//   },
//   "ollama": {
//     "baseUrl": "http://localhost:11434/api"  // Optional - only needed for remote/custom URL
//   }
// }
${jsonString}`;
            writeFileAtomic.sync(this.providersFile, contentWithComments, {
                encoding: "utf-8",
                mode: 0o600,
            });
        }
        catch (error) {
            log.error("Error saving providers config:", error);
            throw error; // Re-throw to let caller handle
        }
    }
    static normalizeSecretsProjectPath(projectPath) {
        return stripTrailingSlashes(projectPath);
    }
    static isSecretReferenceValue(value) {
        return (typeof value === "object" &&
            value !== null &&
            "secret" in value &&
            typeof value.secret === "string");
    }
    static isSecretValue(value) {
        if (typeof value === "string") {
            return true;
        }
        return Config.isSecretReferenceValue(value);
    }
    static isSecret(value) {
        return (typeof value === "object" &&
            value !== null &&
            "key" in value &&
            "value" in value &&
            typeof value.key === "string" &&
            Config.isSecretValue(value.value));
    }
    static parseSecretsArray(value) {
        if (!Array.isArray(value)) {
            return [];
        }
        // Filter invalid entries to avoid crashes when iterating secrets.
        return value.filter((entry) => Config.isSecret(entry));
    }
    static mergeSecretsByKey(primary, secondary) {
        // Merge-by-key (last writer wins).
        const mergedByKey = new Map();
        for (const secret of primary) {
            mergedByKey.set(secret.key, secret);
        }
        for (const secret of secondary) {
            mergedByKey.set(secret.key, secret);
        }
        return Array.from(mergedByKey.values());
    }
    static normalizeSecretsConfig(raw) {
        if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
            return {};
        }
        const record = raw;
        const normalized = {};
        for (const [rawKey, rawValue] of Object.entries(record)) {
            let key = rawKey;
            if (rawKey !== Config.GLOBAL_SECRETS_KEY) {
                const normalizedKey = Config.normalizeSecretsProjectPath(rawKey);
                key = normalizedKey || rawKey;
            }
            const secrets = Config.parseSecretsArray(rawValue);
            if (!Object.prototype.hasOwnProperty.call(normalized, key)) {
                normalized[key] = secrets;
                continue;
            }
            normalized[key] = Config.mergeSecretsByKey(normalized[key], secrets);
        }
        return normalized;
    }
    /**
     * Load secrets configuration from JSON file
     * Returns empty config if file doesn't exist
     */
    loadSecretsConfig() {
        try {
            if (fs.existsSync(this.secretsFile)) {
                const data = fs.readFileSync(this.secretsFile, "utf-8");
                const parsed = JSON.parse(data);
                return Config.normalizeSecretsConfig(parsed);
            }
        }
        catch (error) {
            log.error("Error loading secrets config:", error);
        }
        return {};
    }
    /**
     * Save secrets configuration to JSON file
     * @param config The secrets configuration to save
     */
    async saveSecretsConfig(config) {
        try {
            if (!fs.existsSync(this.rootDir)) {
                fs.mkdirSync(this.rootDir, { recursive: true });
            }
            await writeFileAtomic(this.secretsFile, JSON.stringify(config, null, 2), {
                encoding: "utf-8",
                mode: 0o600,
            });
        }
        catch (error) {
            log.error("Error saving secrets config:", error);
            throw error;
        }
    }
    /**
     * Get global secrets (not project-scoped).
     *
     * Stored in <muxHome>/secrets.json under a sentinel key for backwards compatibility.
     */
    getGlobalSecrets() {
        const config = this.loadSecretsConfig();
        return config[Config.GLOBAL_SECRETS_KEY] ?? [];
    }
    /** Update global secrets (not project-scoped). */
    async updateGlobalSecrets(secrets) {
        const config = this.loadSecretsConfig();
        config[Config.GLOBAL_SECRETS_KEY] = secrets;
        await this.saveSecretsConfig(config);
    }
    /**
     * Get effective secrets for a project.
     *
     * Project secrets define which env vars are injected into this project/workspace.
     * Global secrets are only used as a shared value store and are injected only when
     * a project secret references them via `{ secret: "GLOBAL_KEY" }`.
     */
    getEffectiveSecrets(projectPath) {
        const normalizedProjectPath = Config.normalizeSecretsProjectPath(projectPath) || projectPath;
        const config = this.loadSecretsConfig();
        const projectSecrets = config[normalizedProjectPath] ?? [];
        const globalSecretsByKey = secretsToRecord(config[Config.GLOBAL_SECRETS_KEY] ?? []);
        return projectSecrets.map((secret) => {
            if (!Config.isSecretReferenceValue(secret.value)) {
                return secret;
            }
            const targetKey = secret.value.secret.trim();
            if (!targetKey) {
                return secret;
            }
            // Allow empty-string global secrets by checking for undefined explicitly.
            const resolvedGlobalValue = globalSecretsByKey[targetKey];
            if (resolvedGlobalValue !== undefined) {
                return {
                    ...secret,
                    value: resolvedGlobalValue,
                };
            }
            return secret;
        });
    }
    /**
     * Get secrets for a specific project.
     *
     * Note: this is project-only (does not include global secrets).
     */
    getProjectSecrets(projectPath) {
        const normalizedProjectPath = Config.normalizeSecretsProjectPath(projectPath) || projectPath;
        const config = this.loadSecretsConfig();
        return config[normalizedProjectPath] ?? [];
    }
    /**
     * Update secrets for a specific project
     * @param projectPath The path to the project
     * @param secrets The secrets to save for the project
     */
    async updateProjectSecrets(projectPath, secrets) {
        const normalizedProjectPath = Config.normalizeSecretsProjectPath(projectPath) || projectPath;
        const config = this.loadSecretsConfig();
        config[normalizedProjectPath] = secrets;
        await this.saveSecretsConfig(config);
    }
}
Config.GLOBAL_SECRETS_KEY = "__global__";
// Default instance for application use
export const defaultConfig = new Config();
//# sourceMappingURL=config.js.map