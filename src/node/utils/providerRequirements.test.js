import { describe, expect, it } from "bun:test";
import { hasAnyConfiguredProvider } from "./providerRequirements";
describe("hasAnyConfiguredProvider", () => {
    it("returns false for null or empty config", () => {
        expect(hasAnyConfiguredProvider(null)).toBe(false);
        expect(hasAnyConfiguredProvider({})).toBe(false);
    });
    it("returns true when a provider has an API key", () => {
        const providers = {
            anthropic: { apiKey: "sk-ant-test" },
        };
        expect(hasAnyConfiguredProvider(providers)).toBe(true);
    });
    it("returns true for OpenAI Codex OAuth-only configuration", () => {
        const providers = {
            openai: {
                codexOauth: {
                    type: "oauth",
                    access: "test-access-token",
                    refresh: "test-refresh-token",
                    expires: Date.now() + 60000,
                    accountId: "acct_123",
                },
            },
        };
        expect(hasAnyConfiguredProvider(providers)).toBe(true);
    });
    it("returns true for keyless providers with explicit config", () => {
        const providers = {
            ollama: {
                baseUrl: "http://localhost:11434/api",
            },
        };
        expect(hasAnyConfiguredProvider(providers)).toBe(true);
    });
});
//# sourceMappingURL=providerRequirements.test.js.map