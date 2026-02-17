import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useTheme, THEME_OPTIONS } from "@/browser/contexts/ThemeContext";
import { Tooltip, TooltipTrigger, TooltipContent } from "./ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, } from "@/browser/components/ui/select";
export function ThemeSelector() {
    const { theme, setTheme } = useTheme();
    const currentLabel = THEME_OPTIONS.find((t) => t.value === theme)?.label ?? theme;
    return (_jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsxs(Select, { value: theme, onValueChange: (value) => setTheme(value), children: [_jsx(SelectTrigger, { className: "border-border-light text-muted-foreground hover:border-border-medium/80 hover:bg-toggle-bg/70 h-5 w-auto cursor-pointer border bg-transparent px-1.5 text-[11px] transition-colors duration-150", "aria-label": "Select theme", "data-testid": "theme-selector", children: _jsx(SelectValue, {}) }), _jsx(SelectContent, { children: THEME_OPTIONS.map((option) => (_jsx(SelectItem, { value: option.value, children: option.label }, option.value))) })] }) }), _jsxs(TooltipContent, { align: "end", children: ["Theme: ", currentLabel] })] }));
}
//# sourceMappingURL=ThemeSelector.js.map