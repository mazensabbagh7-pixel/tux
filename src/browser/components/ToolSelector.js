import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Checkbox } from "@/browser/components/ui/checkbox";
import { Button } from "@/browser/components/ui/button";
/**
 * Reusable tool selector grid with All/None buttons.
 * Used by both project-level and workspace-level MCP config UIs.
 */
export const ToolSelector = ({ availableTools, allowedTools, onToggle, onSelectAll, onSelectNone, disabled = false, }) => {
    const allAllowed = allowedTools.length === availableTools.length;
    const noneAllowed = allowedTools.length === 0;
    return (_jsxs("div", { children: [_jsxs("div", { className: "mb-2 flex items-center justify-between", children: [_jsx("span", { className: "text-muted-foreground text-xs", children: "Select tools to expose:" }), _jsxs("div", { className: "flex gap-1", children: [_jsx(Button, { variant: "ghost", size: "sm", className: "h-5 px-2 text-xs", onClick: onSelectAll, disabled: disabled || allAllowed, children: "All" }), _jsx(Button, { variant: "ghost", size: "sm", className: "h-5 px-2 text-xs", onClick: onSelectNone, disabled: disabled || noneAllowed, children: "None" })] })] }), _jsx("div", { className: "grid grid-cols-2 gap-1", children: availableTools.map((tool) => (_jsxs("label", { className: "flex cursor-pointer items-center gap-2 py-0.5 text-xs", children: [_jsx(Checkbox, { checked: allowedTools.includes(tool), onCheckedChange: (checked) => onToggle(tool, checked === true), disabled: disabled }), _jsx("span", { className: "truncate font-mono", title: tool, children: tool })] }, tool))) })] }));
};
//# sourceMappingURL=ToolSelector.js.map