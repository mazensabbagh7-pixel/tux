import { jsx as _jsx } from "react/jsx-runtime";
import { MarkdownCore } from "./MarkdownCore";
import { cn } from "@/common/lib/utils";
export const MarkdownRenderer = ({ content, className, style, preserveLineBreaks, }) => {
    return (_jsx("div", { className: cn("markdown-content", className), style: style, children: _jsx(MarkdownCore, { content: content, preserveLineBreaks: preserveLineBreaks }) }));
};
// For plan-specific styling
export const PlanMarkdownContainer = ({ children, className, }) => {
    return (_jsx("div", { className: cn("markdown-content", className), style: {
            // Plan-specific overrides
            // @ts-expect-error CSS custom property
            "--blockquote-color": "var(--color-plan-mode)",
            "--code-color": "var(--color-plan-mode-hover)",
        }, children: children }));
};
//# sourceMappingURL=MarkdownRenderer.js.map