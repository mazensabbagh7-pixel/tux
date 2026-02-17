import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Settings, X } from "lucide-react";
import { useSettings } from "@/browser/contexts/SettingsContext";
import { Button } from "@/browser/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/browser/components/ui/tooltip";
import { formatKeybind, KEYBINDS } from "@/browser/utils/ui/keybinds";
export function SettingsButton(props) {
    const { isOpen, open, close } = useSettings();
    return (_jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx(Button, { variant: "ghost", size: "icon", onClick: () => {
                        // Keep the titlebar control as a true toggle: when settings are already open,
                        // this should behave like a close action and restore the previous route.
                        if (isOpen) {
                            close();
                            return;
                        }
                        props.onBeforeOpenSettings?.();
                        open();
                    }, className: "border-border-light text-muted-foreground hover:border-border-medium/80 hover:bg-toggle-bg/70 h-5 w-5 border", "aria-label": isOpen ? "Close settings" : "Open settings", "data-testid": "settings-button", children: isOpen ? (_jsx(X, { className: "h-3.5 w-3.5", "aria-hidden": true })) : (_jsx(Settings, { className: "h-3.5 w-3.5", "aria-hidden": true })) }) }), _jsx(TooltipContent, { children: isOpen ? "Close settings" : `Open settings (${formatKeybind(KEYBINDS.OPEN_SETTINGS)})` })] }));
}
//# sourceMappingURL=SettingsButton.js.map