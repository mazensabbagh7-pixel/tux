import { spawn } from "child_process";
import * as fs from "fs";
import * as fsPromises from "fs/promises";
import * as path from "path";
import { Readable, Writable } from "stream";
import { RuntimeError as RuntimeErrorClass } from "./Runtime";
import { NON_INTERACTIVE_ENV_VARS } from "@/common/constants/env";
import { getBashPath } from "@/node/utils/main/bashPath";
import { shellQuote } from "@/common/utils/shell";
import { EXIT_CODE_ABORTED, EXIT_CODE_TIMEOUT } from "@/common/constants/exitCodes";
import { DisposableProcess, killProcessTree } from "@/node/utils/disposableExec";
import { expandTilde } from "./tildeExpansion";
import { getInitHookPath, createLineBufferedLoggers } from "./initHook";
/**
 * Abstract base class for local runtimes (both WorktreeRuntime and LocalRuntime).
 *
 * Provides shared implementation for:
 * - exec() - Command execution with streaming I/O
 * - readFile() - File reading with streaming
 * - writeFile() - Atomic file writes with streaming
 * - stat() - File statistics
 * - resolvePath() - Path resolution with tilde expansion
 * - normalizePath() - Path normalization
 *
 * Subclasses must implement workspace-specific methods:
 * - getWorkspacePath()
 * - createWorkspace()
 * - initWorkspace()
 * - deleteWorkspace()
 * - renameWorkspace()
 * - forkWorkspace()
 */
export class LocalBaseRuntime {
    async exec(command, options) {
        const startTime = performance.now();
        // Use the specified working directory (must be a specific workspace path)
        const cwd = options.cwd;
        // Check if working directory exists before spawning
        // This prevents confusing ENOENT errors from spawn()
        try {
            await fsPromises.access(cwd);
        }
        catch (err) {
            throw new RuntimeErrorClass(`Working directory does not exist: ${cwd}`, "exec", err instanceof Error ? err : undefined);
        }
        const bashPath = getBashPath();
        const spawnCommand = bashPath;
        // Match RemoteRuntime behavior: ensure non-interactive env vars are set inside the shell.
        //
        // Why not rely solely on `env`?
        // - On Windows, env var casing and shell startup state can be surprising.
        // - These are non-sensitive vars that we want to guarantee for git/editor safety.
        const nonInteractivePrelude = Object.entries(NON_INTERACTIVE_ENV_VARS)
            .map(([key, value]) => `export ${key}=${shellQuote(value)}`)
            .join("\n");
        const spawnArgs = ["-c", `${nonInteractivePrelude}\n${command}`];
        const defaultPath = "/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin";
        const effectivePath = (options.env?.PATH && options.env.PATH.length > 0 ? options.env.PATH : process.env.PATH) ??
            defaultPath;
        const childProcess = spawn(spawnCommand, spawnArgs, {
            cwd,
            env: {
                ...process.env,
                ...(options.env ?? {}),
                ...NON_INTERACTIVE_ENV_VARS,
                PATH: effectivePath,
            },
            stdio: ["pipe", "pipe", "pipe"],
            // CRITICAL: Spawn as detached process group leader to enable cleanup of background processes.
            // When a bash script spawns background processes (e.g., `sleep 100 &`), we need to kill
            // the entire process group (including all backgrounded children) via process.kill(-pid).
            // NOTE: detached:true does NOT cause bash to wait for background jobs when using 'exit' event
            // instead of 'close' event. The 'exit' event fires when bash exits, ignoring background children.
            detached: true,
            // Prevent console window from appearing on Windows (WSL bash spawns steal focus otherwise)
            windowsHide: true,
        });
        // Wrap in DisposableProcess for automatic cleanup
        const disposable = new DisposableProcess(childProcess);
        // Convert Node.js streams to Web Streams
        const stdout = Readable.toWeb(childProcess.stdout);
        const stderr = Readable.toWeb(childProcess.stderr);
        const stdin = Writable.toWeb(childProcess.stdin);
        // No stream cleanup in DisposableProcess - streams close naturally when process exits
        // bash.ts handles cleanup after waiting for exitCode
        // Track if we killed the process due to timeout or abort
        let timedOut = false;
        let aborted = false;
        // Create promises for exit code and duration
        // Uses special exit codes (EXIT_CODE_ABORTED, EXIT_CODE_TIMEOUT) for expected error conditions
        const exitCode = new Promise((resolve, reject) => {
            // Use 'exit' event instead of 'close' to handle background processes correctly.
            // The 'close' event waits for ALL child processes (including background ones) to exit,
            // which causes hangs when users spawn background processes like servers.
            // The 'exit' event fires when the main bash process exits, which is what we want.
            childProcess.on("exit", (code) => {
                // Clean up any background processes (process group cleanup)
                // This prevents zombie processes when scripts spawn background tasks
                if (childProcess.pid !== undefined) {
                    // Kill the full process tree to prevent hangs when scripts spawn background jobs.
                    //
                    // On Unix we can kill the whole group via process.kill(-pid).
                    // On Windows we must use taskkill to avoid leaking child processes.
                    killProcessTree(childProcess.pid);
                }
                // Check abort first (highest priority)
                if (aborted || options.abortSignal?.aborted) {
                    resolve(EXIT_CODE_ABORTED);
                    return;
                }
                // Check if we killed the process due to timeout
                if (timedOut) {
                    resolve(EXIT_CODE_TIMEOUT);
                    return;
                }
                resolve(code ?? 0);
                // Cleanup runs automatically via DisposableProcess
            });
            childProcess.on("error", (err) => {
                reject(new RuntimeErrorClass(`Failed to execute command: ${err.message}`, "exec", err));
            });
        });
        const duration = exitCode.then(() => performance.now() - startTime);
        // Avoid unhandled promise rejections in fire-and-forget exec() callsites.
        // Callers that await these promises will still observe the rejection.
        void exitCode.catch(() => undefined);
        void duration.catch(() => undefined);
        // Register process group cleanup with DisposableProcess
        // This ensures ALL background children are killed when process exits
        disposable.addCleanup(() => {
            if (childProcess.pid === undefined)
                return;
            // Kill the full process tree (see comment in exit handler).
            killProcessTree(childProcess.pid);
        });
        // Handle abort signal
        if (options.abortSignal) {
            options.abortSignal.addEventListener("abort", () => {
                aborted = true;
                disposable[Symbol.dispose](); // Kill process and run cleanup
            });
        }
        // Handle timeout
        if (options.timeout !== undefined) {
            const timeoutHandle = setTimeout(() => {
                timedOut = true;
                disposable[Symbol.dispose](); // Kill process and run cleanup
            }, options.timeout * 1000);
            // Clear timeout if process exits naturally
            void exitCode.catch(() => undefined).finally(() => clearTimeout(timeoutHandle));
        }
        return { stdout, stderr, stdin, exitCode, duration };
    }
    readFile(filePath, _abortSignal) {
        // Note: _abortSignal ignored for local operations (fast, no need for cancellation)
        // Expand tildes before reading (Node.js fs doesn't expand ~)
        const expandedPath = expandTilde(filePath);
        const nodeStream = fs.createReadStream(expandedPath);
        // Handle errors by wrapping in a transform
        const webStream = Readable.toWeb(nodeStream);
        return new ReadableStream({
            async start(controller) {
                try {
                    const reader = webStream.getReader();
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done)
                            break;
                        controller.enqueue(value);
                    }
                    controller.close();
                }
                catch (err) {
                    controller.error(new RuntimeErrorClass(`Failed to read file ${filePath}: ${err instanceof Error ? err.message : String(err)}`, "file_io", err instanceof Error ? err : undefined));
                }
            },
        });
    }
    writeFile(filePath, _abortSignal) {
        // Note: _abortSignal ignored for local operations (fast, no need for cancellation)
        // Expand tildes before writing (Node.js fs doesn't expand ~)
        const expandedPath = expandTilde(filePath);
        let tempPath;
        let writer;
        let resolvedPath;
        let originalMode;
        return new WritableStream({
            async start() {
                // Resolve symlinks to write through them (preserves the symlink)
                try {
                    resolvedPath = await fsPromises.realpath(expandedPath);
                    // Save original permissions to restore after write
                    const stat = await fsPromises.stat(resolvedPath);
                    originalMode = stat.mode;
                }
                catch {
                    // If file doesn't exist, use the expanded path and default permissions
                    resolvedPath = expandedPath;
                    originalMode = undefined;
                }
                // Create parent directories if they don't exist
                const parentDir = path.dirname(resolvedPath);
                await fsPromises.mkdir(parentDir, { recursive: true });
                // Create temp file for atomic write
                tempPath = `${resolvedPath}.tmp.${Date.now()}`;
                const nodeStream = fs.createWriteStream(tempPath);
                const webStream = Writable.toWeb(nodeStream);
                writer = webStream.getWriter();
            },
            async write(chunk) {
                await writer.write(chunk);
            },
            async close() {
                // Close the writer and rename to final location
                await writer.close();
                try {
                    // If we have original permissions, apply them to temp file before rename
                    if (originalMode !== undefined) {
                        await fsPromises.chmod(tempPath, originalMode);
                    }
                    await fsPromises.rename(tempPath, resolvedPath);
                }
                catch (err) {
                    throw new RuntimeErrorClass(`Failed to write file ${filePath}: ${err instanceof Error ? err.message : String(err)}`, "file_io", err instanceof Error ? err : undefined);
                }
            },
            async abort(reason) {
                // Clean up temp file on abort
                await writer.abort();
                try {
                    await fsPromises.unlink(tempPath);
                }
                catch {
                    // Ignore errors cleaning up temp file
                }
                throw new RuntimeErrorClass(`Failed to write file ${filePath}: ${String(reason)}`, "file_io");
            },
        });
    }
    async stat(filePath, _abortSignal) {
        // Note: _abortSignal ignored for local operations (fast, no need for cancellation)
        // Expand tildes before stat (Node.js fs doesn't expand ~)
        const expandedPath = expandTilde(filePath);
        try {
            const stats = await fsPromises.stat(expandedPath);
            return {
                size: stats.size,
                modifiedTime: stats.mtime,
                isDirectory: stats.isDirectory(),
            };
        }
        catch (err) {
            throw new RuntimeErrorClass(`Failed to stat ${filePath}: ${err instanceof Error ? err.message : String(err)}`, "file_io", err instanceof Error ? err : undefined);
        }
    }
    async ensureDir(dirPath) {
        const expandedPath = expandTilde(dirPath);
        try {
            await fsPromises.mkdir(expandedPath, { recursive: true });
        }
        catch (err) {
            throw new RuntimeErrorClass(`Failed to create directory ${dirPath}: ${err instanceof Error ? err.message : String(err)}`, "file_io", err instanceof Error ? err : undefined);
        }
    }
    resolvePath(filePath) {
        // Expand tilde to actual home directory path
        const expanded = expandTilde(filePath);
        // Resolve to absolute path (handles relative paths like "./foo")
        return Promise.resolve(path.resolve(expanded));
    }
    normalizePath(targetPath, basePath) {
        // For local runtime, use Node.js path resolution
        // Handle special case: current directory
        const target = targetPath.trim();
        if (target === ".") {
            return path.resolve(basePath);
        }
        // Expand tildes before resolving (~ is not expanded by path.resolve)
        const expanded = expandTilde(target);
        return path.resolve(basePath, expanded);
    }
    /**
     * Get the runtime's temp directory.
     * Uses OS temp dir on local systems.
     */
    tempDir() {
        // Use /tmp on Unix, or OS temp dir on Windows
        const isWindows = process.platform === "win32";
        return Promise.resolve(isWindows ? (process.env.TEMP ?? "C:\\Temp") : "/tmp");
    }
    getMuxHome() {
        return "~/.mux";
    }
    /**
     * Local runtimes are always ready.
     */
    ensureReady() {
        return Promise.resolve({ ready: true });
    }
    /**
     * Helper to run .mux/init hook if it exists and is executable.
     * Shared between WorktreeRuntime and LocalRuntime.
     * @param workspacePath - Path to the workspace directory
     * @param muxEnv - MUX_ environment variables (from getMuxEnv)
     * @param initLogger - Logger for streaming output
     * @param abortSignal - Optional abort signal
     */
    async runInitHook(workspacePath, muxEnv, initLogger, abortSignal) {
        // Hook path is derived from MUX_PROJECT_PATH in muxEnv
        const projectPath = muxEnv.MUX_PROJECT_PATH;
        const hookPath = getInitHookPath(projectPath);
        initLogger.logStep(`Running init hook: ${hookPath}`);
        if (abortSignal?.aborted) {
            initLogger.logComplete(EXIT_CODE_ABORTED);
            return;
        }
        // Create line-buffered loggers
        const loggers = createLineBufferedLoggers(initLogger);
        return new Promise((resolve) => {
            const bashPath = getBashPath();
            const proc = spawn(bashPath, ["-c", `"${hookPath}"`], {
                cwd: workspacePath,
                stdio: ["ignore", "pipe", "pipe"],
                env: {
                    ...process.env,
                    ...muxEnv,
                },
                // Prevent console window from appearing on Windows
                windowsHide: true,
                // Spawn as a detached process group leader so we can reliably cancel the hook.
                detached: true,
            });
            let aborted = false;
            const onAbort = () => {
                aborted = true;
                if (proc.pid !== undefined) {
                    killProcessTree(proc.pid);
                    return;
                }
                try {
                    proc.kill("SIGKILL");
                }
                catch {
                    // ignore
                }
            };
            abortSignal?.addEventListener("abort", onAbort, { once: true });
            if (abortSignal?.aborted) {
                onAbort();
            }
            proc.stdout.on("data", (data) => {
                loggers.stdout.append(data.toString());
            });
            proc.stderr.on("data", (data) => {
                loggers.stderr.append(data.toString());
            });
            proc.on("close", (code) => {
                abortSignal?.removeEventListener("abort", onAbort);
                // Flush any remaining buffered output
                loggers.stdout.flush();
                loggers.stderr.flush();
                initLogger.logComplete(aborted || abortSignal?.aborted ? EXIT_CODE_ABORTED : (code ?? 0));
                resolve();
            });
            proc.on("error", (err) => {
                abortSignal?.removeEventListener("abort", onAbort);
                if (aborted || abortSignal?.aborted) {
                    initLogger.logComplete(EXIT_CODE_ABORTED);
                    resolve();
                    return;
                }
                initLogger.logStderr(`Error running init hook: ${err.message}`);
                initLogger.logComplete(-1);
                resolve();
            });
        });
    }
}
//# sourceMappingURL=LocalBaseRuntime.js.map