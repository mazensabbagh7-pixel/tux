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
import { DEFAULT_SECTION_COLOR } from "@/common/constants/ui";
import { sortSectionsByLinkedList } from "@/common/utils/sections";
import { isWorkspaceArchived } from "@/common/utils/archive";
import { spawn } from "child_process";
import { randomBytes } from "crypto";
import { validateProjectPath, isGitRepository } from "@/node/utils/pathUtils";
import { listLocalBranches, detectDefaultTrunkBranch } from "@/node/git";
import { Ok, Err } from "@/common/types/result";
import * as fsPromises from "fs/promises";
import { execAsync, killProcessTree } from "@/node/utils/disposableExec";
import { buildFileCompletionsIndex, EMPTY_FILE_COMPLETIONS_INDEX, searchFileCompletions, } from "@/node/services/fileCompletionsIndex";
import { log } from "@/node/services/log";
import * as path from "path";
import { getMuxProjectsDir } from "@/common/constants/paths";
import { expandTilde } from "@/node/runtime/tildeExpansion";
/**
 * List directory contents for the DirectoryPickerModal.
 * Returns a FileTreeNode where:
 * - name and path are the resolved absolute path of the requested directory
 * - children are the immediate subdirectories (not recursive)
 */
async function listDirectory(requestedPath) {
    // Expand ~ to home directory (path.resolve doesn't handle tilde)
    const expanded = requestedPath === "~" || requestedPath.startsWith("~/") || requestedPath.startsWith("~\\")
        ? expandTilde(requestedPath)
        : requestedPath;
    const normalizedRoot = path.resolve(expanded || ".");
    const entries = await fsPromises.readdir(normalizedRoot, { withFileTypes: true });
    const children = entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => {
        const entryPath = path.join(normalizedRoot, entry.name);
        return {
            name: entry.name,
            path: entryPath,
            isDirectory: true,
            children: [],
        };
    });
    return {
        name: normalizedRoot,
        path: normalizedRoot,
        isDirectory: true,
        children,
    };
}
function isTildePrefixedPath(value) {
    return value === "~" || value.startsWith("~/") || value.startsWith("~\\");
}
function resolvePathWithTilde(inputPath) {
    const expanded = isTildePrefixedPath(inputPath) ? expandTilde(inputPath) : inputPath;
    return path.resolve(expanded);
}
function resolveProjectParentDir(parentDir, defaultProjectDir) {
    const rawParentDir = parentDir ?? defaultProjectDir ?? getMuxProjectsDir();
    const trimmedParentDir = rawParentDir.trim();
    if (!trimmedParentDir) {
        throw new Error("Project parent directory cannot be empty");
    }
    return resolvePathWithTilde(trimmedParentDir);
}
// Strip filesystem-unsafe characters (including control chars U+0000–U+001F)
function sanitizeRepoFolderName(name) {
    const unsafeCharsPattern = /[<>:"/\\|?*]/g;
    return name
        .replace(unsafeCharsPattern, "-")
        .replace(/^[.\s]+/, "")
        .replace(/[.\s]+$/, "");
}
function deriveRepoFolderName(repoUrl) {
    const trimmedRepoUrl = repoUrl.trim();
    if (!trimmedRepoUrl) {
        throw new Error("Repository URL cannot be empty");
    }
    let candidatePath = trimmedRepoUrl;
    // SSH-style shorthand: git@github.com:owner/repo.git
    const scpLikeMatch = /^[^@\s]+@[^:\s]+:(.+)$/.exec(trimmedRepoUrl);
    if (scpLikeMatch) {
        candidatePath = scpLikeMatch[1];
    }
    else if (/^[^/\\\s]+\/[^/\\\s]+$/.test(trimmedRepoUrl)) {
        // Owner/repo shorthand
        candidatePath = trimmedRepoUrl;
    }
    else {
        try {
            // https://..., ssh://..., file://...
            const parsed = new URL(trimmedRepoUrl);
            candidatePath = decodeURIComponent(parsed.pathname);
        }
        catch {
            // Not a URL with protocol. Treat as local path-like input.
        }
    }
    const normalizedCandidatePath = candidatePath.replace(/\\/g, "/").replace(/\/+$/, "");
    const repoName = path.posix.basename(normalizedCandidatePath).replace(/\.git$/i, "");
    const safeFolderName = sanitizeRepoFolderName(repoName);
    if (!safeFolderName) {
        throw new Error("Could not determine destination folder name from repository URL");
    }
    return safeFolderName;
}
const GITHUB_SHORTHAND_PATTERN = /^[a-zA-Z0-9][\w-]*\/[a-zA-Z0-9][\w.-]*$/;
function hasLikelySshCredentials() {
    const sshAgentSocket = process.env.SSH_AUTH_SOCK;
    // Be conservative: only prefer git@github.com shorthand when the session has an active
    // SSH agent. The mere presence of local key files does not imply GitHub SSH access.
    return typeof sshAgentSocket === "string" && sshAgentSocket.trim().length > 0;
}
/**
 * Normalize a repo URL so git clone receives a valid remote.
 * Expands "owner/repo" shorthand to either SSH or HTTPS based on likely local credentials.
 * All other inputs (HTTPS URLs, SSH URLs, SCP-style, etc.) pass through unchanged.
 */
function normalizeRepoUrlForClone(repoUrl) {
    const trimmedRepoUrl = repoUrl.trim();
    const shorthandCandidate = trimmedRepoUrl.replace(/[\\/]+$/, "");
    // owner/repo shorthand: exactly two non-empty segments separated by a single slash,
    // where the first segment looks like a GitHub username (letters, digits, hyphens).
    // Excludes local paths like ../repo, ./foo, foo/bar/baz, and absolute paths.
    // Note: bare `foo/bar` style local relative paths are intentionally treated as GitHub
    // shorthand here because this function is only called from the Clone dialog, which is
    // specifically for remote repos. Users cloning local repos should use the "Local folder" tab.
    if (GITHUB_SHORTHAND_PATTERN.test(shorthandCandidate)) {
        // Strip existing .git suffix before appending to avoid double .git (e.g. owner/repo.git → owner/repo.git.git)
        const withoutGitSuffix = shorthandCandidate.replace(/\.git$/i, "");
        // Prefer SSH for shorthand only when the current session has an active SSH agent.
        // This avoids assuming GitHub access from unrelated key files on disk.
        if (hasLikelySshCredentials()) {
            return `git@github.com:${withoutGitSuffix}.git`;
        }
        return `https://github.com/${withoutGitSuffix}.git`;
    }
    // Strip query strings and fragments only from URL-like inputs (protocol:// or git@),
    // not from local paths where # and ? may be valid filename characters.
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmedRepoUrl) || trimmedRepoUrl.startsWith("git@")) {
        return trimmedRepoUrl.replace(/[?#].*$/, "");
    }
    return trimmedRepoUrl;
}
const FILE_COMPLETIONS_CACHE_TTL_MS = 10000;
export class ProjectService {
    constructor(config) {
        this.config = config;
        this.fileCompletionsCache = new Map();
    }
    setDirectoryPicker(picker) {
        this.directoryPicker = picker;
    }
    async pickDirectory() {
        if (!this.directoryPicker)
            return null;
        return this.directoryPicker();
    }
    async create(projectPath) {
        try {
            // Validate input
            if (!projectPath || projectPath.trim().length === 0) {
                return Err("Project path cannot be empty");
            }
            // Resolve the path:
            // - Bare names like "my-project" → ~/.mux/projects/my-project
            // - Paths with ~ → expand to home directory
            // - Absolute/relative paths → resolve normally
            const isBareProjectName = projectPath.length > 0 &&
                !projectPath.includes("/") &&
                !projectPath.includes("\\") &&
                !projectPath.startsWith("~");
            const config = this.config.loadConfigOrDefault();
            let normalizedPath;
            if (isBareProjectName) {
                // Bare project name - put in default projects directory
                const parentDir = resolveProjectParentDir(undefined, config.defaultProjectDir);
                normalizedPath = path.join(parentDir, projectPath);
            }
            else if (projectPath === "~" ||
                projectPath.startsWith("~/") ||
                projectPath.startsWith("~\\")) {
                // Tilde expansion - uses expandTilde to respect MUX_ROOT for ~/.mux paths
                normalizedPath = path.resolve(expandTilde(projectPath));
            }
            else {
                normalizedPath = path.resolve(projectPath);
            }
            let existingStat = null;
            try {
                existingStat = await fsPromises.stat(normalizedPath);
            }
            catch (error) {
                const err = error;
                if (err.code !== "ENOENT") {
                    throw error;
                }
            }
            if (existingStat && !existingStat.isDirectory()) {
                return Err("Project path is not a directory");
            }
            if (config.projects.has(normalizedPath)) {
                return Err("Project already exists");
            }
            // Create the directory if it doesn't exist (like mkdir -p)
            await fsPromises.mkdir(normalizedPath, { recursive: true });
            const projectConfig = { workspaces: [] };
            config.projects.set(normalizedPath, projectConfig);
            await this.config.saveConfig(config);
            return Ok({ projectConfig, normalizedPath });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return Err(`Failed to create project: ${message}`);
        }
    }
    getDefaultProjectDir() {
        const config = this.config.loadConfigOrDefault();
        return resolveProjectParentDir(undefined, config.defaultProjectDir);
    }
    async setDefaultProjectDir(dirPath) {
        const trimmed = dirPath.trim();
        await this.config.editConfig((config) => ({
            ...config,
            defaultProjectDir: trimmed || undefined,
        }));
    }
    validateAndPrepareClone(input) {
        try {
            const repoUrl = input.repoUrl.trim();
            if (!repoUrl) {
                return Err("Repository URL cannot be empty");
            }
            const config = this.config.loadConfigOrDefault();
            const cloneParentDir = resolveProjectParentDir(input.cloneParentDir, config.defaultProjectDir);
            const repoFolderName = deriveRepoFolderName(repoUrl);
            const normalizedPath = path.join(cloneParentDir, repoFolderName);
            if (config.projects.has(normalizedPath)) {
                return Err(`Project already exists at ${normalizedPath}`);
            }
            return Ok({
                cloneUrl: normalizeRepoUrlForClone(repoUrl),
                normalizedPath,
                cloneParentDir,
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return Err(message);
        }
    }
    async *cloneWithProgress(input, signal) {
        const prepared = this.validateAndPrepareClone(input);
        if (!prepared.success) {
            yield { type: "error", error: prepared.error };
            return;
        }
        const { cloneUrl, normalizedPath, cloneParentDir } = prepared.data;
        const cloneWorkPath = `${normalizedPath}.mux-clone-${randomBytes(6).toString("hex")}`;
        let cloneSucceeded = false;
        const cleanupPartialClone = async () => {
            if (cloneSucceeded) {
                return;
            }
            try {
                // Only clean up the temp clone path we created so we never delete
                // a destination directory that another process created concurrently.
                await fsPromises.rm(cloneWorkPath, { recursive: true, force: true });
            }
            catch {
                // Ignore cleanup errors — the original error is more important.
            }
        };
        try {
            if (signal?.aborted) {
                yield { type: "error", error: "Clone cancelled" };
                return;
            }
            let cloneParentStat = null;
            try {
                cloneParentStat = await fsPromises.stat(cloneParentDir);
            }
            catch (error) {
                const err = error;
                if (err.code !== "ENOENT") {
                    throw error;
                }
            }
            if (cloneParentStat && !cloneParentStat.isDirectory()) {
                yield { type: "error", error: "Clone destination parent directory is not a directory" };
                return;
            }
            let destinationStat = null;
            try {
                destinationStat = await fsPromises.stat(normalizedPath);
            }
            catch (error) {
                const err = error;
                if (err.code !== "ENOENT") {
                    throw error;
                }
            }
            if (destinationStat) {
                yield { type: "error", error: `Destination already exists: ${normalizedPath}` };
                return;
            }
            await fsPromises.mkdir(cloneParentDir, { recursive: true });
            const child = spawn("git", ["clone", "--progress", "--", cloneUrl, cloneWorkPath], {
                stdio: ["ignore", "pipe", "pipe"],
                env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
                // Detached children become process-group leaders on Unix so we can
                // reliably terminate clone helpers (ssh, shells) as a full tree.
                detached: process.platform !== "win32",
            });
            const stderrChunks = [];
            // Preserve full stderr so failed clones can surface git's fatal message instead of only exit code 128.
            let collectedStderr = "";
            let resolveChunk = null;
            let processEnded = false;
            let resolveProcessExit = null;
            const processExitPromise = new Promise((resolve) => {
                resolveProcessExit = resolve;
            });
            let spawnErrorMessage = null;
            const getLastMeaningfulStderrLine = () => {
                const stderrLines = collectedStderr
                    .trim()
                    .split(/\r?\n/)
                    .map((line) => line.trim())
                    .filter((line) => line.length > 0);
                return stderrLines[stderrLines.length - 1] ?? null;
            };
            const notifyChunk = () => {
                if (!resolveChunk) {
                    return;
                }
                if (!processEnded && stderrChunks.length === 0) {
                    return;
                }
                const resolve = resolveChunk;
                resolveChunk = null;
                resolve();
            };
            const markProcessEnded = () => {
                if (processEnded) {
                    return;
                }
                processEnded = true;
                notifyChunk();
                if (resolveProcessExit) {
                    const resolve = resolveProcessExit;
                    resolveProcessExit = null;
                    resolve();
                }
            };
            child.stderr?.on("data", (data) => {
                const chunk = data.toString();
                stderrChunks.push(chunk);
                collectedStderr += chunk;
                notifyChunk();
            });
            child.on("error", (error) => {
                spawnErrorMessage = error.message;
                markProcessEnded();
            });
            child.on("close", () => {
                markProcessEnded();
            });
            if (child.exitCode !== null || child.signalCode !== null) {
                markProcessEnded();
            }
            const terminateCloneProcess = () => {
                if (child.killed || child.exitCode !== null || child.signalCode !== null) {
                    return;
                }
                if (typeof child.pid === "number" && child.pid > 0) {
                    killProcessTree(child.pid);
                    return;
                }
                try {
                    child.kill();
                }
                catch {
                    // Ignore ESRCH races if process exits between checks.
                }
            };
            const onAbort = () => {
                terminateCloneProcess();
                notifyChunk();
            };
            if (signal) {
                if (signal.aborted) {
                    onAbort();
                }
                else {
                    signal.addEventListener("abort", onAbort, { once: true });
                }
            }
            try {
                while (!processEnded) {
                    if (stderrChunks.length > 0) {
                        yield { type: "progress", line: stderrChunks.shift() };
                        continue;
                    }
                    await new Promise((resolve) => {
                        resolveChunk = resolve;
                        notifyChunk();
                    });
                }
            }
            finally {
                signal?.removeEventListener("abort", onAbort);
                terminateCloneProcess();
                await processExitPromise;
            }
            while (stderrChunks.length > 0) {
                yield { type: "progress", line: stderrChunks.shift() };
            }
            if (spawnErrorMessage != null) {
                await cleanupPartialClone();
                const errorMessage = getLastMeaningfulStderrLine() ?? spawnErrorMessage;
                yield { type: "error", error: errorMessage };
                return;
            }
            if (signal?.aborted) {
                await cleanupPartialClone();
                yield { type: "error", error: "Clone cancelled" };
                return;
            }
            const exitCode = child.exitCode;
            const exitSignal = child.signalCode;
            if (exitCode !== 0 || exitSignal != null) {
                await cleanupPartialClone();
                const errorMessage = getLastMeaningfulStderrLine() ??
                    (exitSignal != null
                        ? `Clone failed: process terminated by signal ${String(exitSignal)}`
                        : `Clone failed with exit code ${exitCode ?? "unknown"}`);
                yield { type: "error", error: errorMessage };
                return;
            }
            if (signal?.aborted) {
                await cleanupPartialClone();
                yield { type: "error", error: "Clone cancelled" };
                return;
            }
            try {
                await fsPromises.rename(cloneWorkPath, normalizedPath);
            }
            catch (error) {
                const err = error;
                if (err.code === "EEXIST" || err.code === "ENOTEMPTY") {
                    await cleanupPartialClone();
                    yield { type: "error", error: `Destination already exists: ${normalizedPath}` };
                    return;
                }
                throw error;
            }
            if (signal?.aborted) {
                // Abort won the race after rename but before config mutation.
                // Remove the newly materialized destination so cancellation remains authoritative.
                try {
                    await fsPromises.rm(normalizedPath, { recursive: true, force: true });
                }
                catch {
                    // Best-effort cleanup only.
                }
                yield { type: "error", error: "Clone cancelled" };
                return;
            }
            const projectConfig = { workspaces: [] };
            await this.config.editConfig((freshConfig) => {
                if (freshConfig.projects.has(normalizedPath)) {
                    return freshConfig;
                }
                const updatedProjects = new Map(freshConfig.projects);
                updatedProjects.set(normalizedPath, projectConfig);
                return { ...freshConfig, projects: updatedProjects };
            });
            if (!this.config.loadConfigOrDefault().projects.has(normalizedPath)) {
                // Config.saveConfig logs-and-continues on write failures, so verify persistence
                // explicitly before reporting success.
                try {
                    await fsPromises.rm(normalizedPath, { recursive: true, force: true });
                }
                catch {
                    // Best-effort rollback only.
                }
                yield { type: "error", error: "Failed to persist cloned project configuration" };
                return;
            }
            cloneSucceeded = true;
            yield { type: "success", projectConfig, normalizedPath };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            yield { type: "error", error: `Failed to clone repository: ${message}` };
        }
        finally {
            await cleanupPartialClone();
        }
    }
    async clone(input) {
        for await (const event of this.cloneWithProgress(input)) {
            if (event.type === "success") {
                return Ok({ projectConfig: event.projectConfig, normalizedPath: event.normalizedPath });
            }
            if (event.type === "error") {
                return Err(event.error);
            }
        }
        return Err("Clone did not return a completion event");
    }
    async remove(projectPath) {
        try {
            const config = this.config.loadConfigOrDefault();
            const projectConfig = config.projects.get(projectPath);
            if (!projectConfig) {
                return Err("Project not found");
            }
            const activeWorkspaces = projectConfig.workspaces.filter((w) => !isWorkspaceArchived(w.archivedAt, w.unarchivedAt));
            if (activeWorkspaces.length > 0) {
                return Err(`Cannot remove project with active workspaces. Please remove all ${activeWorkspaces.length} workspace(s) first.`);
            }
            config.projects.delete(projectPath);
            await this.config.saveConfig(config);
            try {
                await this.config.updateProjectSecrets(projectPath, []);
            }
            catch (error) {
                log.error(`Failed to clean up secrets for project ${projectPath}:`, error);
            }
            return Ok(undefined);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return Err(`Failed to remove project: ${message}`);
        }
    }
    list() {
        try {
            const config = this.config.loadConfigOrDefault();
            return Array.from(config.projects.entries());
        }
        catch (error) {
            log.error("Failed to list projects:", error);
            return [];
        }
    }
    async listBranches(projectPath) {
        if (typeof projectPath !== "string" || projectPath.trim().length === 0) {
            throw new Error("Project path is required to list branches");
        }
        try {
            const validation = await validateProjectPath(projectPath);
            if (!validation.valid) {
                throw new Error(validation.error ?? "Invalid project path");
            }
            const normalizedPath = validation.expandedPath;
            // Non-git repos return empty branches - they're restricted to local runtime only
            if (!(await isGitRepository(normalizedPath))) {
                return { branches: [], recommendedTrunk: null };
            }
            const branches = await listLocalBranches(normalizedPath);
            // Empty branches means the repo is unborn (git init but no commits yet)
            // Return empty branches - frontend will show the git init banner since no branches exist
            // After user creates a commit, branches will populate
            if (branches.length === 0) {
                return { branches: [], recommendedTrunk: null };
            }
            const recommendedTrunk = await detectDefaultTrunkBranch(normalizedPath, branches);
            return { branches, recommendedTrunk };
        }
        catch (error) {
            log.error("Failed to list branches:", error);
            throw error instanceof Error ? error : new Error(String(error));
        }
    }
    /**
     * Initialize a git repository in the project directory.
     * Runs `git init` and creates an initial commit so branches exist.
     * Also handles "unborn" repos (git init already run but no commits yet).
     */
    async gitInit(projectPath) {
        if (typeof projectPath !== "string" || projectPath.trim().length === 0) {
            return Err("Project path is required");
        }
        try {
            const env_1 = { stack: [], error: void 0, hasError: false };
            try {
                const validation = await validateProjectPath(projectPath);
                if (!validation.valid) {
                    return Err(validation.error ?? "Invalid project path");
                }
                const normalizedPath = validation.expandedPath;
                const isGitRepo = await isGitRepository(normalizedPath);
                if (isGitRepo) {
                    // Check if repo is "unborn" (git init but no commits yet)
                    const branches = await listLocalBranches(normalizedPath);
                    if (branches.length > 0) {
                        return Err("Directory is already a git repository with commits");
                    }
                    // Repo exists but is unborn - just create the initial commit
                }
                else {
                    const env_2 = { stack: [], error: void 0, hasError: false };
                    try {
                        // Initialize git repository with main as default branch
                        const initProc = __addDisposableResource(env_2, execAsync(`git -C "${normalizedPath}" init -b main`), false);
                        await initProc.result;
                    }
                    catch (e_1) {
                        env_2.error = e_1;
                        env_2.hasError = true;
                    }
                    finally {
                        __disposeResources(env_2);
                    }
                }
                // Create an initial empty commit so the branch exists and worktree/SSH can work
                // Without a commit, the repo is "unborn" and has no branches
                // Use -c flags to set identity only for this commit (don't persist to repo config)
                const commitProc = __addDisposableResource(env_1, execAsync(`git -C "${normalizedPath}" -c user.name="mux" -c user.email="mux@localhost" commit --allow-empty -m "Initial commit"`), false);
                await commitProc.result;
                // Invalidate file completions cache since the repo state changed
                this.fileCompletionsCache.delete(normalizedPath);
                return Ok(undefined);
            }
            catch (e_2) {
                env_1.error = e_2;
                env_1.hasError = true;
            }
            finally {
                __disposeResources(env_1);
            }
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            log.error("Failed to initialize git repository:", error);
            return Err(`Failed to initialize git repository: ${message}`);
        }
    }
    async getFileCompletions(projectPath, query, limit) {
        const resolvedLimit = limit ?? 20;
        if (typeof projectPath !== "string" || projectPath.trim().length === 0) {
            return { paths: [] };
        }
        const validation = await validateProjectPath(projectPath);
        if (!validation.valid) {
            return { paths: [] };
        }
        const normalizedPath = validation.expandedPath;
        let cacheEntry = this.fileCompletionsCache.get(normalizedPath);
        if (!cacheEntry) {
            cacheEntry = { index: EMPTY_FILE_COMPLETIONS_INDEX, fetchedAt: 0 };
            this.fileCompletionsCache.set(normalizedPath, cacheEntry);
        }
        const now = Date.now();
        const isStale = cacheEntry.fetchedAt === 0 || now - cacheEntry.fetchedAt > FILE_COMPLETIONS_CACHE_TTL_MS;
        if (isStale && !cacheEntry.refreshing) {
            cacheEntry.refreshing = (async () => {
                try {
                    const env_3 = { stack: [], error: void 0, hasError: false };
                    try {
                        if (!(await isGitRepository(normalizedPath))) {
                            cacheEntry.index = EMPTY_FILE_COMPLETIONS_INDEX;
                            return;
                        }
                        const proc = __addDisposableResource(env_3, execAsync(`git -C "${normalizedPath}" ls-files -co --exclude-standard`), false);
                        const { stdout } = await proc.result;
                        const files = stdout
                            .split("\n")
                            .map((line) => line.trim())
                            .filter((line) => line.length > 0)
                            // File @mentions are whitespace-delimited (extractAtMentions uses /@(\\S+)/), so
                            // suggestions containing spaces would be inserted incorrectly (e.g. "@foo bar.ts").
                            .filter((filePath) => !/\s/.test(filePath));
                        cacheEntry.index = buildFileCompletionsIndex(files);
                    }
                    catch (e_3) {
                        env_3.error = e_3;
                        env_3.hasError = true;
                    }
                    finally {
                        __disposeResources(env_3);
                    }
                }
                catch (error) {
                    log.debug("getFileCompletions: failed to list files", {
                        projectPath: normalizedPath,
                        error: error instanceof Error ? error.message : String(error),
                    });
                }
                finally {
                    cacheEntry.fetchedAt = Date.now();
                    cacheEntry.refreshing = undefined;
                }
            })();
        }
        if (cacheEntry.fetchedAt === 0 && cacheEntry.refreshing) {
            await cacheEntry.refreshing;
        }
        return { paths: searchFileCompletions(cacheEntry.index, query, resolvedLimit) };
    }
    getSecrets(projectPath) {
        try {
            return this.config.getProjectSecrets(projectPath);
        }
        catch (error) {
            log.error("Failed to get project secrets:", error);
            return [];
        }
    }
    async listDirectory(path) {
        try {
            const tree = await listDirectory(path);
            return { success: true, data: tree };
        }
        catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }
    async createDirectory(requestedPath) {
        try {
            // Expand ~ to home directory
            const expanded = requestedPath === "~" || requestedPath.startsWith("~/") || requestedPath.startsWith("~\\")
                ? expandTilde(requestedPath)
                : requestedPath;
            const normalizedPath = path.resolve(expanded);
            await fsPromises.mkdir(normalizedPath, { recursive: true });
            return Ok({ normalizedPath });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return Err(`Failed to create directory: ${message}`);
        }
    }
    async updateSecrets(projectPath, secrets) {
        try {
            await this.config.updateProjectSecrets(projectPath, secrets);
            return Ok(undefined);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return Err(`Failed to update project secrets: ${message}`);
        }
    }
    /**
     * Get idle compaction hours setting for a project.
     * Returns null if disabled or project not found.
     */
    getIdleCompactionHours(projectPath) {
        try {
            const config = this.config.loadConfigOrDefault();
            const project = config.projects.get(projectPath);
            return project?.idleCompactionHours ?? null;
        }
        catch (error) {
            log.error("Failed to get idle compaction hours:", error);
            return null;
        }
    }
    /**
     * Set idle compaction hours for a project.
     * Pass null to disable idle compaction.
     */
    async setIdleCompactionHours(projectPath, hours) {
        try {
            const config = this.config.loadConfigOrDefault();
            const project = config.projects.get(projectPath);
            if (!project) {
                return Err(`Project not found: ${projectPath}`);
            }
            project.idleCompactionHours = hours;
            await this.config.saveConfig(config);
            return Ok(undefined);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return Err(`Failed to set idle compaction hours: ${message}`);
        }
    }
    // ─────────────────────────────────────────────────────────────────────────────
    // Section Management
    // ─────────────────────────────────────────────────────────────────────────────
    /**
     * List all sections for a project, sorted by linked-list order.
     */
    listSections(projectPath) {
        try {
            const config = this.config.loadConfigOrDefault();
            const project = config.projects.get(projectPath);
            if (!project)
                return [];
            return sortSectionsByLinkedList(project.sections ?? []);
        }
        catch (error) {
            log.error("Failed to list sections:", error);
            return [];
        }
    }
    /**
     * Create a new section in a project.
     */
    async createSection(projectPath, name, color) {
        try {
            const config = this.config.loadConfigOrDefault();
            const project = config.projects.get(projectPath);
            if (!project) {
                return Err(`Project not found: ${projectPath}`);
            }
            const sections = project.sections ?? [];
            const section = {
                id: randomBytes(4).toString("hex"),
                name,
                color: color ?? DEFAULT_SECTION_COLOR,
                nextId: null, // new section is last
            };
            // Find current tail (nextId is null/undefined) and point it to new section
            const sorted = sortSectionsByLinkedList(sections);
            if (sorted.length > 0) {
                const tail = sorted[sorted.length - 1];
                tail.nextId = section.id;
            }
            project.sections = [...sections, section];
            await this.config.saveConfig(config);
            return Ok(section);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return Err(`Failed to create section: ${message}`);
        }
    }
    /**
     * Update section name and/or color.
     */
    async updateSection(projectPath, sectionId, updates) {
        try {
            const config = this.config.loadConfigOrDefault();
            const project = config.projects.get(projectPath);
            if (!project) {
                return Err(`Project not found: ${projectPath}`);
            }
            const sections = project.sections ?? [];
            const sectionIndex = sections.findIndex((s) => s.id === sectionId);
            if (sectionIndex === -1) {
                return Err(`Section not found: ${sectionId}`);
            }
            const section = sections[sectionIndex];
            if (updates.name !== undefined)
                section.name = updates.name;
            if (updates.color !== undefined)
                section.color = updates.color;
            await this.config.saveConfig(config);
            return Ok(undefined);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return Err(`Failed to update section: ${message}`);
        }
    }
    /**
     * Remove a section. Only archived workspaces can remain in the section;
     * active workspaces block removal. Archived workspaces become unsectioned.
     */
    async removeSection(projectPath, sectionId) {
        try {
            const config = this.config.loadConfigOrDefault();
            const project = config.projects.get(projectPath);
            if (!project) {
                return Err(`Project not found: ${projectPath}`);
            }
            const sections = project.sections ?? [];
            const sectionIndex = sections.findIndex((s) => s.id === sectionId);
            if (sectionIndex === -1) {
                return Err(`Section not found: ${sectionId}`);
            }
            // Check for active (non-archived) workspaces in this section
            const workspacesInSection = project.workspaces.filter((w) => w.sectionId === sectionId);
            const activeWorkspaces = workspacesInSection.filter((w) => !isWorkspaceArchived(w.archivedAt, w.unarchivedAt));
            if (activeWorkspaces.length > 0) {
                return Err(`Cannot remove section: ${activeWorkspaces.length} active workspace(s) still assigned. ` +
                    `Archive or move workspaces first.`);
            }
            // Remove sectionId from archived workspaces in this section
            for (const workspace of workspacesInSection) {
                workspace.sectionId = undefined;
            }
            // Remove the section
            project.sections = sections.filter((s) => s.id !== sectionId);
            await this.config.saveConfig(config);
            return Ok(undefined);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return Err(`Failed to remove section: ${message}`);
        }
    }
    /**
     * Reorder sections by providing the full ordered list of section IDs.
     */
    async reorderSections(projectPath, sectionIds) {
        try {
            const config = this.config.loadConfigOrDefault();
            const project = config.projects.get(projectPath);
            if (!project) {
                return Err(`Project not found: ${projectPath}`);
            }
            const sections = project.sections ?? [];
            const sectionMap = new Map(sections.map((s) => [s.id, s]));
            // Validate all IDs exist
            for (const id of sectionIds) {
                if (!sectionMap.has(id)) {
                    return Err(`Section not found: ${id}`);
                }
            }
            // Update nextId pointers based on array order
            for (let i = 0; i < sectionIds.length; i++) {
                const section = sectionMap.get(sectionIds[i]);
                section.nextId = i < sectionIds.length - 1 ? sectionIds[i + 1] : null;
            }
            await this.config.saveConfig(config);
            return Ok(undefined);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return Err(`Failed to reorder sections: ${message}`);
        }
    }
    /**
     * Assign a workspace to a section (or remove from section with null).
     */
    async assignWorkspaceToSection(projectPath, workspaceId, sectionId) {
        try {
            const config = this.config.loadConfigOrDefault();
            const project = config.projects.get(projectPath);
            if (!project) {
                return Err(`Project not found: ${projectPath}`);
            }
            // Validate section exists if not null
            if (sectionId !== null) {
                const sections = project.sections ?? [];
                if (!sections.some((s) => s.id === sectionId)) {
                    return Err(`Section not found: ${sectionId}`);
                }
            }
            // Find and update workspace
            const workspace = project.workspaces.find((w) => w.id === workspaceId);
            if (!workspace) {
                return Err(`Workspace not found: ${workspaceId}`);
            }
            workspace.sectionId = sectionId ?? undefined;
            await this.config.saveConfig(config);
            return Ok(undefined);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return Err(`Failed to assign workspace to section: ${message}`);
        }
    }
}
//# sourceMappingURL=projectService.js.map