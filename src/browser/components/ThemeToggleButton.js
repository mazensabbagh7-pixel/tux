import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { MoonStar, SunMedium } from "lucide-react";
import { useTheme } from "@/browser/contexts/ThemeContext";
import { Tooltip, TooltipTrigger, TooltipContent } from "./ui/tooltip";
export function ThemeToggleButton() {
    const { theme, toggleTheme } = useTheme();
    const isLightTheme = theme === "light" || theme.endsWith("-light");
    const label = isLightTheme ? "Switch to dark theme" : "Switch to light theme";
    const Icon = isLightTheme ? MoonStar : SunMedium;
    return (_jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("button", { type: "button", onClick: toggleTheme, className: "border-border-light text-muted-foreground hover:border-border-medium/80 hover:bg-toggle-bg/70 focus-visible:ring-border-medium flex h-5 w-5 items-center justify-center rounded-md border bg-transparent transition-colors duration-150 focus-visible:ring-1", "aria-label": label, "data-testid": "theme-toggle", children: _jsx(Icon, { className: "h-3.5 w-3.5", "aria-hidden": true }) }) }), _jsx(TooltipContent, { align: "end", children: label })] }));
}
//# sourceMappingURL=ThemeToggleButton.js.map