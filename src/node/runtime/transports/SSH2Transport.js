import { EventEmitter } from "events";
import { PassThrough } from "stream";
import { RuntimeError as RuntimeErrorClass } from "../Runtime";
import { getErrorMessage } from "@/common/utils/errors";
import { log } from "@/node/services/log";
import { attachStreamErrorHandler, isIgnorableStreamError } from "@/node/utils/streamErrors";
import { expandTildeForSSH } from "../tildeExpansion";
import { ssh2ConnectionPool } from "../SSH2ConnectionPool";
class SSH2ChildProcess extends EventEmitter {
    constructor(channel) {
        super();
        this.channel = channel;
        this.exitCode = null;
        this.signalCode = null;
        this.killed = false;
        this.pid = 0;
        const stdoutPipe = new PassThrough();
        const stderrPipe = new PassThrough();
        const stdinPipe = new PassThrough();
        channel.pipe(stdoutPipe);
        (channel.stderr ?? new PassThrough()).pipe(stderrPipe);
        stdinPipe.pipe(channel);
        this.stdout = stdoutPipe;
        this.stderr = stderrPipe;
        this.stdin = stdinPipe;
        let closeEventFired = false;
        let closeTimer = null;
        let closeEmitted = false;
        const emitClose = () => {
            if (closeEmitted) {
                return;
            }
            closeEmitted = true;
            if (closeTimer) {
                clearTimeout(closeTimer);
                closeTimer = null;
            }
            this.emit("close", this.exitCode ?? 0, this.signalCode);
        };
        channel.on("exit", (code, signal) => {
            this.exitCode = typeof code === "number" ? code : null;
            this.signalCode = typeof signal === "string" ? signal : null;
            // ssh2 sometimes emits "close" before "exit"; if that happens, ensure we still
            // report the real exit code.
            if (closeEventFired) {
                emitClose();
            }
        });
        channel.on("close", (...args) => {
            closeEventFired = true;
            // ssh2 sometimes emits "close" with the exit code/signal. Capture it so we still
            // report the correct exit status even if we missed the earlier "exit" event
            // (e.g. extremely fast commands).
            const [code, signal] = args;
            if (this.exitCode === null && typeof code === "number") {
                this.exitCode = code;
            }
            if (this.signalCode === null && typeof signal === "string") {
                this.signalCode = signal;
            }
            if (this.exitCode !== null || this.signalCode !== null) {
                emitClose();
                return;
            }
            // Grace period: allow the "exit" event to arrive after "close".
            // Without this, we can incorrectly report exitCode=0 for failed commands.
            closeTimer = setTimeout(() => emitClose(), 250);
            closeTimer.unref?.();
        });
        channel.on("error", (err) => {
            this.emit("error", err);
        });
    }
    kill(signal) {
        this.killed = true;
        try {
            if (signal && typeof this.channel.signal === "function") {
                this.channel.signal(signal);
            }
        }
        catch {
            // Ignore signal errors.
        }
        try {
            this.channel.close();
        }
        catch {
            // Ignore close errors.
        }
        return true;
    }
}
class SSH2Pty {
    constructor(channel) {
        this.channel = channel;
        this.closed = false;
        this.channel.on("close", () => {
            this.closed = true;
        });
        const closeChannel = () => {
            this.closed = true;
            try {
                this.channel.close();
            }
            catch {
                // Ignore close errors.
            }
        };
        // PTY channels can emit socket errors when sessions exit early.
        attachStreamErrorHandler(this.channel, "ssh2-pty-channel", {
            logger: log,
            onIgnorable: closeChannel,
            onUnexpected: closeChannel,
        });
        if (this.channel.stderr) {
            attachStreamErrorHandler(this.channel.stderr, "ssh2-pty-stderr", {
                logger: log,
                onIgnorable: closeChannel,
                onUnexpected: closeChannel,
            });
        }
    }
    write(data) {
        if (this.closed || this.channel.destroyed || this.channel.writableEnded) {
            return;
        }
        try {
            this.channel.write(data);
        }
        catch (error) {
            if (isIgnorableStreamError(error)) {
                return;
            }
            const message = error instanceof Error ? error.message : String(error);
            const code = error && typeof error === "object" && "code" in error && typeof error.code === "string"
                ? error.code
                : undefined;
            log.warn("SSH2 PTY write failed", { code, message });
        }
    }
    resize(cols, rows) {
        this.channel.setWindow(rows, cols, 0, 0);
    }
    kill() {
        this.closed = true;
        this.channel.close();
    }
    onData(handler) {
        const onStdout = (data) => handler(data.toString());
        const onStderr = (data) => handler(data.toString());
        this.channel.on("data", onStdout);
        this.channel.stderr?.on("data", onStderr);
        return {
            dispose: () => {
                this.channel.off("data", onStdout);
                this.channel.stderr?.off("data", onStderr);
            },
        };
    }
    onExit(handler) {
        const onClose = (code) => {
            handler({ exitCode: typeof code === "number" ? code : 0 });
        };
        this.channel.on("close", onClose);
        return {
            dispose: () => {
                this.channel.off("close", onClose);
            },
        };
    }
}
export class SSH2Transport {
    constructor(config) {
        this.config = config;
    }
    isConnectionFailure(_exitCode, _stderr) {
        return false;
    }
    getConfig() {
        return this.config;
    }
    markHealthy() {
        ssh2ConnectionPool.markHealthy(this.config);
    }
    reportFailure(error) {
        ssh2ConnectionPool.reportFailure(this.config, error);
    }
    async acquireConnection(options) {
        await ssh2ConnectionPool.acquireConnection(this.config, {
            abortSignal: options?.abortSignal,
            timeoutMs: options?.timeoutMs,
            onWait: options?.onWait,
        });
    }
    async spawnRemoteProcess(fullCommand, options) {
        const connectTimeoutSec = options.timeout !== undefined ? Math.min(Math.ceil(options.timeout), 15) : 15;
        let client;
        try {
            ({ client } = await ssh2ConnectionPool.acquireConnection(this.config, {
                abortSignal: options.abortSignal,
                timeoutMs: connectTimeoutSec * 1000,
            }));
        }
        catch (error) {
            throw new RuntimeErrorClass(`SSH2 connection failed: ${getErrorMessage(error)}`, "network", error instanceof Error ? error : undefined);
        }
        try {
            const channel = await new Promise((resolve, reject) => {
                const onExec = (err, stream) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    if (!stream) {
                        reject(new Error("SSH2 exec did not return a stream"));
                        return;
                    }
                    resolve(stream);
                };
                if (options.forcePTY) {
                    client.exec(fullCommand, { pty: { term: "xterm-256color" } }, onExec);
                }
                else {
                    client.exec(fullCommand, onExec);
                }
            });
            const process = new SSH2ChildProcess(channel);
            return { process };
        }
        catch (error) {
            ssh2ConnectionPool.reportFailure(this.config, getErrorMessage(error));
            throw new RuntimeErrorClass(`SSH2 command failed: ${getErrorMessage(error)}`, "network", error instanceof Error ? error : undefined);
        }
    }
    async createPtySession(params) {
        const { client } = await ssh2ConnectionPool.acquireConnection(this.config, { maxWaitMs: 0 });
        const channel = await new Promise((resolve, reject) => {
            client.shell({
                term: "xterm-256color",
                cols: params.cols,
                rows: params.rows,
            }, (err, stream) => {
                if (err) {
                    reject(err);
                    return;
                }
                if (!stream) {
                    reject(new Error("SSH2 shell did not return a stream"));
                    return;
                }
                resolve(stream);
            });
        });
        // expandTildeForSSH already returns a quoted string (e.g., "$HOME/path")
        // Do NOT wrap with shellQuotePath - that would double-quote it
        // Exit on cd failure to match OpenSSH transport behavior (cd ... && exec $SHELL -i)
        const expandedPath = expandTildeForSSH(params.workspacePath);
        channel.write(`cd ${expandedPath} || exit 1\n`);
        return new SSH2Pty(channel);
    }
}
//# sourceMappingURL=SSH2Transport.js.map