var __addDisposableResource = (this && this.__addDisposableResource) || function (env, value, async) {
    if (value !== null && value !== void 0) {
        if (typeof value !== "object" && typeof value !== "function") throw new TypeError("Object expected.");
        var dispose, inner;
        if (async) {
            if (!Symbol.asyncDispose) throw new TypeError("Symbol.asyncDispose is not defined.");
            dispose = value[Symbol.asyncDispose];
        }
        if (dispose === void 0) {
            if (!Symbol.dispose) throw new TypeError("Symbol.dispose is not defined.");
            dispose = value[Symbol.dispose];
            if (async) inner = dispose;
        }
        if (typeof dispose !== "function") throw new TypeError("Object not disposable.");
        if (inner) dispose = function() { try { inner.call(this); } catch (e) { return Promise.reject(e); } };
        env.stack.push({ value: value, dispose: dispose, async: async });
    }
    else if (async) {
        env.stack.push({ async: true });
    }
    return value;
};
var __disposeResources = (this && this.__disposeResources) || (function (SuppressedError) {
    return function (env) {
        function fail(e) {
            env.error = env.hasError ? new SuppressedError(e, env.error, "An error was suppressed during disposal.") : e;
            env.hasError = true;
        }
        var r, s = 0;
        function next() {
            while (r = env.stack.pop()) {
                try {
                    if (!r.async && s === 1) return s = 0, env.stack.push(r), Promise.resolve().then(next);
                    if (r.dispose) {
                        var result = r.dispose.call(r.value);
                        if (r.async) return s |= 2, Promise.resolve(result).then(next, function(e) { fail(e); return next(); });
                    }
                    else s |= 1;
                }
                catch (e) {
                    fail(e);
                }
            }
            if (s === 1) return env.hasError ? Promise.reject(env.error) : Promise.resolve();
            if (env.hasError) throw env.error;
        }
        return next();
    };
})(typeof SuppressedError === "function" ? SuppressedError : function (error, suppressed, message) {
    var e = new Error(message);
    return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
});
import * as fs from "fs/promises";
import * as path from "path";
import { LocalRuntime } from "./LocalRuntime";
import { WorktreeRuntime } from "./WorktreeRuntime";
import { SSHRuntime } from "./SSHRuntime";
import { CoderSSHRuntime } from "./CoderSSHRuntime";
import { createSSHTransport } from "./transports";
import { DockerRuntime, getContainerName } from "./DockerRuntime";
import { DevcontainerRuntime } from "./DevcontainerRuntime";
import { hasSrcBaseDir } from "@/common/types/runtime";
import { isIncompatibleRuntimeConfig } from "@/common/utils/runtimeCompatibility";
import { execAsync } from "@/node/utils/disposableExec";
import { Config } from "@/node/config";
import { checkDevcontainerCliVersion } from "./devcontainerCli";
import { buildDevcontainerConfigInfo, scanDevcontainerConfigs } from "./devcontainerConfigs";
// Re-export for backward compatibility with existing imports
export { isIncompatibleRuntimeConfig };
// Global CoderService singleton - set during app init so all createRuntime calls can use it
let globalCoderService;
/**
 * Set the global CoderService instance for runtime factory.
 * Call this during app initialization so createRuntime() can create CoderSSHRuntime
 * without requiring callers to pass coderService explicitly.
 */
export function setGlobalCoderService(service) {
    globalCoderService = service;
}
/**
 * Run the full init sequence: postCreateSetup (if present) then initWorkspace.
 * Use this everywhere instead of calling initWorkspace directly to ensure
 * runtimes with provisioning steps (Docker, CoderSSH) work correctly.
 */
export async function runFullInit(runtime, params) {
    if (runtime.postCreateSetup) {
        await runtime.postCreateSetup(params);
    }
    return runtime.initWorkspace(params);
}
/**
 * Fire-and-forget init with standardized error handling.
 * Use this for background init after workspace creation (workspaceService, taskService).
 */
export function runBackgroundInit(runtime, params, workspaceId, logger) {
    void (async () => {
        try {
            await runFullInit(runtime, params);
        }
        catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            logger?.error(`Workspace init failed for ${workspaceId}:`, { error });
            params.initLogger.logStderr(`Initialization failed: ${errorMsg}`);
            params.initLogger.logComplete(-1);
        }
    })();
}
function shouldUseSSH2Runtime() {
    // Windows always uses SSH2 (no native OpenSSH)
    if (process.platform === "win32") {
        return true;
    }
    // Other platforms: check config (defaults to OpenSSH)
    const config = new Config();
    return config.loadConfigOrDefault().useSSH2Transport ?? false;
}
/**
 * Error thrown when a workspace has an incompatible runtime configuration,
 * typically from a newer version of mux that added new runtime types.
 */
export class IncompatibleRuntimeError extends Error {
    constructor(message) {
        super(message);
        this.name = "IncompatibleRuntimeError";
    }
}
/**
 * Create a Runtime instance based on the configuration.
 *
 * Handles runtime types:
 * - "local" without srcBaseDir: Project-dir runtime (no isolation) - requires projectPath in options
 * - "local" with srcBaseDir: Legacy worktree config (backward compat)
 * - "worktree": Explicit worktree runtime
 * - "ssh": Remote SSH runtime
 * - "docker": Docker container runtime
 */
export function createRuntime(config, options) {
    // Check for incompatible configs from newer versions
    if (isIncompatibleRuntimeConfig(config)) {
        throw new IncompatibleRuntimeError(`This workspace uses a runtime configuration from a newer version of mux. ` +
            `Please upgrade mux to use this workspace.`);
    }
    switch (config.type) {
        case "local":
            // Check if this is legacy "local" with srcBaseDir (= worktree semantics)
            // or new "local" without srcBaseDir (= project-dir semantics)
            if (hasSrcBaseDir(config)) {
                // Legacy: "local" with srcBaseDir is treated as worktree
                return new WorktreeRuntime(config.srcBaseDir, {
                    projectPath: options?.projectPath,
                    workspaceName: options?.workspaceName,
                });
            }
            // Project-dir: uses project path directly, no isolation
            if (!options?.projectPath) {
                throw new Error("LocalRuntime requires projectPath in options for project-dir config (type: 'local' without srcBaseDir)");
            }
            return new LocalRuntime(options.projectPath);
        case "worktree":
            return new WorktreeRuntime(config.srcBaseDir, {
                projectPath: options?.projectPath,
                workspaceName: options?.workspaceName,
            });
        case "ssh": {
            const sshConfig = {
                host: config.host,
                srcBaseDir: config.srcBaseDir,
                bgOutputDir: config.bgOutputDir,
                identityFile: config.identityFile,
                port: config.port,
            };
            const useSSH2 = shouldUseSSH2Runtime();
            const transport = createSSHTransport(sshConfig, useSSH2);
            // Use a Coder SSH runtime for SSH+Coder when coderService is available (explicit or global)
            const coderService = options?.coderService ?? globalCoderService;
            if (config.coder) {
                if (!coderService) {
                    throw new Error("Coder runtime requested but CoderService is not initialized");
                }
                return new CoderSSHRuntime({ ...sshConfig, coder: config.coder }, transport, coderService, {
                    projectPath: options?.projectPath,
                    workspaceName: options?.workspaceName,
                });
            }
            return new SSHRuntime(sshConfig, transport, {
                projectPath: options?.projectPath,
                workspaceName: options?.workspaceName,
            });
        }
        case "docker": {
            // For existing workspaces, derive container name from project+workspace
            const containerName = options?.projectPath && options?.workspaceName
                ? getContainerName(options.projectPath, options.workspaceName)
                : config.containerName;
            return new DockerRuntime({
                image: config.image,
                containerName,
                shareCredentials: config.shareCredentials,
            });
        }
        case "devcontainer": {
            // Devcontainer uses worktrees on host + container exec
            // srcBaseDir sourced from config to honor MUX_ROOT and dev-mode suffixes
            const runtime = new DevcontainerRuntime({
                srcBaseDir: new Config().srcDir,
                configPath: config.configPath,
                shareCredentials: config.shareCredentials,
            });
            // Set workspace path for existing workspaces
            if (options?.projectPath && options?.workspaceName) {
                runtime.setCurrentWorkspacePath(runtime.getWorkspacePath(options.projectPath, options.workspaceName));
            }
            return runtime;
        }
        default: {
            const unknownConfig = config;
            throw new Error(`Unknown runtime type: ${unknownConfig.type ?? "undefined"}`);
        }
    }
}
/**
 * Helper to check if a runtime config requires projectPath for createRuntime.
 */
export function runtimeRequiresProjectPath(config) {
    // Project-dir local runtime (no srcBaseDir) requires projectPath
    return config.type === "local" && !hasSrcBaseDir(config);
}
/**
 * Check if a project has a .git directory (is a git repository).
 */
async function isGitRepository(projectPath) {
    try {
        const gitPath = path.join(projectPath, ".git");
        const stat = await fs.stat(gitPath);
        // .git can be a directory (normal repo) or a file (worktree)
        return stat.isDirectory() || stat.isFile();
    }
    catch {
        return false;
    }
}
/**
 * Check if Docker daemon is running and accessible.
 */
async function isDockerAvailable() {
    let timeoutHandle;
    try {
        const env_1 = { stack: [], error: void 0, hasError: false };
        try {
            const proc = __addDisposableResource(env_1, execAsync("docker info"), false);
            const timeout = new Promise((_, reject) => {
                timeoutHandle = setTimeout(() => reject(new Error("timeout")), 5000);
            });
            await Promise.race([proc.result, timeout]);
            return true;
        }
        catch (e_1) {
            env_1.error = e_1;
            env_1.hasError = true;
        }
        finally {
            __disposeResources(env_1);
        }
    }
    catch {
        return false;
    }
    finally {
        if (timeoutHandle)
            clearTimeout(timeoutHandle);
    }
}
/**
 * Check availability of all runtime types for a given project.
 * Returns a record of runtime mode to availability status.
 */
export async function checkRuntimeAvailability(projectPath) {
    const [isGit, dockerAvailable, devcontainerCliInfo, devcontainerConfigs] = await Promise.all([
        isGitRepository(projectPath),
        isDockerAvailable(),
        checkDevcontainerCliVersion(),
        scanDevcontainerConfigs(projectPath),
    ]);
    const devcontainerConfigInfo = buildDevcontainerConfigInfo(devcontainerConfigs);
    const gitRequiredReason = "Requires git repository";
    // Determine devcontainer availability
    let devcontainerAvailability;
    if (!isGit) {
        devcontainerAvailability = { available: false, reason: gitRequiredReason };
    }
    else if (!devcontainerCliInfo) {
        devcontainerAvailability = {
            available: false,
            reason: "Dev Container CLI not installed. Run: npm install -g @devcontainers/cli",
        };
    }
    else if (!dockerAvailable) {
        devcontainerAvailability = { available: false, reason: "Docker daemon not running" };
    }
    else if (devcontainerConfigInfo.length === 0) {
        devcontainerAvailability = { available: false, reason: "No devcontainer.json found" };
    }
    else {
        devcontainerAvailability = {
            available: true,
            configs: devcontainerConfigInfo,
            cliVersion: devcontainerCliInfo.version,
        };
    }
    return {
        local: { available: true },
        worktree: isGit ? { available: true } : { available: false, reason: gitRequiredReason },
        ssh: isGit ? { available: true } : { available: false, reason: gitRequiredReason },
        docker: !isGit
            ? { available: false, reason: gitRequiredReason }
            : !dockerAvailable
                ? { available: false, reason: "Docker daemon not running" }
                : { available: true },
        devcontainer: devcontainerAvailability,
    };
}
//# sourceMappingURL=runtimeFactory.js.map