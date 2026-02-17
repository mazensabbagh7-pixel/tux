import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { ToolContainer, ToolHeader, ExpandIcon, StatusIndicator, ToolDetails, DetailSection, DetailLabel, LoadingDots, ToolIcon, ErrorBox, } from "./shared/ToolPrimitives";
import { useToolExpansion, getStatusDisplay } from "./shared/toolUtils";
import { MarkdownRenderer } from "../Messages/MarkdownRenderer";
function formatBytes(bytes) {
    if (bytes < 1024)
        return `${bytes}B`;
    if (bytes < 1024 * 1024)
        return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
/**
 * Extract domain from URL for compact display
 */
function getDomain(url) {
    try {
        const parsed = new URL(url);
        return parsed.hostname;
    }
    catch {
        return url;
    }
}
export const WebFetchToolCall = ({ args, result, status = "pending", }) => {
    const { expanded, toggleExpanded } = useToolExpansion();
    const domain = getDomain(args.url);
    return (_jsxs(ToolContainer, { expanded: expanded, className: "@container", children: [_jsxs(ToolHeader, { onClick: toggleExpanded, children: [_jsx(ExpandIcon, { expanded: expanded, children: "\u25B6" }), _jsx(ToolIcon, { toolName: "web_fetch" }), _jsx("div", { className: "text-text flex max-w-96 min-w-0 items-center gap-1.5", children: _jsx("span", { className: "font-monospace truncate", children: domain }) }), result && result.success && (_jsxs("span", { className: "text-secondary ml-2 text-[10px] whitespace-nowrap", children: [_jsx("span", { className: "hidden @sm:inline", children: "fetched " }), formatBytes(result.length)] })), _jsx(StatusIndicator, { status: status, children: getStatusDisplay(status) })] }), expanded && (_jsxs(ToolDetails, { children: [_jsx(DetailSection, { children: _jsxs("div", { className: "bg-code-bg flex flex-wrap gap-4 rounded px-2 py-1.5 text-[11px] leading-[1.4]", children: [_jsxs("div", { className: "flex min-w-0 gap-1.5", children: [_jsx("span", { className: "text-secondary font-medium", children: "URL:" }), _jsx("a", { href: args.url, target: "_blank", rel: "noopener noreferrer", className: "text-link font-monospace truncate hover:underline", children: args.url })] }), result && result.success && result.title && (_jsxs("div", { className: "flex min-w-0 gap-1.5", children: [_jsx("span", { className: "text-secondary font-medium", children: "Title:" }), _jsx("span", { className: "text-text truncate", children: result.title })] }))] }) }), result && (_jsxs(_Fragment, { children: [result.success === false && result.error && (_jsxs(DetailSection, { children: [_jsx(DetailLabel, { children: "Error" }), _jsx(ErrorBox, { children: result.error })] })), result.content && (_jsxs(DetailSection, { children: [_jsx(DetailLabel, { children: result.success ? "Content" : "Error Page Content" }), _jsx("div", { className: "bg-code-bg max-h-[300px] overflow-y-auto rounded px-3 py-2 text-[12px]", children: _jsx(MarkdownRenderer, { content: result.content }) })] }))] })), status === "executing" && !result && (_jsx(DetailSection, { children: _jsxs("div", { className: "text-secondary text-[11px]", children: ["Fetching page", _jsx(LoadingDots, {})] }) }))] }))] }));
};
//# sourceMappingURL=WebFetchToolCall.js.map