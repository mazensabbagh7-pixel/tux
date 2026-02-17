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
import * as fs from "fs";
import * as path from "path";
import { execAsync } from "@/node/utils/disposableExec";
import { createRuntime } from "./runtime/runtimeFactory";
import { log } from "./services/log";
/**
 * Remove stale .git/index.lock file if it exists and is old.
 *
 * Git creates index.lock during operations that modify the index. If a process
 * is killed mid-operation (user cancel, crash, terminal closed), the lock file
 * gets orphaned. This is common in Mux when git operations are interrupted.
 *
 * We only remove locks older than STALE_LOCK_AGE_MS to avoid removing locks
 * from legitimately running processes.
 */
const STALE_LOCK_AGE_MS = 5000; // 5 seconds
export function cleanStaleLock(repoPath) {
    const lockPath = path.join(repoPath, ".git", "index.lock");
    try {
        const stat = fs.statSync(lockPath);
        const ageMs = Date.now() - stat.mtimeMs;
        if (ageMs > STALE_LOCK_AGE_MS) {
            fs.unlinkSync(lockPath);
            log.info(`Removed stale git index.lock (age: ${Math.round(ageMs / 1000)}s) at ${lockPath}`);
        }
    }
    catch {
        // Lock doesn't exist or can't be accessed - this is fine
    }
}
export async function listLocalBranches(projectPath) {
    const env_1 = { stack: [], error: void 0, hasError: false };
    try {
        const proc = __addDisposableResource(env_1, execAsync(`git -C "${projectPath}" for-each-ref --format="%(refname:short)" refs/heads`), false);
        const { stdout } = await proc.result;
        return stdout
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => line.length > 0)
            .sort((a, b) => a.localeCompare(b));
    }
    catch (e_1) {
        env_1.error = e_1;
        env_1.hasError = true;
    }
    finally {
        __disposeResources(env_1);
    }
}
export async function getCurrentBranch(projectPath) {
    try {
        const env_2 = { stack: [], error: void 0, hasError: false };
        try {
            const proc = __addDisposableResource(env_2, execAsync(`git -C "${projectPath}" rev-parse --abbrev-ref HEAD`), false);
            const { stdout } = await proc.result;
            const branch = stdout.trim();
            if (!branch || branch === "HEAD") {
                return null;
            }
            return branch;
        }
        catch (e_2) {
            env_2.error = e_2;
            env_2.hasError = true;
        }
        finally {
            __disposeResources(env_2);
        }
    }
    catch {
        return null;
    }
}
const FALLBACK_TRUNK_CANDIDATES = ["main", "master", "trunk", "develop", "default"];
export async function detectDefaultTrunkBranch(projectPath, branches) {
    const branchList = branches ?? (await listLocalBranches(projectPath));
    if (branchList.length === 0) {
        throw new Error(`No branches available in repository ${projectPath}`);
    }
    const branchSet = new Set(branchList);
    const currentBranch = await getCurrentBranch(projectPath);
    if (currentBranch && branchSet.has(currentBranch)) {
        return currentBranch;
    }
    for (const candidate of FALLBACK_TRUNK_CANDIDATES) {
        if (branchSet.has(candidate)) {
            return candidate;
        }
    }
    return branchList[0];
}
export async function createWorktree(config, projectPath, branchName, options) {
    // Clean up stale lock before git operations on main repo
    cleanStaleLock(projectPath);
    try {
        const env_3 = { stack: [], error: void 0, hasError: false };
        try {
            // Use directoryName if provided, otherwise fall back to branchName (legacy)
            const dirName = options.directoryName ?? branchName;
            // Compute workspace path using Runtime (single source of truth)
            const runtime = createRuntime(options.runtimeConfig ?? { type: "local", srcBaseDir: config.srcDir }, { projectPath });
            const workspacePath = runtime.getWorkspacePath(projectPath, dirName);
            const { trunkBranch } = options;
            const normalizedTrunkBranch = typeof trunkBranch === "string" ? trunkBranch.trim() : "";
            if (!normalizedTrunkBranch) {
                return {
                    success: false,
                    error: "Trunk branch is required to create a workspace",
                };
            }
            console.assert(normalizedTrunkBranch.length > 0, "Expected trunk branch to be validated before calling createWorktree");
            // Create workspace directory if it doesn't exist
            if (!fs.existsSync(path.dirname(workspacePath))) {
                fs.mkdirSync(path.dirname(workspacePath), { recursive: true });
            }
            // Check if workspace already exists
            if (fs.existsSync(workspacePath)) {
                return {
                    success: false,
                    error: `Workspace already exists at ${workspacePath}`,
                };
            }
            const localBranches = await listLocalBranches(projectPath);
            // If branch already exists locally, reuse it instead of creating a new one
            if (localBranches.includes(branchName)) {
                const env_4 = { stack: [], error: void 0, hasError: false };
                try {
                    const proc = __addDisposableResource(env_4, execAsync(`git -C "${projectPath}" worktree add "${workspacePath}" "${branchName}"`), false);
                    await proc.result;
                    return { success: true, path: workspacePath };
                }
                catch (e_3) {
                    env_4.error = e_3;
                    env_4.hasError = true;
                }
                finally {
                    __disposeResources(env_4);
                }
            }
            // Check if branch exists remotely (origin/<branchName>)
            const remoteBranchesProc = __addDisposableResource(env_3, execAsync(`git -C "${projectPath}" branch -a`), false);
            const { stdout: remoteBranchesRaw } = await remoteBranchesProc.result;
            const branchExists = remoteBranchesRaw
                .split("\n")
                .map((b) => b.trim().replace(/^(\*)\s+/, ""))
                .some((b) => b === branchName || b === `remotes/origin/${branchName}`);
            if (branchExists) {
                const env_5 = { stack: [], error: void 0, hasError: false };
                try {
                    const proc = __addDisposableResource(env_5, execAsync(`git -C "${projectPath}" worktree add "${workspacePath}" "${branchName}"`), false);
                    await proc.result;
                    return { success: true, path: workspacePath };
                }
                catch (e_4) {
                    env_5.error = e_4;
                    env_5.hasError = true;
                }
                finally {
                    __disposeResources(env_5);
                }
            }
            if (!localBranches.includes(normalizedTrunkBranch)) {
                return {
                    success: false,
                    error: `Trunk branch "${normalizedTrunkBranch}" does not exist locally`,
                };
            }
            const proc = __addDisposableResource(env_3, execAsync(`git -C "${projectPath}" worktree add -b "${branchName}" "${workspacePath}" "${normalizedTrunkBranch}"`), false);
            await proc.result;
            return { success: true, path: workspacePath };
        }
        catch (e_5) {
            env_3.error = e_5;
            env_3.hasError = true;
        }
        finally {
            __disposeResources(env_3);
        }
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { success: false, error: message };
    }
}
/**
 * Get the main repository path from a worktree path
 * @param worktreePath Path to a git worktree
 * @returns Path to the main repository, or null if not found
 */
export async function getMainWorktreeFromWorktree(worktreePath) {
    try {
        const env_6 = { stack: [], error: void 0, hasError: false };
        try {
            // Get the worktree list from the worktree itself
            const proc = __addDisposableResource(env_6, execAsync(`git -C "${worktreePath}" worktree list --porcelain`), false);
            const { stdout } = await proc.result;
            const lines = stdout.split("\n");
            // The first worktree in the list is always the main worktree
            for (const line of lines) {
                if (line.startsWith("worktree ")) {
                    return line.slice("worktree ".length);
                }
            }
            return null;
        }
        catch (e_6) {
            env_6.error = e_6;
            env_6.hasError = true;
        }
        finally {
            __disposeResources(env_6);
        }
    }
    catch {
        return null;
    }
}
export async function removeWorktree(projectPath, workspacePath, options = { force: false }) {
    // Clean up stale lock before git operations on main repo
    cleanStaleLock(projectPath);
    try {
        const env_7 = { stack: [], error: void 0, hasError: false };
        try {
            // Remove the worktree (from the main repository context)
            const proc = __addDisposableResource(env_7, execAsync(`git -C "${projectPath}" worktree remove "${workspacePath}" ${options.force ? "--force" : ""}`), false);
            await proc.result;
            return { success: true };
        }
        catch (e_7) {
            env_7.error = e_7;
            env_7.hasError = true;
        }
        finally {
            __disposeResources(env_7);
        }
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { success: false, error: message };
    }
}
export async function pruneWorktrees(projectPath) {
    // Clean up stale lock before git operations on main repo
    cleanStaleLock(projectPath);
    try {
        const env_8 = { stack: [], error: void 0, hasError: false };
        try {
            const proc = __addDisposableResource(env_8, execAsync(`git -C "${projectPath}" worktree prune`), false);
            await proc.result;
            return { success: true };
        }
        catch (e_8) {
            env_8.error = e_8;
            env_8.hasError = true;
        }
        finally {
            __disposeResources(env_8);
        }
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { success: false, error: message };
    }
}
//# sourceMappingURL=git.js.map