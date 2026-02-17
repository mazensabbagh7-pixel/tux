import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Check, Settings } from "lucide-react";
import { PROVIDER_DISPLAY_NAMES } from "@/common/constants/providers";
import { usePolicy } from "@/browser/contexts/PolicyContext";
import { getAllowedProvidersForUi } from "@/browser/utils/policyUi";
import { hasProviderIcon, ProviderIcon } from "./ProviderIcon";
import { useSettings } from "@/browser/contexts/SettingsContext";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
/**
 * Compact horizontal bar showing configured provider icons with a link to add more.
 * Displayed above ChatInput on the Project page.
 */
export function ConfiguredProvidersBar(props) {
    const policyState = usePolicy();
    const effectivePolicy = policyState.status.state === "enforced" ? (policyState.policy ?? null) : null;
    const visibleProviders = getAllowedProvidersForUi(effectivePolicy);
    const settings = useSettings();
    const configuredProviders = visibleProviders.filter((p) => props.providersConfig[p]?.isConfigured);
    const handleOpenProviders = () => {
        settings.open("providers");
    };
    const tooltipText = configuredProviders.map((p) => PROVIDER_DISPLAY_NAMES[p]).join(", ");
    return (_jsxs("div", { className: "text-muted-foreground flex items-center justify-center gap-2 py-1.5 text-sm", children: [_jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsxs("span", { className: "border-border/50 hover:border-border inline-flex items-center gap-1.5 rounded border px-2 py-1 text-sm transition-colors", children: [_jsx(Check, { className: "text-success h-3.5 w-3.5" }), _jsx("span", { className: "flex items-center gap-1", children: configuredProviders.map((provider) => hasProviderIcon(provider) ? (_jsx(ProviderIcon, { provider: provider }, provider)) : (_jsx("span", { className: "text-muted-foreground text-xs font-medium", children: PROVIDER_DISPLAY_NAMES[provider] }, provider))) })] }) }), _jsx(TooltipContent, { side: "top", children: tooltipText })] }), _jsxs("button", { type: "button", onClick: handleOpenProviders, className: "text-muted-foreground/70 hover:text-foreground inline-flex items-center gap-1 text-xs transition-colors", children: [_jsx(Settings, { className: "h-3 w-3" }), _jsx("span", { children: "Providers" })] })] }));
}
//# sourceMappingURL=ConfiguredProvidersBar.js.map