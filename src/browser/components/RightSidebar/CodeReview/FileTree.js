import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { extractNewPath } from "@/common/utils/git/numstatParser";
import { usePersistedState } from "@/browser/hooks/usePersistedState";
import { getFileTreeExpandStateKey, REVIEW_FILE_TREE_VIEW_MODE_KEY, } from "@/common/constants/storage";
import { cn } from "@/common/lib/utils";
import { ToggleGroup } from "@/browser/components/ToggleGroup";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/browser/components/ui/tooltip";
import { FileIcon } from "@/browser/components/FileIcon";
/**
 * Compute read status for a directory by recursively checking all descendant files
 * Returns "fully-read" if all files are fully read, "unknown" if any file has unknown status, null otherwise
 */
function computeDirectoryReadStatus(node, getFileReadStatus) {
    if (!node.isDirectory || !getFileReadStatus)
        return null;
    let hasUnknown = false;
    let fileCount = 0;
    let fullyReadCount = 0;
    const checkNode = (n) => {
        if (n.isDirectory) {
            // Recurse into children
            n.children.forEach(checkNode);
        }
        else {
            // Check file status
            fileCount++;
            const status = getFileReadStatus(extractNewPath(n.path));
            if (status === null) {
                // Some diff entries (renames, binary changes, mode-only edits) have no hunks.
                // Only treat this as "unknown" when numstat indicates there's actual +/− content.
                if ((n.stats?.additions ?? 0) > 0 || (n.stats?.deletions ?? 0) > 0) {
                    hasUnknown = true;
                }
            }
            else if (status.read === status.total && status.total > 0) {
                fullyReadCount++;
            }
        }
    };
    checkNode(node);
    // If any file has unknown state, directory is unknown
    if (hasUnknown)
        return "unknown";
    // If all files are fully read, directory is fully read
    if (fileCount > 0 && fullyReadCount === fileCount)
        return "fully-read";
    // Otherwise, directory has partial/no read state
    return null;
}
function getFileChangeBadge(changeType, oldPath) {
    switch (changeType) {
        case "added":
            return { label: "A", className: "text-success-light", title: "Added" };
        case "deleted":
            return { label: "D", className: "text-danger", title: "Deleted" };
        case "renamed":
            return {
                label: "R",
                className: "text-muted",
                title: oldPath ? `Renamed from ${oldPath}` : "Renamed",
            };
        case "modified":
            return {
                label: "M",
                className: "text-warning-light",
                title: "Modified",
            };
    }
}
const FILE_TREE_VIEW_MODE_OPTIONS = [
    { value: "structured", label: "Structured" },
    { value: "flat", label: "Flat" },
];
function collectLeafFileNodes(node) {
    if (!node.isDirectory) {
        return [node];
    }
    const files = [];
    for (const child of node.children) {
        files.push(...collectLeafFileNodes(child));
    }
    return files;
}
const TreeNodeContent = ({ node, depth, fileLabelMode = "name", selectedPath, onSelectFile, getFileReadStatus, expandStateMap, setExpandStateMap, }) => {
    // Check if user has manually set expand state for this directory
    const hasManualState = node.path in expandStateMap;
    const isOpen = hasManualState ? expandStateMap[node.path] : depth < 2; // Default: auto-expand first 2 levels
    const setIsOpen = (open) => {
        setExpandStateMap((prev) => ({
            ...prev,
            [node.path]: open,
        }));
    };
    const handleClick = (e) => {
        if (node.isDirectory) {
            // Check if clicked on the toggle icon area (first 20px)
            const target = e.target;
            const isToggleClick = target.closest("[data-toggle]");
            if (isToggleClick) {
                // Just toggle expansion
                setIsOpen(!isOpen);
            }
            else {
                // Clicking on folder name/stats selects the folder for filtering
                // Use full path (with prefix) for selection
                onSelectFile(selectedPath === node.path ? null : node.path);
            }
        }
        else {
            // Toggle selection: if already selected, clear filter
            // Use full path (with prefix) for selection
            onSelectFile(selectedPath === node.path ? null : node.path);
        }
    };
    const handleToggleClick = (e) => {
        e.stopPropagation();
        setIsOpen(!isOpen);
    };
    const canonicalFilePath = node.isDirectory ? node.path : extractNewPath(node.path);
    const fallbackFileName = canonicalFilePath.split("/").pop() ?? "";
    const fileDirPath = canonicalFilePath.split("/").slice(0, -1).join("/");
    const fileNameForIcon = fallbackFileName;
    const isSelected = selectedPath === node.path;
    const changeType = !node.isDirectory ? (node.stats?.changeType ?? "modified") : null;
    const isDeletedFile = changeType === "deleted";
    const isRenamedFile = changeType === "renamed" && !!node.stats?.oldPath;
    const oldFileName = node.stats?.oldPath?.split("/").pop() ?? node.stats?.oldPath ?? "";
    const shouldShowRenameArrow = isRenamedFile && oldFileName !== fallbackFileName;
    // Compute read status for files and directories
    let isFullyRead = false;
    let isUnknownState = false;
    if (node.isDirectory) {
        const dirStatus = computeDirectoryReadStatus(node, getFileReadStatus);
        isFullyRead = dirStatus === "fully-read";
        isUnknownState = dirStatus === "unknown";
    }
    else if (getFileReadStatus) {
        const readStatus = getFileReadStatus(canonicalFilePath);
        isFullyRead = readStatus ? readStatus.read === readStatus.total && readStatus.total > 0 : false;
        // Some diff entries (renames, binary changes, mode-only edits) have no hunks.
        // Only treat this as "unknown" when numstat indicates there's actual +/− content.
        isUnknownState =
            readStatus === null && ((node.stats?.additions ?? 0) > 0 || (node.stats?.deletions ?? 0) > 0);
    }
    const iconOpacity = isFullyRead ? 0.45 : isUnknownState && !isFullyRead ? 0.7 : 1;
    const fileChangeBadge = !node.isDirectory && node.stats
        ? getFileChangeBadge(node.stats.changeType ?? "modified", node.stats.oldPath)
        : null;
    const fileLabelTitle = !node.isDirectory && fileLabelMode === "path"
        ? isRenamedFile
            ? `${node.stats?.oldPath ?? ""} -> ${canonicalFilePath}`
            : canonicalFilePath
        : undefined;
    return (_jsxs(_Fragment, { children: [_jsx("div", { className: cn("cursor-pointer select-none flex items-center gap-1.5 rounded py-0.5 px-1.5", isSelected ? "bg-code-keyword-overlay" : "bg-transparent hover:bg-white/5"), style: { paddingLeft: `${depth * 12 + 4}px` }, onClick: handleClick, children: node.isDirectory ? (_jsxs(_Fragment, { children: [_jsx("span", { className: "text-muted inline-flex h-3 w-3 shrink-0 items-center justify-center text-[8px] transition-transform duration-200", style: { transform: isOpen ? "rotate(90deg)" : "rotate(0deg)" }, "data-toggle": true, onClick: handleToggleClick, children: "\u25B6" }), _jsx("span", { className: cn("flex-1", isFullyRead &&
                                "text-dim line-through [text-decoration-color:var(--color-read)] [text-decoration-thickness:2px]", isUnknownState && !isFullyRead && "text-dim", !isFullyRead && !isUnknownState && "text-muted"), children: node.name || "/" }), node.totalStats &&
                            (node.totalStats.additions > 0 || node.totalStats.deletions > 0) && (_jsxs("span", { className: "flex gap-2 text-[11px] opacity-70", style: { color: isOpen ? "var(--color-dim)" : "inherit" }, children: [node.totalStats.additions > 0 &&
                                    (isOpen ? (_jsxs("span", { children: ["+", node.totalStats.additions] })) : (_jsxs("span", { className: "text-success-light", children: ["+", node.totalStats.additions] }))), node.totalStats.deletions > 0 &&
                                    (isOpen ? (_jsxs("span", { children: ["-", node.totalStats.deletions] })) : (_jsxs("span", { className: "text-warning-light", children: ["-", node.totalStats.deletions] })))] }))] })) : (_jsxs(_Fragment, { children: [_jsx(FileIcon, { fileName: fileNameForIcon, filePath: node.path, className: "shrink-0", style: { opacity: iconOpacity } }), _jsx("span", { className: cn("flex-1", fileLabelMode === "path" && "min-w-0", isDeletedFile && "line-through", isFullyRead &&
                                "text-dim line-through [text-decoration-color:var(--color-read)] [text-decoration-thickness:2px]", isUnknownState && !isFullyRead && "text-dim", !isFullyRead && !isUnknownState && "text-foreground"), title: fileLabelTitle, children: fileLabelMode === "path" ? (_jsxs("span", { className: "flex min-w-0 items-baseline gap-2", children: [_jsx("span", { className: cn("min-w-0 truncate", fileDirPath && "max-w-[60%]"), children: shouldShowRenameArrow ? (_jsxs(_Fragment, { children: [_jsx("span", { className: "text-muted", children: oldFileName }), _jsx("span", { className: "text-muted", children: " -> " }), _jsx("span", { children: fallbackFileName })] })) : (fallbackFileName) }), fileDirPath ? (_jsx("span", { className: "text-muted min-w-0 flex-1 truncate", children: fileDirPath })) : null] })) : shouldShowRenameArrow ? (_jsxs(_Fragment, { children: [_jsx("span", { className: "text-muted", children: oldFileName }), _jsx("span", { className: "text-muted", children: " -> " }), _jsx("span", { children: fallbackFileName })] })) : (node.name) }), _jsxs("span", { className: "ml-auto flex items-center gap-2 text-[11px]", children: [node.stats?.additions ? (_jsxs("span", { className: "text-success-light", children: ["+", node.stats.additions] })) : null, node.stats?.deletions ? (_jsxs("span", { className: "text-warning-light", children: ["-", node.stats.deletions] })) : null, fileChangeBadge ? (_jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("span", { className: cn("shrink-0 font-semibold", fileChangeBadge.className), style: { opacity: iconOpacity }, children: fileChangeBadge.label }) }), _jsx(TooltipContent, { side: "left", align: "center", children: fileChangeBadge.title })] })) : null] })] })) }), node.isDirectory &&
                isOpen &&
                node.children.map((child) => (_jsx(TreeNodeContent, { node: child, depth: depth + 1, fileLabelMode: fileLabelMode, selectedPath: selectedPath, onSelectFile: onSelectFile, getFileReadStatus: getFileReadStatus, expandStateMap: expandStateMap, setExpandStateMap: setExpandStateMap }, child.path)))] }));
};
export const FileTree = ({ root, selectedPath, onSelectFile, isLoading = false, getFileReadStatus, workspaceId, }) => {
    // Use persisted state for expand/collapse per workspace (lifted to parent to avoid O(n) re-renders)
    const [expandStateMap, setExpandStateMap] = usePersistedState(getFileTreeExpandStateKey(workspaceId), {}, { listener: true });
    const [viewMode, setViewMode] = usePersistedState(REVIEW_FILE_TREE_VIEW_MODE_KEY, "structured", { listener: true });
    // Extract display name for filter indicator
    const filterDisplayName = selectedPath ? (selectedPath.split("/").pop() ?? selectedPath) : null;
    return (_jsxs(_Fragment, { children: [_jsxs("div", { className: "border-border-light text-muted font-primary flex items-center gap-2 border-b px-2 py-1 text-[11px]", children: [_jsx("span", { children: "Files" }), _jsxs("div", { className: "ml-auto flex items-center gap-2", children: [_jsx("div", { "data-testid": "review-file-tree-view-mode", children: _jsx(ToggleGroup, { options: FILE_TREE_VIEW_MODE_OPTIONS, value: viewMode, onChange: (mode) => setViewMode(mode) }) }), selectedPath && (_jsxs("button", { className: "bg-code-keyword-overlay text-foreground hover:bg-code-keyword-overlay/80 flex cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 text-[10px] transition-colors", onClick: () => onSelectFile(null), title: `Filtering: ${selectedPath}\nClick to clear`, children: [_jsx("span", { className: "max-w-[120px] truncate", children: filterDisplayName }), _jsx("span", { className: "text-muted", children: "\u2715" })] }))] })] }), _jsx("div", { className: "font-monospace min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-1 py-1 text-[11px]", "data-testid": "review-file-tree", children: isLoading && !root ? (_jsx("div", { className: "text-muted py-5 text-center", children: "Loading file tree..." })) : root ? (viewMode === "flat" ? (collectLeafFileNodes(root).map((fileNode) => (_jsx(TreeNodeContent, { node: fileNode, depth: 0, fileLabelMode: "path", selectedPath: selectedPath, onSelectFile: onSelectFile, getFileReadStatus: getFileReadStatus, expandStateMap: expandStateMap, setExpandStateMap: setExpandStateMap }, fileNode.path)))) : (root.children.map((child) => (_jsx(TreeNodeContent, { node: child, depth: 0, selectedPath: selectedPath, onSelectFile: onSelectFile, getFileReadStatus: getFileReadStatus, expandStateMap: expandStateMap, setExpandStateMap: setExpandStateMap }, child.path))))) : (_jsx("div", { className: "text-muted py-5 text-center", children: "No files changed" })) })] }));
};
//# sourceMappingURL=FileTree.js.map