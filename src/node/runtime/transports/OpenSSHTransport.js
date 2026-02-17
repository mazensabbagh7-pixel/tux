import { spawn } from "child_process";
import { log } from "@/node/services/log";
import { spawnPtyProcess } from "../ptySpawn";
import { expandTildeForSSH } from "../tildeExpansion";
import { getControlPath, sshConnectionPool } from "../sshConnectionPool";
export class OpenSSHTransport {
    constructor(config) {
        this.config = config;
        this.controlPath = getControlPath(config);
    }
    isConnectionFailure(exitCode, _stderr) {
        return exitCode === 255;
    }
    getConfig() {
        return this.config;
    }
    markHealthy() {
        sshConnectionPool.markHealthy(this.config);
    }
    reportFailure(error) {
        sshConnectionPool.reportFailure(this.config, error);
    }
    async acquireConnection(options) {
        await sshConnectionPool.acquireConnection(this.config, {
            abortSignal: options?.abortSignal,
            timeoutMs: options?.timeoutMs,
            onWait: options?.onWait,
        });
    }
    async spawnRemoteProcess(fullCommand, options) {
        await sshConnectionPool.acquireConnection(this.config, {
            abortSignal: options.abortSignal,
        });
        // Note: use -tt (not -t) so PTY allocation works even when stdin is a pipe.
        const sshArgs = [options.forcePTY ? "-tt" : "-T", ...this.buildSSHArgs()];
        const connectTimeout = options.timeout !== undefined ? Math.min(Math.ceil(options.timeout), 15) : 15;
        sshArgs.push("-o", `ConnectTimeout=${connectTimeout}`);
        sshArgs.push("-o", "ServerAliveInterval=5");
        sshArgs.push("-o", "ServerAliveCountMax=2");
        sshArgs.push(this.config.host, fullCommand);
        log.debug(`SSH exec on ${this.config.host}`);
        const process = spawn("ssh", sshArgs, {
            stdio: ["pipe", "pipe", "pipe"],
            windowsHide: true,
        });
        return { process };
    }
    async createPtySession(params) {
        await sshConnectionPool.acquireConnection(this.config, { maxWaitMs: 0 });
        const args = [...this.buildSSHArgs()];
        args.push("-o", "ConnectTimeout=15");
        args.push("-o", "ServerAliveInterval=5");
        args.push("-o", "ServerAliveCountMax=2");
        args.push("-t");
        args.push(this.config.host);
        // expandTildeForSSH already returns a quoted string (e.g., "$HOME/path")
        // Do NOT wrap with shellQuotePath - that would double-quote it
        const expandedPath = expandTildeForSSH(params.workspacePath);
        args.push(`cd ${expandedPath} && exec $SHELL -i`);
        return spawnPtyProcess({
            runtimeLabel: "SSH",
            command: "ssh",
            args,
            cwd: process.cwd(),
            cols: params.cols,
            rows: params.rows,
            preferElectronBuild: false,
        });
    }
    buildSSHArgs() {
        const args = [];
        if (this.config.port) {
            args.push("-p", this.config.port.toString());
        }
        if (this.config.identityFile) {
            args.push("-i", this.config.identityFile);
            args.push("-o", "StrictHostKeyChecking=no");
            args.push("-o", "UserKnownHostsFile=/dev/null");
        }
        args.push("-o", "LogLevel=FATAL");
        args.push("-o", "ControlMaster=auto");
        args.push("-o", `ControlPath=${this.controlPath}`);
        args.push("-o", "ControlPersist=60");
        return args;
    }
}
//# sourceMappingURL=OpenSSHTransport.js.map