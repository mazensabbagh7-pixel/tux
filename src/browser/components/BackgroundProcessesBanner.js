import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useCallback, useEffect } from "react";
import { Terminal, X, ChevronDown, ChevronRight, Loader2, FileText } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "./ui/tooltip";
import { cn } from "@/common/lib/utils";
import { BackgroundBashOutputDialog } from "./BackgroundBashOutputDialog";
import { formatDuration } from "./tools/shared/toolUtils";
import { useBackgroundBashTerminatingIds, useBackgroundProcesses, } from "@/browser/stores/BackgroundBashStore";
import { useBackgroundBashActions } from "@/browser/contexts/BackgroundBashContext";
/**
 * Truncate script to reasonable display length.
 */
function truncateScript(script, maxLength = 60) {
    // First line only, truncated
    const firstLine = script.split("\n")[0] ?? script;
    if (firstLine.length <= maxLength) {
        return firstLine;
    }
    return firstLine.slice(0, maxLength - 3) + "...";
}
/**
 * Banner showing running background processes.
 * Displays "N running bashes" which expands on click to show details.
 */
export const BackgroundProcessesBanner = (props) => {
    const [viewingProcessId, setViewingProcessId] = useState(null);
    const [isExpanded, setIsExpanded] = useState(false);
    const [, setTick] = useState(0);
    const processes = useBackgroundProcesses(props.workspaceId);
    const terminatingIds = useBackgroundBashTerminatingIds(props.workspaceId);
    const { terminate } = useBackgroundBashActions();
    // Filter to only running processes
    const runningProcesses = processes.filter((p) => p.status === "running");
    const viewingProcess = processes.find((p) => p.id === viewingProcessId) ?? null;
    const count = runningProcesses.length;
    // Update duration display every second when expanded
    useEffect(() => {
        if (!isExpanded || count === 0)
            return;
        const interval = setInterval(() => setTick((t) => t + 1), 1000);
        return () => clearInterval(interval);
    }, [isExpanded, count]);
    const handleViewOutput = useCallback((processId, event) => {
        event.stopPropagation();
        setViewingProcessId(processId);
    }, []);
    const handleTerminate = useCallback((processId, event) => {
        event.stopPropagation();
        terminate(processId);
    }, [terminate]);
    const handleToggle = useCallback(() => {
        setIsExpanded((prev) => !prev);
    }, []);
    // Don't render if no running processes and no dialog open.
    if (count === 0 && !viewingProcessId) {
        return null;
    }
    return (_jsxs(_Fragment, { children: [count > 0 && (_jsxs("div", { className: "border-border bg-dark border-t px-[15px]", children: [_jsxs("button", { type: "button", onClick: handleToggle, className: "group mx-auto flex w-full max-w-4xl items-center gap-2 px-2 py-1 text-xs transition-colors", children: [_jsx(Terminal, { className: "text-muted group-hover:text-secondary size-3.5 transition-colors" }), _jsxs("span", { className: "text-muted group-hover:text-secondary transition-colors", children: [_jsx("span", { className: "font-medium", children: count }), " background bash", count !== 1 && "es"] }), _jsx("div", { className: "ml-auto", children: isExpanded ? (_jsx(ChevronDown, { className: "text-muted group-hover:text-secondary size-3.5 transition-colors" })) : (_jsx(ChevronRight, { className: "text-muted group-hover:text-secondary size-3.5 transition-colors" })) })] }), isExpanded && (_jsx("div", { className: "border-border mx-auto max-h-48 max-w-4xl space-y-1.5 overflow-y-auto border-t py-2", children: runningProcesses.map((proc) => {
                            const isTerminating = terminatingIds.has(proc.id);
                            return (_jsxs("div", { className: cn("hover:bg-hover flex items-center justify-between gap-3 rounded px-2 py-1.5", "transition-colors", isTerminating && "pointer-events-none opacity-50"), children: [_jsxs("div", { className: "min-w-0 flex-1", children: [_jsx("div", { className: "text-foreground truncate font-mono text-xs", title: proc.script, children: proc.displayName ?? truncateScript(proc.script) }), _jsxs("div", { className: "text-muted font-mono text-[10px]", children: ["pid ", proc.pid] })] }), _jsxs("div", { className: "flex shrink-0 items-center gap-2", children: [_jsx("span", { className: "text-muted text-[10px]", children: formatDuration(Date.now() - proc.startTime) }), _jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("button", { type: "button", disabled: isTerminating, onClick: (e) => handleViewOutput(proc.id, e), className: cn("text-muted hover:text-secondary rounded p-1 transition-colors", isTerminating && "cursor-not-allowed"), children: _jsx(FileText, { size: 14 }) }) }), _jsx(TooltipContent, { children: "View output" })] }), _jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("button", { type: "button", disabled: isTerminating, onClick: (e) => handleTerminate(proc.id, e), className: cn("text-muted hover:text-error rounded p-1 transition-colors", isTerminating && "cursor-not-allowed"), children: isTerminating ? (_jsx(Loader2, { size: 14, className: "animate-spin" })) : (_jsx(X, { size: 14 })) }) }), _jsx(TooltipContent, { children: "Terminate process" })] })] })] }, proc.id));
                        }) }))] })), viewingProcessId && (_jsx(BackgroundBashOutputDialog, { open: true, onOpenChange: (open) => {
                    if (!open) {
                        setViewingProcessId(null);
                    }
                }, workspaceId: props.workspaceId, processId: viewingProcessId, displayName: viewingProcess?.displayName }))] }));
};
//# sourceMappingURL=BackgroundProcessesBanner.js.map