import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import AnthropicIcon from "@/browser/assets/icons/anthropic.svg?react";
import OpenAIIcon from "@/browser/assets/icons/openai.svg?react";
import GoogleIcon from "@/browser/assets/icons/google.svg?react";
import XAIIcon from "@/browser/assets/icons/xai.svg?react";
import OpenRouterIcon from "@/browser/assets/icons/openrouter.svg?react";
import OllamaIcon from "@/browser/assets/icons/ollama.svg?react";
import DeepSeekIcon from "@/browser/assets/icons/deepseek.svg?react";
import AWSIcon from "@/browser/assets/icons/aws.svg?react";
import GitHubIcon from "@/browser/assets/icons/github.svg?react";
import { GatewayIcon } from "@/browser/components/icons/GatewayIcon";
import { PROVIDER_DEFINITIONS, PROVIDER_DISPLAY_NAMES, } from "@/common/constants/providers";
import { cn } from "@/common/lib/utils";
/**
 * Provider icons mapped by provider name.
 * When adding a new provider, add its icon import above and entry here.
 */
const PROVIDER_ICONS = {
    anthropic: AnthropicIcon,
    openai: OpenAIIcon,
    google: GoogleIcon,
    xai: XAIIcon,
    deepseek: DeepSeekIcon,
    openrouter: OpenRouterIcon,
    bedrock: AWSIcon,
    ollama: OllamaIcon,
    "mux-gateway": GatewayIcon,
    "github-copilot": GitHubIcon,
};
/**
 * Check if a provider has an icon available.
 */
export function hasProviderIcon(provider) {
    return provider in PROVIDER_ICONS;
}
/**
 * Renders a provider's icon if one exists, otherwise returns null.
 * Icons are sized to 1em by default to match surrounding text.
 */
export function ProviderIcon(props) {
    const providerName = props.provider;
    const IconComponent = PROVIDER_ICONS[providerName];
    if (!IconComponent)
        return null;
    // Check if this provider uses stroke-based icon styling (from PROVIDER_DEFINITIONS)
    const def = PROVIDER_DEFINITIONS[providerName];
    const isStrokeBased = def?.strokeBasedIcon ?? false;
    return (_jsx("span", { className: cn("inline-block h-[1em] w-[1em] align-[-0.125em] [&_svg]:block [&_svg]:h-full [&_svg]:w-full", 
        // Stroke-based icons (like GatewayIcon) use stroke for color, others use fill
        isStrokeBased
            ? "[&_svg]:stroke-current [&_svg]:fill-none"
            : "[&_svg]:fill-current [&_svg_.st0]:fill-current", props.className), children: _jsx(IconComponent, {}) }));
}
/**
 * Renders a provider name with its icon (if available).
 * Falls back to just the name if no icon exists for the provider.
 */
export function ProviderWithIcon(props) {
    const name = props.displayName
        ? (PROVIDER_DISPLAY_NAMES[props.provider] ?? props.provider)
        : props.provider;
    return (_jsxs("span", { className: cn("inline-flex items-center gap-1 whitespace-nowrap", props.className), children: [_jsx(ProviderIcon, { provider: props.provider, className: props.iconClassName }), _jsx("span", { children: name })] }));
}
//# sourceMappingURL=ProviderIcon.js.map