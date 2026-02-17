import { EventEmitter } from "events";
import { readFile } from "node:fs/promises";
import { log } from "@/node/services/log";
import { Err, Ok } from "@/common/types/result";
import { PolicyFileSchema, } from "@/common/orpc/schemas/policy";
import { compareVersions } from "@/node/services/coderService";
import packageJson from "../../../package.json";
const POLICY_FETCH_TIMEOUT_MS = 10 * 1000;
const POLICY_MAX_BYTES = 1024 * 1024;
const POLICY_REFRESH_INTERVAL_MS = 15 * 60 * 1000;
function stableNormalize(value) {
    if (Array.isArray(value)) {
        return value.map(stableNormalize);
    }
    if (value && typeof value === "object") {
        const obj = value;
        return Object.fromEntries(Object.keys(obj)
            .sort()
            .map((key) => [key, stableNormalize(obj[key])]));
    }
    return value;
}
function stableStringify(value) {
    return JSON.stringify(stableNormalize(value));
}
async function getClientVersion() {
    // Prefer Electron's app version when available (authoritative in packaged apps).
    if (process.versions.electron) {
        try {
            // Intentionally lazy import to keep CLI/server mode light.
            // eslint-disable-next-line no-restricted-syntax
            const { app } = await import("electron");
            return app.getVersion();
        }
        catch {
            // Ignore and fall back.
        }
    }
    // Fallback for CLI/headless.
    if (typeof packageJson.version === "string") {
        return packageJson.version;
    }
    return "0.0.0";
}
function isRemotePolicySource(source) {
    return source.startsWith("http://") || source.startsWith("https://");
}
function formatPolicySourceForLog(source) {
    if (!isRemotePolicySource(source)) {
        return source;
    }
    try {
        const url = new URL(source);
        // Intentionally omit credentials and query string.
        return `${url.origin}${url.pathname}`;
    }
    catch {
        return "<policy-url>";
    }
}
async function loadPolicyText(source) {
    if (!isRemotePolicySource(source)) {
        try {
            return await readFile(source, "utf8");
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to read policy file: ${message}`);
        }
    }
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), POLICY_FETCH_TIMEOUT_MS);
    try {
        const response = await fetch(source, {
            signal: abortController.signal,
            headers: {
                accept: "application/json",
            },
        });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const text = await response.text();
        const bytes = Buffer.byteLength(text, "utf8");
        if (bytes > POLICY_MAX_BYTES) {
            throw new Error(`Response too large (${bytes} bytes)`);
        }
        return text;
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to fetch policy URL (${formatPolicySourceForLog(source)}): ${message}`);
    }
    finally {
        clearTimeout(timeout);
    }
}
async function loadGovernorPolicyText(input) {
    const policyUrl = new URL("/api/v1/policy.json", input.governorOrigin).toString();
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), POLICY_FETCH_TIMEOUT_MS);
    try {
        const response = await fetch(policyUrl, {
            signal: abortController.signal,
            headers: {
                accept: "application/json",
                "Mux-Governor-Session-Token": input.token,
            },
        });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const text = await response.text();
        const bytes = Buffer.byteLength(text, "utf8");
        if (bytes > POLICY_MAX_BYTES) {
            throw new Error(`Response too large (${bytes} bytes)`);
        }
        return text;
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to fetch Governor policy (${formatPolicySourceForLog(policyUrl)}): ${message}`);
    }
    finally {
        clearTimeout(timeout);
    }
}
function normalizeForcedBaseUrl(value) {
    const trimmed = value?.trim();
    if (!trimmed) {
        return undefined;
    }
    return trimmed;
}
function parsePolicyFile(text) {
    // Policy files are strict JSON (no JS evaluation).
    return JSON.parse(text);
}
export class PolicyService {
    constructor(config) {
        this.config = config;
        this.emitter = new EventEmitter();
        this.refreshInterval = null;
        this.source = "none";
        this.refreshInFlight = null;
        this.status = { state: "disabled" };
        this.effectivePolicy = null;
        this.signature = stableStringify({
            source: this.source,
            status: this.status,
            policy: this.effectivePolicy,
        });
        // Multiple windows can subscribe.
        this.emitter.setMaxListeners(50);
    }
    async initialize() {
        await this.refreshPolicy({ isStartup: true });
        if (!this.refreshInterval) {
            this.refreshInterval = setInterval(() => {
                void this.refreshPolicy({ isStartup: false });
            }, POLICY_REFRESH_INTERVAL_MS);
            this.refreshInterval.unref?.();
        }
    }
    dispose() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }
    }
    async refreshNow() {
        return await this.refreshPolicy({ isStartup: false });
    }
    onPolicyChanged(callback) {
        this.emitter.on("policyChanged", callback);
        return () => this.emitter.off("policyChanged", callback);
    }
    emitPolicyChanged() {
        this.emitter.emit("policyChanged");
    }
    getPolicyGetResponse() {
        return {
            source: this.source,
            status: this.toSchemaStatus(this.status),
            policy: this.effectivePolicy,
        };
    }
    getEffectivePolicy() {
        return this.effectivePolicy;
    }
    getStatus() {
        return this.status;
    }
    isEnforced() {
        // "blocked" should behave as deny-all enforcement so callers can't bypass the
        // UI block by calling backend endpoints directly (CLI/headless/orpc).
        return this.status.state !== "disabled";
    }
    isProviderAllowed(provider) {
        if (this.status.state === "blocked") {
            return false;
        }
        const access = this.effectivePolicy?.providerAccess;
        if (access == null) {
            return true;
        }
        return access.some((p) => p.id === provider);
    }
    getForcedBaseUrl(provider) {
        return this.effectivePolicy?.providerAccess?.find((p) => p.id === provider)?.forcedBaseUrl;
    }
    isModelAllowed(provider, modelId) {
        if (this.status.state === "blocked") {
            return false;
        }
        const access = this.effectivePolicy?.providerAccess;
        if (access == null) {
            return true;
        }
        const providerPolicy = access.find((p) => p.id === provider);
        if (!providerPolicy) {
            return false;
        }
        const allowedModels = providerPolicy.allowedModels ?? null;
        if (allowedModels === null) {
            return true;
        }
        return allowedModels.includes(modelId);
    }
    isMcpTransportAllowed(transport) {
        if (this.status.state === "blocked") {
            return false;
        }
        const policy = this.effectivePolicy;
        if (!policy) {
            return true;
        }
        const allow = policy.mcp.allowUserDefined;
        if (transport === "stdio") {
            return allow.stdio;
        }
        // http/sse/auto are all remote.
        return allow.remote;
    }
    isRuntimeAllowed(runtimeConfig) {
        if (this.status.state === "blocked") {
            return false;
        }
        const runtimes = this.effectivePolicy?.runtimes;
        if (runtimes == null) {
            return true;
        }
        const runtimeId = this.getPolicyRuntimeId(runtimeConfig);
        return runtimeId != null && runtimes.includes(runtimeId);
    }
    getPolicyRuntimeId(runtimeConfig) {
        if (!runtimeConfig) {
            // This matches the server default in workspaceService.create().
            return "worktree";
        }
        // Legacy local+srcBaseDir is treated as worktree.
        if (runtimeConfig.type === "local" && "srcBaseDir" in runtimeConfig) {
            return "worktree";
        }
        if (runtimeConfig.type === "ssh") {
            return runtimeConfig.coder ? "ssh+coder" : "ssh";
        }
        return runtimeConfig.type;
    }
    getActivePolicySource() {
        const filePath = process.env.MUX_POLICY_FILE?.trim();
        if (filePath) {
            return { kind: "env", value: filePath };
        }
        const config = this.config.loadConfigOrDefault();
        const governorOrigin = config.muxGovernorUrl?.trim();
        const governorToken = config.muxGovernorToken?.trim();
        if (governorOrigin && governorToken) {
            return { kind: "governor", origin: governorOrigin, token: governorToken };
        }
        return { kind: "none" };
    }
    async refreshPolicy(options) {
        if (this.refreshInFlight) {
            return this.refreshInFlight;
        }
        const promise = this.refreshPolicyOnce(options).finally(() => {
            this.refreshInFlight = null;
        });
        this.refreshInFlight = promise;
        return promise;
    }
    async refreshPolicyOnce(options) {
        const policySource = this.getActivePolicySource();
        if (policySource.kind === "none") {
            // Policy is opt-in.
            this.updateState({ source: "none", status: { state: "disabled" }, policy: null });
            return Ok(undefined);
        }
        const schemaSource = policySource.kind === "env" ? "env" : "governor";
        try {
            const [clientVersion, fileText] = await Promise.all([
                getClientVersion(),
                policySource.kind === "env"
                    ? loadPolicyText(policySource.value)
                    : loadGovernorPolicyText({
                        governorOrigin: policySource.origin,
                        token: policySource.token,
                    }),
            ]);
            const raw = parsePolicyFile(fileText);
            const parsed = PolicyFileSchema.parse(raw);
            // Version gates
            if (parsed.minimum_client_version) {
                const min = parsed.minimum_client_version;
                if (compareVersions(clientVersion, min) < 0) {
                    this.updateState({
                        source: schemaSource,
                        status: {
                            state: "blocked",
                            reason: `Mux ${clientVersion} is below required minimum_client_version ${min}`,
                        },
                        policy: null,
                    });
                    return Ok(undefined);
                }
            }
            const providerAccess = (() => {
                const list = parsed.provider_access;
                if (!list || list.length === 0) {
                    return null;
                }
                return list.map((p) => {
                    const forcedBaseUrl = normalizeForcedBaseUrl(p.base_url);
                    const models = p.model_access;
                    if (!models || models.length === 0) {
                        return { id: p.id, forcedBaseUrl, allowedModels: null };
                    }
                    // Normalize + drop empties. An empty list means "allow all".
                    const normalized = models.map((m) => m.trim()).filter(Boolean);
                    if (normalized.length === 0) {
                        return { id: p.id, forcedBaseUrl, allowedModels: null };
                    }
                    return { id: p.id, forcedBaseUrl, allowedModels: normalized };
                });
            })();
            const allowUserDefined = parsed.tools?.allow_user_defined_mcp;
            const effective = {
                policyFormatVersion: "0.1",
                serverVersion: parsed.server_version,
                minimumClientVersion: parsed.minimum_client_version,
                providerAccess,
                mcp: {
                    allowUserDefined: {
                        stdio: allowUserDefined?.stdio ?? true,
                        remote: allowUserDefined?.remote ?? true,
                    },
                },
                runtimes: parsed.runtimes && parsed.runtimes.length > 0 ? parsed.runtimes.map((r) => r.id) : null,
            };
            this.updateState({ source: schemaSource, status: { state: "enforced" }, policy: effective });
            return Ok(undefined);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            // Fail closed on startup, or if there's no existing enforced policy (e.g., first fetch
            // after enrollment). This ensures enrollment can't silently bypass policy on a bad first fetch.
            if (options.isStartup || this.effectivePolicy === null) {
                this.updateState({
                    source: schemaSource,
                    status: { state: "blocked", reason: `Failed to load policy: ${message}` },
                    policy: null,
                });
                return Err(message);
            }
            // Refresh failures should not unlock the user; keep last-known-good.
            log.warn("Policy refresh failed; keeping last-known-good policy", { error: message });
            return Err(message);
        }
    }
    updateState(next) {
        const nextSignature = stableStringify(next);
        if (nextSignature === this.signature) {
            return;
        }
        this.source = next.source;
        this.status = next.status;
        this.effectivePolicy = next.policy;
        this.signature = nextSignature;
        this.emitPolicyChanged();
    }
    toSchemaStatus(status) {
        if (status.state === "disabled") {
            return { state: "disabled" };
        }
        if (status.state === "enforced") {
            return { state: "enforced" };
        }
        return { state: "blocked", reason: status.reason };
    }
}
//# sourceMappingURL=policyService.js.map