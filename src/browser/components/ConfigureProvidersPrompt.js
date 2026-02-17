import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Settings, Zap } from "lucide-react";
import { useSettings } from "@/browser/contexts/SettingsContext";
import { Button } from "./ui/button";
/**
 * Large prompt displayed when no providers are configured.
 * Directs users to configure API providers before they can start using the app.
 */
export function ConfigureProvidersPrompt() {
    const settings = useSettings();
    const handleOpenProviders = () => {
        settings.open("providers");
    };
    return (_jsxs("div", { className: "border-border bg-card/50 flex flex-col items-center justify-center gap-4 rounded-lg border p-8 text-center", "data-testid": "configure-providers-prompt", children: [_jsx("div", { className: "bg-primary/10 flex h-12 w-12 items-center justify-center rounded-full", children: _jsx(Zap, { className: "text-primary h-6 w-6" }) }), _jsxs("div", { className: "space-y-2", children: [_jsx("h2", { className: "text-foreground text-lg font-semibold", children: "Configure an LLM Provider" }), _jsx("p", { className: "text-muted-foreground max-w-sm text-sm", children: "To start a workspace, you'll need to configure at least one LLM provider with API credentials." })] }), _jsxs(Button, { onClick: handleOpenProviders, className: "gap-2", children: [_jsx(Settings, { className: "h-4 w-4" }), "Open Provider Settings"] })] }));
}
//# sourceMappingURL=ConfigureProvidersPrompt.js.map