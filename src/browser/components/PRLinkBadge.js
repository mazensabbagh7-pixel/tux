import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * PR link badge component for displaying GitHub PR status in header.
 */
import { ExternalLink, GitPullRequest, Loader2, Check, X, AlertCircle, CircleDot, } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "./ui/tooltip";
import { Button } from "./ui/button";
import { cn } from "@/common/lib/utils";
/**
 * Get status color class based on PR merge state.
 * When refreshing with cached status, we keep the existing color rather than fading to muted.
 */
function getStatusColorClass(prLink) {
    // When loading without cached status, show muted
    if (prLink.loading && !prLink.status)
        return "text-muted";
    if (prLink.error)
        return "text-danger-soft";
    if (!prLink.status)
        return "text-muted";
    const { state, mergeable, mergeStateStatus, isDraft, hasFailedChecks, hasPendingChecks } = prLink.status;
    if (state === "MERGED")
        return "text-purple-500";
    if (state === "CLOSED")
        return "text-danger-soft";
    if (isDraft || mergeStateStatus === "DRAFT")
        return "text-muted";
    if (mergeable === "CONFLICTING" || mergeStateStatus === "DIRTY")
        return "text-danger-soft";
    if (mergeStateStatus === "CLEAN")
        return "text-success";
    if (mergeStateStatus === "BEHIND")
        return "text-warning";
    // Prefer check rollup when available; fall back to mergeStateStatus.
    if (hasFailedChecks)
        return "text-danger-soft";
    if (hasPendingChecks)
        return "text-warning";
    // GitHub marks UNSTABLE for non-passing states (including pending), so only treat it
    // as failing when rollup doesn't already say pending/failed.
    if (mergeStateStatus === "UNSTABLE")
        return "text-danger-soft";
    if (mergeStateStatus === "BLOCKED" || mergeStateStatus === "HAS_HOOKS") {
        return "text-warning";
    }
    return "text-muted";
}
/**
 * Get status icon based on PR state.
 * When refreshing with cached status, we show the cached status icon (not a spinner).
 */
function StatusIcon({ prLink }) {
    // Only show spinner when loading without any cached status
    if (prLink.loading && !prLink.status) {
        return _jsx(Loader2, { className: "h-3 w-3 animate-spin" });
    }
    if (prLink.error) {
        return _jsx(AlertCircle, { className: "h-3 w-3" });
    }
    if (!prLink.status) {
        return _jsx(GitPullRequest, { className: "h-3 w-3" });
    }
    const { state, mergeable, mergeStateStatus, isDraft, hasFailedChecks, hasPendingChecks } = prLink.status;
    if (state === "MERGED") {
        return _jsx(Check, { className: "h-3 w-3" });
    }
    if (state === "CLOSED") {
        return _jsx(X, { className: "h-3 w-3" });
    }
    if (isDraft || mergeStateStatus === "DRAFT") {
        return _jsx(GitPullRequest, { className: "h-3 w-3" });
    }
    if (mergeable === "CONFLICTING" || mergeStateStatus === "DIRTY") {
        return _jsx(X, { className: "h-3 w-3" });
    }
    if (mergeStateStatus === "CLEAN") {
        return _jsx(Check, { className: "h-3 w-3" });
    }
    // Prefer check rollup when available; fall back to mergeStateStatus.
    if (hasFailedChecks) {
        return _jsx(X, { className: "h-3 w-3" });
    }
    if (hasPendingChecks || mergeStateStatus === "BLOCKED") {
        return _jsx(CircleDot, { className: "h-3 w-3" });
    }
    // GitHub marks UNSTABLE for non-passing states (including pending), so only treat it
    // as failing when rollup doesn't already say pending/failed.
    if (mergeStateStatus === "UNSTABLE") {
        return _jsx(X, { className: "h-3 w-3" });
    }
    return _jsx(GitPullRequest, { className: "h-3 w-3" });
}
/**
 * Format PR tooltip content
 */
function getTooltipContent(prLink) {
    // When refreshing with cached status, don't show "Loading..." - show the cached status
    if (prLink.loading && !prLink.status)
        return "Loading PR status...";
    if (prLink.error)
        return `Error: ${prLink.error}`;
    if (!prLink.status)
        return `PR #${prLink.number}`;
    const { title, state, mergeable, mergeStateStatus, isDraft, hasFailedChecks, hasPendingChecks, headRefName, baseRefName, } = prLink.status;
    const lines = [title || `PR #${prLink.number}`];
    if (isDraft) {
        lines.push("Draft PR");
    }
    else if (state === "MERGED") {
        lines.push("Merged");
    }
    else if (state === "CLOSED") {
        lines.push("Closed");
    }
    else {
        if (mergeable === "CONFLICTING" || mergeStateStatus === "DIRTY") {
            lines.push("Has merge conflicts");
        }
        else if (mergeStateStatus === "BEHIND") {
            lines.push("Behind base branch");
        }
        else if (mergeStateStatus === "CLEAN") {
            lines.push("Ready to merge");
        }
        else if (hasFailedChecks) {
            lines.push("Checks failing");
        }
        else if (hasPendingChecks) {
            lines.push("Checks pending");
        }
        else if (mergeStateStatus === "UNSTABLE") {
            // GitHub marks UNSTABLE for non-passing states (including pending), so only fall back here.
            lines.push("Checks failing");
        }
        else if (mergeStateStatus === "BLOCKED" || mergeStateStatus === "HAS_HOOKS") {
            lines.push("Merge blocked");
        }
        else {
            lines.push("Open");
        }
    }
    lines.push(`${headRefName} → ${baseRefName}`);
    return lines.join("\n");
}
export function PRLinkBadge({ prLink }) {
    const colorClass = getStatusColorClass(prLink);
    // Show pulse effect when refreshing with cached status (optimistic UI)
    const isRefreshing = prLink.loading && prLink.status != null;
    return (_jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx(Button, { variant: "ghost", size: "sm", className: cn("h-6 gap-1 px-2 text-xs font-medium", colorClass, isRefreshing && "animate-pulse"), asChild: true, children: _jsxs("a", { href: prLink.url, target: "_blank", rel: "noopener noreferrer", children: [_jsx(StatusIcon, { prLink: prLink }), _jsxs("span", { children: ["#", prLink.number] }), _jsx(ExternalLink, { className: "h-3 w-3 opacity-50" })] }) }) }), _jsx(TooltipContent, { align: "center", className: "whitespace-pre-line", children: getTooltipContent(prLink) })] }));
}
//# sourceMappingURL=PRLinkBadge.js.map