import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * HunkViewer - Displays a single diff hunk with syntax highlighting
 * Includes read-more feature to expand context above/below the hunk.
 */
import React, { useState, useMemo } from "react";
import { Check, Circle } from "lucide-react";
import { SelectableDiffRenderer } from "../../shared/DiffRenderer";
import { highlightSearchInText, } from "@/browser/utils/highlighting/highlightSearchTerms";
import { Tooltip, TooltipTrigger, TooltipContent } from "../../ui/tooltip";
import { usePersistedState } from "@/browser/hooks/usePersistedState";
import { getReviewExpandStateKey } from "@/common/constants/storage";
import { KEYBINDS, formatKeybind } from "@/browser/utils/ui/keybinds";
import { formatRelativeTime } from "@/browser/utils/ui/dateTime";
import { cn } from "@/common/lib/utils";
import { ContextCollapseIndicator } from "./ContextCollapseIndicator";
import { useReadMore } from "./useReadMore";
export const HunkViewer = React.memo(({ hunk, hunkId, workspaceId, inlineReviews, isSelected, isRead = false, firstSeenAt, onClick, onToggleRead, onRegisterToggleExpand, onReviewNote, searchConfig, onComposingChange, diffBase, reviewActions, includeUncommitted, onOpenFile, }) => {
    // Ref for the hunk container to track visibility
    const hunkRef = React.useRef(null);
    // Track if hunk is visible in viewport for lazy syntax highlighting
    // Use ref for visibility to avoid re-renders when visibility changes
    // Start as not visible to avoid eagerly highlighting off-screen hunks
    const isVisibleRef = React.useRef(false);
    const [isVisible, setIsVisible] = React.useState(false);
    // Use IntersectionObserver to track visibility
    React.useEffect(() => {
        const element = hunkRef.current;
        if (!element)
            return;
        // Create observer with generous root margin for pre-loading
        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                const newVisibility = entry.isIntersecting;
                // Only trigger re-render if transitioning from not-visible to visible
                // (to start highlighting). Transitions from visible to not-visible don't
                // need re-render because we cache the highlighting result.
                if (newVisibility && !isVisibleRef.current) {
                    isVisibleRef.current = true;
                    setIsVisible(true);
                }
                else if (!newVisibility && isVisibleRef.current) {
                    isVisibleRef.current = false;
                    // Don't update state when going invisible - keeps highlighted version
                }
            });
        }, {
            rootMargin: "600px", // Pre-load hunks 600px before they enter viewport
        });
        observer.observe(element);
        return () => {
            observer.disconnect();
        };
    }, []);
    // Parse diff lines (memoized - only recompute if hunk.content changes)
    // Must be done before state initialization to determine initial collapse state
    const { lineCount, additions, deletions, isLargeHunk } = React.useMemo(() => {
        const lines = hunk.content.split("\n").filter((line) => line.length > 0);
        const count = lines.length;
        return {
            lineCount: count,
            additions: lines.filter((line) => line.startsWith("+")).length,
            deletions: lines.filter((line) => line.startsWith("-")).length,
            isLargeHunk: count > 200, // Memoize to prevent useEffect re-runs
        };
    }, [hunk.content]);
    // Highlight filePath if search is active
    const highlightedFilePath = useMemo(() => {
        if (!searchConfig) {
            return hunk.filePath;
        }
        return highlightSearchInText(hunk.filePath, searchConfig);
    }, [hunk.filePath, searchConfig]);
    const handleOpenFile = React.useCallback((event) => {
        event.stopPropagation();
        onOpenFile?.(hunk.filePath);
    }, [onOpenFile, hunk.filePath]);
    // Persist manual expand/collapse state across remounts per workspace
    // Maps hunkId -> isExpanded for user's manual preferences
    // Enable listener to synchronize updates across all HunkViewer instances
    const [expandStateMap, setExpandStateMap] = usePersistedState(getReviewExpandStateKey(workspaceId), {}, { listener: true });
    // Check if user has manually set expand state for this hunk
    const hasManualState = hunkId in expandStateMap;
    const manualExpandState = expandStateMap[hunkId];
    // Determine initial expand state (priority: manual > read status > size)
    const [isExpanded, setIsExpanded] = useState(() => {
        if (hasManualState) {
            return manualExpandState;
        }
        return !isRead && !isLargeHunk;
    });
    // Auto-collapse when marked as read, auto-expand when unmarked (unless user manually set)
    React.useEffect(() => {
        // Don't override manual expand/collapse choices
        if (hasManualState) {
            return;
        }
        if (isRead) {
            setIsExpanded(false);
        }
        else if (!isLargeHunk) {
            setIsExpanded(true);
        }
        // Note: When unmarking as read, large hunks remain collapsed
    }, [isRead, isLargeHunk, hasManualState]);
    // Sync local state with persisted state when it changes
    React.useEffect(() => {
        if (hasManualState) {
            setIsExpanded(manualExpandState);
        }
    }, [hasManualState, manualExpandState]);
    // Read-more context expansion
    const { upContent, downContent, upLoading, downLoading, atBOF, atEOF, readMore, handleExpandUp, handleExpandDown, handleCollapseUp, handleCollapseDown, } = useReadMore({ hunk, hunkId, workspaceId, diffBase, includeUncommitted });
    const handleToggleExpand = React.useCallback((e) => {
        e?.stopPropagation();
        const newExpandState = !isExpanded;
        setIsExpanded(newExpandState);
        // Persist manual expand/collapse choice
        setExpandStateMap((prev) => ({
            ...prev,
            [hunkId]: newExpandState,
        }));
    }, [isExpanded, hunkId, setExpandStateMap]);
    // Register toggle method with parent component
    React.useEffect(() => {
        if (onRegisterToggleExpand) {
            onRegisterToggleExpand(hunkId, handleToggleExpand);
        }
    }, [hunkId, onRegisterToggleExpand, handleToggleExpand]);
    const handleToggleRead = (e) => {
        e.stopPropagation();
        onToggleRead?.(e);
    };
    // Wrap onComposingChange to include hunkId - creates stable reference per-hunk
    // This allows parent to pass a single stable callback instead of inline arrow functions
    const handleComposingChange = React.useCallback((isComposing) => {
        onComposingChange?.(hunkId, isComposing);
    }, [hunkId, onComposingChange]);
    // Detect pure rename: if renamed and content hasn't changed (zero additions and deletions)
    const isPureRename = hunk.changeType === "renamed" && hunk.oldPath && additions === 0 && deletions === 0;
    return (_jsxs("div", { ref: hunkRef, className: cn("bg-dark border rounded mb-3 overflow-hidden cursor-pointer transition-all duration-200", "focus:outline-none focus-visible:outline-none", isRead ? "border-read" : "border-border-light", isSelected && "border-review-accent shadow-[0_0_0_1px_var(--color-review-accent)]"), onClick: onClick, role: "button", tabIndex: 0, "data-hunk-id": hunkId, children: [_jsxs("div", { className: "border-border-light font-monospace flex items-center gap-1.5 border-b px-2 py-1 text-[11px]", children: [onToggleRead && (_jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("button", { className: cn("text-muted hover:text-read flex cursor-pointer items-center bg-transparent border-none p-0 text-[11px] transition-colors duration-150", isRead && "text-read"), "data-hunk-id": hunkId, onClick: handleToggleRead, "aria-label": `Mark as read (${formatKeybind(KEYBINDS.TOGGLE_HUNK_READ)})`, children: isRead ? (_jsx(Check, { "aria-hidden": "true", className: "h-3 w-3" })) : (_jsx(Circle, { "aria-hidden": "true", className: "h-3 w-3" })) }) }), _jsxs(TooltipContent, { align: "start", side: "top", children: ["Mark as read (", formatKeybind(KEYBINDS.TOGGLE_HUNK_READ), ") \u00B7 Mark file (", formatKeybind(KEYBINDS.MARK_FILE_READ), ")"] })] })), onOpenFile ? (_jsx("button", { type: "button", onClick: handleOpenFile, className: cn("text-foreground min-w-0 truncate bg-transparent p-0 text-left", "hover:text-link focus-visible:text-link cursor-pointer border-none"), title: hunk.filePath, "aria-label": `Open ${hunk.filePath} in new tab`, children: _jsx("span", { dangerouslySetInnerHTML: { __html: highlightedFilePath } }) })) : (_jsx("div", { className: "text-foreground min-w-0 truncate", dangerouslySetInnerHTML: { __html: highlightedFilePath } })), _jsxs("div", { className: "text-muted ml-auto flex shrink-0 items-center gap-1.5 whitespace-nowrap", children: [!isPureRename && (_jsxs(_Fragment, { children: [additions > 0 && _jsxs("span", { className: "text-success-light", children: ["+", additions] }), deletions > 0 && _jsxs("span", { className: "text-warning-light", children: ["\u2212", deletions] })] })), _jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("span", { className: "text-dim cursor-default", children: formatRelativeTime(firstSeenAt) }) }), _jsxs(TooltipContent, { align: "center", side: "top", children: ["First seen: ", new Date(firstSeenAt).toLocaleString()] })] })] })] }), isPureRename ? (_jsxs("div", { className: "text-muted bg-code-keyword-overlay-light before:text-code-keyword flex items-center gap-2 p-3 text-[11px] before:text-sm before:content-['\u2192']", children: ["Renamed from ", _jsx("code", { children: hunk.oldPath })] })) : isExpanded ? (_jsxs("div", { className: "font-monospace bg-code-bg overflow-x-auto text-[11px] leading-[1.4]", children: [!atBOF && !upLoading && (_jsx("div", { className: "text-muted flex h-[18px] items-center justify-center text-[10px]", children: _jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("button", { onClick: handleExpandUp, className: "text-link hover:text-link-hover cursor-pointer px-1", "aria-label": "Show more context above", children: "\u25B2" }) }), _jsx(TooltipContent, { side: "top", children: "Show more context above" })] }) })), upLoading && (_jsx("div", { className: "text-muted flex h-[18px] items-center justify-center text-[10px]", children: _jsx("span", { children: "Loading..." }) })), upContent && (_jsxs(_Fragment, { children: [_jsx(SelectableDiffRenderer, { content: upContent, filePath: hunk.filePath, inlineReviews: inlineReviews, oldStart: Math.max(1, hunk.oldStart - readMore.up), newStart: Math.max(1, hunk.newStart - readMore.up), fontSize: "11px", maxHeight: "none", className: "rounded-none border-0 [&>div]:overflow-x-visible", enableHighlighting: isVisible, reviewActions: reviewActions }), _jsx(ContextCollapseIndicator, { lineCount: readMore.up, onCollapse: handleCollapseUp, position: "above" })] })), _jsx(SelectableDiffRenderer, { content: hunk.content, filePath: hunk.filePath, inlineReviews: inlineReviews, oldStart: hunk.oldStart, newStart: hunk.newStart, fontSize: "11px", maxHeight: "none", className: "rounded-none border-0 [&>div]:overflow-x-visible", onReviewNote: onReviewNote, onLineClick: () => {
                            const syntheticEvent = {
                                currentTarget: { dataset: { hunkId } },
                            };
                            onClick?.(syntheticEvent);
                        }, searchConfig: searchConfig, enableHighlighting: isVisible, onComposingChange: handleComposingChange, reviewActions: reviewActions }), downContent && (_jsxs(_Fragment, { children: [_jsx(ContextCollapseIndicator, { lineCount: readMore.down, onCollapse: handleCollapseDown, position: "below" }), _jsx(SelectableDiffRenderer, { content: downContent, filePath: hunk.filePath, inlineReviews: inlineReviews, oldStart: hunk.oldStart + hunk.oldLines, newStart: hunk.newStart + hunk.newLines, fontSize: "11px", maxHeight: "none", className: "rounded-none border-0 [&>div]:overflow-x-visible", enableHighlighting: isVisible, reviewActions: reviewActions })] })), !atEOF && !downLoading && (_jsx("div", { className: "text-muted flex h-[18px] items-center justify-center text-[10px]", children: _jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("button", { onClick: handleExpandDown, className: "text-link hover:text-link-hover cursor-pointer px-1", "aria-label": "Show more context below", children: "\u25BC" }) }), _jsx(TooltipContent, { side: "bottom", children: "Show more context below" })] }) })), downLoading && (_jsx("div", { className: "text-muted flex h-[18px] items-center justify-center text-[10px]", children: _jsx("span", { children: "Loading..." }) })), atEOF && downContent && !downLoading && (_jsx("div", { className: "text-dim flex h-[18px] items-center justify-center text-[10px]", children: "\u2014 end of file \u2014" }))] })) : (_jsxs("div", { className: "text-muted hover:text-foreground cursor-pointer px-3 py-2 text-center text-[11px] italic", onClick: handleToggleExpand, children: [isRead && "Hunk marked as read. ", "Click to expand (", lineCount, " lines) or press", " ", formatKeybind(KEYBINDS.TOGGLE_HUNK_COLLAPSE)] })), hasManualState && isExpanded && !isPureRename && (_jsxs("div", { className: "text-muted hover:text-foreground cursor-pointer px-3 py-2 text-center text-[11px] italic", onClick: handleToggleExpand, children: ["Click here or press ", formatKeybind(KEYBINDS.TOGGLE_HUNK_COLLAPSE), " to collapse"] }))] }));
});
HunkViewer.displayName = "HunkViewer";
//# sourceMappingURL=HunkViewer.js.map