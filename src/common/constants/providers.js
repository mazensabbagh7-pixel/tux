/**
 * Provider Definitions - Single source of truth for all provider metadata
 *
 * When adding a new provider:
 * 1. Add entry to PROVIDER_DEFINITIONS below
 * 2. Add SVG icon + import in src/browser/components/ProviderIcon.tsx
 * 3. If provider needs custom logic, add handler in aiService.ts
 *    (simple providers using standard pattern are handled automatically)
 *
 * Simple providers (requiresApiKey + standard factory pattern) need NO aiService.ts changes.
 */
// Order determines display order in UI (Settings, model selectors, etc.)
export const PROVIDER_DEFINITIONS = {
    "mux-gateway": {
        displayName: "Mux Gateway",
        import: () => import("ai"),
        factoryName: "createGateway",
        requiresApiKey: true, // Uses couponCode
        strokeBasedIcon: true,
    },
    anthropic: {
        displayName: "Anthropic",
        import: () => import("@ai-sdk/anthropic"),
        factoryName: "createAnthropic",
        requiresApiKey: true,
    },
    openai: {
        displayName: "OpenAI",
        import: () => import("@ai-sdk/openai"),
        factoryName: "createOpenAI",
        requiresApiKey: true,
    },
    google: {
        displayName: "Google",
        import: () => import("@ai-sdk/google"),
        factoryName: "createGoogleGenerativeAI",
        requiresApiKey: true,
    },
    xai: {
        displayName: "xAI",
        import: () => import("@ai-sdk/xai"),
        factoryName: "createXai",
        requiresApiKey: true,
    },
    deepseek: {
        displayName: "DeepSeek",
        import: () => import("@ai-sdk/deepseek"),
        factoryName: "createDeepSeek",
        requiresApiKey: true,
    },
    openrouter: {
        displayName: "OpenRouter",
        import: () => import("@openrouter/ai-sdk-provider"),
        factoryName: "createOpenRouter",
        requiresApiKey: true,
    },
    "github-copilot": {
        displayName: "GitHub Copilot",
        import: () => import("@ai-sdk/openai-compatible"),
        factoryName: "createOpenAICompatible",
        requiresApiKey: true,
    },
    bedrock: {
        displayName: "Bedrock",
        import: () => import("@ai-sdk/amazon-bedrock"),
        factoryName: "createAmazonBedrock",
        requiresApiKey: false, // Uses AWS credential chain
    },
    ollama: {
        displayName: "Ollama",
        import: () => import("ollama-ai-provider-v2"),
        factoryName: "createOllama",
        requiresApiKey: false, // Local service
    },
};
/**
 * Array of all supported provider names (for UI lists, iteration, etc.)
 */
export const SUPPORTED_PROVIDERS = Object.keys(PROVIDER_DEFINITIONS);
/**
 * Providers that Mux Gateway can route to.
 * Matches the supported providers in the gateway UI.
 */
export const MUX_GATEWAY_SUPPORTED_PROVIDERS = new Set([
    "anthropic",
    "openai",
    "google",
    "xai",
]);
/**
 * Display names for providers (proper casing for UI)
 * Derived from PROVIDER_DEFINITIONS - do not edit directly
 */
export const PROVIDER_DISPLAY_NAMES = Object.fromEntries(Object.entries(PROVIDER_DEFINITIONS).map(([key, def]) => [key, def.displayName]));
/**
 * Legacy registry for backward compatibility with aiService.ts
 * Maps provider names to their import functions
 */
export const PROVIDER_REGISTRY = Object.fromEntries(Object.entries(PROVIDER_DEFINITIONS).map(([key, def]) => [key, def.import]));
/**
 * Type guard to check if a string is a valid provider name
 */
export function isValidProvider(provider) {
    return provider in PROVIDER_REGISTRY;
}
//# sourceMappingURL=providers.js.map