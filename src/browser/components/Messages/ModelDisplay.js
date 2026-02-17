import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/browser/components/ui/tooltip";
import { ProviderIcon } from "@/browser/components/ProviderIcon";
import { formatModelDisplayName } from "@/common/utils/ai/modelDisplay";
/**
 * Parse a model string into provider and model name.
 * Handles mux-gateway format: "mux-gateway:inner-provider/model-name"
 * Returns: { provider, modelName, isMuxGateway, innerProvider }
 */
function parseModelString(modelString, routedThroughGateway) {
    const [provider, rest] = modelString.includes(":")
        ? modelString.split(":", 2)
        : ["", modelString];
    // Handle mux-gateway format: mux-gateway:anthropic/claude-sonnet-4-5
    if (provider === "mux-gateway" && rest.includes("/")) {
        const [innerProvider, modelName] = rest.split("/", 2);
        return { provider, modelName, isMuxGateway: true, innerProvider };
    }
    if (routedThroughGateway && provider && rest) {
        return { provider, modelName: rest, isMuxGateway: true, innerProvider: provider };
    }
    return { provider, modelName: rest, isMuxGateway: false, innerProvider: "" };
}
/**
 * Display a model name with its provider icon.
 * Supports format "provider:model-name" (e.g., "anthropic:claude-sonnet-4-5")
 * Also supports mux-gateway: "mux-gateway:anthropic/claude-sonnet-4-5"
 *   -> Shows mux icon + inner provider icon + model name + "(mux gateway)"
 *
 * Uses standard inline layout for natural text alignment.
 * Icon is 1em (matches font size) with vertical-align: middle.
 */
export const ModelDisplay = ({ modelString, showTooltip = true, routedThroughGateway, }) => {
    const { provider, modelName, isMuxGateway, innerProvider } = parseModelString(modelString, routedThroughGateway);
    // For mux-gateway, show the inner provider's icon (the model's actual provider)
    const iconProvider = isMuxGateway ? innerProvider : provider;
    const displayName = formatModelDisplayName(modelName);
    const suffix = isMuxGateway ? " (mux gateway)" : "";
    const tooltipModelString = isMuxGateway && provider !== "mux-gateway" && provider.length > 0
        ? `mux-gateway:${provider}/${modelName}`
        : modelString;
    const iconClass = "mr-[0.3em] inline-block h-[1.1em] w-[1.1em] align-[-0.19em] [&_svg]:block [&_svg]:h-full [&_svg]:w-full [&_svg_.st0]:fill-current [&_svg_circle]:!fill-current [&_svg_path]:!fill-current [&_svg_rect]:!fill-current";
    const content = (_jsxs("span", { className: "inline normal-case", "data-model-display": true, children: [_jsx(ProviderIcon, { provider: iconProvider, className: iconClass, "data-model-icon": true }), _jsxs("span", { className: "inline", children: [displayName, suffix] })] }));
    if (!showTooltip) {
        return content;
    }
    return (_jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("span", { "data-model-display-tooltip": true, children: content }) }), _jsx(TooltipContent, { align: "center", "data-model-tooltip-text": true, children: tooltipModelString })] }));
};
//# sourceMappingURL=ModelDisplay.js.map