import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Layers, Link } from "lucide-react";
import { ToolContainer, ToolHeader, ExpandIcon, StatusIndicator, ToolDetails, DetailSection, DetailLabel, DetailContent, LoadingDots, ToolIcon, ErrorBox, OutputStatusBadge, ProcessStatusBadge, OutputSection, } from "./shared/ToolPrimitives";
import { useToolExpansion, getStatusDisplay } from "./shared/toolUtils";
/**
 * Display component for bash_output tool calls.
 * Shows output from background processes in a format matching regular bash tool.
 */
export const BashOutputToolCall = ({ args, result, status = "pending", groupPosition, }) => {
    const { expanded, toggleExpanded } = useToolExpansion();
    // Derive process status display
    const processStatus = result?.success ? result.status : undefined;
    const note = result?.success ? result.note : undefined;
    return (_jsxs(ToolContainer, { expanded: expanded, children: [_jsxs(ToolHeader, { onClick: toggleExpanded, children: [_jsx(ExpandIcon, { expanded: expanded, children: "\u25B6" }), _jsx(ToolIcon, { toolName: "bash_output" }), _jsx("span", { className: "text-text font-monospace max-w-96 truncate", children: args.process_id }), _jsxs("span", { className: "text-muted ml-2 flex items-center gap-1 text-[10px] whitespace-nowrap", children: [_jsx(Layers, { size: 10 }), "output", args.timeout_secs > 0 && ` • wait ${args.timeout_secs}s`, args.filter && ` • ${args.filter_exclude ? "exclude" : "filter"}: ${args.filter}`, groupPosition && (_jsxs("span", { className: "text-muted ml-1 flex items-center gap-0.5", children: ["\u2022 ", _jsx(Link, { size: 8 }), " ", groupPosition === "first" ? "start" : "end"] }))] }), result?.success && _jsx(OutputStatusBadge, { hasOutput: !!result.output, className: "ml-2" }), result?.success && processStatus && processStatus !== "running" && (_jsx(ProcessStatusBadge, { status: processStatus, exitCode: result.exitCode, className: "ml-2" })), _jsx(StatusIndicator, { status: status, children: getStatusDisplay(status) })] }), expanded && (_jsxs(ToolDetails, { children: [result && (_jsxs(_Fragment, { children: [result.success === false && (_jsxs(DetailSection, { children: [_jsx(DetailLabel, { children: "Error" }), _jsx(ErrorBox, { children: result.error })] })), result.success && (_jsx(OutputSection, { output: result.output, note: note, emptyMessage: "No new output" }))] })), status === "executing" && !result && (_jsx(DetailSection, { children: _jsxs(DetailContent, { className: "px-2 py-1.5", children: ["Waiting for result", _jsx(LoadingDots, {})] }) }))] }))] }));
};
//# sourceMappingURL=BashOutputToolCall.js.map