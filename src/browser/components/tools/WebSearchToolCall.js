import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { ToolContainer, ToolHeader, ExpandIcon, StatusIndicator, ToolDetails, DetailSection, DetailLabel, LoadingDots, ToolIcon, } from "./shared/ToolPrimitives";
import { useToolExpansion, getStatusDisplay } from "./shared/toolUtils";
import { JsonHighlight } from "./shared/HighlightedCode";
/**
 * Unwrap JSON container from streamManager's stripEncryptedContent.
 * Results arrive as { type: "json", value: [...] } or direct array/object.
 */
function unwrapResult(result) {
    if (result !== null &&
        typeof result === "object" &&
        "type" in result &&
        result.type === "json" &&
        "value" in result) {
        return result.value;
    }
    return result;
}
/**
 * Extract query from either args (Anthropic) or result.action.query (OpenAI)
 */
function extractQuery(args, result) {
    if (args.query)
        return args.query;
    const unwrapped = unwrapResult(result);
    // OpenAI puts query in result.action.query
    if (unwrapped !== null &&
        typeof unwrapped === "object" &&
        "action" in unwrapped &&
        typeof unwrapped.action === "object") {
        const action = unwrapped.action;
        if (typeof action.query === "string")
            return action.query;
    }
    return undefined;
}
/**
 * Get result count - Anthropic returns array, OpenAI returns { sources: [] }
 */
function getResultCount(result) {
    const unwrapped = unwrapResult(result);
    if (Array.isArray(unwrapped))
        return unwrapped.length;
    if (unwrapped !== null &&
        typeof unwrapped === "object" &&
        "sources" in unwrapped &&
        Array.isArray(unwrapped.sources)) {
        return unwrapped.sources.length;
    }
    return 0;
}
export const WebSearchToolCall = ({ args, result, status = "pending", }) => {
    const { expanded, toggleExpanded } = useToolExpansion();
    const query = extractQuery(args, result);
    const resultCount = getResultCount(result);
    return (_jsxs(ToolContainer, { expanded: expanded, className: "@container", children: [_jsxs(ToolHeader, { onClick: toggleExpanded, children: [_jsx(ExpandIcon, { expanded: expanded, children: "\u25B6" }), _jsx(ToolIcon, { toolName: "web_search" }), _jsx("div", { className: "text-text flex max-w-96 min-w-0 items-center gap-1.5", children: _jsx("span", { className: "font-monospace truncate", children: query ?? "searching..." }) }), result !== undefined && resultCount > 0 && (_jsxs("span", { className: "text-secondary ml-2 text-[10px] whitespace-nowrap", children: [resultCount, " result", resultCount !== 1 ? "s" : ""] })), _jsx(StatusIndicator, { status: status, children: getStatusDisplay(status) })] }), expanded && (_jsxs(ToolDetails, { children: [_jsx(DetailSection, { children: _jsx("div", { className: "bg-code-bg flex flex-wrap gap-4 rounded px-2 py-1.5 text-[11px] leading-[1.4]", children: query && (_jsxs("div", { className: "flex min-w-0 gap-1.5", children: [_jsx("span", { className: "text-secondary font-medium", children: "Query:" }), _jsx("span", { className: "text-text", children: query })] })) }) }), result != null && (_jsxs(DetailSection, { children: [_jsx(DetailLabel, { children: "Results" }), _jsx("div", { className: "bg-code-bg max-h-[300px] overflow-y-auto rounded px-3 py-2 text-[12px]", children: _jsx(JsonHighlight, { value: result }) })] })), status === "executing" && !result && (_jsx(DetailSection, { children: _jsxs("div", { className: "text-secondary text-[11px]", children: ["Searching", _jsx(LoadingDots, {})] }) }))] }))] }));
};
//# sourceMappingURL=WebSearchToolCall.js.map