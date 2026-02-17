import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { AlertTriangle, X } from "lucide-react";
import { getModelName } from "@/common/utils/ai/models";
function formatTokens(n) {
    if (n >= 1000000)
        return `${(n / 1000000).toFixed(1).replace(".0", "")}M`;
    if (n >= 1000)
        return `${Math.round(n / 1000)}K`;
    return String(n);
}
/**
 * Warning banner shown when user switches to a model that can't fit the current context.
 */
export const ContextSwitchWarning = (props) => {
    const targetName = getModelName(props.warning.targetModel);
    const compactName = props.warning.compactionModel
        ? getModelName(props.warning.compactionModel)
        : null;
    return (_jsxs("div", { "data-testid": "context-switch-warning", className: "bg-background-secondary border-plan-mode mx-4 my-2 rounded-md border px-4 py-3", children: [_jsxs("div", { className: "flex items-start justify-between gap-3", children: [_jsxs("div", { className: "flex-1", children: [_jsxs("div", { className: "text-plan-mode mb-1 flex items-center gap-2 text-[13px] font-medium", children: [_jsx(AlertTriangle, { "aria-hidden": "true", className: "h-4 w-4" }), _jsx("span", { children: "Context May Exceed Model Limit" })] }), _jsxs("p", { className: "text-foreground/80 text-[12px] leading-relaxed", children: ["Current context (", formatTokens(props.warning.currentTokens), " tokens) may exceed the", " ", _jsx("span", { className: "font-medium", children: targetName }), " limit (", formatTokens(props.warning.targetLimit), "). Consider compacting before sending."] })] }), _jsx("button", { type: "button", onClick: props.onDismiss, className: "text-muted hover:text-foreground -mt-1 -mr-1 cursor-pointer p-1", title: "Dismiss", "aria-label": "Dismiss context limit warning", children: _jsx(X, { size: 14, "aria-hidden": "true" }) })] }), _jsx("div", { className: "mt-2.5 flex items-center gap-3", children: props.warning.errorMessage ? (_jsx("span", { className: "text-error text-[12px]", children: props.warning.errorMessage })) : (_jsxs("button", { type: "button", onClick: props.onCompact, className: "bg-plan-mode/20 hover:bg-plan-mode/30 text-plan-mode cursor-pointer rounded px-3 py-1.5 text-[12px] font-medium transition-colors", children: ["Compact with ", compactName] })) })] }));
};
//# sourceMappingURL=ContextSwitchWarning.js.map