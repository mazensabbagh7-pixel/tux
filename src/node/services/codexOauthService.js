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
import * as crypto from "crypto";
import { Err, Ok } from "@/common/types/result";
import { buildCodexAuthorizeUrl, buildCodexRefreshBody, buildCodexTokenExchangeBody, CODEX_OAUTH_BROWSER_REDIRECT_URI, CODEX_OAUTH_CLIENT_ID, CODEX_OAUTH_DEVICE_TOKEN_POLL_URL, CODEX_OAUTH_DEVICE_USERCODE_URL, CODEX_OAUTH_DEVICE_VERIFY_URL, CODEX_OAUTH_TOKEN_URL, } from "@/common/constants/codexOAuth";
import { log } from "@/node/services/log";
import { AsyncMutex } from "@/node/utils/concurrency/asyncMutex";
import { extractChatGptAccountIdFromTokens, isCodexOauthAuthExpired, parseCodexOauthAuth, } from "@/node/utils/codexOauthAuth";
import { createDeferred } from "@/node/utils/oauthUtils";
import { startLoopbackServer } from "@/node/utils/oauthLoopbackServer";
import { OAuthFlowManager } from "@/node/utils/oauthFlowManager";
const DEFAULT_DESKTOP_TIMEOUT_MS = 5 * 60 * 1000;
const DEFAULT_DEVICE_TIMEOUT_MS = 15 * 60 * 1000;
const COMPLETED_FLOW_TTL_MS = 60 * 1000;
function sha256Base64Url(value) {
    return crypto.createHash("sha256").update(value).digest().toString("base64url");
}
function randomBase64Url(bytes = 32) {
    return crypto.randomBytes(bytes).toString("base64url");
}
function isPlainObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function parseOptionalNumber(value) {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === "string") {
        const n = Number(value);
        return Number.isFinite(n) ? n : null;
    }
    return null;
}
function isInvalidGrantError(errorText) {
    const trimmed = errorText.trim();
    if (trimmed.length === 0) {
        return false;
    }
    try {
        const json = JSON.parse(trimmed);
        if (isPlainObject(json) && json.error === "invalid_grant") {
            return true;
        }
    }
    catch {
        // Ignore parse failures - fall back to substring checks.
    }
    const lower = trimmed.toLowerCase();
    return lower.includes("invalid_grant") || lower.includes("revoked");
}
export class CodexOauthService {
    constructor(config, providerService, windowService) {
        this.config = config;
        this.providerService = providerService;
        this.windowService = windowService;
        this.desktopFlows = new OAuthFlowManager();
        this.deviceFlows = new Map();
        this.refreshMutex = new AsyncMutex();
        // In-memory cache so getValidAuth() skips disk reads when tokens are valid.
        // Invalidated on every write (exchange, refresh, disconnect).
        this.cachedAuth = null;
    }
    disconnect() {
        // Clear stored ChatGPT OAuth tokens so Codex-only models are hidden again.
        this.cachedAuth = null;
        return this.providerService.setConfigValue("openai", ["codexOauth"], undefined);
    }
    async startDesktopFlow() {
        const flowId = randomBase64Url();
        const codeVerifier = randomBase64Url();
        const codeChallenge = sha256Base64Url(codeVerifier);
        const redirectUri = CODEX_OAUTH_BROWSER_REDIRECT_URI;
        let loopback;
        try {
            loopback = await startLoopbackServer({
                port: 1455,
                host: "localhost",
                callbackPath: "/auth/callback",
                validateLoopback: true,
                expectedState: flowId,
                deferSuccessResponse: true,
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return Err(`Failed to start OAuth callback listener: ${message}`);
        }
        const resultDeferred = createDeferred();
        this.desktopFlows.register(flowId, {
            server: loopback.server,
            resultDeferred,
            // Keep server-side timeout tied to flow lifetime so abandoned flows
            // (e.g. callers that never invoke waitForDesktopFlow) still self-clean.
            timeoutHandle: setTimeout(() => {
                void this.desktopFlows.finish(flowId, Err("Timed out waiting for OAuth callback"));
            }, DEFAULT_DESKTOP_TIMEOUT_MS),
        });
        const authorizeUrl = buildCodexAuthorizeUrl({
            redirectUri,
            state: flowId,
            codeChallenge,
        });
        // Background task: wait for the loopback callback, exchange code for tokens,
        // then finish the flow. Races against resultDeferred (which resolves on
        // cancel/timeout) so the task exits cleanly if the flow is cancelled.
        void (async () => {
            const callbackResult = await Promise.race([
                loopback.result,
                resultDeferred.promise.then(() => null),
            ]);
            // null means the flow was finished externally (cancel/timeout).
            if (!callbackResult)
                return;
            if (!callbackResult.success) {
                await this.desktopFlows.finish(flowId, Err(callbackResult.error));
                return;
            }
            const exchangeResult = await this.handleDesktopCallbackAndExchange({
                flowId,
                redirectUri,
                codeVerifier,
                code: callbackResult.data.code,
                error: null,
                errorDescription: undefined,
            });
            if (exchangeResult.success) {
                loopback.sendSuccessResponse();
            }
            else {
                loopback.sendFailureResponse(exchangeResult.error);
            }
            await this.desktopFlows.finish(flowId, exchangeResult);
        })();
        log.debug(`[Codex OAuth] Desktop flow started (flowId=${flowId})`);
        return Ok({ flowId, authorizeUrl });
    }
    async waitForDesktopFlow(flowId, opts) {
        return this.desktopFlows.waitFor(flowId, opts?.timeoutMs ?? DEFAULT_DESKTOP_TIMEOUT_MS);
    }
    async cancelDesktopFlow(flowId) {
        if (this.desktopFlows.has(flowId)) {
            log.debug(`[Codex OAuth] Desktop flow cancelled (flowId=${flowId})`);
        }
        await this.desktopFlows.cancel(flowId);
    }
    async startDeviceFlow() {
        const flowId = randomBase64Url();
        const deviceAuthResult = await this.requestDeviceUserCode();
        if (!deviceAuthResult.success) {
            return Err(deviceAuthResult.error);
        }
        const { deviceAuthId, userCode, intervalSeconds, expiresAtMs } = deviceAuthResult.data;
        const verifyUrl = CODEX_OAUTH_DEVICE_VERIFY_URL;
        const { promise: resultPromise, resolve: resolveResult } = createDeferred();
        const abortController = new AbortController();
        const timeoutMs = Math.min(DEFAULT_DEVICE_TIMEOUT_MS, Math.max(0, expiresAtMs - Date.now()));
        const timeout = setTimeout(() => {
            void this.finishDeviceFlow(flowId, Err("Device code expired"));
        }, timeoutMs);
        this.deviceFlows.set(flowId, {
            flowId,
            deviceAuthId,
            userCode,
            verifyUrl,
            intervalSeconds,
            expiresAtMs,
            abortController,
            pollingStarted: false,
            timeout,
            cleanupTimeout: null,
            resultPromise,
            resolveResult,
            settled: false,
        });
        log.debug(`[Codex OAuth] Device flow started (flowId=${flowId})`);
        return Ok({ flowId, userCode, verifyUrl, intervalSeconds });
    }
    async waitForDeviceFlow(flowId, opts) {
        const flow = this.deviceFlows.get(flowId);
        if (!flow) {
            return Err("OAuth flow not found");
        }
        if (!flow.pollingStarted) {
            flow.pollingStarted = true;
            this.pollDeviceFlow(flowId).catch((error) => {
                // The polling loop is responsible for resolving the flow; if we reach
                // here something unexpected happened.
                const message = error instanceof Error ? error.message : String(error);
                log.warn(`[Codex OAuth] Device polling crashed (flowId=${flowId}): ${message}`);
                void this.finishDeviceFlow(flowId, Err(`Device polling crashed: ${message}`));
            });
        }
        const timeoutMs = opts?.timeoutMs ?? DEFAULT_DEVICE_TIMEOUT_MS;
        let timeoutHandle = null;
        const timeoutPromise = new Promise((resolve) => {
            timeoutHandle = setTimeout(() => {
                resolve(Err("Timed out waiting for device authorization"));
            }, timeoutMs);
        });
        const result = await Promise.race([flow.resultPromise, timeoutPromise]);
        if (timeoutHandle !== null) {
            clearTimeout(timeoutHandle);
        }
        if (!result.success) {
            // Ensure polling is cancelled on timeout/errors.
            void this.finishDeviceFlow(flowId, result);
        }
        return result;
    }
    async cancelDeviceFlow(flowId) {
        const flow = this.deviceFlows.get(flowId);
        if (!flow)
            return;
        log.debug(`[Codex OAuth] Device flow cancelled (flowId=${flowId})`);
        await this.finishDeviceFlow(flowId, Err("OAuth flow cancelled"));
    }
    async getValidAuth() {
        const env_1 = { stack: [], error: void 0, hasError: false };
        try {
            const stored = this.readStoredAuth();
            if (!stored) {
                return Err("Codex OAuth is not configured");
            }
            if (!isCodexOauthAuthExpired(stored)) {
                return Ok(stored);
            }
            const _lock = __addDisposableResource(env_1, await this.refreshMutex.acquire(), true);
            // Re-read after acquiring lock in case another caller refreshed first.
            const latest = this.readStoredAuth();
            if (!latest) {
                return Err("Codex OAuth is not configured");
            }
            if (!isCodexOauthAuthExpired(latest)) {
                return Ok(latest);
            }
            const refreshed = await this.refreshTokens(latest);
            if (!refreshed.success) {
                return Err(refreshed.error);
            }
            return Ok(refreshed.data);
        }
        catch (e_1) {
            env_1.error = e_1;
            env_1.hasError = true;
        }
        finally {
            const result_1 = __disposeResources(env_1);
            if (result_1)
                await result_1;
        }
    }
    async dispose() {
        await this.desktopFlows.shutdownAll();
        const deviceIds = [...this.deviceFlows.keys()];
        await Promise.all(deviceIds.map((id) => this.finishDeviceFlow(id, Err("App shutting down"))));
        for (const flow of this.deviceFlows.values()) {
            clearTimeout(flow.timeout);
            if (flow.cleanupTimeout !== null) {
                clearTimeout(flow.cleanupTimeout);
            }
        }
        this.deviceFlows.clear();
    }
    readStoredAuth() {
        if (this.cachedAuth) {
            return this.cachedAuth;
        }
        const providersConfig = this.config.loadProvidersConfig() ?? {};
        const openaiConfig = providersConfig.openai;
        const auth = parseCodexOauthAuth(openaiConfig?.codexOauth);
        this.cachedAuth = auth;
        return auth;
    }
    persistAuth(auth) {
        const result = this.providerService.setConfigValue("openai", ["codexOauth"], auth);
        // Invalidate cache so the next readStoredAuth() picks up the persisted value from disk.
        // We clear rather than set because setConfigValue may have side-effects (e.g. file-write
        // failures) and we want the next read to be authoritative.
        this.cachedAuth = null;
        return result;
    }
    async handleDesktopCallbackAndExchange(input) {
        if (input.error) {
            const message = input.errorDescription
                ? `${input.error}: ${input.errorDescription}`
                : input.error;
            return Err(`Codex OAuth error: ${message}`);
        }
        if (!input.code) {
            return Err("Missing OAuth code");
        }
        const tokenResult = await this.exchangeCodeForTokens({
            code: input.code,
            redirectUri: input.redirectUri,
            codeVerifier: input.codeVerifier,
        });
        if (!tokenResult.success) {
            return Err(tokenResult.error);
        }
        const persistResult = this.persistAuth(tokenResult.data);
        if (!persistResult.success) {
            return Err(persistResult.error);
        }
        log.debug(`[Codex OAuth] Desktop exchange completed (flowId=${input.flowId})`);
        this.windowService?.focusMainWindow();
        return Ok(undefined);
    }
    async exchangeCodeForTokens(input) {
        try {
            const response = await fetch(CODEX_OAUTH_TOKEN_URL, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: buildCodexTokenExchangeBody({
                    code: input.code,
                    redirectUri: input.redirectUri,
                    codeVerifier: input.codeVerifier,
                }),
            });
            if (!response.ok) {
                const errorText = await response.text().catch(() => "");
                const prefix = `Codex OAuth exchange failed (${response.status})`;
                return Err(errorText ? `${prefix}: ${errorText}` : prefix);
            }
            const json = (await response.json());
            if (!isPlainObject(json)) {
                return Err("Codex OAuth exchange returned an invalid JSON payload");
            }
            const accessToken = typeof json.access_token === "string" ? json.access_token : null;
            const refreshToken = typeof json.refresh_token === "string" ? json.refresh_token : null;
            const expiresIn = parseOptionalNumber(json.expires_in);
            const idToken = typeof json.id_token === "string" ? json.id_token : undefined;
            if (!accessToken) {
                return Err("Codex OAuth exchange response missing access_token");
            }
            if (!refreshToken) {
                return Err("Codex OAuth exchange response missing refresh_token");
            }
            if (expiresIn === null) {
                return Err("Codex OAuth exchange response missing expires_in");
            }
            const accountId = extractChatGptAccountIdFromTokens({ accessToken, idToken }) ?? undefined;
            return Ok({
                type: "oauth",
                access: accessToken,
                refresh: refreshToken,
                expires: Date.now() + Math.max(0, Math.floor(expiresIn * 1000)),
                accountId,
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return Err(`Codex OAuth exchange failed: ${message}`);
        }
    }
    async refreshTokens(current) {
        try {
            const response = await fetch(CODEX_OAUTH_TOKEN_URL, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: buildCodexRefreshBody({ refreshToken: current.refresh }),
            });
            if (!response.ok) {
                const errorText = await response.text().catch(() => "");
                // When the refresh token is invalid/revoked, clear persisted auth so subsequent
                // requests fall back to the existing "not connected" behavior.
                if (isInvalidGrantError(errorText)) {
                    log.debug("[Codex OAuth] Refresh token rejected; clearing stored auth");
                    const disconnectResult = this.disconnect();
                    if (!disconnectResult.success) {
                        log.warn(`[Codex OAuth] Failed to clear stored auth after refresh failure: ${disconnectResult.error}`);
                    }
                }
                const prefix = `Codex OAuth refresh failed (${response.status})`;
                return Err(errorText ? `${prefix}: ${errorText}` : prefix);
            }
            const json = (await response.json());
            if (!isPlainObject(json)) {
                return Err("Codex OAuth refresh returned an invalid JSON payload");
            }
            const accessToken = typeof json.access_token === "string" ? json.access_token : null;
            const refreshToken = typeof json.refresh_token === "string" ? json.refresh_token : null;
            const expiresIn = parseOptionalNumber(json.expires_in);
            const idToken = typeof json.id_token === "string" ? json.id_token : undefined;
            if (!accessToken) {
                return Err("Codex OAuth refresh response missing access_token");
            }
            if (expiresIn === null) {
                return Err("Codex OAuth refresh response missing expires_in");
            }
            const accountId = extractChatGptAccountIdFromTokens({ accessToken, idToken }) ?? current.accountId;
            const next = {
                type: "oauth",
                access: accessToken,
                refresh: refreshToken ?? current.refresh,
                expires: Date.now() + Math.max(0, Math.floor(expiresIn * 1000)),
                accountId,
            };
            const persistResult = this.persistAuth(next);
            if (!persistResult.success) {
                return Err(persistResult.error);
            }
            return Ok(next);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return Err(`Codex OAuth refresh failed: ${message}`);
        }
    }
    async requestDeviceUserCode() {
        try {
            const response = await fetch(CODEX_OAUTH_DEVICE_USERCODE_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ client_id: CODEX_OAUTH_CLIENT_ID }),
            });
            if (!response.ok) {
                const errorText = await response.text().catch(() => "");
                const prefix = `Codex OAuth device auth request failed (${response.status})`;
                return Err(errorText ? `${prefix}: ${errorText}` : prefix);
            }
            const json = (await response.json());
            if (!isPlainObject(json)) {
                return Err("Codex OAuth device auth response returned an invalid JSON payload");
            }
            const deviceAuthId = typeof json.device_auth_id === "string" ? json.device_auth_id : null;
            const userCode = typeof json.user_code === "string" ? json.user_code : null;
            const interval = parseOptionalNumber(json.interval);
            const expiresIn = parseOptionalNumber(json.expires_in);
            if (!deviceAuthId || !userCode) {
                return Err("Codex OAuth device auth response missing required fields");
            }
            const intervalSeconds = interval !== null ? Math.max(1, Math.floor(interval)) : 5;
            const expiresAtMs = expiresIn !== null
                ? Date.now() + Math.max(0, Math.floor(expiresIn * 1000))
                : Date.now() + DEFAULT_DEVICE_TIMEOUT_MS;
            return Ok({ deviceAuthId, userCode, intervalSeconds, expiresAtMs });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return Err(`Codex OAuth device auth request failed: ${message}`);
        }
    }
    async pollDeviceFlow(flowId) {
        const flow = this.deviceFlows.get(flowId);
        if (!flow || flow.settled) {
            return;
        }
        const intervalSeconds = flow.intervalSeconds;
        while (Date.now() < flow.expiresAtMs) {
            if (flow.abortController.signal.aborted) {
                await this.finishDeviceFlow(flowId, Err("OAuth flow cancelled"));
                return;
            }
            const attempt = await this.pollDeviceTokenOnce(flow);
            if (attempt.kind === "success") {
                const persistResult = this.persistAuth(attempt.auth);
                if (!persistResult.success) {
                    await this.finishDeviceFlow(flowId, Err(persistResult.error));
                    return;
                }
                log.debug(`[Codex OAuth] Device authorization completed (flowId=${flowId})`);
                this.windowService?.focusMainWindow();
                await this.finishDeviceFlow(flowId, Ok(undefined));
                return;
            }
            if (attempt.kind === "fatal") {
                await this.finishDeviceFlow(flowId, Err(attempt.message));
                return;
            }
            try {
                // OpenCode guide: intervalSeconds * 1000 + 3000
                await sleepWithAbort(intervalSeconds * 1000 + 3000, flow.abortController.signal);
            }
            catch {
                // Abort is handled via cancelDeviceFlow()/finishDeviceFlow().
                return;
            }
        }
        await this.finishDeviceFlow(flowId, Err("Device code expired"));
    }
    async pollDeviceTokenOnce(flow) {
        try {
            const response = await fetch(CODEX_OAUTH_DEVICE_TOKEN_POLL_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ device_auth_id: flow.deviceAuthId, user_code: flow.userCode }),
                signal: flow.abortController.signal,
            });
            if (response.status === 403 || response.status === 404) {
                return { kind: "pending" };
            }
            if (response.status !== 200) {
                const errorText = await response.text().catch(() => "");
                const prefix = `Codex OAuth device token poll failed (${response.status})`;
                return { kind: "fatal", message: errorText ? `${prefix}: ${errorText}` : prefix };
            }
            const json = (await response.json().catch(() => null));
            if (!isPlainObject(json)) {
                return { kind: "fatal", message: "Codex OAuth device token poll returned invalid JSON" };
            }
            const authorizationCode = typeof json.authorization_code === "string" ? json.authorization_code : null;
            const codeVerifier = typeof json.code_verifier === "string" ? json.code_verifier : null;
            if (!authorizationCode || !codeVerifier) {
                return {
                    kind: "fatal",
                    message: "Codex OAuth device token poll response missing required fields",
                };
            }
            const tokenResult = await this.exchangeCodeForTokens({
                code: authorizationCode,
                redirectUri: "https://auth.openai.com/deviceauth/callback",
                codeVerifier,
            });
            if (!tokenResult.success) {
                return { kind: "fatal", message: tokenResult.error };
            }
            return { kind: "success", auth: tokenResult.data };
        }
        catch (error) {
            // Abort is treated as cancellation.
            if (flow.abortController.signal.aborted) {
                return { kind: "fatal", message: "OAuth flow cancelled" };
            }
            const message = error instanceof Error ? error.message : String(error);
            return { kind: "fatal", message: `Device authorization failed: ${message}` };
        }
    }
    finishDeviceFlow(flowId, result) {
        const flow = this.deviceFlows.get(flowId);
        if (!flow || flow.settled) {
            return Promise.resolve();
        }
        flow.settled = true;
        clearTimeout(flow.timeout);
        flow.abortController.abort();
        try {
            flow.resolveResult(result);
        }
        finally {
            if (flow.cleanupTimeout !== null) {
                clearTimeout(flow.cleanupTimeout);
            }
            flow.cleanupTimeout = setTimeout(() => {
                this.deviceFlows.delete(flowId);
            }, COMPLETED_FLOW_TTL_MS);
        }
        return Promise.resolve();
    }
}
async function sleepWithAbort(ms, signal) {
    if (ms <= 0) {
        return;
    }
    if (signal.aborted) {
        throw new Error("aborted");
    }
    await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            cleanup();
            resolve();
        }, ms);
        const onAbort = () => {
            cleanup();
            reject(new Error("aborted"));
        };
        const cleanup = () => {
            clearTimeout(timeout);
            signal.removeEventListener("abort", onAbort);
        };
        signal.addEventListener("abort", onAbort);
    });
}
//# sourceMappingURL=codexOauthService.js.map