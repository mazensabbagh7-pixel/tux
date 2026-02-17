import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import React from "react";
import { cn } from "@/common/lib/utils";
import { useWorkspaceContext } from "@/browser/contexts/WorkspaceContext";
import { usePersistedState } from "@/browser/hooks/usePersistedState";
import { useAPI } from "@/browser/contexts/API";
import { ChevronDown, ChevronRight, Loader2, Search, Trash2 } from "lucide-react";
import { ArchiveIcon, ArchiveRestoreIcon } from "./icons/ArchiveIcon";
import { Tooltip, TooltipTrigger, TooltipContent } from "./ui/tooltip";
import { RuntimeBadge } from "./RuntimeBadge";
import { Skeleton } from "./ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, } from "@/browser/components/ui/dialog";
import { ForceDeleteModal } from "./ForceDeleteModal";
import { Button } from "@/browser/components/ui/button";
import { sumUsageHistory, getTotalCost, formatCostWithDollar, } from "@/common/utils/tokens/usageAggregator";
import { useOptimisticBatchLRU } from "@/browser/hooks/useOptimisticBatchLRU";
import { sessionCostCache } from "@/browser/utils/sessionCostCache";
/** Group workspaces by time period for timeline display */
function groupByTimePeriod(workspaces) {
    const groups = new Map();
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 86400000);
    const lastWeek = new Date(today.getTime() - 7 * 86400000);
    const lastMonth = new Date(today.getTime() - 30 * 86400000);
    // Sort by archivedAt descending (most recent first)
    const sorted = [...workspaces].sort((a, b) => {
        const aTime = a.archivedAt ? new Date(a.archivedAt).getTime() : 0;
        const bTime = b.archivedAt ? new Date(b.archivedAt).getTime() : 0;
        return bTime - aTime;
    });
    for (const ws of sorted) {
        const archivedDate = ws.archivedAt ? new Date(ws.archivedAt) : null;
        let period;
        if (!archivedDate) {
            period = "Unknown";
        }
        else if (archivedDate >= today) {
            period = "Today";
        }
        else if (archivedDate >= yesterday) {
            period = "Yesterday";
        }
        else if (archivedDate >= lastWeek) {
            period = "This Week";
        }
        else if (archivedDate >= lastMonth) {
            period = "This Month";
        }
        else {
            // Group by month/year for older items
            period = archivedDate.toLocaleDateString(undefined, { month: "long", year: "numeric" });
        }
        const existing = groups.get(period) ?? [];
        existing.push(ws);
        groups.set(period, existing);
    }
    return groups;
}
/** Flatten grouped workspaces back to ordered array for index-based selection */
function flattenGrouped(grouped) {
    const result = [];
    for (const workspaces of grouped.values()) {
        result.push(...workspaces);
    }
    return result;
}
/** Calculate total cost from a SessionUsageFile by summing all model usages */
function getSessionTotalCost(usage) {
    if (!usage)
        return undefined;
    const aggregated = sumUsageHistory(Object.values(usage.byModel));
    return getTotalCost(aggregated);
}
/** Cost badge component with size variants for different scopes.
 * Shows a shimmer skeleton while loading to prevent layout flash. */
const CostBadge = ({ cost, loading = false, size = "md", className }) => {
    const sizeStyles = {
        sm: "px-1 py-0.5 text-[10px]",
        md: "px-1.5 py-0.5 text-xs",
        lg: "px-2 py-0.5 text-sm",
    };
    // Skeleton sizes that reserve the same space as a typical cost value (e.g., "$0.12")
    const skeletonSizes = {
        sm: "h-4 w-[5ch]",
        md: "h-5 w-[6ch]",
        lg: "h-6 w-[7ch]",
    };
    // Show skeleton while loading and no cached value available
    if (cost === undefined) {
        if (!loading)
            return null;
        return (_jsx(Skeleton, { variant: "shimmer", className: cn(skeletonSizes[size], sizeStyles[size], className) }));
    }
    return (_jsx("span", { className: cn("text-muted inline-flex items-center rounded bg-white/5 tabular-nums", sizeStyles[size], className), children: formatCostWithDollar(cost) }));
};
/** Progress modal for bulk operations */
const BulkProgressModal = ({ operation, onClose }) => {
    const percentage = Math.round((operation.completed / operation.total) * 100);
    const isComplete = operation.completed === operation.total;
    const actionVerb = operation.type === "restore" ? "Restoring" : "Deleting";
    const actionPast = operation.type === "restore" ? "restored" : "deleted";
    return (_jsx(Dialog, { open: true, onOpenChange: (open) => !open && isComplete && onClose(), children: _jsxs(DialogContent, { maxWidth: "400px", showCloseButton: isComplete, children: [_jsxs(DialogHeader, { children: [_jsx(DialogTitle, { children: isComplete ? "Complete" : `${actionVerb} Workspaces` }), _jsx(DialogDescription, { children: isComplete ? (_jsxs(_Fragment, { children: ["Successfully ", actionPast, " ", operation.completed, " workspace", operation.completed !== 1 && "s", operation.errors.length > 0 && ` (${operation.errors.length} failed)`] })) : (_jsxs(_Fragment, { children: [operation.completed, " of ", operation.total, " complete", operation.current && _jsxs(_Fragment, { children: [" \u2014 ", operation.current] })] })) })] }), _jsx("div", { className: "bg-separator h-2 overflow-hidden rounded-full", children: _jsx("div", { className: cn("h-full transition-all duration-300", operation.type === "restore" ? "bg-green-500" : "bg-red-500"), style: { width: `${percentage}%` } }) }), operation.errors.length > 0 && (_jsx("div", { className: "max-h-32 overflow-y-auto rounded bg-red-500/10 p-2 text-xs text-red-400", children: operation.errors.map((err, i) => (_jsx("div", { children: err }, i))) })), isComplete && (_jsx(DialogFooter, { className: "justify-center", children: _jsx(Button, { variant: "secondary", onClick: onClose, className: "w-full", children: "Done" }) }))] }) }));
};
/**
 * Section showing archived workspaces for a project.
 * Appears on the project page when there are archived workspaces.
 */
export const ArchivedWorkspaces = ({ projectPath: _projectPath, projectName: _projectName, workspaces, onWorkspacesChanged, }) => {
    const [isExpanded, setIsExpanded] = usePersistedState(`archivedWorkspacesExpanded:${_projectPath}`, false);
    const archivedRegionId = React.useId();
    const { unarchiveWorkspace, removeWorkspace, setSelectedWorkspace } = useWorkspaceContext();
    const { api } = useAPI();
    const [searchQuery, setSearchQuery] = React.useState("");
    const [processingIds, setProcessingIds] = React.useState(new Set());
    const [forceDeleteModal, setForceDeleteModal] = React.useState(null);
    // Bulk selection state
    const [selectedIds, setSelectedIds] = React.useState(new Set());
    const [lastClickedId, setLastClickedId] = React.useState(null);
    const [bulkOperation, setBulkOperation] = React.useState(null);
    const [bulkDeleteConfirm, setBulkDeleteConfirm] = React.useState(false);
    const handleToggleExpanded = () => {
        setIsExpanded((prev) => {
            const next = !prev;
            // Clear selection when collapsing so hidden items can't be bulk-acted later.
            if (!next) {
                setSelectedIds(new Set());
                setLastClickedId(null);
                setBulkDeleteConfirm(false);
            }
            return next;
        });
    };
    // Cost data with optimistic caching - shows cached costs immediately, fetches fresh in background
    const workspaceIds = React.useMemo(() => workspaces.map((w) => w.id), [workspaces]);
    // Memoize fetchBatch so the hook doesn't refetch on every local state change.
    const fetchWorkspaceCosts = React.useCallback(async (ids) => {
        if (!api)
            return {};
        const usageData = await api.workspace.getSessionUsageBatch({ workspaceIds: ids });
        // Compute costs from usage data and return as record
        const costs = {};
        for (const id of ids) {
            costs[id] = getSessionTotalCost(usageData[id]);
        }
        return costs;
    }, [api]);
    const { values: costsByWorkspace, status: costsStatus } = useOptimisticBatchLRU({
        keys: workspaceIds,
        cache: sessionCostCache,
        skip: !api,
        fetchBatch: fetchWorkspaceCosts,
    });
    const costsLoading = costsStatus === "idle" || costsStatus === "loading";
    // Filter workspaces by search query (frontend-only)
    const filteredWorkspaces = searchQuery.trim()
        ? workspaces.filter((ws) => {
            const query = searchQuery.toLowerCase();
            const title = (ws.title ?? ws.name).toLowerCase();
            const name = ws.name.toLowerCase();
            return title.includes(query) || name.includes(query);
        })
        : workspaces;
    // Group filtered workspaces by time period
    const groupedWorkspaces = groupByTimePeriod(filteredWorkspaces);
    const flatWorkspaces = flattenGrouped(groupedWorkspaces);
    // Calculate total cost and per-period costs from cached/fetched values
    const totalCost = React.useMemo(() => {
        let sum = 0;
        let hasCost = false;
        for (const ws of workspaces) {
            const cost = costsByWorkspace[ws.id];
            if (cost !== undefined) {
                sum += cost;
                hasCost = true;
            }
        }
        return hasCost ? sum : undefined;
    }, [workspaces, costsByWorkspace]);
    const periodCosts = React.useMemo(() => {
        const costs = new Map();
        for (const [period, periodWorkspaces] of groupedWorkspaces) {
            let sum = 0;
            let hasCost = false;
            for (const ws of periodWorkspaces) {
                const cost = costsByWorkspace[ws.id];
                if (cost !== undefined) {
                    sum += cost;
                    hasCost = true;
                }
            }
            costs.set(period, hasCost ? sum : undefined);
        }
        return costs;
    }, [groupedWorkspaces, costsByWorkspace]);
    // workspaces prop should already be filtered to archived only
    if (workspaces.length === 0) {
        return null;
    }
    // Handle checkbox click with shift-click range selection
    const handleCheckboxClick = (workspaceId, event) => {
        const isShiftClick = event.shiftKey;
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (isShiftClick && lastClickedId) {
                // Range selection
                const lastIndex = flatWorkspaces.findIndex((w) => w.id === lastClickedId);
                const currentIndex = flatWorkspaces.findIndex((w) => w.id === workspaceId);
                if (lastIndex !== -1 && currentIndex !== -1) {
                    const start = Math.min(lastIndex, currentIndex);
                    const end = Math.max(lastIndex, currentIndex);
                    for (let i = start; i <= end; i++) {
                        next.add(flatWorkspaces[i].id);
                    }
                }
            }
            else {
                // Toggle single selection
                if (next.has(workspaceId)) {
                    next.delete(workspaceId);
                }
                else {
                    next.add(workspaceId);
                }
            }
            return next;
        });
        setLastClickedId(workspaceId);
        setBulkDeleteConfirm(false); // Clear confirmation when selection changes
    };
    // Select/deselect all filtered workspaces
    const handleSelectAll = () => {
        const allFilteredIds = new Set(filteredWorkspaces.map((w) => w.id));
        const allSelected = filteredWorkspaces.every((w) => selectedIds.has(w.id));
        if (allSelected) {
            // Deselect all filtered
            setSelectedIds((prev) => {
                const next = new Set(prev);
                for (const id of allFilteredIds) {
                    next.delete(id);
                }
                return next;
            });
        }
        else {
            // Select all filtered
            setSelectedIds((prev) => new Set([...prev, ...allFilteredIds]));
        }
        setBulkDeleteConfirm(false); // Clear confirmation when selection changes
    };
    // Bulk restore
    const handleBulkRestore = async () => {
        const idsToRestore = Array.from(selectedIds);
        setBulkOperation({
            type: "restore",
            total: idsToRestore.length,
            completed: 0,
            current: null,
            errors: [],
        });
        for (let i = 0; i < idsToRestore.length; i++) {
            const id = idsToRestore[i];
            const ws = workspaces.find((w) => w.id === id);
            setBulkOperation((prev) => (prev ? { ...prev, current: ws?.title ?? ws?.name ?? id } : prev));
            try {
                const result = await unarchiveWorkspace(id);
                if (!result.success) {
                    setBulkOperation((prev) => prev
                        ? {
                            ...prev,
                            errors: [
                                ...prev.errors,
                                `Failed to restore ${ws?.name ?? id}${result.error ? `: ${result.error}` : ""}`,
                            ],
                        }
                        : prev);
                }
            }
            catch {
                setBulkOperation((prev) => prev ? { ...prev, errors: [...prev.errors, `Failed to restore ${ws?.name ?? id}`] } : prev);
            }
            setBulkOperation((prev) => (prev ? { ...prev, completed: i + 1 } : prev));
        }
        setSelectedIds(new Set());
        onWorkspacesChanged?.();
    };
    // Bulk delete (always force: true) - requires confirmation
    const handleBulkDelete = async () => {
        setBulkDeleteConfirm(false);
        const idsToDelete = Array.from(selectedIds);
        setBulkOperation({
            type: "delete",
            total: idsToDelete.length,
            completed: 0,
            current: null,
            errors: [],
        });
        for (let i = 0; i < idsToDelete.length; i++) {
            const id = idsToDelete[i];
            const ws = workspaces.find((w) => w.id === id);
            setBulkOperation((prev) => (prev ? { ...prev, current: ws?.title ?? ws?.name ?? id } : prev));
            try {
                const result = await removeWorkspace(id, { force: true });
                if (!result.success) {
                    setBulkOperation((prev) => prev
                        ? {
                            ...prev,
                            errors: [
                                ...prev.errors,
                                `Failed to delete ${ws?.name ?? id}${result.error ? `: ${result.error}` : ""}`,
                            ],
                        }
                        : prev);
                }
            }
            catch {
                setBulkOperation((prev) => prev ? { ...prev, errors: [...prev.errors, `Failed to delete ${ws?.name ?? id}`] } : prev);
            }
            setBulkOperation((prev) => (prev ? { ...prev, completed: i + 1 } : prev));
        }
        setSelectedIds(new Set());
        onWorkspacesChanged?.();
    };
    const handleUnarchive = async (workspaceId) => {
        setProcessingIds((prev) => new Set(prev).add(workspaceId));
        try {
            const result = await unarchiveWorkspace(workspaceId);
            if (result.success) {
                // Select the workspace after unarchiving
                const workspace = workspaces.find((w) => w.id === workspaceId);
                if (workspace) {
                    setSelectedWorkspace({
                        workspaceId: workspace.id,
                        projectPath: workspace.projectPath,
                        projectName: workspace.projectName,
                        namedWorkspacePath: workspace.namedWorkspacePath,
                    });
                }
                onWorkspacesChanged?.();
            }
        }
        finally {
            setProcessingIds((prev) => {
                const next = new Set(prev);
                next.delete(workspaceId);
                return next;
            });
        }
    };
    const handleDelete = async (workspaceId) => {
        setProcessingIds((prev) => new Set(prev).add(workspaceId));
        try {
            const result = await removeWorkspace(workspaceId);
            if (result.success) {
                onWorkspacesChanged?.();
            }
            else {
                setForceDeleteModal({
                    workspaceId,
                    error: result.error ?? "Failed to remove workspace",
                });
            }
        }
        finally {
            setProcessingIds((prev) => {
                const next = new Set(prev);
                next.delete(workspaceId);
                return next;
            });
        }
    };
    const hasSelection = selectedIds.size > 0;
    const allFilteredSelected = filteredWorkspaces.length > 0 && filteredWorkspaces.every((w) => selectedIds.has(w.id));
    return (_jsxs(_Fragment, { children: [_jsx(ForceDeleteModal, { isOpen: forceDeleteModal !== null, workspaceId: forceDeleteModal?.workspaceId ?? "", error: forceDeleteModal?.error ?? "", onClose: () => setForceDeleteModal(null), onForceDelete: async (workspaceId) => {
                    const result = await removeWorkspace(workspaceId, { force: true });
                    if (!result.success) {
                        throw new Error(result.error ?? "Force delete failed");
                    }
                    onWorkspacesChanged?.();
                } }), bulkOperation && (_jsx(BulkProgressModal, { operation: bulkOperation, onClose: () => setBulkOperation(null) })), _jsxs("div", { className: "border-border rounded-lg border", children: [_jsxs("div", { className: "flex items-center gap-2 px-4 py-3", children: [_jsx("button", { type: "button", onClick: handleToggleExpanded, className: "text-muted hover:text-foreground rounded p-1 transition-colors hover:bg-white/10", "aria-label": isExpanded ? "Collapse archived workspaces" : "Expand archived workspaces", "aria-expanded": isExpanded, "aria-controls": archivedRegionId, children: isExpanded ? (_jsx(ChevronDown, { className: "h-4 w-4" })) : (_jsx(ChevronRight, { className: "h-4 w-4" })) }), _jsx(ArchiveIcon, { className: "text-muted h-4 w-4" }), _jsxs("span", { className: "text-foreground font-medium", children: ["Archived Workspaces (", workspaces.length, ")"] }), _jsx(CostBadge, { cost: totalCost, loading: costsLoading, size: "lg" }), _jsx("span", { className: "flex-1" }), isExpanded && hasSelection && (_jsxs("div", { className: "flex items-center gap-2", children: [_jsxs("span", { className: "text-muted text-xs", children: [selectedIds.size, " selected"] }), bulkDeleteConfirm ? (_jsxs(_Fragment, { children: [_jsx("span", { className: "text-muted text-xs", children: "Delete permanently (also deletes local branches)?" }), _jsxs("button", { onClick: () => void handleBulkDelete(), className: "rounded bg-red-600 px-2 py-0.5 text-xs text-white hover:bg-red-700", children: ["Yes, delete ", selectedIds.size] }), _jsx("button", { onClick: () => setBulkDeleteConfirm(false), className: "text-muted hover:text-foreground text-xs", children: "Cancel" })] })) : (_jsxs(_Fragment, { children: [_jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("button", { onClick: () => void handleBulkRestore(), className: "text-muted hover:text-foreground rounded p-1 transition-colors hover:bg-white/10", "aria-label": "Restore selected", children: _jsx(ArchiveRestoreIcon, { className: "h-4 w-4" }) }) }), _jsx(TooltipContent, { children: "Restore selected" })] }), _jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("button", { onClick: () => setBulkDeleteConfirm(true), className: "text-muted rounded p-1 transition-colors hover:bg-white/10 hover:text-red-400", "aria-label": "Delete selected", children: _jsx(Trash2, { className: "h-4 w-4" }) }) }), _jsx(TooltipContent, { children: "Delete selected permanently (local branches too)" })] }), _jsx("button", { onClick: () => setSelectedIds(new Set()), className: "text-muted hover:text-foreground ml-1 text-xs", children: "Clear" })] }))] }))] }), isExpanded && (_jsxs("div", { id: archivedRegionId, role: "region", "aria-label": "Archived workspaces", className: "border-border border-t", children: [workspaces.length > 1 && (_jsxs("div", { className: "border-border flex items-center gap-2 border-b px-4 py-2", children: [_jsx("input", { type: "checkbox", checked: allFilteredSelected, onChange: handleSelectAll, className: "h-4 w-4 rounded border-gray-600 bg-transparent", "aria-label": "Select all" }), workspaces.length > 3 && (_jsxs("div", { className: "relative flex-1", children: [_jsx(Search, { className: "text-muted pointer-events-none absolute top-1/2 left-2 h-4 w-4 -translate-y-1/2" }), _jsx("input", { type: "text", placeholder: "Search archived workspaces or branches...", value: searchQuery, onChange: (e) => setSearchQuery(e.target.value), className: "bg-bg-dark placeholder:text-muted text-foreground focus:border-border-light w-full rounded border border-transparent py-1.5 pr-3 pl-8 text-sm focus:outline-none" })] }))] })), _jsx("div", { children: filteredWorkspaces.length === 0 ? (_jsxs("div", { className: "text-muted px-4 py-6 text-center text-sm", children: ["No workspaces match ", `"${searchQuery}"`] })) : (Array.from(groupedWorkspaces.entries()).map(([period, periodWorkspaces]) => (_jsxs("div", { children: [_jsxs("div", { className: "bg-bg-dark text-muted flex items-center gap-2 px-4 py-1.5 text-xs font-medium", children: [_jsx("span", { children: period }), _jsx(CostBadge, { cost: periodCosts.get(period), loading: costsLoading })] }), periodWorkspaces.map((workspace) => {
                                            const isProcessing = processingIds.has(workspace.id) || workspace.isRemoving;
                                            const isSelected = selectedIds.has(workspace.id);
                                            const workspaceNameForTooltip = workspace.title && workspace.title !== workspace.name
                                                ? workspace.name
                                                : undefined;
                                            const displayTitle = workspace.title ?? workspace.name;
                                            return (_jsxs("div", { className: cn("border-border flex items-center gap-3 border-b px-4 py-2.5 last:border-b-0", isProcessing && "opacity-50", isSelected && "bg-white/5"), children: [_jsx("input", { type: "checkbox", checked: isSelected, onClick: (e) => handleCheckboxClick(workspace.id, e), onChange: () => undefined, className: "h-4 w-4 rounded border-gray-600 bg-transparent", "aria-label": `Select ${displayTitle}` }), _jsx(RuntimeBadge, { runtimeConfig: workspace.runtimeConfig, isWorking: false, workspacePath: workspace.namedWorkspacePath, workspaceName: workspaceNameForTooltip }), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsx("div", { className: "text-foreground truncate text-sm font-medium", children: displayTitle }), _jsxs("div", { className: "flex items-center gap-2", children: [workspace.archivedAt && (_jsx("span", { className: "text-muted text-xs", children: new Date(workspace.archivedAt).toLocaleString(undefined, {
                                                                            month: "short",
                                                                            day: "numeric",
                                                                            hour: "numeric",
                                                                            minute: "2-digit",
                                                                        }) })), _jsx(CostBadge, { cost: costsByWorkspace[workspace.id], loading: costsLoading, size: "sm" })] })] }), _jsxs("div", { className: "flex items-center gap-1", children: [_jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("button", { onClick: () => void handleUnarchive(workspace.id), disabled: isProcessing, className: "text-muted hover:text-foreground rounded p-1.5 transition-colors hover:bg-white/10 disabled:opacity-50", "aria-label": `Restore workspace ${displayTitle}`, children: _jsx(ArchiveRestoreIcon, { className: "h-4 w-4" }) }) }), _jsx(TooltipContent, { children: "Restore to sidebar" })] }), _jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("button", { onClick: () => void handleDelete(workspace.id), disabled: isProcessing, className: "text-muted rounded p-1.5 transition-colors hover:bg-white/10 hover:text-red-400 disabled:opacity-50", "aria-label": `Delete workspace ${displayTitle}`, children: isProcessing ? (_jsx(Loader2, { className: "h-4 w-4 animate-spin" })) : (_jsx(Trash2, { className: "h-4 w-4" })) }) }), _jsx(TooltipContent, { children: "Delete permanently (local branch too)" })] })] })] }, workspace.id));
                                        })] }, period)))) })] }))] })] }));
};
//# sourceMappingURL=ArchivedWorkspaces.js.map