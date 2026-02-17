import { useCallback, useEffect, useMemo } from "react";
import { useAPI } from "@/browser/contexts/API";
import { usePersistedState, readPersistedState, updatePersistedState } from "./usePersistedState";
import { useProvidersConfig } from "./useProvidersConfig";
import { GATEWAY_CONFIGURED_KEY, GATEWAY_ENABLED_KEY, GATEWAY_MODELS_KEY, } from "@/common/constants/storage";
import { MUX_GATEWAY_SUPPORTED_PROVIDERS, isValidProvider, } from "@/common/constants/providers";
// ============================================================================
// Pure utility functions (no side effects, used for message sending)
// ============================================================================
/**
 * Extract provider from a model ID.
 */
function getProvider(modelId) {
    const colonIndex = modelId.indexOf(":");
    if (colonIndex === -1) {
        return null;
    }
    const provider = modelId.slice(0, colonIndex);
    return isValidProvider(provider) ? provider : null;
}
/**
 * Check if a model's provider can route through Mux Gateway.
 */
export function isProviderSupported(modelId) {
    const provider = getProvider(modelId);
    return provider !== null && MUX_GATEWAY_SUPPORTED_PROVIDERS.has(provider);
}
/**
 * Check if a model string is in mux-gateway format.
 */
export function isGatewayFormat(modelId) {
    return modelId.startsWith("mux-gateway:");
}
/**
 * Convert a canonical model string to mux-gateway format.
 * Example: "anthropic:claude-haiku-4-5" → "mux-gateway:anthropic/claude-haiku-4-5"
 *
 * Unlike toGatewayModel(), this doesn't check if the user enabled gateway for
 * this specific model - use it when gateway should be used unconditionally
 * (e.g., for name generation with small models).
 */
export function formatAsGatewayModel(modelId) {
    const provider = getProvider(modelId);
    if (!provider)
        return modelId;
    const model = modelId.slice(provider.length + 1);
    return `mux-gateway:${provider}/${model}`;
}
/**
 * Migrate a mux-gateway model to canonical format and enable gateway toggle.
 * Converts "mux-gateway:provider/model" to "provider:model" and marks it for gateway routing.
 *
 * This provides forward compatibility for users who have directly specified
 * mux-gateway models in their config.
 */
export function migrateGatewayModel(modelId) {
    if (!isGatewayFormat(modelId)) {
        return modelId;
    }
    // mux-gateway:anthropic/claude-opus-4-5 → anthropic:claude-opus-4-5
    const inner = modelId.slice("mux-gateway:".length);
    const slashIndex = inner.indexOf("/");
    if (slashIndex === -1) {
        return modelId; // Malformed, return as-is
    }
    const provider = inner.slice(0, slashIndex);
    const model = inner.slice(slashIndex + 1);
    const canonicalId = `${provider}:${model}`;
    // Auto-enable gateway for this model (one-time migration)
    const gatewayModels = readPersistedState(GATEWAY_MODELS_KEY, []);
    if (!gatewayModels.includes(canonicalId)) {
        updatePersistedState(GATEWAY_MODELS_KEY, [...gatewayModels, canonicalId]);
    }
    return canonicalId;
}
/**
 * Transform a model ID to gateway format for API calls.
 * Returns original modelId if gateway routing shouldn't be used.
 *
 * Checks (all must pass):
 * 1. Gateway is globally enabled (user hasn't disabled it)
 * 2. Gateway is configured (coupon code set)
 * 3. Provider is supported by gateway
 * 4. User enabled gateway for this specific model
 *
 * Example: "anthropic:claude-opus-4-5" → "mux-gateway:anthropic/claude-opus-4-5"
 */
export function toGatewayModel(modelId) {
    const globallyEnabled = readPersistedState(GATEWAY_ENABLED_KEY, true);
    const configured = readPersistedState(GATEWAY_CONFIGURED_KEY, false);
    const enabledModels = readPersistedState(GATEWAY_MODELS_KEY, []);
    if (!globallyEnabled || !configured || !isProviderSupported(modelId)) {
        return modelId;
    }
    if (!enabledModels.includes(modelId)) {
        return modelId;
    }
    // Transform provider:model to mux-gateway:provider/model
    const provider = getProvider(modelId);
    if (!provider)
        return modelId;
    const model = modelId.slice(provider.length + 1);
    return `mux-gateway:${provider}/${model}`;
}
/**
 * Hook for gateway state management.
 *
 * Syncs gateway configuration from provider config to localStorage
 * so that toGatewayModel() can check it synchronously during message sending.
 */
export function useGateway() {
    const { api } = useAPI();
    const { config } = useProvidersConfig();
    const [enabledModels, setEnabledModels] = usePersistedState(GATEWAY_MODELS_KEY, [], {
        listener: true,
    });
    const [isConfigured, setIsConfigured] = usePersistedState(GATEWAY_CONFIGURED_KEY, false, { listener: true });
    const [isEnabled, setIsEnabled] = usePersistedState(GATEWAY_ENABLED_KEY, true, {
        listener: true,
    });
    // Sync gateway configuration from provider config
    useEffect(() => {
        if (!config)
            return;
        const configured = config["mux-gateway"]?.couponCodeSet ?? false;
        setIsConfigured(configured);
    }, [config, setIsConfigured]);
    const isActive = isConfigured && isEnabled;
    const persistGatewayPrefs = useCallback((nextEnabled, nextModels) => {
        if (!api?.config?.updateMuxGatewayPrefs) {
            return;
        }
        api.config
            .updateMuxGatewayPrefs({
            muxGatewayEnabled: nextEnabled,
            muxGatewayModels: nextModels,
        })
            .catch(() => {
            // Best-effort only.
        });
    }, [api]);
    const toggleEnabled = useCallback(() => {
        const nextEnabled = !isEnabled;
        // usePersistedState writes to localStorage synchronously.
        // Avoid double-writes here (which would toggle twice and become a no-op).
        setIsEnabled(nextEnabled);
        persistGatewayPrefs(nextEnabled, enabledModels);
    }, [enabledModels, isEnabled, persistGatewayPrefs, setIsEnabled]);
    const modelUsesGateway = useCallback((modelId) => enabledModels.includes(modelId), [enabledModels]);
    const toggleModelGateway = useCallback((modelId) => {
        const nextModels = enabledModels.includes(modelId)
            ? enabledModels.filter((m) => m !== modelId)
            : [...enabledModels, modelId];
        // usePersistedState writes to localStorage synchronously.
        // Avoid double-writes here (which would toggle twice and become a no-op).
        setEnabledModels(nextModels);
        persistGatewayPrefs(isEnabled, nextModels);
    }, [enabledModels, isEnabled, persistGatewayPrefs, setEnabledModels]);
    const canToggleModel = useCallback((modelId) => isActive && isProviderSupported(modelId), [isActive]);
    const isModelRoutingThroughGateway = useCallback((modelId) => isActive && isProviderSupported(modelId) && enabledModels.includes(modelId), [isActive, enabledModels]);
    return useMemo(() => ({
        isActive,
        isConfigured,
        isEnabled,
        toggleEnabled,
        modelUsesGateway,
        toggleModelGateway,
        canToggleModel,
        isModelRoutingThroughGateway,
    }), [
        isActive,
        isConfigured,
        isEnabled,
        toggleEnabled,
        modelUsesGateway,
        toggleModelGateway,
        canToggleModel,
        isModelRoutingThroughGateway,
    ]);
}
//# sourceMappingURL=useGatewayModels.js.map