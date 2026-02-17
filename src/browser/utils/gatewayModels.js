import { KNOWN_MODELS } from "@/common/constants/knownModels";
import { isProviderSupported } from "@/browser/hooks/useGatewayModels";
const BUILT_IN_MODELS = Object.values(KNOWN_MODELS).map((model) => model.id);
export function getEligibleGatewayModels(config) {
    const customModels = [];
    if (config) {
        for (const [provider, providerConfig] of Object.entries(config)) {
            if (provider === "mux-gateway")
                continue;
            for (const modelId of providerConfig.models ?? []) {
                customModels.push(`${provider}:${modelId}`);
            }
        }
    }
    const unique = new Set();
    for (const modelId of [...customModels, ...BUILT_IN_MODELS]) {
        if (!isProviderSupported(modelId))
            continue;
        unique.add(modelId);
    }
    return Array.from(unique).sort((a, b) => a.localeCompare(b));
}
//# sourceMappingURL=gatewayModels.js.map