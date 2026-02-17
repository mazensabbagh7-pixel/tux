import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Tooltip, TooltipTrigger, TooltipContent } from "./tooltip";
/**
 * Collapse/expand toggle button for sidebars.
 * Renders at the bottom of the sidebar with « » chevrons.
 */
export const SidebarCollapseButton = ({ collapsed, onToggle, side, shortcut, }) => {
    // Left sidebar: collapsed shows », expanded shows «
    // Right sidebar: collapsed shows «, expanded shows »
    const chevron = side === "left" ? (collapsed ? "»" : "«") : collapsed ? "«" : "»";
    const label = collapsed ? "Expand sidebar" : "Collapse sidebar";
    return (_jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("button", { onClick: onToggle, "aria-label": label, className: collapsed
                        ? "text-muted hover:bg-hover hover:text-foreground flex w-full flex-1 cursor-pointer items-center justify-center bg-transparent p-0 text-xs transition-all duration-200"
                        : "text-muted border-dark hover:bg-hover hover:text-foreground mt-auto flex h-6 w-full cursor-pointer items-center justify-center border-t border-none bg-transparent p-0 text-xs transition-all duration-200", children: chevron }) }), _jsxs(TooltipContent, { align: "center", children: [label, shortcut && ` (${shortcut})`] })] }));
};
//# sourceMappingURL=SidebarCollapseButton.js.map