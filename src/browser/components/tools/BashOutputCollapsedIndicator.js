import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Visual indicator showing collapsed bash_output calls.
 * Renders as a squiggly line with count badge between the first and last calls.
 * Clickable to expand/collapse the hidden calls.
 */
export const BashOutputCollapsedIndicator = ({ processId, collapsedCount, isExpanded, onToggle, }) => {
    return (_jsx("div", { className: "px-3 py-1", children: _jsxs("button", { onClick: onToggle, className: "text-muted hover:bg-background-highlight inline-flex cursor-pointer items-center gap-2 rounded px-2 py-0.5 transition-colors", children: [_jsx("svg", { className: `text-border shrink-0 transition-transform ${isExpanded ? "rotate-90" : ""}`, width: "16", height: "24", viewBox: "0 0 16 24", fill: "none", xmlns: "http://www.w3.org/2000/svg", children: _jsx("path", { d: "M8 0 Q12 4, 8 8 Q4 12, 8 16 Q12 20, 8 24", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", fill: "none" }) }), _jsxs("span", { className: "text-[10px] font-medium", children: [isExpanded ? "Hide" : "Show", " ", collapsedCount, " more output check", collapsedCount === 1 ? "" : "s", " for", " ", _jsx("code", { className: "font-monospace text-text-muted", children: processId })] })] }) }));
};
//# sourceMappingURL=BashOutputCollapsedIndicator.js.map