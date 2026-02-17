// Bun test file - doesn't support Jest mocking, so we skip this test for now
// These tests would need to be rewritten to work with Bun's test runner
// For now, the commandProcessor tests demonstrate our testing approach
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
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { describe, it, expect, beforeEach, afterEach, mock, spyOn } from "bun:test";
import { AIService } from "./aiService";
import { discoverAvailableSubagentsForToolContext } from "./streamContextBuilder";
import { normalizeAnthropicBaseURL, buildAnthropicHeaders, buildAppAttributionHeaders, ANTHROPIC_1M_CONTEXT_HEADER, } from "./providerModelFactory";
import { HistoryService } from "./historyService";
import { InitStateManager } from "./initStateManager";
import { ProviderService } from "./providerService";
import { Config } from "@/node/config";
import { LocalRuntime } from "@/node/runtime/LocalRuntime";
import { DisposableTempDir } from "@/node/services/tempDir";
import { createTaskTool } from "./tools/task";
import { createTestToolConfig } from "./tools/testHelpers";
import { MUX_APP_ATTRIBUTION_TITLE, MUX_APP_ATTRIBUTION_URL } from "@/constants/appAttribution";
import { KNOWN_MODELS } from "@/common/constants/knownModels";
import { CODEX_ENDPOINT } from "@/common/constants/codexOAuth";
import { createMuxMessage } from "@/common/types/message";
import { DEFAULT_TASK_SETTINGS } from "@/common/types/tasks";
import * as agentResolution from "./agentResolution";
import * as streamContextBuilder from "./streamContextBuilder";
import * as messagePipeline from "./messagePipeline";
import * as toolsModule from "@/common/utils/tools/tools";
import * as systemMessageModule from "./systemMessage";
describe("AIService", () => {
    let service;
    beforeEach(() => {
        const config = new Config();
        const historyService = new HistoryService(config);
        const initStateManager = new InitStateManager(config);
        const providerService = new ProviderService(config);
        service = new AIService(config, historyService, initStateManager, providerService);
    });
    // Note: These tests are placeholders as Bun doesn't support Jest mocking
    // In a production environment, we'd use dependency injection or other patterns
    // to make the code more testable without mocking
    it("should create an AIService instance", () => {
        expect(service).toBeDefined();
        expect(service).toBeInstanceOf(AIService);
    });
});
describe("AIService.resolveGatewayModelString", () => {
    async function writeMuxConfig(root, config) {
        await fs.writeFile(path.join(root, "config.json"), JSON.stringify({
            projects: [],
            ...config,
        }, null, 2), "utf-8");
    }
    async function writeProvidersConfig(root, config) {
        await fs.writeFile(path.join(root, "providers.jsonc"), JSON.stringify(config, null, 2), "utf-8");
    }
    function toGatewayModelString(modelString) {
        const colonIndex = modelString.indexOf(":");
        const provider = colonIndex === -1 ? modelString : modelString.slice(0, colonIndex);
        const modelId = colonIndex === -1 ? "" : modelString.slice(colonIndex + 1);
        return `mux-gateway:${provider}/${modelId}`;
    }
    function createService(root) {
        const config = new Config(root);
        const historyService = new HistoryService(config);
        const initStateManager = new InitStateManager(config);
        const providerService = new ProviderService(config);
        return new AIService(config, historyService, initStateManager, providerService);
    }
    it("routes allowlisted models when gateway is enabled + configured", async () => {
        const env_1 = { stack: [], error: void 0, hasError: false };
        try {
            const muxHome = __addDisposableResource(env_1, new DisposableTempDir("gateway-routing"), false);
            await writeMuxConfig(muxHome.path, {
                muxGatewayEnabled: true,
                muxGatewayModels: [KNOWN_MODELS.SONNET.id],
            });
            await writeProvidersConfig(muxHome.path, {
                "mux-gateway": { couponCode: "test-coupon" },
            });
            const service = createService(muxHome.path);
            // @ts-expect-error - accessing private field for testing
            const resolved = service.providerModelFactory.resolveGatewayModelString(KNOWN_MODELS.SONNET.id);
            expect(resolved).toBe(toGatewayModelString(KNOWN_MODELS.SONNET.id));
        }
        catch (e_1) {
            env_1.error = e_1;
            env_1.hasError = true;
        }
        finally {
            __disposeResources(env_1);
        }
    });
    it("does not route when gateway is disabled", async () => {
        const env_2 = { stack: [], error: void 0, hasError: false };
        try {
            const muxHome = __addDisposableResource(env_2, new DisposableTempDir("gateway-routing-disabled"), false);
            await writeMuxConfig(muxHome.path, {
                muxGatewayEnabled: false,
                muxGatewayModels: [KNOWN_MODELS.SONNET.id],
            });
            await writeProvidersConfig(muxHome.path, {
                "mux-gateway": { couponCode: "test-coupon" },
            });
            const service = createService(muxHome.path);
            // @ts-expect-error - accessing private field for testing
            const resolved = service.providerModelFactory.resolveGatewayModelString(KNOWN_MODELS.SONNET.id);
            expect(resolved).toBe(KNOWN_MODELS.SONNET.id);
        }
        catch (e_2) {
            env_2.error = e_2;
            env_2.hasError = true;
        }
        finally {
            __disposeResources(env_2);
        }
    });
    it("does not route when gateway is not configured", async () => {
        const env_3 = { stack: [], error: void 0, hasError: false };
        try {
            const muxHome = __addDisposableResource(env_3, new DisposableTempDir("gateway-routing-unconfigured"), false);
            await writeMuxConfig(muxHome.path, {
                muxGatewayEnabled: true,
                muxGatewayModels: [KNOWN_MODELS.SONNET.id],
            });
            const service = createService(muxHome.path);
            // @ts-expect-error - accessing private field for testing
            const resolved = service.providerModelFactory.resolveGatewayModelString(KNOWN_MODELS.SONNET.id);
            expect(resolved).toBe(KNOWN_MODELS.SONNET.id);
        }
        catch (e_3) {
            env_3.error = e_3;
            env_3.hasError = true;
        }
        finally {
            __disposeResources(env_3);
        }
    });
    it("does not route unsupported providers even when allowlisted", async () => {
        const env_4 = { stack: [], error: void 0, hasError: false };
        try {
            const muxHome = __addDisposableResource(env_4, new DisposableTempDir("gateway-routing-unsupported-provider"), false);
            const modelString = "openrouter:some-model";
            await writeMuxConfig(muxHome.path, {
                muxGatewayEnabled: true,
                muxGatewayModels: [modelString],
            });
            await writeProvidersConfig(muxHome.path, {
                "mux-gateway": { couponCode: "test-coupon" },
            });
            const service = createService(muxHome.path);
            // @ts-expect-error - accessing private field for testing
            const resolved = service.providerModelFactory.resolveGatewayModelString(modelString);
            expect(resolved).toBe(modelString);
        }
        catch (e_4) {
            env_4.error = e_4;
            env_4.hasError = true;
        }
        finally {
            __disposeResources(env_4);
        }
    });
    it("routes model variants when the base model is allowlisted via modelKey", async () => {
        const env_5 = { stack: [], error: void 0, hasError: false };
        try {
            const muxHome = __addDisposableResource(env_5, new DisposableTempDir("gateway-routing-model-key"), false);
            const variant = "xai:grok-4-1-fast-reasoning";
            await writeMuxConfig(muxHome.path, {
                muxGatewayEnabled: true,
                muxGatewayModels: [KNOWN_MODELS.GROK_4_1.id],
            });
            await writeProvidersConfig(muxHome.path, {
                "mux-gateway": { couponCode: "test-coupon" },
            });
            const service = createService(muxHome.path);
            // @ts-expect-error - accessing private field for testing
            const resolved = service.providerModelFactory.resolveGatewayModelString(variant, KNOWN_MODELS.GROK_4_1.id);
            expect(resolved).toBe(toGatewayModelString(variant));
        }
        catch (e_5) {
            env_5.error = e_5;
            env_5.hasError = true;
        }
        finally {
            __disposeResources(env_5);
        }
    });
    it("honors explicit mux-gateway prefixes from legacy clients", async () => {
        const env_6 = { stack: [], error: void 0, hasError: false };
        try {
            const muxHome = __addDisposableResource(env_6, new DisposableTempDir("gateway-routing-explicit"), false);
            await writeMuxConfig(muxHome.path, {
                muxGatewayEnabled: true,
                muxGatewayModels: [],
            });
            await writeProvidersConfig(muxHome.path, {
                "mux-gateway": { couponCode: "test-coupon" },
            });
            const service = createService(muxHome.path);
            // @ts-expect-error - accessing private field for testing
            const resolved = service.providerModelFactory.resolveGatewayModelString(KNOWN_MODELS.GPT.id, undefined, true);
            expect(resolved).toBe(toGatewayModelString(KNOWN_MODELS.GPT.id));
        }
        catch (e_6) {
            env_6.error = e_6;
            env_6.hasError = true;
        }
        finally {
            __disposeResources(env_6);
        }
    });
});
describe("AIService.createModel (Codex OAuth routing)", () => {
    async function writeProvidersConfig(root, config) {
        await fs.writeFile(path.join(root, "providers.jsonc"), JSON.stringify(config, null, 2), "utf-8");
    }
    function createService(root) {
        const config = new Config(root);
        const historyService = new HistoryService(config);
        const initStateManager = new InitStateManager(config);
        const providerService = new ProviderService(config);
        return new AIService(config, historyService, initStateManager, providerService);
    }
    function getFetchUrl(input) {
        if (typeof input === "string") {
            return input;
        }
        if (input instanceof URL) {
            return input.toString();
        }
        if (typeof input === "object" && input !== null && "url" in input) {
            const possibleUrl = input.url;
            if (typeof possibleUrl === "string") {
                return possibleUrl;
            }
        }
        return "";
    }
    it("returns oauth_not_connected for required Codex models when both OAuth and API key are missing", async () => {
        const env_7 = { stack: [], error: void 0, hasError: false };
        try {
            const muxHome = __addDisposableResource(env_7, new DisposableTempDir("codex-oauth-missing"), false);
            await writeProvidersConfig(muxHome.path, {
                openai: {},
            });
            // Temporarily clear OPENAI_API_KEY so resolveProviderCredentials doesn't find it
            const savedKey = process.env.OPENAI_API_KEY;
            delete process.env.OPENAI_API_KEY;
            try {
                const service = createService(muxHome.path);
                const result = await service.createModel(KNOWN_MODELS.GPT_53_CODEX.id);
                expect(result.success).toBe(false);
                if (!result.success) {
                    expect(result.error).toEqual({ type: "oauth_not_connected", provider: "openai" });
                }
            }
            finally {
                if (savedKey !== undefined) {
                    process.env.OPENAI_API_KEY = savedKey;
                }
            }
        }
        catch (e_7) {
            env_7.error = e_7;
            env_7.hasError = true;
        }
        finally {
            __disposeResources(env_7);
        }
    });
    it("falls back to API key for required Codex models when OAuth is missing but API key is present", async () => {
        const env_8 = { stack: [], error: void 0, hasError: false };
        try {
            const muxHome = __addDisposableResource(env_8, new DisposableTempDir("codex-oauth-missing-apikey-present"), false);
            await writeProvidersConfig(muxHome.path, {
                openai: { apiKey: "sk-test-key" },
            });
            const service = createService(muxHome.path);
            const result = await service.createModel(KNOWN_MODELS.GPT_53_CODEX.id);
            // Should succeed — falls back to API key instead of erroring with oauth_not_connected
            expect(result.success).toBe(true);
        }
        catch (e_8) {
            env_8.error = e_8;
            env_8.hasError = true;
        }
        finally {
            __disposeResources(env_8);
        }
    });
    it("does not require an OpenAI API key when Codex OAuth is configured", async () => {
        const env_9 = { stack: [], error: void 0, hasError: false };
        try {
            const muxHome = __addDisposableResource(env_9, new DisposableTempDir("codex-oauth-present"), false);
            await writeProvidersConfig(muxHome.path, {
                openai: {
                    codexOauth: {
                        type: "oauth",
                        access: "test-access-token",
                        refresh: "test-refresh-token",
                        expires: Date.now() + 60000,
                        accountId: "test-account-id",
                    },
                },
            });
            const service = createService(muxHome.path);
            const result = await service.createModel(KNOWN_MODELS.GPT_53_CODEX.id);
            expect(result.success).toBe(true);
        }
        catch (e_9) {
            env_9.error = e_9;
            env_9.hasError = true;
        }
        finally {
            __disposeResources(env_9);
        }
    });
    it("defaults OAuth-allowed models to ChatGPT OAuth when both auth methods are configured", async () => {
        const env_10 = { stack: [], error: void 0, hasError: false };
        try {
            const muxHome = __addDisposableResource(env_10, new DisposableTempDir("codex-oauth-default-auth-oauth"), false);
            const config = new Config(muxHome.path);
            const historyService = new HistoryService(config);
            const initStateManager = new InitStateManager(config);
            const providerService = new ProviderService(config);
            const service = new AIService(config, historyService, initStateManager, providerService);
            const requests = [];
            const baseFetch = (input, init) => {
                requests.push({ input, init });
                // Minimal valid OpenAI Responses payload for the provider's response schema.
                const responseBody = {
                    id: "resp_test",
                    created_at: 0,
                    model: "gpt-5.2",
                    output: [
                        {
                            type: "message",
                            role: "assistant",
                            id: "msg_test",
                            content: [{ type: "output_text", text: "ok", annotations: [] }],
                        },
                    ],
                    usage: {
                        input_tokens: 1,
                        output_tokens: 1,
                    },
                };
                return Promise.resolve(new Response(JSON.stringify(responseBody), {
                    status: 200,
                    headers: {
                        "content-type": "application/json",
                    },
                }));
            };
            // Ensure createModel sees a function fetch (providers.jsonc can't store functions).
            config.loadProvidersConfig = () => ({
                openai: {
                    apiKey: "test-openai-api-key",
                    codexOauth: {
                        type: "oauth",
                        access: "test-access-token",
                        refresh: "test-refresh-token",
                        expires: Date.now() + 60000,
                        accountId: "test-account-id",
                    },
                    fetch: baseFetch,
                },
            });
            // fetchWithOpenAITruncation closes over codexOauthService during createModel.
            service.setCodexOauthService({
                getValidAuth: () => Promise.resolve({
                    success: true,
                    data: {
                        type: "oauth",
                        access: "test-access-token",
                        refresh: "test-refresh-token",
                        expires: Date.now() + 60000,
                        accountId: "test-account-id",
                    },
                }),
            });
            const modelResult = await service.createModel(KNOWN_MODELS.GPT.id);
            expect(modelResult.success).toBe(true);
            if (!modelResult.success)
                return;
            const model = modelResult.data;
            if (typeof model === "string") {
                throw new Error("Expected a LanguageModelV2 instance, got a model id string");
            }
            await model.doGenerate({
                prompt: [
                    {
                        role: "user",
                        content: [{ type: "text", text: "Hello" }],
                    },
                ],
            });
            expect(requests.length).toBeGreaterThan(0);
            const lastRequest = requests[requests.length - 1];
            expect(getFetchUrl(lastRequest.input)).toBe(CODEX_ENDPOINT);
        }
        catch (e_10) {
            env_10.error = e_10;
            env_10.hasError = true;
        }
        finally {
            __disposeResources(env_10);
        }
    });
    it("does not rewrite OAuth-allowed models when default auth is set to apiKey", async () => {
        const env_11 = { stack: [], error: void 0, hasError: false };
        try {
            const muxHome = __addDisposableResource(env_11, new DisposableTempDir("codex-oauth-default-auth-api-key"), false);
            const config = new Config(muxHome.path);
            const historyService = new HistoryService(config);
            const initStateManager = new InitStateManager(config);
            const providerService = new ProviderService(config);
            const service = new AIService(config, historyService, initStateManager, providerService);
            const requests = [];
            const baseFetch = (input, init) => {
                requests.push({ input, init });
                // Minimal valid OpenAI Responses payload for the provider's response schema.
                const responseBody = {
                    id: "resp_test",
                    created_at: 0,
                    model: "gpt-5.2",
                    output: [
                        {
                            type: "message",
                            role: "assistant",
                            id: "msg_test",
                            content: [{ type: "output_text", text: "ok", annotations: [] }],
                        },
                    ],
                    usage: {
                        input_tokens: 1,
                        output_tokens: 1,
                    },
                };
                return Promise.resolve(new Response(JSON.stringify(responseBody), {
                    status: 200,
                    headers: {
                        "content-type": "application/json",
                    },
                }));
            };
            // Ensure createModel sees a function fetch (providers.jsonc can't store functions).
            config.loadProvidersConfig = () => ({
                openai: {
                    apiKey: "test-openai-api-key",
                    codexOauth: {
                        type: "oauth",
                        access: "test-access-token",
                        refresh: "test-refresh-token",
                        expires: Date.now() + 60000,
                        accountId: "test-account-id",
                    },
                    codexOauthDefaultAuth: "apiKey",
                    fetch: baseFetch,
                },
            });
            const modelResult = await service.createModel(KNOWN_MODELS.GPT.id);
            expect(modelResult.success).toBe(true);
            if (!modelResult.success)
                return;
            const model = modelResult.data;
            if (typeof model === "string") {
                throw new Error("Expected a LanguageModelV2 instance, got a model id string");
            }
            await model.doGenerate({
                prompt: [
                    {
                        role: "user",
                        content: [{ type: "text", text: "Hello" }],
                    },
                ],
            });
            expect(requests.length).toBeGreaterThan(0);
            const lastRequest = requests[requests.length - 1];
            expect(getFetchUrl(lastRequest.input)).not.toBe(CODEX_ENDPOINT);
        }
        catch (e_11) {
            env_11.error = e_11;
            env_11.hasError = true;
        }
        finally {
            __disposeResources(env_11);
        }
    });
    it("ensures Codex OAuth routed Responses requests include non-empty instructions", async () => {
        const env_12 = { stack: [], error: void 0, hasError: false };
        try {
            const muxHome = __addDisposableResource(env_12, new DisposableTempDir("codex-oauth-instructions"), false);
            const config = new Config(muxHome.path);
            const historyService = new HistoryService(config);
            const initStateManager = new InitStateManager(config);
            const providerService = new ProviderService(config);
            const service = new AIService(config, historyService, initStateManager, providerService);
            const requests = [];
            const baseFetch = (input, init) => {
                requests.push({ input, init });
                // Minimal valid OpenAI Responses payload for the provider's response schema.
                const responseBody = {
                    id: "resp_test",
                    created_at: 0,
                    model: "gpt-5.2-codex",
                    output: [
                        {
                            type: "message",
                            role: "assistant",
                            id: "msg_test",
                            content: [{ type: "output_text", text: "ok", annotations: [] }],
                        },
                    ],
                    usage: {
                        input_tokens: 1,
                        output_tokens: 1,
                    },
                };
                return Promise.resolve(new Response(JSON.stringify(responseBody), {
                    status: 200,
                    headers: {
                        "content-type": "application/json",
                    },
                }));
            };
            // Ensure createModel sees a function fetch (providers.jsonc can't store functions).
            config.loadProvidersConfig = () => ({
                openai: {
                    apiKey: "test-openai-api-key",
                    codexOauth: {
                        type: "oauth",
                        access: "test-access-token",
                        refresh: "test-refresh-token",
                        expires: Date.now() + 60000,
                        accountId: "test-account-id",
                    },
                    fetch: baseFetch,
                },
            });
            // fetchWithOpenAITruncation closes over codexOauthService during createModel.
            service.setCodexOauthService({
                getValidAuth: () => Promise.resolve({
                    success: true,
                    data: {
                        type: "oauth",
                        access: "test-access-token",
                        refresh: "test-refresh-token",
                        expires: Date.now() + 60000,
                        accountId: "test-account-id",
                    },
                }),
            });
            const modelResult = await service.createModel(KNOWN_MODELS.GPT_52_CODEX.id);
            expect(modelResult.success).toBe(true);
            if (!modelResult.success)
                return;
            const model = modelResult.data;
            if (typeof model === "string") {
                throw new Error("Expected a LanguageModelV2 instance, got a model id string");
            }
            const systemPrompt = "Test system prompt";
            await model.doGenerate({
                prompt: [
                    {
                        role: "system",
                        content: systemPrompt,
                    },
                    {
                        role: "user",
                        content: [{ type: "text", text: "Hello" }],
                    },
                ],
            });
            expect(requests.length).toBeGreaterThan(0);
            const lastRequest = requests[requests.length - 1];
            // URL rewrite to chatgpt.com
            expect(lastRequest.input).toBe(CODEX_ENDPOINT);
            // Auth header injection
            const headers = new Headers(lastRequest.init?.headers);
            expect(headers.get("authorization")).toBe("Bearer test-access-token");
            expect(headers.get("chatgpt-account-id")).toBe("test-account-id");
            // Body mutation: non-empty instructions
            const bodyString = lastRequest.init?.body;
            expect(typeof bodyString).toBe("string");
            if (typeof bodyString !== "string") {
                throw new Error("Expected request body to be a string");
            }
            const parsedBody = JSON.parse(bodyString);
            if (!parsedBody || typeof parsedBody !== "object") {
                throw new Error("Expected request body to parse as an object");
            }
            const instructions = parsedBody.instructions;
            expect(typeof instructions).toBe("string");
            if (typeof instructions !== "string") {
                throw new Error("Expected instructions to be a string");
            }
            expect(instructions.trim().length).toBeGreaterThan(0);
            expect(instructions).toBe(systemPrompt);
            // Codex endpoint requires store=false
            const store = parsedBody.store;
            expect(store).toBe(false);
            // System message should be removed from input to avoid double-system
            const input = parsedBody.input;
            if (Array.isArray(input)) {
                for (const item of input) {
                    if (item && typeof item === "object" && "role" in item) {
                        expect(item.role).not.toBe("system");
                        expect(item.role).not.toBe("developer");
                    }
                }
            }
        }
        catch (e_12) {
            env_12.error = e_12;
            env_12.hasError = true;
        }
        finally {
            __disposeResources(env_12);
        }
    });
    it("filters out item_reference entries and preserves inline items when routing through Codex OAuth", async () => {
        const env_13 = { stack: [], error: void 0, hasError: false };
        try {
            const muxHome = __addDisposableResource(env_13, new DisposableTempDir("codex-oauth-filter-refs"), false);
            const config = new Config(muxHome.path);
            const historyService = new HistoryService(config);
            const initStateManager = new InitStateManager(config);
            const providerService = new ProviderService(config);
            const service = new AIService(config, historyService, initStateManager, providerService);
            const requests = [];
            const baseFetch = (input, init) => {
                requests.push({ input, init });
                const responseBody = {
                    id: "resp_test",
                    created_at: 0,
                    model: "gpt-5.2-codex",
                    output: [
                        {
                            type: "message",
                            role: "assistant",
                            id: "msg_test",
                            content: [{ type: "output_text", text: "ok", annotations: [] }],
                        },
                    ],
                    usage: { input_tokens: 1, output_tokens: 1 },
                };
                return Promise.resolve(new Response(JSON.stringify(responseBody), {
                    status: 200,
                    headers: { "content-type": "application/json" },
                }));
            };
            config.loadProvidersConfig = () => ({
                openai: {
                    apiKey: "test-openai-api-key",
                    codexOauth: {
                        type: "oauth",
                        access: "test-access-token",
                        refresh: "test-refresh-token",
                        expires: Date.now() + 60000,
                        accountId: "test-account-id",
                    },
                    fetch: baseFetch,
                },
            });
            service.setCodexOauthService({
                getValidAuth: () => Promise.resolve({
                    success: true,
                    data: {
                        type: "oauth",
                        access: "test-access-token",
                        refresh: "test-refresh-token",
                        expires: Date.now() + 60000,
                        accountId: "test-account-id",
                    },
                }),
            });
            const modelResult = await service.createModel(KNOWN_MODELS.GPT_52_CODEX.id);
            expect(modelResult.success).toBe(true);
            if (!modelResult.success)
                return;
            const model = modelResult.data;
            if (typeof model === "string") {
                throw new Error("Expected a LanguageModelV2 instance, got a model id string");
            }
            await model.doGenerate({
                prompt: [
                    { role: "system", content: "You are a helpful assistant" },
                    { role: "user", content: [{ type: "text", text: "Hello" }] },
                ],
            });
            expect(requests.length).toBeGreaterThan(0);
            const lastRequest = requests[requests.length - 1];
            const bodyString = lastRequest.init?.body;
            expect(typeof bodyString).toBe("string");
            if (typeof bodyString !== "string") {
                throw new Error("Expected request body to be a string");
            }
            const parsedBody = JSON.parse(bodyString);
            // Verify Codex transform ran (store=false is set)
            expect(parsedBody.store).toBe(false);
            // Verify no item_reference entries exist in output
            const input = parsedBody.input;
            expect(Array.isArray(input)).toBe(true);
            if (Array.isArray(input)) {
                for (const item of input) {
                    if (item && typeof item === "object" && item !== null) {
                        expect(item.type).not.toBe("item_reference");
                    }
                }
            }
        }
        catch (e_13) {
            env_13.error = e_13;
            env_13.hasError = true;
        }
        finally {
            __disposeResources(env_13);
        }
    });
    it("item_reference filter removes references and preserves inline items", () => {
        // Direct unit test of the item_reference filtering logic used in the
        // Codex body transformation, independent of the full AIService pipeline.
        const input = [
            { role: "user", content: [{ type: "input_text", text: "hello" }] },
            { type: "item_reference", id: "rs_abc123" },
            {
                type: "message",
                role: "assistant",
                id: "msg_001",
                content: [{ type: "output_text", text: "hi" }],
            },
            {
                type: "function_call",
                id: "fc_xyz",
                call_id: "call_1",
                name: "test_fn",
                arguments: "{}",
            },
            { type: "item_reference", id: "rs_def456" },
            { type: "function_call_output", call_id: "call_1", output: "result" },
        ];
        // Same filter logic as in aiService.ts Codex body transformation
        const filtered = input.filter((item) => !(item && typeof item === "object" && item.type === "item_reference"));
        // Both item_reference entries removed
        expect(filtered).toHaveLength(4);
        expect(filtered.some((i) => i.type === "item_reference")).toBe(false);
        // Inline items preserved with their IDs intact
        expect(filtered.find((i) => i.role === "assistant")?.id).toBe("msg_001");
        expect(filtered.find((i) => i.type === "function_call")?.id).toBe("fc_xyz");
        expect(filtered.find((i) => i.type === "function_call_output")?.call_id).toBe("call_1");
        expect(filtered.find((i) => i.role === "user")).toBeDefined();
    });
});
describe("AIService.streamMessage compaction boundary slicing", () => {
    function createWorkspaceMetadata(workspaceId, projectPath) {
        return {
            id: workspaceId,
            name: "workspace-under-test",
            projectName: "project-under-test",
            projectPath,
            runtimeConfig: { type: "local" },
        };
    }
    function messageIdsFromUnknownArray(messages) {
        if (!Array.isArray(messages)) {
            throw new Error("Expected message array");
        }
        return messages.map((message) => {
            if (!message || typeof message !== "object") {
                throw new Error("Expected message object in array");
            }
            const id = message.id;
            if (typeof id !== "string") {
                throw new Error("Expected message.id to be a string");
            }
            return id;
        });
    }
    function openAIOptionsFromStartStreamCall(startStreamArgs) {
        const providerOptions = startStreamArgs[11];
        if (!providerOptions || typeof providerOptions !== "object") {
            throw new Error("Expected provider options object at startStream arg index 11");
        }
        const openai = providerOptions.openai;
        if (!openai || typeof openai !== "object") {
            throw new Error("Expected OpenAI provider options in startStream providerOptions");
        }
        return openai;
    }
    function createHarness(muxHomePath, metadata) {
        const config = new Config(muxHomePath);
        const historyService = new HistoryService(config);
        const initStateManager = new InitStateManager(config);
        const providerService = new ProviderService(config);
        const service = new AIService(config, historyService, initStateManager, providerService);
        const planPayloadMessageIds = [];
        const preparedPayloadMessageIds = [];
        const startStreamCalls = [];
        const resolvedAgentResult = {
            success: true,
            data: {
                effectiveAgentId: "exec",
                agentDefinition: {
                    id: "exec",
                    scope: "built-in",
                    frontmatter: { name: "Exec" },
                    body: "Exec agent body",
                },
                agentDiscoveryPath: metadata.projectPath,
                isSubagentWorkspace: false,
                agentIsPlanLike: false,
                effectiveMode: "exec",
                taskSettings: DEFAULT_TASK_SETTINGS,
                taskDepth: 0,
                shouldDisableTaskToolsForDepth: false,
                effectiveToolPolicy: undefined,
                toolNamesForSentinel: [],
            },
        };
        spyOn(agentResolution, "resolveAgentForStream").mockImplementation(() => Promise.resolve(resolvedAgentResult));
        spyOn(streamContextBuilder, "buildPlanInstructions").mockImplementation((args) => {
            planPayloadMessageIds.push(args.requestPayloadMessages.map((message) => message.id));
            const planInstructionsResult = {
                effectiveAdditionalInstructions: undefined,
                planFilePath: path.join(metadata.projectPath, "plan.md"),
                planContentForTransition: undefined,
            };
            return Promise.resolve(planInstructionsResult);
        });
        spyOn(streamContextBuilder, "buildStreamSystemContext").mockResolvedValue({
            agentSystemPrompt: "test-agent-prompt",
            systemMessage: "test-system-message",
            systemMessageTokens: 1,
            agentDefinitions: undefined,
            availableSkills: undefined,
        });
        spyOn(messagePipeline, "prepareMessagesForProvider").mockImplementation((args) => {
            preparedPayloadMessageIds.push(args.messagesWithSentinel.map((message) => message.id));
            const preparedMessages = args.messagesWithSentinel;
            return Promise.resolve(preparedMessages);
        });
        spyOn(toolsModule, "getToolsForModel").mockResolvedValue({});
        spyOn(systemMessageModule, "readToolInstructions").mockResolvedValue({});
        const fakeModel = Object.create(null);
        const providerModelFactory = Reflect.get(service, "providerModelFactory");
        if (!providerModelFactory) {
            throw new Error("Expected AIService.providerModelFactory in streamMessage test harness");
        }
        const resolveAndCreateModelResult = {
            success: true,
            data: {
                model: fakeModel,
                effectiveModelString: "openai:gpt-5.2",
                canonicalModelString: "openai:gpt-5.2",
                canonicalProviderName: "openai",
                canonicalModelId: "gpt-5.2",
                routedThroughGateway: false,
            },
        };
        spyOn(providerModelFactory, "resolveAndCreateModel").mockResolvedValue(resolveAndCreateModelResult);
        spyOn(service, "getWorkspaceMetadata").mockResolvedValue({
            success: true,
            data: metadata,
        });
        spyOn(initStateManager, "waitForInit").mockResolvedValue(undefined);
        spyOn(config, "findWorkspace").mockReturnValue({
            workspacePath: metadata.projectPath,
            projectPath: metadata.projectPath,
        });
        spyOn(historyService, "commitPartial").mockResolvedValue({
            success: true,
            data: undefined,
        });
        spyOn(historyService, "appendToHistory").mockImplementation((_workspaceId, message) => {
            message.metadata = {
                ...(message.metadata ?? {}),
                historySequence: 7,
            };
            return Promise.resolve({ success: true, data: undefined });
        });
        const streamManager = service.streamManager;
        const streamToken = "stream-token";
        spyOn(streamManager, "generateStreamToken").mockReturnValue(streamToken);
        spyOn(streamManager, "createTempDirForStream").mockResolvedValue(path.join(metadata.projectPath, ".tmp-stream"));
        spyOn(streamManager, "isResponseIdLost").mockReturnValue(false);
        spyOn(streamManager, "startStream").mockImplementation((...args) => {
            startStreamCalls.push(args);
            const startStreamResult = {
                success: true,
                data: streamToken,
            };
            return Promise.resolve(startStreamResult);
        });
        return {
            service,
            planPayloadMessageIds,
            preparedPayloadMessageIds,
            startStreamCalls,
        };
    }
    afterEach(() => {
        mock.restore();
    });
    it("uses the latest durable boundary slice for provider payload and OpenAI derivations", async () => {
        const env_14 = { stack: [], error: void 0, hasError: false };
        try {
            const muxHome = __addDisposableResource(env_14, new DisposableTempDir("ai-service-slice-latest-boundary"), false);
            const projectPath = path.join(muxHome.path, "project");
            await fs.mkdir(projectPath, { recursive: true });
            const workspaceId = "workspace-slice-latest";
            const metadata = createWorkspaceMetadata(workspaceId, projectPath);
            const harness = createHarness(muxHome.path, metadata);
            const messages = [
                createMuxMessage("boundary-1", "assistant", "compaction epoch 1", {
                    compacted: "user",
                    compactionBoundary: true,
                    compactionEpoch: 1,
                    model: "openai:gpt-5.2",
                }),
                createMuxMessage("assistant-old-response", "assistant", "older response", {
                    model: "openai:gpt-5.2",
                    providerMetadata: { openai: { responseId: "resp_epoch_1" } },
                }),
                createMuxMessage("start-here-summary", "assistant", "# Start Here\n\n- Existing plan context\n\n*Plan file preserved at:* /tmp/plan.md", {
                    compacted: "user",
                    agentId: "plan",
                }),
                createMuxMessage("mid-user", "user", "mid conversation"),
                createMuxMessage("boundary-2", "assistant", "compaction epoch 2", {
                    compacted: "user",
                    compactionBoundary: true,
                    compactionEpoch: 2,
                    model: "openai:gpt-5.2",
                }),
                createMuxMessage("latest-user", "user", "continue"),
            ];
            const result = await harness.service.streamMessage({
                messages,
                workspaceId,
                modelString: "openai:gpt-5.2",
                thinkingLevel: "medium",
            });
            expect(result.success).toBe(true);
            expect(harness.planPayloadMessageIds).toEqual([["boundary-2", "latest-user"]]);
            expect(harness.preparedPayloadMessageIds).toEqual([["boundary-2", "latest-user"]]);
            expect(harness.startStreamCalls).toHaveLength(1);
            const startStreamCall = harness.startStreamCalls[0];
            expect(startStreamCall).toBeDefined();
            if (!startStreamCall) {
                throw new Error("Expected streamManager.startStream call arguments");
            }
            const startStreamMessageIds = messageIdsFromUnknownArray(startStreamCall[1]);
            expect(startStreamMessageIds).toEqual(["boundary-2", "latest-user"]);
            const openaiOptions = openAIOptionsFromStartStreamCall(startStreamCall);
            expect(openaiOptions.previousResponseId).toBeUndefined();
            expect(openaiOptions.promptCacheKey).toBe(`mux-v1-${workspaceId}`);
        }
        catch (e_14) {
            env_14.error = e_14;
            env_14.hasError = true;
        }
        finally {
            __disposeResources(env_14);
        }
    });
    it("falls back safely when boundary metadata is malformed", async () => {
        const env_15 = { stack: [], error: void 0, hasError: false };
        try {
            const muxHome = __addDisposableResource(env_15, new DisposableTempDir("ai-service-slice-malformed-boundary"), false);
            const projectPath = path.join(muxHome.path, "project");
            await fs.mkdir(projectPath, { recursive: true });
            const workspaceId = "workspace-slice-malformed";
            const metadata = createWorkspaceMetadata(workspaceId, projectPath);
            const harness = createHarness(muxHome.path, metadata);
            const messages = [
                createMuxMessage("assistant-before-malformed", "assistant", "response before malformed", {
                    model: "openai:gpt-5.2",
                    providerMetadata: { openai: { responseId: "resp_before_malformed" } },
                }),
                createMuxMessage("malformed-boundary", "assistant", "not a durable boundary", {
                    compacted: "user",
                    compactionBoundary: true,
                    // Invalid durable marker: must not truncate request payload.
                    compactionEpoch: 0,
                    model: "openai:gpt-5.2",
                }),
                createMuxMessage("latest-user", "user", "continue"),
            ];
            const result = await harness.service.streamMessage({
                messages,
                workspaceId,
                modelString: "openai:gpt-5.2",
                thinkingLevel: "medium",
            });
            expect(result.success).toBe(true);
            expect(harness.planPayloadMessageIds).toEqual([
                ["assistant-before-malformed", "malformed-boundary", "latest-user"],
            ]);
            expect(harness.preparedPayloadMessageIds).toEqual([
                ["assistant-before-malformed", "malformed-boundary", "latest-user"],
            ]);
            expect(harness.startStreamCalls).toHaveLength(1);
            const startStreamCall = harness.startStreamCalls[0];
            expect(startStreamCall).toBeDefined();
            if (!startStreamCall) {
                throw new Error("Expected streamManager.startStream call arguments");
            }
            const startStreamMessageIds = messageIdsFromUnknownArray(startStreamCall[1]);
            expect(startStreamMessageIds).toEqual([
                "assistant-before-malformed",
                "malformed-boundary",
                "latest-user",
            ]);
            const openaiOptions = openAIOptionsFromStartStreamCall(startStreamCall);
            expect(openaiOptions.previousResponseId).toBe("resp_before_malformed");
            expect(openaiOptions.promptCacheKey).toBe(`mux-v1-${workspaceId}`);
        }
        catch (e_15) {
            env_15.error = e_15;
            env_15.hasError = true;
        }
        finally {
            __disposeResources(env_15);
        }
    });
});
describe("normalizeAnthropicBaseURL", () => {
    it("appends /v1 to URLs without it", () => {
        expect(normalizeAnthropicBaseURL("https://api.anthropic.com")).toBe("https://api.anthropic.com/v1");
        expect(normalizeAnthropicBaseURL("https://custom-proxy.com")).toBe("https://custom-proxy.com/v1");
    });
    it("preserves URLs already ending with /v1", () => {
        expect(normalizeAnthropicBaseURL("https://api.anthropic.com/v1")).toBe("https://api.anthropic.com/v1");
        expect(normalizeAnthropicBaseURL("https://custom-proxy.com/v1")).toBe("https://custom-proxy.com/v1");
    });
    it("removes trailing slashes before appending /v1", () => {
        expect(normalizeAnthropicBaseURL("https://api.anthropic.com/")).toBe("https://api.anthropic.com/v1");
        expect(normalizeAnthropicBaseURL("https://api.anthropic.com///")).toBe("https://api.anthropic.com/v1");
    });
    it("removes trailing slash after /v1", () => {
        expect(normalizeAnthropicBaseURL("https://api.anthropic.com/v1/")).toBe("https://api.anthropic.com/v1");
    });
    it("handles URLs with ports", () => {
        expect(normalizeAnthropicBaseURL("http://localhost:8080")).toBe("http://localhost:8080/v1");
        expect(normalizeAnthropicBaseURL("http://localhost:8080/v1")).toBe("http://localhost:8080/v1");
    });
    it("handles URLs with paths that include v1 in the middle", () => {
        // This should still append /v1 because the path doesn't END with /v1
        expect(normalizeAnthropicBaseURL("https://proxy.com/api/v1-beta")).toBe("https://proxy.com/api/v1-beta/v1");
    });
});
describe("buildAnthropicHeaders", () => {
    it("returns undefined when use1MContext is false and no existing headers", () => {
        expect(buildAnthropicHeaders(undefined, false)).toBeUndefined();
    });
    it("returns existing headers unchanged when use1MContext is false", () => {
        const existing = { "x-custom": "value" };
        expect(buildAnthropicHeaders(existing, false)).toBe(existing);
    });
    it("returns existing headers unchanged when use1MContext is undefined", () => {
        const existing = { "x-custom": "value" };
        expect(buildAnthropicHeaders(existing, undefined)).toBe(existing);
    });
    it("adds 1M context header when use1MContext is true and no existing headers", () => {
        const result = buildAnthropicHeaders(undefined, true);
        expect(result).toEqual({ "anthropic-beta": ANTHROPIC_1M_CONTEXT_HEADER });
    });
    it("merges 1M context header with existing headers when use1MContext is true", () => {
        const existing = { "x-custom": "value" };
        const result = buildAnthropicHeaders(existing, true);
        expect(result).toEqual({
            "x-custom": "value",
            "anthropic-beta": ANTHROPIC_1M_CONTEXT_HEADER,
        });
    });
    it("overwrites existing anthropic-beta header when use1MContext is true", () => {
        const existing = { "anthropic-beta": "other-beta" };
        const result = buildAnthropicHeaders(existing, true);
        expect(result).toEqual({ "anthropic-beta": ANTHROPIC_1M_CONTEXT_HEADER });
    });
});
describe("buildAppAttributionHeaders", () => {
    it("adds both headers when no headers exist", () => {
        expect(buildAppAttributionHeaders(undefined)).toEqual({
            "HTTP-Referer": MUX_APP_ATTRIBUTION_URL,
            "X-Title": MUX_APP_ATTRIBUTION_TITLE,
        });
    });
    it("adds only the missing header when one is present", () => {
        const existing = { "HTTP-Referer": "https://example.com" };
        const result = buildAppAttributionHeaders(existing);
        expect(result).toEqual({
            "HTTP-Referer": "https://example.com",
            "X-Title": MUX_APP_ATTRIBUTION_TITLE,
        });
    });
    it("does not overwrite existing values (case-insensitive)", () => {
        const existing = { "http-referer": "https://example.com", "X-TITLE": "My App" };
        const result = buildAppAttributionHeaders(existing);
        expect(result).toEqual(existing);
    });
    it("preserves unrelated headers", () => {
        const existing = { "x-custom": "value" };
        const result = buildAppAttributionHeaders(existing);
        expect(result).toEqual({
            "x-custom": "value",
            "HTTP-Referer": MUX_APP_ATTRIBUTION_URL,
            "X-Title": MUX_APP_ATTRIBUTION_TITLE,
        });
    });
    it("does not mutate the input object", () => {
        const existing = { "x-custom": "value" };
        const existingSnapshot = { ...existing };
        buildAppAttributionHeaders(existing);
        expect(existing).toEqual(existingSnapshot);
    });
});
describe("discoverAvailableSubagentsForToolContext", () => {
    it("includes derived agents that inherit subagent.runnable from base", async () => {
        const env_16 = { stack: [], error: void 0, hasError: false };
        try {
            const project = __addDisposableResource(env_16, new DisposableTempDir("available-subagents"), false);
            const muxHome = __addDisposableResource(env_16, new DisposableTempDir("available-subagents-home"), false);
            const agentsRoot = path.join(project.path, ".mux", "agents");
            await fs.mkdir(agentsRoot, { recursive: true });
            // Derived agent: base exec but no explicit subagent.runnable.
            await fs.writeFile(path.join(agentsRoot, "custom.md"), `---\nname: Custom Exec Derivative\nbase: exec\n---\nBody\n`, "utf-8");
            const runtime = new LocalRuntime(project.path);
            const cfg = new Config(muxHome.path).loadConfigOrDefault();
            const availableSubagents = await discoverAvailableSubagentsForToolContext({
                runtime,
                workspacePath: project.path,
                cfg,
                roots: {
                    projectRoot: agentsRoot,
                    globalRoot: path.join(project.path, "empty-global-agents"),
                },
            });
            const custom = availableSubagents.find((agent) => agent.id === "custom");
            expect(custom).toBeDefined();
            expect(custom?.subagentRunnable).toBe(true);
            // Ensure the task tool description includes the derived agent in the runnable sub-agent list.
            const taskTool = createTaskTool({
                ...createTestToolConfig(project.path, { workspaceId: "test-workspace" }),
                availableSubagents,
            });
            const description = taskTool.description;
            expect(typeof description).toBe("string");
            if (typeof description === "string") {
                expect(description).toContain("Available sub-agents");
                expect(description).toContain("- custom");
            }
        }
        catch (e_16) {
            env_16.error = e_16;
            env_16.hasError = true;
        }
        finally {
            __disposeResources(env_16);
        }
    });
});
//# sourceMappingURL=aiService.test.js.map