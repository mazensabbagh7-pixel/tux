import { jsxs as _jsxs, Fragment as _Fragment, jsx as _jsx } from "react/jsx-runtime";
/**
 * Tab label components for RightSidebar tabs.
 *
 * Each tab type has its own label component that handles badges, icons, and actions.
 *
 * CostsTabLabel and StatsTabLabel subscribe to their own data to avoid re-rendering
 * the entire RightSidebarTabsetNode tree when stats update during agent streaming.
 */
import React from "react";
import { ExternalLink, FolderTree, Terminal as TerminalIcon, X } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../ui/tooltip";
import { FileIcon } from "../../FileIcon";
import { formatTabDuration } from "./registry";
import { formatKeybind, KEYBINDS } from "@/browser/utils/ui/keybinds";
import { cn } from "@/common/lib/utils";
import { useWorkspaceUsage, useWorkspaceStatsSnapshot } from "@/browser/stores/WorkspaceStore";
import { sumUsageHistory } from "@/common/utils/tokens/usageAggregator";
/**
 * Costs tab label with session cost badge.
 * Subscribes to workspace usage directly to avoid re-rendering parent components.
 */
export const CostsTabLabel = ({ workspaceId }) => {
    const usage = useWorkspaceUsage(workspaceId);
    const sessionCost = React.useMemo(() => {
        const parts = [];
        if (usage.sessionTotal)
            parts.push(usage.sessionTotal);
        if (usage.liveCostUsage)
            parts.push(usage.liveCostUsage);
        if (parts.length === 0)
            return null;
        const aggregated = sumUsageHistory(parts);
        if (!aggregated)
            return null;
        const total = (aggregated.input.cost_usd ?? 0) +
            (aggregated.cached.cost_usd ?? 0) +
            (aggregated.cacheCreate.cost_usd ?? 0) +
            (aggregated.output.cost_usd ?? 0) +
            (aggregated.reasoning.cost_usd ?? 0);
        return total > 0 ? total : null;
    }, [usage.sessionTotal, usage.liveCostUsage]);
    return (_jsxs(_Fragment, { children: ["Costs", sessionCost !== null && (_jsxs("span", { className: "text-muted text-[10px]", children: ["$", sessionCost < 0.01 ? "<0.01" : sessionCost.toFixed(2)] }))] }));
};
/** Review tab label with read/total badge */
export const ReviewTabLabel = ({ reviewStats }) => (_jsxs(_Fragment, { children: ["Review", reviewStats !== null && reviewStats.total > 0 && (_jsxs("span", { className: cn("text-[10px]", reviewStats.read === reviewStats.total ? "text-muted" : "text-muted"), children: [reviewStats.read, "/", reviewStats.total] }))] }));
/**
 * Stats tab label with session duration badge.
 * Subscribes to workspace stats directly to avoid re-rendering parent components.
 */
export const StatsTabLabel = ({ workspaceId }) => {
    const statsSnapshot = useWorkspaceStatsSnapshot(workspaceId);
    const sessionDuration = React.useMemo(() => {
        const baseDuration = statsSnapshot?.session?.totalDurationMs ?? 0;
        const activeDuration = statsSnapshot?.active?.elapsedMs ?? 0;
        const total = baseDuration + activeDuration;
        return total > 0 ? total : null;
    }, [statsSnapshot]);
    return (_jsxs(_Fragment, { children: ["Stats", sessionDuration !== null && (_jsx("span", { className: "text-muted text-[10px]", children: formatTabDuration(sessionDuration) }))] }));
};
/** Explorer tab label with folder tree icon */
export const ExplorerTabLabel = () => (_jsxs("span", { className: "inline-flex items-center gap-1", children: [_jsx(FolderTree, { className: "h-3 w-3 shrink-0" }), "Explorer"] }));
export function OutputTabLabel() {
    return _jsx(_Fragment, { children: "Output" });
}
/** File tab label with file icon, filename, and close button */
export const FileTabLabel = ({ filePath, onClose }) => {
    // Extract just the filename for display
    const fileName = filePath.split("/").pop() ?? filePath;
    return (_jsxs("span", { className: "inline-flex items-center gap-1", children: [_jsx(FileIcon, { fileName: fileName, style: { fontSize: 14 }, className: "h-3.5 w-3.5 shrink-0" }), _jsx("span", { className: "max-w-[120px] truncate", title: filePath, children: fileName }), _jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("button", { type: "button", className: "text-muted hover:text-destructive -my-0.5 rounded p-0.5 transition-colors", onClick: (e) => {
                                e.stopPropagation();
                                onClose();
                            }, "aria-label": "Close file", children: _jsx(X, { className: "h-3 w-3" }) }) }), _jsxs(TooltipContent, { side: "bottom", children: ["Close (", formatKeybind(KEYBINDS.CLOSE_TAB), ")"] })] })] }));
};
/** Terminal tab label with icon, dynamic title, and action buttons */
export const TerminalTabLabel = ({ dynamicTitle, terminalIndex, onPopOut, onClose, }) => {
    const fallbackName = terminalIndex === 0 ? "Terminal" : `Terminal ${terminalIndex + 1}`;
    const displayName = dynamicTitle ?? fallbackName;
    return (_jsxs("span", { className: "inline-flex items-center gap-1", children: [_jsx(TerminalIcon, { className: "h-3 w-3 shrink-0" }), _jsx("span", { className: "max-w-[20ch] min-w-0 truncate", children: displayName }), _jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("button", { type: "button", className: "text-muted hover:text-foreground -my-0.5 rounded p-0.5 transition-colors", onClick: (e) => {
                                e.stopPropagation();
                                onPopOut();
                            }, "aria-label": "Open terminal in new window", children: _jsx(ExternalLink, { className: "h-3 w-3" }) }) }), _jsx(TooltipContent, { side: "bottom", children: "Open in new window" })] }), _jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("button", { type: "button", className: "text-muted hover:text-destructive -my-0.5 rounded p-0.5 transition-colors", onClick: (e) => {
                                e.stopPropagation();
                                onClose();
                            }, "aria-label": "Close terminal", children: _jsx(X, { className: "h-3 w-3" }) }) }), _jsxs(TooltipContent, { side: "bottom", children: ["Close terminal (", formatKeybind(KEYBINDS.CLOSE_TAB), ")"] })] })] }));
};
//# sourceMappingURL=TabLabels.js.map