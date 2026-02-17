/**
 * Runtime configuration types for workspace execution environments
 */
import { RuntimeModeSchema } from "../orpc/schemas";
/** Runtime mode constants */
export const RUNTIME_MODE = {
    LOCAL: "local",
    WORKTREE: "worktree",
    SSH: "ssh",
    DOCKER: "docker",
    DEVCONTAINER: "devcontainer",
};
/** Runtime string prefix for SSH mode (e.g., "ssh hostname") */
export const SSH_RUNTIME_PREFIX = "ssh ";
/** Runtime string prefix for Docker mode (e.g., "docker ubuntu:22.04") */
export const DOCKER_RUNTIME_PREFIX = "docker ";
/** Runtime string prefix for Devcontainer mode (e.g., "devcontainer .devcontainer/devcontainer.json") */
export const DEVCONTAINER_RUNTIME_PREFIX = "devcontainer ";
/** Placeholder host for Coder SSH runtimes (where host is derived from Coder config) */
export const CODER_RUNTIME_PLACEHOLDER = "coder://";
/**
 * Parse runtime string from localStorage or UI input into structured result.
 * Format: "ssh <host>" -> { mode: "ssh", host: "<host>" }
 *         "docker <image>" -> { mode: "docker", image: "<image>" }
 *         "worktree" -> { mode: "worktree" }
 *         "local" -> { mode: "local" }
 *         undefined/null -> { mode: "worktree" } (default)
 *
 * Note: "ssh" or "docker" without arguments returns null (invalid).
 * Use this for UI state management (localStorage, form inputs).
 */
export function parseRuntimeModeAndHost(runtime) {
    if (!runtime) {
        return { mode: RUNTIME_MODE.WORKTREE };
    }
    const trimmed = runtime.trim();
    const lowerTrimmed = trimmed.toLowerCase();
    if (lowerTrimmed === RUNTIME_MODE.LOCAL) {
        return { mode: RUNTIME_MODE.LOCAL };
    }
    if (lowerTrimmed === RUNTIME_MODE.WORKTREE) {
        return { mode: RUNTIME_MODE.WORKTREE };
    }
    // Check for "ssh <host>" format
    if (lowerTrimmed.startsWith(SSH_RUNTIME_PREFIX)) {
        const host = trimmed.substring(SSH_RUNTIME_PREFIX.length).trim();
        if (!host)
            return null; // "ssh " without host is invalid
        return { mode: RUNTIME_MODE.SSH, host };
    }
    // Plain "ssh" without host is invalid
    if (lowerTrimmed === RUNTIME_MODE.SSH) {
        return null;
    }
    // Check for "docker <image>" format
    if (lowerTrimmed.startsWith(DOCKER_RUNTIME_PREFIX)) {
        const image = trimmed.substring(DOCKER_RUNTIME_PREFIX.length).trim();
        if (!image)
            return null; // "docker " without image is invalid
        return { mode: RUNTIME_MODE.DOCKER, image };
    }
    // Plain "docker" without image is invalid
    if (lowerTrimmed === RUNTIME_MODE.DOCKER) {
        return null;
    }
    // Check for "devcontainer <configPath>" format (config path is optional)
    if (lowerTrimmed.startsWith(DEVCONTAINER_RUNTIME_PREFIX)) {
        const configPath = trimmed.substring(DEVCONTAINER_RUNTIME_PREFIX.length).trim();
        return { mode: RUNTIME_MODE.DEVCONTAINER, configPath };
    }
    if (lowerTrimmed === RUNTIME_MODE.DEVCONTAINER) {
        return { mode: RUNTIME_MODE.DEVCONTAINER, configPath: "" };
    }
    // Try to parse as a plain mode (local/worktree/devcontainer)
    const modeResult = RuntimeModeSchema.safeParse(lowerTrimmed);
    if (modeResult.success) {
        const mode = modeResult.data;
        if (mode === "local")
            return { mode: "local" };
        if (mode === "worktree")
            return { mode: "worktree" };
        if (mode === "devcontainer")
            return { mode: "devcontainer", configPath: "" };
        // ssh/docker without args handled above
    }
    // Unrecognized - return null
    return null;
}
/**
 * Build runtime string for storage/IPC from parsed runtime.
 * Returns: "ssh <host>" for SSH, "docker <image>" for Docker, "local" for local, undefined for worktree (default)
 */
export function buildRuntimeString(parsed) {
    switch (parsed.mode) {
        case RUNTIME_MODE.SSH:
            return `${SSH_RUNTIME_PREFIX}${parsed.host}`;
        case RUNTIME_MODE.DOCKER:
            return `${DOCKER_RUNTIME_PREFIX}${parsed.image}`;
        case RUNTIME_MODE.LOCAL:
            return "local";
        case RUNTIME_MODE.DEVCONTAINER: {
            const configPath = parsed.configPath.trim();
            return configPath.length > 0
                ? `${DEVCONTAINER_RUNTIME_PREFIX}${configPath}`
                : RUNTIME_MODE.DEVCONTAINER;
        }
        case RUNTIME_MODE.WORKTREE:
            // Worktree is default, no string needed
            return undefined;
    }
}
/**
 * Convert ParsedRuntime to RuntimeConfig for workspace creation.
 * This preserves all fields (like shareCredentials for Docker) that would be lost
 * in string serialization via buildRuntimeString + parseRuntimeString.
 */
export function buildRuntimeConfig(parsed) {
    switch (parsed.mode) {
        case RUNTIME_MODE.SSH:
            return {
                type: RUNTIME_MODE.SSH,
                host: parsed.host.trim(),
                srcBaseDir: "~/mux", // Default remote base directory (tilde resolved by backend)
                coder: parsed.coder,
            };
        case RUNTIME_MODE.DOCKER:
            return {
                type: RUNTIME_MODE.DOCKER,
                image: parsed.image.trim(),
                shareCredentials: parsed.shareCredentials,
            };
        case RUNTIME_MODE.LOCAL:
            return { type: RUNTIME_MODE.LOCAL };
        case RUNTIME_MODE.DEVCONTAINER:
            return {
                type: RUNTIME_MODE.DEVCONTAINER,
                configPath: parsed.configPath.trim(),
                shareCredentials: parsed.shareCredentials,
            };
        case RUNTIME_MODE.WORKTREE:
            // Worktree uses system default config
            return undefined;
    }
}
/**
 * Type guard to check if a runtime config is SSH
 */
export function isSSHRuntime(config) {
    return config?.type === "ssh";
}
/**
 * Type guard to check if a runtime config is Docker
 */
export function isDockerRuntime(config) {
    return config?.type === "docker";
}
/**
 * Type guard to check if a runtime config is Devcontainer
 */
export function isDevcontainerRuntime(config) {
    return config?.type === "devcontainer";
}
/**
 * Type guard to check if a runtime config uses worktree semantics.
 * This includes both explicit "worktree" type AND legacy "local" with srcBaseDir.
 */
export function isWorktreeRuntime(config) {
    if (!config)
        return false;
    if (config.type === "worktree")
        return true;
    // Legacy: "local" with srcBaseDir is treated as worktree
    if (config.type === "local" && "srcBaseDir" in config && config.srcBaseDir)
        return true;
    return false;
}
/**
 * Type guard to check if a runtime config is project-dir local (no isolation)
 */
export function isLocalProjectRuntime(config) {
    if (!config)
        return false;
    // "local" without srcBaseDir is project-dir runtime
    return config.type === "local" && !("srcBaseDir" in config && config.srcBaseDir);
}
/**
 * Type guard to check if a runtime config has srcBaseDir (worktree-style runtimes).
 * This narrows the type to allow safe access to srcBaseDir.
 */
export function hasSrcBaseDir(config) {
    if (!config)
        return false;
    return "srcBaseDir" in config && typeof config.srcBaseDir === "string";
}
/**
 * Helper to safely get srcBaseDir from a runtime config.
 * Returns undefined for project-dir local configs.
 */
export function getSrcBaseDir(config) {
    if (!config)
        return undefined;
    if (hasSrcBaseDir(config))
        return config.srcBaseDir;
    return undefined;
}
/**
 * Helper to extract devcontainer configs from availability status.
 * Returns empty array if not a devcontainer availability or not available.
 */
export function getDevcontainerConfigs(status) {
    if (status.available && "configs" in status) {
        return status.configs;
    }
    return [];
}
//# sourceMappingURL=runtime.js.map