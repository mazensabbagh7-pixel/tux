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
/**
 * Service for interacting with the Coder CLI.
 * Used to create/manage Coder workspaces as SSH targets for Mux workspaces.
 */
import { shescape } from "@/node/runtime/streamUtils";
import { execAsync } from "@/node/utils/disposableExec";
import { getBashPath } from "@/node/utils/main/bashPath";
import { log } from "@/node/services/log";
import { spawn } from "child_process";
import { Ok, Err } from "@/common/types/result";
import { CoderWorkspaceStatusSchema, } from "@/common/orpc/schemas/coder";
/**
 * Serialize a Coder parameter default_value to string.
 * Preserves numeric/boolean/array values instead of coercing to "".
 */
function serializeParameterDefault(value) {
    if (value == null)
        return "";
    if (typeof value === "string")
        return value;
    if (typeof value === "number" || typeof value === "boolean")
        return String(value);
    // Arrays/objects (e.g., list(string) type) → JSON
    return JSON.stringify(value);
}
// Minimum supported Coder CLI version
const MIN_CODER_VERSION = "2.25.0";
/**
 * Normalize a version string for comparison.
 * Strips leading "v", dev suffixes like "-devel+hash", and build metadata.
 * Example: "v2.28.6+df47153" → "2.28.6"
 */
function normalizeVersion(v) {
    return v
        .replace(/^v/i, "") // Strip leading v/V
        .split("-")[0] // Remove pre-release suffix
        .split("+")[0]; // Remove build metadata
}
/**
 * Compare two semver versions. Returns:
 * - negative if a < b
 * - 0 if a === b
 * - positive if a > b
 */
export function compareVersions(a, b) {
    const aParts = normalizeVersion(a).split(".").map(Number);
    const bParts = normalizeVersion(b).split(".").map(Number);
    for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
        const aPart = aParts[i] ?? 0;
        const bPart = bParts[i] ?? 0;
        if (aPart !== bPart)
            return aPart - bPart;
    }
    return 0;
}
const SIGKILL_GRACE_PERIOD_MS = 5000;
function createGracefulTerminator(child, options) {
    const sigkillAfterMs = options?.sigkillAfterMs ?? SIGKILL_GRACE_PERIOD_MS;
    let sigkillTimer = null;
    const scheduleSigkill = () => {
        if (sigkillTimer)
            return;
        sigkillTimer = setTimeout(() => {
            sigkillTimer = null;
            // Only attempt SIGKILL if the process still appears to be running.
            if (child.exitCode === null && child.signalCode === null) {
                try {
                    child.kill("SIGKILL");
                }
                catch {
                    // ignore
                }
            }
        }, sigkillAfterMs);
    };
    const terminate = () => {
        try {
            child.kill("SIGTERM");
        }
        catch {
            // ignore
        }
        scheduleSigkill();
    };
    const cleanup = () => {
        if (sigkillTimer) {
            clearTimeout(sigkillTimer);
            sigkillTimer = null;
        }
    };
    return { terminate, cleanup };
}
/**
 * Stream output from a coder CLI command line by line.
 * Yields lines as they arrive from stdout/stderr.
 * Throws on non-zero exit with stderr content in the error message.
 *
 * @param args Command arguments (e.g., ["start", "-y", "my-ws"])
 * @param errorPrefix Prefix for error messages (e.g., "coder start failed")
 * @param abortSignal Optional signal to cancel the command
 * @param abortMessage Message to throw when aborted
 */
async function* streamCoderCommand(args, errorPrefix, abortSignal, abortMessage = "Coder command aborted") {
    if (abortSignal?.aborted) {
        throw new Error(abortMessage);
    }
    // Yield the command we're about to run so it's visible in UI
    yield `$ coder ${args.join(" ")}`;
    const child = spawn("coder", args, {
        stdio: ["ignore", "pipe", "pipe"],
    });
    const terminator = createGracefulTerminator(child);
    const abortHandler = () => {
        terminator.terminate();
    };
    abortSignal?.addEventListener("abort", abortHandler);
    try {
        // Use an async queue to stream lines as they arrive
        const lineQueue = [];
        const stderrLines = [];
        let streamsDone = false;
        let resolveNext = null;
        const pushLine = (line) => {
            lineQueue.push(line);
            if (resolveNext) {
                resolveNext();
                resolveNext = null;
            }
        };
        let pending = 2;
        const markDone = () => {
            pending--;
            if (pending === 0) {
                streamsDone = true;
                if (resolveNext) {
                    resolveNext();
                    resolveNext = null;
                }
            }
        };
        const processStream = (stream, isStderr) => {
            if (!stream) {
                markDone();
                return;
            }
            let buffer = "";
            stream.on("data", (chunk) => {
                buffer += chunk.toString();
                const parts = buffer.split("\n");
                buffer = parts.pop() ?? "";
                for (const line of parts) {
                    const trimmed = line.trim();
                    if (trimmed) {
                        pushLine(trimmed);
                        if (isStderr)
                            stderrLines.push(trimmed);
                    }
                }
            });
            stream.on("end", () => {
                if (buffer.trim()) {
                    pushLine(buffer.trim());
                    if (isStderr)
                        stderrLines.push(buffer.trim());
                }
                markDone();
            });
            stream.on("error", markDone);
        };
        processStream(child.stdout, false);
        processStream(child.stderr, true);
        // Yield lines as they arrive
        while (!streamsDone || lineQueue.length > 0) {
            if (lineQueue.length > 0) {
                yield lineQueue.shift();
            }
            else if (!streamsDone) {
                await new Promise((resolve) => {
                    resolveNext = resolve;
                });
            }
        }
        // Wait for process to exit
        const exitCode = await new Promise((resolve) => {
            child.on("close", resolve);
            child.on("error", () => resolve(null));
        });
        if (abortSignal?.aborted) {
            throw new Error(abortMessage);
        }
        if (exitCode !== 0) {
            const errorDetail = stderrLines.length > 0 ? `: ${stderrLines.join(" | ")}` : "";
            throw new Error(`${errorPrefix} (exit ${String(exitCode)})${errorDetail}`);
        }
    }
    finally {
        terminator.cleanup();
        abortSignal?.removeEventListener("abort", abortHandler);
    }
}
function interpretCoderResult(result) {
    const combined = `${result.stderr}\n${result.stdout}`.trim();
    if (result.error) {
        return { ok: false, error: result.error, combined };
    }
    if (result.exitCode !== 0) {
        return {
            ok: false,
            error: combined || `Exit code ${String(result.exitCode)}`,
            combined,
        };
    }
    return { ok: true, stdout: result.stdout, stderr: result.stderr };
}
function sanitizeCoderCliErrorForUi(error) {
    if (!(error instanceof Error)) {
        return "Unknown error";
    }
    const err = error;
    const raw = (err.stderr?.trim() ? err.stderr : err.message) ?? "";
    const lines = raw
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
    if (lines.length === 0) {
        return "Unknown error";
    }
    // Coder often prints a generic "Encountered an error running..." line followed by
    // a more actionable "error: ..." line. Prefer the latter when present.
    const preferred = [...lines].reverse().find((line) => /^error:\s*/i.test(line)) ?? lines[lines.length - 1];
    return (preferred
        .replace(/^error:\s*/i, "")
        .slice(0, 200)
        .trim() || "Unknown error");
}
export class CoderService {
    constructor() {
        // Ephemeral API sessions scoped to workspace provisioning.
        // This keeps token reuse explicit without persisting anything to disk.
        this.provisioningSessions = new Map();
        this.cachedInfo = null;
        // Cache whoami results so later URL lookups can reuse the last CLI response.
        this.cachedWhoami = null;
    }
    async resolveCoderBinaryPath() {
        let shell;
        if (process.platform === "win32") {
            try {
                shell = getBashPath();
            }
            catch {
                // Best-effort; if Git Bash isn't available, the lookup may fail and we'll fall back to null.
            }
        }
        try {
            const env_1 = { stack: [], error: void 0, hasError: false };
            try {
                const proc = __addDisposableResource(env_1, execAsync("command -v coder", shell ? { shell } : undefined), false);
                const { stdout } = await proc.result;
                const firstLine = stdout.split(/\r?\n/)[0]?.trim();
                return firstLine || null;
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
            return null;
        }
    }
    /**
     * Get Coder CLI info. Caches result for the session.
     * Returns discriminated union: available | outdated | unavailable.
     */
    async getCoderInfo() {
        if (this.cachedInfo) {
            return this.cachedInfo;
        }
        // Resolve the Coder binary path for better error messages (helps when multiple binaries are on PATH).
        const binaryPath = await this.resolveCoderBinaryPath();
        try {
            const env_2 = { stack: [], error: void 0, hasError: false };
            try {
                const proc = __addDisposableResource(env_2, execAsync("coder version --output=json"), false);
                const { stdout } = await proc.result;
                // Parse JSON output
                const data = JSON.parse(stdout);
                const version = data.version;
                if (!version) {
                    this.cachedInfo = {
                        state: "unavailable",
                        reason: { kind: "error", message: "Version output missing from CLI" },
                    };
                    return this.cachedInfo;
                }
                // Check minimum version
                if (compareVersions(version, MIN_CODER_VERSION) < 0) {
                    log.debug(`Coder CLI version ${version} is below minimum ${MIN_CODER_VERSION}`);
                    this.cachedInfo = {
                        state: "outdated",
                        version,
                        minVersion: MIN_CODER_VERSION,
                        ...(binaryPath ? { binaryPath } : {}),
                    };
                    return this.cachedInfo;
                }
                let whoami = null;
                try {
                    whoami = await this.getWhoamiData();
                }
                catch (error) {
                    // Treat whoami failures as a blocking issue for the Coder runtime.
                    // If the CLI isn't logged in, users will hit confusing failures later during provisioning.
                    const err = error;
                    const raw = (err.stderr?.trim() ? err.stderr : err.message) ?? "";
                    const normalized = raw.toLowerCase();
                    const isNotLoggedIn = normalized.includes("not logged in") ||
                        normalized.includes("try logging in") ||
                        normalized.includes("please login") ||
                        normalized.includes("coder login");
                    const lastLine = raw
                        .split(/\r?\n/)
                        .map((line) => line.trim())
                        .filter(Boolean)
                        .at(-1) ?? "";
                    const sanitizedLine = lastLine
                        .replace(/^error:\s*/i, "")
                        .slice(0, 200)
                        .trim() || "Unknown error";
                    const notLoggedInMessage = binaryPath
                        ? `${binaryPath} is ${sanitizedLine.replace(/^you are\s+/i, "")}`
                        : sanitizedLine;
                    log.debug("Failed to fetch Coder whoami data", { error });
                    const result = isNotLoggedIn
                        ? { state: "unavailable", reason: { kind: "not-logged-in", message: notLoggedInMessage } }
                        : { state: "unavailable", reason: { kind: "error", message: sanitizedLine } };
                    // Don't cache whoami failures: users can often recover without restarting the app
                    // (e.g., temporary network issues or `coder login`).
                    return result;
                }
                const availableInfo = {
                    state: "available",
                    version,
                    ...(whoami?.username ? { username: whoami.username } : {}),
                    ...(whoami?.url ? { url: whoami.url } : {}),
                };
                this.cachedInfo = availableInfo;
                return this.cachedInfo;
            }
            catch (e_2) {
                env_2.error = e_2;
                env_2.hasError = true;
            }
            finally {
                __disposeResources(env_2);
            }
        }
        catch (error) {
            log.debug("Coder CLI not available", { error });
            this.cachedInfo = this.classifyCoderError(error);
            return this.cachedInfo;
        }
    }
    /**
     * Classify an error from the Coder CLI as missing or error with message.
     */
    classifyCoderError(error) {
        // ENOENT or "command not found" = CLI not installed
        if (error instanceof Error) {
            const code = error.code;
            const message = error.message.toLowerCase();
            if (code === "ENOENT" ||
                message.includes("command not found") ||
                message.includes("enoent")) {
                return { state: "unavailable", reason: "missing" };
            }
            // Other errors: include sanitized message (single line, capped length)
            const sanitized = sanitizeCoderCliErrorForUi(error);
            return {
                state: "unavailable",
                reason: { kind: "error", message: sanitized },
            };
        }
        return { state: "unavailable", reason: { kind: "error", message: "Unknown error" } };
    }
    /**
     * Create a short-lived Coder API token for deployment endpoints.
     */
    async createApiSession(tokenName) {
        const env_3 = { stack: [], error: void 0, hasError: false };
        try {
            const tokenProc = __addDisposableResource(env_3, execAsync(`coder tokens create --lifetime 5m --name ${shescape.quote(tokenName)}`), false);
            const { stdout: token } = await tokenProc.result;
            const trimmed = token.trim();
            return {
                token: trimmed,
                dispose: async () => {
                    try {
                        const env_4 = { stack: [], error: void 0, hasError: false };
                        try {
                            const deleteProc = __addDisposableResource(env_4, execAsync(`coder tokens delete ${shescape.quote(tokenName)}`), false);
                            await deleteProc.result;
                        }
                        catch (e_4) {
                            env_4.error = e_4;
                            env_4.hasError = true;
                        }
                        finally {
                            __disposeResources(env_4);
                        }
                    }
                    catch {
                        // Best-effort cleanup; token will expire in 5 minutes anyway.
                        log.debug("Failed to delete temporary Coder API token", { tokenName });
                    }
                },
            };
        }
        catch (e_3) {
            env_3.error = e_3;
            env_3.hasError = true;
        }
        finally {
            __disposeResources(env_3);
        }
    }
    async withApiSession(tokenName, fn) {
        const session = await this.createApiSession(tokenName);
        try {
            return await fn(session);
        }
        finally {
            await session.dispose();
        }
    }
    async ensureProvisioningSession(workspaceName) {
        const existing = this.provisioningSessions.get(workspaceName);
        if (existing) {
            return existing;
        }
        const tokenName = `mux-${workspaceName}-${Date.now().toString(36)}`;
        const session = await this.createApiSession(tokenName);
        this.provisioningSessions.set(workspaceName, session);
        return session;
    }
    takeProvisioningSession(workspaceName) {
        const session = this.provisioningSessions.get(workspaceName);
        if (session) {
            this.provisioningSessions.delete(workspaceName);
        }
        return session;
    }
    async disposeProvisioningSession(workspaceName) {
        const session = this.provisioningSessions.get(workspaceName);
        if (!session) {
            return;
        }
        this.provisioningSessions.delete(workspaceName);
        await session.dispose();
    }
    normalizeHostnameSuffix(raw) {
        const cleaned = (raw ?? "").trim().replace(/^\./, "");
        return cleaned || "coder";
    }
    async fetchDeploymentSshConfig(session) {
        const deploymentUrl = await this.getDeploymentUrl();
        const tokenName = `mux-ssh-config-${Date.now().toString(36)}`;
        const run = async (api) => {
            const url = new URL("/api/v2/deployment/ssh", deploymentUrl);
            const response = await fetch(url, {
                headers: { "Coder-Session-Token": api.token },
            });
            if (!response.ok) {
                throw new Error(`Failed to fetch SSH config: ${response.status}`);
            }
            const data = (await response.json());
            return { hostnameSuffix: this.normalizeHostnameSuffix(data.hostname_suffix) };
        };
        return session ? run(session) : this.withApiSession(tokenName, run);
    }
    /**
     * Clear cached Coder info. Used for testing.
     */
    clearCache() {
        this.cachedInfo = null;
        this.cachedWhoami = null;
    }
    // Preserve the old behavior: explicit whoami checks should hit the CLI even if cached.
    // The cache only exists so later URL lookups can reuse the last whoami response.
    async getWhoamiData(options) {
        const env_5 = { stack: [], error: void 0, hasError: false };
        try {
            if (options?.useCache && this.cachedWhoami) {
                return this.cachedWhoami;
            }
            const proc = __addDisposableResource(env_5, execAsync("coder whoami --output=json"), false);
            const { stdout } = await proc.result;
            const data = JSON.parse(stdout);
            if (!data[0]?.url) {
                throw new Error("Could not determine Coder deployment URL from `coder whoami`");
            }
            this.cachedWhoami = {
                url: data[0].url,
                username: data[0].username,
                id: data[0].id,
            };
            return this.cachedWhoami;
        }
        catch (e_5) {
            env_5.error = e_5;
            env_5.hasError = true;
        }
        finally {
            __disposeResources(env_5);
        }
    }
    /**
     * Get the Coder deployment URL via `coder whoami`.
     * Throws if Coder CLI is not configured/logged in.
     */
    async getDeploymentUrl() {
        const { url } = await this.getWhoamiData({ useCache: true });
        return url;
    }
    /**
     * Get the active template version ID for a template.
     * Throws if template not found.
     */
    async getActiveTemplateVersionId(templateName, org) {
        const env_6 = { stack: [], error: void 0, hasError: false };
        try {
            // Note: `coder templates list` doesn't support --org flag, so we filter client-side
            const proc = __addDisposableResource(env_6, execAsync("coder templates list --output=json"), false);
            const { stdout } = await proc.result;
            if (!stdout.trim()) {
                throw new Error(`Template "${templateName}" not found (no templates exist)`);
            }
            const raw = JSON.parse(stdout);
            // Filter by name and optionally by org for disambiguation
            const template = raw.find((t) => t.Template.name === templateName && (!org || t.Template.organization_name === org));
            if (!template) {
                const orgSuffix = org ? ` in organization "${org}"` : "";
                throw new Error(`Template "${templateName}" not found${orgSuffix}`);
            }
            return template.Template.active_version_id;
        }
        catch (e_6) {
            env_6.error = e_6;
            env_6.hasError = true;
        }
        finally {
            __disposeResources(env_6);
        }
    }
    /**
     * Get parameter names covered by a preset.
     * Returns empty set if preset not found (allows creation to proceed without preset params).
     */
    async getPresetParamNames(templateName, presetName, org) {
        try {
            const env_7 = { stack: [], error: void 0, hasError: false };
            try {
                const orgFlag = org ? ` --org ${shescape.quote(org)}` : "";
                const proc = __addDisposableResource(env_7, execAsync(`coder templates presets list ${shescape.quote(templateName)}${orgFlag} --output=json`), false);
                const { stdout } = await proc.result;
                // Same non-JSON guard as listPresets (CLI prints info message for no presets)
                if (!stdout.trim() || !stdout.trimStart().startsWith("[")) {
                    return new Set();
                }
                const raw = JSON.parse(stdout);
                const preset = raw.find((p) => p.TemplatePreset.Name === presetName);
                if (!preset?.TemplatePreset.Parameters) {
                    return new Set();
                }
                return new Set(preset.TemplatePreset.Parameters.map((p) => p.Name));
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
            log.debug("Failed to get preset param names", { templateName, presetName, error });
            return new Set();
        }
    }
    /**
     * Parse rich parameter data from the Coder API.
     * Filters out entries with missing/invalid names to avoid generating invalid --parameter flags.
     */
    parseRichParameters(data) {
        if (!Array.isArray(data)) {
            throw new Error("Expected array of rich parameters");
        }
        return data
            .filter((p) => {
            if (p === null || typeof p !== "object")
                return false;
            const obj = p;
            return typeof obj.name === "string" && obj.name !== "";
        })
            .map((p) => ({
            name: p.name,
            defaultValue: serializeParameterDefault(p.default_value),
            type: typeof p.type === "string" ? p.type : "string",
            ephemeral: Boolean(p.ephemeral),
            required: Boolean(p.required),
        }));
    }
    /**
     * Fetch template rich parameters from Coder API.
     * Uses an optional API session to avoid generating multiple tokens.
     */
    async getTemplateRichParameters(deploymentUrl, versionId, workspaceName, session) {
        const run = async (api) => {
            const url = new URL(`/api/v2/templateversions/${versionId}/rich-parameters`, deploymentUrl).toString();
            const response = await fetch(url, {
                headers: {
                    "Coder-Session-Token": api.token,
                },
            });
            if (!response.ok) {
                throw new Error(`Failed to fetch rich parameters: ${response.status} ${response.statusText}`);
            }
            const data = await response.json();
            return this.parseRichParameters(data);
        };
        const tokenName = `mux-${workspaceName}`;
        return session ? run(session) : this.withApiSession(tokenName, run);
    }
    /**
     * Encode a parameter string for the Coder CLI's --parameter flag.
     * The CLI uses CSV parsing, so values containing quotes or commas need escaping:
     * - Wrap the entire string in double quotes
     * - Escape internal double quotes as ""
     */
    encodeParameterValue(nameValue) {
        if (!nameValue.includes('"') && !nameValue.includes(",")) {
            return nameValue;
        }
        // CSV quoting: wrap in quotes, escape internal quotes as ""
        return `"${nameValue.replace(/"/g, '""')}"`;
    }
    /**
     * Compute extra --parameter flags needed for workspace creation.
     * Filters to non-ephemeral params not covered by preset, using their defaults.
     * Values are passed through as-is (list(string) types expect JSON-encoded arrays).
     */
    computeExtraParams(allParams, coveredByPreset) {
        const extra = [];
        for (const p of allParams) {
            // Skip ephemeral params
            if (p.ephemeral)
                continue;
            // Skip params covered by preset
            if (coveredByPreset.has(p.name))
                continue;
            // Encode for CLI's CSV parser (escape quotes/commas)
            const encoded = this.encodeParameterValue(`${p.name}=${p.defaultValue}`);
            extra.push({ name: p.name, encoded });
        }
        return extra;
    }
    /**
     * Validate that all required params have values (either from preset or defaults).
     * Throws if any required param is missing a value.
     */
    validateRequiredParams(allParams, coveredByPreset) {
        const missing = [];
        for (const p of allParams) {
            if (p.ephemeral)
                continue;
            if (p.required && !p.defaultValue && !coveredByPreset.has(p.name)) {
                missing.push(p.name);
            }
        }
        if (missing.length > 0) {
            throw new Error(`Required template parameters missing values: ${missing.join(", ")}. ` +
                `Select a preset that provides these values or contact your template admin.`);
        }
    }
    /**
     * List available Coder templates.
     */
    async listTemplates() {
        try {
            const env_8 = { stack: [], error: void 0, hasError: false };
            try {
                const proc = __addDisposableResource(env_8, execAsync("coder templates list --output=json"), false);
                const { stdout } = await proc.result;
                // Handle empty output (no templates)
                if (!stdout.trim()) {
                    return { ok: true, templates: [] };
                }
                // CLI returns [{Template: {...}}, ...] wrapper structure
                const raw = JSON.parse(stdout);
                return {
                    ok: true,
                    templates: raw.map((entry) => ({
                        name: entry.Template.name,
                        displayName: entry.Template.display_name ?? entry.Template.name,
                        organizationName: entry.Template.organization_name ?? "default",
                    })),
                };
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
            const message = sanitizeCoderCliErrorForUi(error);
            // Surface CLI failures so the UI doesn't show "No templates" incorrectly.
            log.warn("Failed to list Coder templates", { error });
            return { ok: false, error: message || "Unknown error" };
        }
    }
    /**
     * List presets for a template.
     * @param templateName - Template name
     * @param org - Organization name for disambiguation (optional)
     */
    async listPresets(templateName, org) {
        try {
            const env_9 = { stack: [], error: void 0, hasError: false };
            try {
                const orgFlag = org ? ` --org ${shescape.quote(org)}` : "";
                const proc = __addDisposableResource(env_9, execAsync(`coder templates presets list ${shescape.quote(templateName)}${orgFlag} --output=json`), false);
                const { stdout } = await proc.result;
                // Handle empty output or non-JSON info messages (no presets).
                // CLI prints "No presets found for template ..." to stdout even with --output=json
                // because the Go handler returns early before the formatter runs.
                if (!stdout.trim() || !stdout.trimStart().startsWith("[")) {
                    return { ok: true, presets: [] };
                }
                // CLI returns [{TemplatePreset: {ID, Name, ...}}, ...] wrapper structure
                const raw = JSON.parse(stdout);
                return {
                    ok: true,
                    presets: raw.map((entry) => ({
                        id: entry.TemplatePreset.ID,
                        name: entry.TemplatePreset.Name,
                        description: entry.TemplatePreset.Description,
                        isDefault: entry.TemplatePreset.Default ?? false,
                    })),
                };
            }
            catch (e_9) {
                env_9.error = e_9;
                env_9.hasError = true;
            }
            finally {
                __disposeResources(env_9);
            }
        }
        catch (error) {
            const message = sanitizeCoderCliErrorForUi(error);
            // Surface CLI failures so the UI doesn't show "No presets" incorrectly.
            log.warn("Failed to list Coder presets", { templateName, error });
            return { ok: false, error: message || "Unknown error" };
        }
    }
    /**
     * Check if a Coder workspace exists by name.
     *
     * Uses `coder list --search name:<workspace>` so we don't have to fetch all workspaces.
     * Note: Coder's `--search` is prefix-based server-side, so we must exact-match locally.
     */
    async workspaceExists(workspaceName) {
        try {
            const env_10 = { stack: [], error: void 0, hasError: false };
            try {
                const proc = __addDisposableResource(env_10, execAsync(`coder list --search ${shescape.quote(`name:${workspaceName}`)} --output=json`), false);
                const { stdout } = await proc.result;
                if (!stdout.trim()) {
                    return false;
                }
                const workspaces = JSON.parse(stdout);
                return workspaces.some((w) => w.name === workspaceName);
            }
            catch (e_10) {
                env_10.error = e_10;
                env_10.hasError = true;
            }
            finally {
                __disposeResources(env_10);
            }
        }
        catch (error) {
            // Best-effort: if Coder isn't configured/logged in, treat as "doesn't exist" so we
            // don't block creation (later steps will fail with a more actionable error).
            log.debug("Failed to check if Coder workspace exists", { workspaceName, error });
            return false;
        }
    }
    /**
     * List Coder workspaces (all statuses).
     */
    async listWorkspaces() {
        // Derive known statuses from schema to avoid duplication and prevent ORPC validation errors
        const KNOWN_STATUSES = new Set(CoderWorkspaceStatusSchema.options);
        try {
            const env_11 = { stack: [], error: void 0, hasError: false };
            try {
                const proc = __addDisposableResource(env_11, execAsync("coder list --output=json"), false);
                const { stdout } = await proc.result;
                // Handle empty output (no workspaces)
                if (!stdout.trim()) {
                    return { ok: true, workspaces: [] };
                }
                const workspaces = JSON.parse(stdout);
                // Filter to known statuses to avoid ORPC schema validation failures
                return {
                    ok: true,
                    workspaces: workspaces
                        .filter((w) => KNOWN_STATUSES.has(w.latest_build.status))
                        .map((w) => ({
                        name: w.name,
                        templateName: w.template_name,
                        templateDisplayName: w.template_display_name || w.template_name,
                        status: w.latest_build.status,
                    })),
                };
            }
            catch (e_11) {
                env_11.error = e_11;
                env_11.hasError = true;
            }
            finally {
                __disposeResources(env_11);
            }
        }
        catch (error) {
            const message = sanitizeCoderCliErrorForUi(error);
            // Users reported seeing "No workspaces found" even when the CLI failed,
            // so surface an error state instead of silently returning an empty list.
            log.warn("Failed to list Coder workspaces", { error });
            return { ok: false, error: message || "Unknown error" };
        }
    }
    /**
     * Run a `coder` CLI command with timeout + optional cancellation.
     *
     * We use spawn (not execAsync) so ensureReady() can't hang forever on a stuck
     * Coder CLI invocation.
     */
    runCoderCommand(args, options) {
        return new Promise((resolve) => {
            if (options.timeoutMs <= 0) {
                resolve({ exitCode: null, stdout: "", stderr: "", error: "timeout" });
                return;
            }
            if (options.signal?.aborted) {
                resolve({ exitCode: null, stdout: "", stderr: "", error: "aborted" });
                return;
            }
            const child = spawn("coder", args, {
                stdio: ["ignore", "pipe", "pipe"],
            });
            let stdout = "";
            let stderr = "";
            let resolved = false;
            let timeoutTimer = null;
            const terminator = createGracefulTerminator(child);
            const resolveOnce = (result) => {
                if (resolved)
                    return;
                resolved = true;
                resolve(result);
            };
            const cleanup = (cleanupOptions) => {
                if (timeoutTimer) {
                    clearTimeout(timeoutTimer);
                    timeoutTimer = null;
                }
                if (!cleanupOptions?.keepSigkillTimer) {
                    terminator.cleanup();
                }
                child.removeListener("close", onClose);
                child.removeListener("error", onError);
                options.signal?.removeEventListener("abort", onAbort);
            };
            function onAbort() {
                terminator.terminate();
                // Keep SIGKILL escalation alive if SIGTERM doesn't work.
                cleanup({ keepSigkillTimer: true });
                resolveOnce({ exitCode: null, stdout, stderr, error: "aborted" });
            }
            function onError() {
                cleanup();
                resolveOnce({ exitCode: null, stdout, stderr });
            }
            function onClose(code) {
                cleanup();
                resolveOnce({ exitCode: code, stdout, stderr });
            }
            child.stdout?.on("data", (chunk) => {
                stdout += String(chunk);
            });
            child.stderr?.on("data", (chunk) => {
                stderr += String(chunk);
            });
            child.on("error", onError);
            child.on("close", onClose);
            timeoutTimer = setTimeout(() => {
                terminator.terminate();
                // Keep SIGKILL escalation alive if SIGTERM doesn't work.
                // We still remove the abort listener to avoid leaking it beyond the call.
                options.signal?.removeEventListener("abort", onAbort);
                resolveOnce({ exitCode: null, stdout, stderr, error: "timeout" });
            }, options.timeoutMs);
            options.signal?.addEventListener("abort", onAbort);
        });
    }
    /**
     * Get workspace status using control-plane query.
     *
     * Note: `coder list --search 'name:X'` is prefix-based on the server,
     * so we must exact-match the workspace name client-side.
     */
    async getWorkspaceStatus(workspaceName, options) {
        const timeoutMs = options?.timeoutMs ?? 10000;
        try {
            const result = await this.runCoderCommand(["list", "--search", `name:${workspaceName}`, "--output", "json"], { timeoutMs, signal: options?.signal });
            const interpreted = interpretCoderResult(result);
            if (!interpreted.ok) {
                return { kind: "error", error: interpreted.error };
            }
            if (!interpreted.stdout.trim()) {
                return { kind: "not_found" };
            }
            const workspaces = JSON.parse(interpreted.stdout);
            // Exact match required (search is prefix-based)
            const match = workspaces.find((w) => w.name === workspaceName);
            if (!match) {
                return { kind: "not_found" };
            }
            // Validate status against known schema values
            const status = match.latest_build.status;
            const parsed = CoderWorkspaceStatusSchema.safeParse(status);
            if (!parsed.success) {
                log.warn("Unknown Coder workspace status", { workspaceName, status });
                return { kind: "error", error: `Unknown status: ${status}` };
            }
            return { kind: "ok", status: parsed.data };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            log.debug("Failed to get Coder workspace status", { workspaceName, error: message });
            return { kind: "error", error: message };
        }
    }
    /**
     * Start a Coder workspace.
     *
     * Uses spawn + timeout so callers don't hang forever on a stuck CLI invocation.
     */
    async startWorkspace(workspaceName, options) {
        const timeoutMs = options?.timeoutMs ?? 60000;
        try {
            const result = await this.runCoderCommand(["start", workspaceName, "--yes"], {
                timeoutMs,
                signal: options?.signal,
            });
            const interpreted = interpretCoderResult(result);
            if (!interpreted.ok) {
                return Err(interpreted.error);
            }
            return Ok(undefined);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return Err(message);
        }
    }
    /**
     * Stop a Coder workspace.
     *
     * Uses spawn + timeout so callers don't hang forever on a stuck CLI invocation.
     */
    async stopWorkspace(workspaceName, options) {
        const timeoutMs = options?.timeoutMs ?? 60000;
        try {
            const result = await this.runCoderCommand(["stop", workspaceName, "--yes"], {
                timeoutMs,
                signal: options?.signal,
            });
            const interpreted = interpretCoderResult(result);
            if (!interpreted.ok) {
                return Err(interpreted.error);
            }
            return Ok(undefined);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return Err(message);
        }
    }
    /**
     * Wait for Coder workspace startup scripts to complete.
     * Runs `coder ssh <workspace> --wait=yes -- true` and streams output.
     */
    async *waitForStartupScripts(workspaceName, abortSignal) {
        log.debug("Waiting for Coder startup scripts", { workspaceName });
        yield* streamCoderCommand(["ssh", workspaceName, "--wait=yes", "--", "true"], "coder ssh --wait failed", abortSignal, "Coder startup script wait aborted");
    }
    /**
     * Create a new Coder workspace. Yields build log lines as they arrive.
     *
     * Pre-fetches template parameters and passes defaults via --parameter flags
     * to avoid interactive prompts during creation.
     *
     * @param name Workspace name
     * @param template Template name
     * @param preset Optional preset name
     * @param abortSignal Optional signal to cancel workspace creation
     * @param org Optional organization name for disambiguation
     * @param session Optional API session to reuse across deployment endpoints
     */
    async *createWorkspace(name, template, preset, abortSignal, org, session) {
        log.debug("Creating Coder workspace", { name, template, preset, org });
        if (abortSignal?.aborted) {
            throw new Error("Coder workspace creation aborted");
        }
        // 1. Get deployment URL
        const deploymentUrl = await this.getDeploymentUrl();
        // 2. Get active template version ID
        const versionId = await this.getActiveTemplateVersionId(template, org);
        // 3. Get parameter names covered by preset (if any)
        const coveredByPreset = preset
            ? await this.getPresetParamNames(template, preset, org)
            : new Set();
        // 4. Fetch all template parameters from API
        const allParams = await this.getTemplateRichParameters(deploymentUrl, versionId, name, session);
        // 5. Validate required params have values
        this.validateRequiredParams(allParams, coveredByPreset);
        // 6. Compute extra --parameter flags for non-ephemeral params not in preset
        const extraParams = this.computeExtraParams(allParams, coveredByPreset);
        log.debug("Computed extra params for coder create", {
            name,
            template,
            preset,
            org,
            extraParamCount: extraParams.length,
            extraParamNames: extraParams.map((p) => p.name),
        });
        // 7. Build and run single coder create command
        const args = ["create", name, "-t", template, "--yes"];
        if (org) {
            args.push("--org", org);
        }
        if (preset) {
            args.push("--preset", preset);
        }
        for (const p of extraParams) {
            args.push("--parameter", p.encoded);
        }
        yield* streamCoderCommand(args, "coder create failed", abortSignal, "Coder workspace creation aborted");
    }
    /** Promise-based sleep helper */
    sleep(ms, signal) {
        if (signal?.aborted) {
            return Promise.resolve();
        }
        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                signal?.removeEventListener("abort", onAbort);
                resolve();
            }, ms);
            const onAbort = () => {
                clearTimeout(timeout);
                signal?.removeEventListener("abort", onAbort);
                resolve();
            };
            signal?.addEventListener("abort", onAbort, { once: true });
        });
    }
    /**
     * Delete a Coder workspace, retrying across transient build states.
     *
     * This is used for "cancel creation" because aborting the local `coder create`
     * process does not guarantee the control-plane build is canceled.
     */
    async deleteWorkspaceEventually(name, options) {
        const timeoutMs = options?.timeoutMs ?? 60000;
        const startTime = Date.now();
        // Safety: never delete Coder workspaces mux didn't create.
        // Mux-created workspaces always use the mux- prefix.
        if (!name.startsWith("mux-")) {
            log.warn("Refusing to delete Coder workspace without mux- prefix", { name });
            return Ok(undefined);
        }
        const isTimedOut = () => Date.now() - startTime > timeoutMs;
        const remainingMs = () => Math.max(0, timeoutMs - (Date.now() - startTime));
        const unstableStates = new Set([
            "starting",
            "pending",
            "stopping",
            "canceling",
        ]);
        let sawWorkspaceExist = false;
        let lastError;
        let attempt = 0;
        while (!isTimedOut()) {
            if (options?.signal?.aborted) {
                return Err("Delete operation aborted");
            }
            const statusResult = await this.getWorkspaceStatus(name, {
                timeoutMs: Math.min(remainingMs(), 10000),
                signal: options?.signal,
            });
            if (statusResult.kind === "ok") {
                sawWorkspaceExist = true;
                if (statusResult.status === "deleted" || statusResult.status === "deleting") {
                    return Ok(undefined);
                }
                // If a build is transitioning (starting/stopping/etc), deletion may fail temporarily.
                // We'll keep polling + retrying the delete command.
                if (unstableStates.has(statusResult.status)) {
                    log.debug("Coder workspace in transitional state; will retry delete", {
                        name,
                        status: statusResult.status,
                    });
                }
            }
            if (statusResult.kind === "not_found") {
                if (options?.waitForExistence !== true) {
                    return Ok(undefined);
                }
                // For cancel-init, avoid treating an initial not_found as success: `coder create` may still
                // complete server-side after we abort the local CLI. Keep polling until we either observe
                // the workspace exist (and then disappear), or we hit the existence-wait window.
                if (sawWorkspaceExist) {
                    return Ok(undefined);
                }
                // Short-circuit: if we've never seen the workspace and the shorter existence-wait
                // window has elapsed, assume the server-side create never completed.
                const existenceTimeout = options?.waitForExistenceTimeoutMs ?? timeoutMs;
                if (Date.now() - startTime > existenceTimeout) {
                    return Ok(undefined);
                }
                attempt++;
                const backoffMs = Math.min(2000, 250 + attempt * 150);
                await this.sleep(backoffMs, options?.signal);
                continue;
            }
            if (statusResult.kind === "error") {
                // If status checks fail (auth/network), still attempt delete best-effort.
                lastError = statusResult.error;
            }
            const deleteAttempt = await this.runCoderCommand(["delete", name, "--yes"], {
                timeoutMs: Math.min(remainingMs(), 20000),
                signal: options?.signal,
            });
            const interpreted = interpretCoderResult(deleteAttempt);
            if (!interpreted.ok) {
                lastError = interpreted.error;
            }
            else {
                // Successful delete is terminal; status polling is best-effort.
                lastError = undefined;
                return Ok(undefined);
            }
            attempt++;
            const backoffMs = Math.min(2000, 250 + attempt * 150);
            await this.sleep(backoffMs, options?.signal);
        }
        if (options?.waitForExistence === true && !sawWorkspaceExist && !lastError) {
            return Ok(undefined);
        }
        return Err(lastError ?? "Timed out deleting Coder workspace");
    }
    /**
     * Delete a Coder workspace.
     *
     * Safety: Only deletes workspaces with "mux-" prefix to prevent accidentally
     * deleting user workspaces that weren't created by mux.
     */
    async deleteWorkspace(name) {
        const result = await this.deleteWorkspaceEventually(name, {
            timeoutMs: 30000,
            waitForExistence: false,
        });
        if (!result.success) {
            throw new Error(result.error);
        }
    }
    /**
     * Ensure SSH config is set up for Coder workspaces.
     * Run before every Coder workspace connection (idempotent).
     */
    async ensureSSHConfig() {
        const env_12 = { stack: [], error: void 0, hasError: false };
        try {
            log.debug("Ensuring Coder SSH config");
            const proc = __addDisposableResource(env_12, execAsync("coder config-ssh --yes"), false);
            await proc.result;
        }
        catch (e_12) {
            env_12.error = e_12;
            env_12.hasError = true;
        }
        finally {
            __disposeResources(env_12);
        }
    }
}
// Singleton instance
export const coderService = new CoderService();
//# sourceMappingURL=coderService.js.map