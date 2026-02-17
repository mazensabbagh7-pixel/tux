import http from "node:http";
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Ok } from "@/common/types/result";
import { MuxGovernorOauthService } from "./muxGovernorOauthService";
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
/** Simple GET helper that returns { status, body }. */
async function httpGet(url) {
    return new Promise((resolve, reject) => {
        http
            .get(url, (res) => {
            let body = "";
            res.on("data", (chunk) => {
                body += Buffer.from(chunk).toString();
            });
            res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
        })
            .on("error", reject);
    });
}
/** Build a mock JSON response. */
function jsonResponse(body, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
    });
}
/**
 * Helper to mock globalThis.fetch without needing the `preconnect` property.
 */
function mockFetch(fn) {
    globalThis.fetch = Object.assign(fn, {
        preconnect: (_url) => {
            // no-op in tests
        },
    });
}
function createMockDeps() {
    return {
        configState: { projects: new Map() },
        editConfigCalls: 0,
        focusCalls: 0,
        refreshCalls: 0,
        refreshResult: Ok(undefined),
    };
}
function createMockConfig(deps) {
    return {
        editConfig: (fn) => {
            deps.configState = fn(deps.configState);
            deps.editConfigCalls++;
            return Promise.resolve();
        },
    };
}
function createMockWindowService(deps) {
    return {
        focusMainWindow: () => {
            deps.focusCalls++;
        },
    };
}
function createMockPolicyService(deps) {
    return {
        refreshNow: () => {
            deps.refreshCalls++;
            return Promise.resolve(deps.refreshResult);
        },
    };
}
function createService(deps) {
    return new MuxGovernorOauthService(createMockConfig(deps), createMockWindowService(deps), createMockPolicyService(deps));
}
// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("MuxGovernorOauthService", () => {
    let deps;
    let service;
    const originalFetch = globalThis.fetch;
    beforeEach(() => {
        deps = createMockDeps();
        service = createService(deps);
    });
    afterEach(async () => {
        globalThis.fetch = originalFetch;
        await service.dispose();
    });
    describe("startDesktopFlow", () => {
        it("returns flowId, authorizeUrl, and redirectUri", async () => {
            const result = await service.startDesktopFlow({
                governorOrigin: "https://governor.example.com/admin?from=test",
            });
            expect(result.success).toBe(true);
            if (!result.success)
                return;
            expect(result.data.flowId).toBeTruthy();
            expect(result.data.redirectUri).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/callback$/);
            const authorizeUrl = new URL(result.data.authorizeUrl);
            expect(`${authorizeUrl.origin}${authorizeUrl.pathname}`).toBe("https://governor.example.com/oauth2/authorize");
            expect(authorizeUrl.searchParams.get("response_type")).toBe("code");
            expect(authorizeUrl.searchParams.get("state")).toBe(result.data.flowId);
            expect(authorizeUrl.searchParams.get("redirect_uri")).toBe(result.data.redirectUri);
            await service.cancelDesktopFlow(result.data.flowId);
        });
    });
    describe("desktop callback flow", () => {
        it("callback with code + successful exchange resolves waitFor success and renders success HTML", async () => {
            let capturedUrl = "";
            let capturedBody = "";
            mockFetch((input, init) => {
                capturedUrl =
                    typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
                capturedBody =
                    typeof init?.body === "string"
                        ? init.body
                        : init?.body instanceof URLSearchParams
                            ? init.body.toString()
                            : "";
                return jsonResponse({ access_token: "governor-token" });
            });
            const startResult = await service.startDesktopFlow({
                governorOrigin: "https://governor.example.com",
            });
            expect(startResult.success).toBe(true);
            if (!startResult.success)
                return;
            const flowId = startResult.data.flowId;
            const callbackUrl = `${startResult.data.redirectUri}?state=${flowId}&code=ok-code`;
            const waitPromise = service.waitForDesktopFlow(flowId, { timeoutMs: 5000 });
            const callbackResponsePromise = httpGet(callbackUrl);
            const [waitResult, callbackResponse] = await Promise.all([
                waitPromise,
                callbackResponsePromise,
            ]);
            expect(waitResult).toEqual(Ok(undefined));
            expect(callbackResponse.status).toBe(200);
            expect(callbackResponse.body).toContain("Enrollment complete");
            expect(capturedUrl).toBe("https://governor.example.com/api/v1/oauth2/exchange");
            expect(capturedBody).toContain("code=ok-code");
            expect(deps.editConfigCalls).toBe(1);
            expect(deps.configState.muxGovernorUrl).toBe("https://governor.example.com");
            expect(deps.configState.muxGovernorToken).toBe("governor-token");
            expect(deps.focusCalls).toBe(1);
            expect(deps.refreshCalls).toBe(1);
        });
        it("callback with code + failed exchange resolves waitFor error and renders failure HTML", async () => {
            let releaseExchange;
            const exchangeStarted = new Promise((resolveStarted) => {
                const exchangeBlocked = new Promise((resolveBlocked) => {
                    releaseExchange = () => resolveBlocked();
                });
                mockFetch(async () => {
                    resolveStarted();
                    await exchangeBlocked;
                    return new Response("governor unavailable", { status: 502 });
                });
            });
            const startResult = await service.startDesktopFlow({
                governorOrigin: "https://governor.example.com",
            });
            expect(startResult.success).toBe(true);
            if (!startResult.success)
                return;
            const flowId = startResult.data.flowId;
            const callbackUrl = `${startResult.data.redirectUri}?state=${flowId}&code=bad-code`;
            const waitPromise = service.waitForDesktopFlow(flowId, { timeoutMs: 5000 });
            const callbackResponsePromise = httpGet(callbackUrl);
            await exchangeStarted;
            const callbackState = await Promise.race([
                callbackResponsePromise.then(() => "settled"),
                new Promise((resolve) => setTimeout(() => resolve("pending"), 100)),
            ]);
            expect(callbackState).toBe("pending");
            releaseExchange();
            const [waitResult, callbackResponse] = await Promise.all([
                waitPromise,
                callbackResponsePromise,
            ]);
            expect(waitResult.success).toBe(false);
            if (!waitResult.success) {
                expect(waitResult.error).toContain("Mux Governor exchange failed (502)");
            }
            expect(callbackResponse.status).toBe(400);
            expect(callbackResponse.body).toContain("Enrollment failed");
            expect(callbackResponse.body).toContain("Mux Governor exchange failed (502): governor unavailable");
            expect(deps.editConfigCalls).toBe(0);
            expect(deps.focusCalls).toBe(0);
            expect(deps.refreshCalls).toBe(0);
            expect(deps.configState.muxGovernorUrl).toBeUndefined();
            expect(deps.configState.muxGovernorToken).toBeUndefined();
        });
    });
});
//# sourceMappingURL=muxGovernorOauthService.test.js.map