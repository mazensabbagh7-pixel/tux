import { shellQuote } from "@/common/utils/shell";
export { shellQuote };
/** Exit code for process killed by SIGKILL (128 + 9) */
export const EXIT_CODE_SIGKILL = 137;
/** Exit code for process killed by SIGTERM (128 + 15) */
export const EXIT_CODE_SIGTERM = 143;
/**
 * Parse exit code from file content.
 * Returns null if content is empty or not a valid number.
 */
export function parseExitCode(content) {
    const code = parseInt(content.trim(), 10);
    return isNaN(code) ? null : code;
}
/**
 * Parse PID from buildSpawnCommand output.
 * Returns the PID or null if invalid.
 */
export function parsePid(output) {
    const pid = parseInt(output.trim(), 10);
    return isNaN(pid) || pid <= 0 ? null : pid;
}
/**
 * Build the wrapper script that captures exit code and sets up environment.
 * Pattern: trap 'echo $? > exit_code' EXIT && cd /path && export K=V && script
 */
export function buildWrapperScript(options) {
    const parts = [];
    // Set up trap first to capture exit code.
    //
    // IMPORTANT: Do NOT inline shellQuote(exitCodePath) inside a double-quoted trap string.
    // If the path contains a single quote (e.g. processId derived from script contains quotes),
    // shellQuote() will emit the POSIX escape pattern '\''"'"'\'', which contains double quotes
    // and will break the surrounding double quotes.
    //
    // Instead, assign the (quoted) path to a variable and reference it from the trap.
    parts.push(`__MUX_EXIT_CODE_PATH=${shellQuote(options.exitCodePath)}`);
    parts.push(`trap 'echo $? > "$__MUX_EXIT_CODE_PATH"' EXIT`);
    // Change to working directory
    parts.push(`cd ${shellQuote(options.cwd)}`);
    // Add environment variable exports
    if (options.env) {
        for (const [key, value] of Object.entries(options.env)) {
            parts.push(`export ${key}=${shellQuote(value)}`);
        }
    }
    // Add the actual script
    parts.push(options.script);
    return parts.join(" && ");
}
/**
 * Build the spawn command using subshell + nohup pattern.
 *
 * Uses subshell (...) to isolate the process group so the outer shell exits immediately.
 * set -m: enables job control so backgrounded process gets its own process group (PID === PGID)
 * nohup: ignores SIGHUP (survives terminal hangup)
 *
 * stdout and stderr are merged into a single output file with 2>&1 for unified display.
 *
 * Returns PID via echo. With set -m, PID === PGID (process is its own group leader).
 */
export function buildSpawnCommand(options) {
    const bash = options.bashPath ?? "bash";
    const quotePath = options.quotePath ?? shellQuote;
    return (`(set -m; nohup ${shellQuote(bash)} -c ${shellQuote(options.wrapperScript)} ` +
        `> ${quotePath(options.outputPath)} 2>&1 ` +
        `< /dev/null & echo $!)`);
}
/**
 * Build the terminate command for killing a process group.
 *
 * Uses negative PID to kill entire process group.
 * Relies on set -m ensuring PID === PGID (process is its own group leader).
 * Sends SIGTERM, waits 2 seconds, then SIGKILL if still running.
 * Writes EXIT_CODE_SIGKILL on force kill.
 *
 * @param pid - Process ID (equals PGID due to set -m in buildSpawnCommand)
 * @param exitCodePath - Path to write exit code (raw, will be quoted by quotePath)
 * @param quotePath - Function to quote path (default: shellQuote). Use expandTildeForSSH for SSH.
 */
export function buildTerminateCommand(pid, exitCodePath, quotePath = shellQuote) {
    const negPid = -pid; // Negative PID targets process group (PID === PGID due to set -m)
    // Send SIGTERM, wait for process to exit, then write the correct exit code.
    // We can't write immediately because the process's EXIT trap would overwrite it.
    // After sleep 2, either the process exited (write SIGTERM code) or we escalate to SIGKILL.
    return (`kill -15 ${negPid} 2>/dev/null || true; ` +
        `sleep 2; ` +
        `if kill -0 ${negPid} 2>/dev/null; then ` +
        `kill -9 ${negPid} 2>/dev/null || true; ` +
        `echo ${EXIT_CODE_SIGKILL} > ${quotePath(exitCodePath)}; ` +
        `else ` +
        `echo ${EXIT_CODE_SIGTERM} > ${quotePath(exitCodePath)}; ` +
        `fi`);
}
//# sourceMappingURL=backgroundCommands.js.map