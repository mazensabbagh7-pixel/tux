import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import React from "react";
import { Tooltip, TooltipTrigger, TooltipContent, HelpIndicator } from "../ui/tooltip";
// Format token display - show k for thousands with 1 decimal
const formatTokens = (tokens) => tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}k` : tokens.toLocaleString();
const ConsumerBreakdownComponent = ({ consumers, totalTokens, }) => {
    if (consumers.length === 0) {
        return null;
    }
    return (_jsx("div", { className: "flex flex-col gap-2", children: consumers.map((consumer) => {
            // Calculate percentages for fixed and variable segments
            const fixedPercentage = consumer.fixedTokens
                ? (consumer.fixedTokens / totalTokens) * 100
                : 0;
            const variablePercentage = consumer.variableTokens
                ? (consumer.variableTokens / totalTokens) * 100
                : 0;
            return (_jsxs("div", { className: "flex flex-col gap-0.5", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsxs("span", { className: "text-foreground flex items-center gap-1 text-xs font-medium", children: [consumer.name, consumer.name === "web_search" && (_jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx(HelpIndicator, { children: "?" }) }), _jsx(TooltipContent, { align: "center", className: "max-w-80 whitespace-normal", children: "Web search results are encrypted and decrypted server-side. This estimate is approximate." })] }))] }), _jsxs("span", { className: "text-muted text-[11px]", children: [formatTokens(consumer.tokens), " (", consumer.percentage.toFixed(1), "%)"] })] }), _jsx("div", { className: "bg-hover flex h-1.5 w-full overflow-hidden rounded", children: consumer.fixedTokens && consumer.variableTokens ? (_jsxs(_Fragment, { children: [_jsx("div", { className: "bg-token-fixed h-full transition-[width] duration-300", style: { width: `${fixedPercentage}%` } }), _jsx("div", { className: "bg-token-variable h-full transition-[width] duration-300", style: { width: `${variablePercentage}%` } })] })) : (_jsx("div", { className: "h-full bg-[linear-gradient(90deg,var(--color-token-input)_0%,var(--color-token-output)_100%)] transition-[width] duration-300", style: { width: `${consumer.percentage}%` } })) })] }, consumer.name));
        }) }));
};
// Memoize to prevent re-renders when parent re-renders but consumers data hasn't changed
// Only re-renders when consumers object reference changes (when store bumps it)
export const ConsumerBreakdown = React.memo(ConsumerBreakdownComponent);
//# sourceMappingURL=ConsumerBreakdown.js.map