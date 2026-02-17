import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useMemo, useState } from "react";
import { ChevronRight, FileText, ExternalLink, Eye, EyeOff, Info } from "lucide-react";
import { usePersistedState } from "@/browser/hooks/usePersistedState";
import { useOpenInEditor } from "@/browser/hooks/useOpenInEditor";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/browser/components/ui/tooltip";
import { PlanFileDialog } from "./PlanFileDialog";
/** Extract just the filename from a full path */
function getFileName(filePath) {
    return filePath.split("/").pop() ?? filePath;
}
/**
 * Displays what context will be injected after compaction.
 * Collapsible section in the right sidebar below the context usage bar.
 */
export const PostCompactionSection = (props) => {
    const openInEditor = useOpenInEditor();
    const [collapsed, setCollapsed] = usePersistedState("postCompaction:collapsed", true);
    const [filesExpanded, setFilesExpanded] = usePersistedState("postCompaction:filesExpanded", false);
    const [isPlanDialogOpen, setIsPlanDialogOpen] = useState(false);
    const handleOpenPlan = (e) => {
        e.stopPropagation();
        if (!props.planPath)
            return;
        void openInEditor(props.workspaceId, props.planPath, props.runtimeConfig, { isFile: true });
    };
    // Derive values from props
    const planExists = props.planPath !== null;
    const trackedFilesCount = props.trackedFilePaths.length;
    const isPlanExcluded = props.excludedItems.has("plan");
    // Format file names for display - show just filename, with parent dir if duplicates
    const formattedFiles = useMemo(() => {
        const nameCount = new Map();
        props.trackedFilePaths.forEach((p) => {
            const name = getFileName(p);
            nameCount.set(name, (nameCount.get(name) ?? 0) + 1);
        });
        return props.trackedFilePaths.map((fullPath) => {
            const name = getFileName(fullPath);
            const needsContext = (nameCount.get(name) ?? 0) > 1;
            const parts = fullPath.split("/");
            const displayName = needsContext && parts.length > 1 ? parts.slice(-2).join("/") : name;
            const itemId = `file:${fullPath}`;
            const isExcluded = props.excludedItems.has(itemId);
            return { fullPath, displayName, itemId, isExcluded };
        });
    }, [props.trackedFilePaths, props.excludedItems]);
    // Count how many items are included (not excluded)
    const includedFilesCount = formattedFiles.filter((f) => !f.isExcluded).length;
    // Don't render if nothing will be injected
    if (!planExists && trackedFilesCount === 0) {
        return null;
    }
    return (_jsxs("div", { className: "border-border-light mt-4 border-t pt-4", children: [_jsxs("button", { onClick: () => setCollapsed((prev) => !prev), className: "flex w-full items-center justify-between text-left", type: "button", children: [_jsxs("div", { className: "flex items-center gap-1.5", children: [_jsx("span", { className: "text-muted text-xs font-medium", children: "Artifacts" }), _jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("span", { className: "text-muted hover:text-foreground inline-flex items-center", children: _jsx(Info, { className: "h-3 w-3" }) }) }), _jsx(TooltipContent, { side: "top", showArrow: false, children: "After compaction, included artifacts in this list (plan + selected file diffs) are attached to your next message so the agent keeps important earlier context." })] })] }), _jsx(ChevronRight, { className: `text-muted h-3.5 w-3.5 transition-transform duration-200 ${collapsed ? "" : "rotate-90"}` })] }), !collapsed && (_jsxs("div", { className: "mt-2 flex flex-col gap-2", children: [planExists && props.planPath && (_jsxs(_Fragment, { children: [_jsxs("div", { className: `flex items-center gap-1 ${isPlanExcluded ? "opacity-50" : ""}`, children: [_jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("button", { onClick: () => void props.onToggleExclusion("plan"), className: "text-subtle hover:text-foreground p-0.5 transition-colors", type: "button", children: isPlanExcluded ? (_jsx(EyeOff, { className: "h-3 w-3" })) : (_jsx(Eye, { className: "h-3 w-3" })) }) }), _jsx(TooltipContent, { side: "top", showArrow: false, children: isPlanExcluded ? "Include in context" : "Exclude from context" })] }), _jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsxs("button", { onClick: () => setIsPlanDialogOpen(true), className: `text-subtle hover:text-foreground flex items-center gap-2 text-left text-xs transition-colors ${isPlanExcluded ? "line-through" : ""}`, type: "button", children: [_jsx(FileText, { className: "h-3.5 w-3.5" }), _jsx("span", { children: "Plan file" })] }) }), _jsx(TooltipContent, { side: "top", showArrow: false, children: "View plan" })] }), _jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("button", { onClick: handleOpenPlan, className: "text-subtle hover:text-foreground p-0.5 transition-colors", type: "button", children: _jsx(ExternalLink, { className: "h-3 w-3" }) }) }), _jsx(TooltipContent, { side: "top", showArrow: false, children: "Open in editor" })] })] }), _jsx(PlanFileDialog, { open: isPlanDialogOpen, onOpenChange: setIsPlanDialogOpen, workspaceId: props.workspaceId })] })), trackedFilesCount > 0 && (_jsxs("div", { className: "flex flex-col", children: [_jsxs("div", { className: "flex items-center gap-1", children: [_jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("button", { onClick: (e) => {
                                                        e.stopPropagation();
                                                        // Toggle all files: if any included, exclude all; otherwise include all
                                                        const shouldExclude = includedFilesCount > 0;
                                                        void (async () => {
                                                            for (const file of formattedFiles) {
                                                                if (shouldExclude !== file.isExcluded) {
                                                                    await props.onToggleExclusion(file.itemId);
                                                                }
                                                            }
                                                        })();
                                                    }, className: "text-subtle hover:text-foreground p-0.5 transition-colors", type: "button", children: includedFilesCount === 0 ? (_jsx(EyeOff, { className: "h-3 w-3" })) : (_jsx(Eye, { className: "h-3 w-3" })) }) }), _jsx(TooltipContent, { side: "top", showArrow: false, children: includedFilesCount === 0 ? "Include all files" : "Exclude all files" })] }), _jsxs("button", { onClick: () => setFilesExpanded((prev) => !prev), className: "text-subtle hover:text-foreground flex items-center gap-2 text-left text-xs transition-colors", type: "button", children: [_jsx(ChevronRight, { className: `h-3 w-3 transition-transform duration-200 ${filesExpanded ? "rotate-90" : ""}` }), _jsxs("span", { children: [includedFilesCount, "/", trackedFilesCount, " file diff", trackedFilesCount !== 1 ? "s" : ""] })] })] }), filesExpanded && formattedFiles.length > 0 && (_jsx("div", { className: "mt-1 ml-5 flex flex-col gap-0.5", children: formattedFiles.map((file) => (_jsxs("div", { className: `flex items-center gap-1 ${file.isExcluded ? "opacity-50" : ""}`, children: [_jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("button", { onClick: () => void props.onToggleExclusion(file.itemId), className: "text-subtle hover:text-foreground p-0.5 transition-colors", type: "button", children: file.isExcluded ? (_jsx(EyeOff, { className: "h-2.5 w-2.5" })) : (_jsx(Eye, { className: "h-2.5 w-2.5" })) }) }), _jsx(TooltipContent, { side: "top", showArrow: false, children: file.isExcluded ? "Include in context" : "Exclude from context" })] }), _jsx("span", { className: `text-muted text-[10px] ${file.isExcluded ? "line-through" : ""}`, children: file.displayName })] }, file.fullPath))) }))] })), _jsx("p", { className: "text-muted mt-1 text-[10px] italic", children: "Keeps agent aligned with your plan and prior edits" })] }))] }));
};
//# sourceMappingURL=PostCompactionSection.js.map