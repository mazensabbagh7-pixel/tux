import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { ToolContainer, ToolHeader, ExpandIcon, StatusIndicator, ToolDetails, DetailSection, LoadingDots, ToolIcon, ErrorBox, } from "./shared/ToolPrimitives";
import { useToolExpansion, getStatusDisplay, formatDuration, } from "./shared/toolUtils";
import { cn } from "@/common/lib/utils";
function getProcessStatusStyle(status) {
    switch (status) {
        case "running":
            return "bg-success text-on-success";
        case "exited":
            return "bg-[hsl(0,0%,40%)] text-white";
        case "killed":
        case "failed":
            return "bg-danger text-on-danger";
    }
}
export const BashBackgroundListToolCall = ({ args: _args, result, status = "pending", }) => {
    const { expanded, toggleExpanded } = useToolExpansion(false);
    const processes = result?.success ? result.processes : [];
    const runningCount = processes.filter((p) => p.status === "running").length;
    return (_jsxs(ToolContainer, { expanded: expanded, children: [_jsxs(ToolHeader, { onClick: toggleExpanded, children: [_jsx(ExpandIcon, { expanded: expanded, children: "\u25B6" }), _jsx(ToolIcon, { toolName: "bash_background_list" }), _jsx("span", { className: "text-text-secondary", children: result?.success
                            ? runningCount === 0
                                ? "No background processes"
                                : `${runningCount} background process${runningCount !== 1 ? "es" : ""}`
                            : "Listing background processes" }), _jsx(StatusIndicator, { status: status, children: getStatusDisplay(status) })] }), expanded && (_jsxs(ToolDetails, { children: [result?.success === false && (_jsx(DetailSection, { children: _jsx(ErrorBox, { children: result.error }) })), result?.success && processes.length > 0 && (_jsx(DetailSection, { children: _jsx("div", { className: "space-y-2", children: processes.map((proc) => (_jsxs("div", { className: "bg-code-bg rounded px-2 py-1.5 text-[11px]", children: [_jsxs("div", { className: "mb-1 flex items-center gap-2", children: [_jsx("span", { className: "text-text font-mono", children: proc.display_name ?? proc.process_id }), _jsxs("span", { className: cn("inline-block rounded px-1.5 py-0.5 text-[9px] font-medium uppercase", getProcessStatusStyle(proc.status)), children: [proc.status, proc.exitCode !== undefined && ` (${proc.exitCode})`] }), _jsx("span", { className: "text-text-secondary ml-auto", children: formatDuration(proc.uptime_ms) })] }), _jsx("div", { className: "text-text-secondary truncate font-mono", title: proc.script, children: proc.script })] }, proc.process_id))) }) })), status === "executing" && !result && (_jsx(DetailSection, { children: _jsxs("div", { className: "text-[11px]", children: ["Listing processes", _jsx(LoadingDots, {})] }) }))] }))] }));
};
//# sourceMappingURL=BashBackgroundListToolCall.js.map