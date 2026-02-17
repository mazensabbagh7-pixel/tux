/**
 * Shared git-bundle sync logic for remote runtimes (SSH, Docker).
 *
 * Each runtime is responsible for creating a bundle on the remote runtime (via pipe/cp/etc.).
 * This module handles the common steps once a remote bundle path exists.
 */
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
import { streamToString, shescape } from "./streamUtils";
import { execAsync } from "@/node/utils/disposableExec";
import { getErrorMessage } from "@/common/utils/errors";
import { log } from "@/node/services/log";
/**
 * Detect the origin remote URL for a local project.
 * Returns null if no origin exists, or if the URL points to a bundle file.
 * Exported for reuse by SSHRuntime's worktree-based sync path.
 */
export async function getOriginUrlForBundle(projectPath, initLogger, logErrors) {
    try {
        const env_1 = { stack: [], error: void 0, hasError: false };
        try {
            // Use git -C to avoid shell-specific `cd && ...` quoting.
            const proc = __addDisposableResource(env_1, execAsync(`git -C "${projectPath}" remote get-url origin`), false);
            const { stdout } = await proc.result;
            const url = stdout.trim();
            if (url && !url.includes(".bundle") && !url.includes(".mux-bundle")) {
                return { originUrl: url };
            }
            return { originUrl: null };
        }
        catch (e_1) {
            env_1.error = e_1;
            env_1.hasError = true;
        }
        finally {
            __disposeResources(env_1);
        }
    }
    catch (error) {
        // Not fatal (repo may not have an origin remote).
        if (logErrors) {
            initLogger.logStderr(`Could not get origin URL: ${getErrorMessage(error)}`);
        }
        else {
            log.debug("Could not get origin URL", { error: getErrorMessage(error) });
        }
        return { originUrl: null };
    }
}
const TRACKING_BRANCHES_COMMAND = "for branch in $(git for-each-ref --format='%(refname:short)' refs/remotes/origin/ | grep -v 'origin/HEAD'); do localname=${branch#origin/}; git show-ref --verify --quiet refs/heads/$localname || git branch $localname $branch; done";
export async function syncProjectViaGitBundle(params) {
    const { projectPath, workspacePath, remoteTmpDir, remoteBundlePath, exec, quoteRemotePath, initLogger, logOriginErrors, abortSignal, createRemoteBundle, cloneStep, } = params;
    if (abortSignal?.aborted) {
        throw new Error("Sync operation aborted before starting");
    }
    const { originUrl } = await getOriginUrlForBundle(projectPath, initLogger, logOriginErrors ?? false);
    // Ensure the bundle exists on the remote runtime.
    initLogger.logStep("Creating git bundle...");
    let createResult;
    try {
        createResult = await createRemoteBundle({ remoteBundlePath, initLogger, abortSignal });
    }
    catch (error) {
        // Best-effort cleanup (remote bundle may have been partially written).
        try {
            const rmStream = await exec(`rm -f ${quoteRemotePath(remoteBundlePath)}`, {
                cwd: remoteTmpDir,
                timeout: 10,
                abortSignal,
            });
            await rmStream.exitCode;
        }
        catch {
            // Ignore cleanup errors.
        }
        throw error;
    }
    try {
        // Clone from the bundle on the remote runtime.
        initLogger.logStep(cloneStep);
        const cloneStream = await exec(`git clone --quiet ${quoteRemotePath(remoteBundlePath)} ${quoteRemotePath(workspacePath)}`, {
            cwd: remoteTmpDir,
            timeout: 300,
            abortSignal,
        });
        const [cloneStdout, cloneStderr, cloneExitCode] = await Promise.all([
            streamToString(cloneStream.stdout),
            streamToString(cloneStream.stderr),
            cloneStream.exitCode,
        ]);
        if (cloneExitCode !== 0) {
            throw new Error(`Failed to clone repository: ${cloneStderr || cloneStdout}`);
        }
        // Create local tracking branches.
        initLogger.logStep("Creating local tracking branches...");
        const trackingStream = await exec(TRACKING_BRANCHES_COMMAND, {
            cwd: workspacePath,
            timeout: 30,
            abortSignal,
        });
        await trackingStream.exitCode;
        // Update origin remote.
        if (originUrl) {
            initLogger.logStep(`Setting origin remote to ${originUrl}...`);
            const setOriginStream = await exec(`git remote set-url origin ${shescape.quote(originUrl)}`, {
                cwd: workspacePath,
                timeout: 10,
                abortSignal,
            });
            const setOriginExitCode = await setOriginStream.exitCode;
            if (setOriginExitCode !== 0) {
                const stderr = await streamToString(setOriginStream.stderr);
                log.debug("Failed to set origin remote", { stderr });
            }
        }
        else {
            initLogger.logStep("Removing bundle origin remote...");
            const removeOriginStream = await exec(`git remote remove origin 2>/dev/null || true`, {
                cwd: workspacePath,
                timeout: 10,
                abortSignal,
            });
            await removeOriginStream.exitCode;
        }
        // Clean up remote bundle.
        initLogger.logStep("Cleaning up bundle file...");
        const rmStream = await exec(`rm -f ${quoteRemotePath(remoteBundlePath)}`, {
            cwd: remoteTmpDir,
            timeout: 10,
            abortSignal,
        });
        const rmExitCode = await rmStream.exitCode;
        if (rmExitCode !== 0) {
            log.debug("Failed to remove remote bundle file", { remoteBundlePath });
        }
        if (createResult && "cleanupLocal" in createResult && createResult.cleanupLocal) {
            await createResult.cleanupLocal();
        }
        initLogger.logStep("Repository cloned successfully");
    }
    catch (error) {
        // Best-effort cleanup (remote bundle + any local temp file).
        try {
            const rmStream = await exec(`rm -f ${quoteRemotePath(remoteBundlePath)}`, {
                cwd: remoteTmpDir,
                timeout: 10,
                abortSignal,
            });
            await rmStream.exitCode;
        }
        catch {
            // Ignore cleanup errors.
        }
        try {
            if (createResult && "cleanupLocal" in createResult && createResult.cleanupLocal) {
                await createResult.cleanupLocal();
            }
        }
        catch {
            // Ignore cleanup errors.
        }
        throw error;
    }
}
//# sourceMappingURL=gitBundleSync.js.map