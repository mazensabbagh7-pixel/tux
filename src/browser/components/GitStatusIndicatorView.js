import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { cn } from "@/common/lib/utils";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "./ui/hover-card";
import { BaseSelectorPopover } from "./RightSidebar/CodeReview/BaseSelectorPopover";
const RADIX_PORTAL_WRAPPER_SELECTOR = "[data-radix-popper-content-wrapper]";
function preventHoverCardDismissForRadixPortals(e) {
    const target = e.target;
    if (target instanceof HTMLElement && target.closest(RADIX_PORTAL_WRAPPER_SELECTOR)) {
        e.preventDefault();
    }
}
// Helper for indicator colors
const getIndicatorColor = (branch) => {
    switch (branch) {
        case 0:
            return "#6bcc6b"; // Green for HEAD
        case 1:
            return "#6ba3cc"; // Blue for origin/main
        case 2:
            return "#b66bcc"; // Purple for origin/branch
        default:
            return "#6b6b6b"; // Gray fallback
    }
};
function formatCountAbbrev(count) {
    const abs = Math.abs(count);
    if (abs < 1000) {
        return String(count);
    }
    if (abs < 1000000) {
        const raw = (abs / 1000).toFixed(1);
        const normalized = raw.endsWith(".0") ? raw.slice(0, -2) : raw;
        return `${count < 0 ? "-" : ""}${normalized}k`;
    }
    const raw = (abs / 1000000).toFixed(1);
    const normalized = raw.endsWith(".0") ? raw.slice(0, -2) : raw;
    return `${count < 0 ? "-" : ""}${normalized}m`;
}
/**
 * Pure presentation component for git status indicator.
 * Displays git status (ahead/behind/dirty) with tooltip on hover.
 * All data is passed as props - no IPC calls or side effects.
 */
export const GitStatusIndicatorView = ({ gitStatus, tooltipPosition = "right", mode, branchHeaders, commits, dirtyFiles, isLoading, errorMessage, isOpen, onOpenChange, onModeChange, baseRef, onBaseChange, onPopoverOpenChange, isWorking = false, isRefreshing = false, }) => {
    // Handle null gitStatus (initial loading state)
    if (!gitStatus) {
        return (_jsx("span", { className: "text-accent relative flex items-center gap-1 font-mono text-xs", "aria-hidden": "true" }));
    }
    const outgoingLines = gitStatus.outgoingAdditions + gitStatus.outgoingDeletions;
    // Render empty placeholder when nothing to show (prevents layout shift)
    // In line-delta mode, also show if behind so users can toggle to divergence view
    const isEmpty = mode === "divergence"
        ? gitStatus.ahead === 0 && gitStatus.behind === 0 && !gitStatus.dirty
        : outgoingLines === 0 && !gitStatus.dirty && gitStatus.behind === 0;
    if (isEmpty) {
        return (_jsx("span", { className: "text-accent relative flex items-center gap-1 font-mono text-xs", "aria-hidden": "true" }));
    }
    // Render colored indicator characters
    const renderIndicators = (indicators) => {
        return (_jsx("span", { className: "text-placeholder mr-2 shrink-0 font-mono whitespace-pre", children: Array.from(indicators).map((char, index) => (_jsx("span", { style: { color: getIndicatorColor(index) }, children: char }, index))) }));
    };
    // Render branch header showing which column corresponds to which branch
    const renderBranchHeaders = () => {
        if (!branchHeaders || branchHeaders.length === 0) {
            return null;
        }
        return (_jsx("div", { className: "border-separator-light mb-2 flex flex-col gap-0.5 border-b pb-2", children: branchHeaders.map((header, index) => (_jsxs("div", { className: "flex gap-2 font-mono leading-snug", children: [_jsxs("span", { className: "text-placeholder mr-2 shrink-0 font-mono whitespace-pre", children: [Array.from({ length: header.columnIndex }).map((_, i) => (_jsx("span", { style: { color: getIndicatorColor(i) }, children: " " }, i))), _jsx("span", { style: { color: getIndicatorColor(header.columnIndex) }, children: "!" })] }), _jsxs("span", { className: "text-foreground", children: ["[", header.branch, "]"] })] }, index))) }));
    };
    // Render dirty files section
    const renderDirtySection = () => {
        if (!dirtyFiles || dirtyFiles.length === 0) {
            return null;
        }
        const LIMIT = 20;
        const displayFiles = dirtyFiles.slice(0, LIMIT);
        const isTruncated = dirtyFiles.length > LIMIT;
        return (_jsxs("div", { className: "border-separator-light mb-2 border-b pb-2", children: [_jsx("div", { className: "text-git-dirty mb-1 font-mono font-semibold", children: "Uncommitted changes:" }), _jsx("div", { className: "flex flex-col gap-px", children: displayFiles.map((line, index) => (_jsx("div", { className: "text-foreground font-mono text-xs leading-snug whitespace-pre", children: line }, index))) }), isTruncated && (_jsxs("div", { className: "text-muted-light mt-1 text-[10px] italic", children: ["(showing ", LIMIT, " of ", dirtyFiles.length, " files)"] }))] }));
    };
    // Render tooltip content
    const renderTooltipContent = () => {
        if (isLoading) {
            return "Loading...";
        }
        if (errorMessage) {
            return errorMessage;
        }
        if (!commits || commits.length === 0) {
            return "No commits to display";
        }
        return (_jsxs(_Fragment, { children: [renderDirtySection(), renderBranchHeaders(), _jsx("div", { className: "flex flex-col gap-1", children: commits.map((commit, index) => (_jsx("div", { className: "flex flex-col gap-0.5", children: _jsxs("div", { className: "flex gap-2 font-mono leading-snug", children: [renderIndicators(commit.indicators), _jsx("span", { className: "text-accent shrink-0 select-all", children: commit.hash }), _jsx("span", { className: "text-muted-light shrink-0", children: commit.date }), _jsx("span", { className: "text-foreground flex-1 break-words", children: commit.subject })] }) }, `${commit.hash}-${index}`))) })] }));
    };
    const outgoingHasDelta = gitStatus.outgoingAdditions > 0 || gitStatus.outgoingDeletions > 0;
    const hasCommitDivergence = gitStatus.ahead > 0 || gitStatus.behind > 0;
    // Dynamic color based on working state
    // Idle: muted/grayscale, Working: original accent colors
    const statusColor = isWorking ? "text-accent" : "text-muted";
    const dirtyColor = isWorking ? "text-git-dirty" : "text-muted";
    const additionsColor = isWorking ? "text-success-light" : "text-muted";
    const deletionsColor = isWorking ? "text-warning-light" : "text-muted";
    // HoverCard content with git divergence details
    const hoverCardContent = (_jsxs(_Fragment, { children: [_jsxs("div", { className: "border-separator-light mb-2 flex flex-col gap-1 border-b pb-2", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: "text-muted-light", children: "Divergence:" }), _jsxs(ToggleGroup, { type: "single", value: mode, onValueChange: (value) => {
                                    if (!value)
                                        return;
                                    onModeChange(value);
                                }, "aria-label": "Git status indicator mode", size: "sm", children: [_jsx(ToggleGroupItem, { value: "line-delta", "aria-label": "Show line delta", size: "sm", children: "Lines" }), _jsx(ToggleGroupItem, { value: "divergence", "aria-label": "Show commit divergence", size: "sm", children: "Commits" })] })] }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: "text-muted-light", children: "Base:" }), _jsx(BaseSelectorPopover, { value: baseRef, onChange: onBaseChange, onOpenChange: onPopoverOpenChange })] }), _jsxs("div", { className: "flex flex-wrap items-center gap-x-3 gap-y-1 text-xs", children: [_jsx("span", { className: "text-muted-light", children: "Overview:" }), outgoingHasDelta ? (_jsxs("span", { className: "flex items-center gap-2", children: [gitStatus.outgoingAdditions > 0 && (_jsxs("span", { className: cn("font-normal", additionsColor), children: ["+", formatCountAbbrev(gitStatus.outgoingAdditions)] })), gitStatus.outgoingDeletions > 0 && (_jsxs("span", { className: cn("font-normal", deletionsColor), children: ["-", formatCountAbbrev(gitStatus.outgoingDeletions)] }))] })) : (_jsx("span", { className: "text-muted", children: "Lines: 0" })), hasCommitDivergence ? (_jsxs("span", { className: "text-muted", children: ["Commits: ", formatCountAbbrev(gitStatus.ahead), " ahead \u00B7", " ", formatCountAbbrev(gitStatus.behind), " behind"] })) : (_jsx("span", { className: "text-muted", children: "Commits: 0" }))] })] }), renderTooltipContent()] }));
    const triggerContent = (_jsxs(_Fragment, { children: [mode === "divergence" ? (_jsxs(_Fragment, { children: [gitStatus.ahead > 0 && (_jsxs("span", { className: "flex items-center font-normal", children: ["\u2191", formatCountAbbrev(gitStatus.ahead)] })), gitStatus.behind > 0 && (_jsxs("span", { className: "flex items-center font-normal", children: ["\u2193", formatCountAbbrev(gitStatus.behind)] }))] })) : (_jsx(_Fragment, { children: outgoingHasDelta ? (_jsxs("span", { className: "flex items-center gap-2", children: [gitStatus.outgoingAdditions > 0 && (_jsxs("span", { className: cn("font-normal", additionsColor), children: ["+", formatCountAbbrev(gitStatus.outgoingAdditions)] })), gitStatus.outgoingDeletions > 0 && (_jsxs("span", { className: cn("font-normal", deletionsColor), children: ["-", formatCountAbbrev(gitStatus.outgoingDeletions)] }))] })) : (
                // No outgoing lines but behind remote - show muted behind indicator
                // so users know they can hover to toggle to divergence view
                gitStatus.behind > 0 && (_jsxs("span", { className: "text-muted flex items-center font-normal", children: ["\u2193", formatCountAbbrev(gitStatus.behind)] }))) })), gitStatus.dirty && (_jsx("span", { className: cn("flex items-center leading-none font-normal", dirtyColor), children: "*" }))] }));
    return (_jsxs(HoverCard, { open: isOpen, onOpenChange: onOpenChange, openDelay: 0, closeDelay: 150, children: [_jsx(HoverCardTrigger, { asChild: true, children: _jsx("button", { type: "button", onClick: () => onOpenChange(!isOpen), className: cn("relative flex items-center gap-1 font-mono text-xs transition-colors", "rounded border border-border-light px-1.5 py-0.5", "hover:border-border-medium/80 hover:bg-toggle-bg/70", "cursor-pointer", statusColor, isRefreshing && "animate-pulse"), children: triggerContent }) }), _jsx(HoverCardContent, { side: tooltipPosition === "right" ? "right" : "bottom", align: tooltipPosition === "right" ? "center" : "start", sideOffset: 26, collisionPadding: 8, className: "bg-modal-bg text-foreground border-separator-light z-[10000] max-h-[400px] w-auto max-w-96 min-w-0 overflow-auto px-3 py-2 font-mono text-xs whitespace-pre shadow-[0_4px_12px_rgba(0,0,0,0.5)]", onPointerDownOutside: preventHoverCardDismissForRadixPortals, onFocusOutside: preventHoverCardDismissForRadixPortals, children: hoverCardContent })] }));
};
//# sourceMappingURL=GitStatusIndicatorView.js.map