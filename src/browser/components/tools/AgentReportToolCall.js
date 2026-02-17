import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { ToolContainer, ToolHeader, ExpandIcon, ToolName, StatusIndicator, ToolDetails, ToolIcon, ErrorBox, } from "./shared/ToolPrimitives";
import { useToolExpansion, getStatusDisplay, isToolErrorResult, } from "./shared/toolUtils";
import { MarkdownRenderer } from "../Messages/MarkdownRenderer";
export const AgentReportToolCall = ({ args, result, status = "pending", }) => {
    // Default to expanded: the report is the entire point of this tool.
    const { expanded, toggleExpanded } = useToolExpansion(true);
    const errorResult = isToolErrorResult(result) ? result : null;
    const title = args.title ?? "Agent report";
    // Show a small preview when collapsed so the card still has some useful context.
    const firstLine = args.reportMarkdown.trim().split("\n")[0] ?? "";
    const preview = firstLine.length > 80 ? firstLine.slice(0, 80).trim() + "…" : firstLine;
    return (_jsxs(ToolContainer, { expanded: expanded, children: [_jsxs(ToolHeader, { onClick: toggleExpanded, children: [_jsx(ExpandIcon, { expanded: expanded, children: "\u25B6" }), _jsx(ToolIcon, { toolName: "agent_report" }), _jsx(ToolName, { children: title }), _jsx(StatusIndicator, { status: status, children: getStatusDisplay(status) })] }), expanded && (_jsxs(ToolDetails, { children: [_jsx("div", { className: "text-[11px]", children: _jsx(MarkdownRenderer, { content: args.reportMarkdown }) }), errorResult && _jsx(ErrorBox, { className: "mt-2", children: errorResult.error })] })), !expanded && preview && (_jsx("div", { className: "text-muted mt-1 truncate text-[10px]", children: preview }))] }));
};
//# sourceMappingURL=AgentReportToolCall.js.map