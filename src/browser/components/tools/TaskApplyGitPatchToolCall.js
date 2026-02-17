import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { DetailContent, DetailLabel, DetailSection, ErrorBox, ExpandIcon, HeaderButton, LoadingDots, StatusIndicator, ToolContainer, ToolDetails, ToolHeader, ToolIcon, ToolName, } from "./shared/ToolPrimitives";
import { getStatusDisplay, useToolExpansion } from "./shared/toolUtils";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { useCopyToClipboard } from "@/browser/hooks/useCopyToClipboard";
import { cn } from "@/common/lib/utils";
function formatCommitCount(count) {
    return `${count} ${count === 1 ? "commit" : "commits"}`;
}
function formatShortSha(sha) {
    return sha.length > 8 ? sha.slice(0, 7) : sha;
}
function isRecord(value) {
    return typeof value === "object" && value !== null;
}
function unwrapJsonContainer(value) {
    let current = value;
    // Tool outputs can be wrapped as `{ type: "json", value: ... }`.
    // Some paths may double-wrap; unwrap a couple layers defensively.
    for (let i = 0; i < 2; i++) {
        if (current !== null &&
            typeof current === "object" &&
            "type" in current &&
            current.type === "json" &&
            "value" in current) {
            current = current.value;
            continue;
        }
        break;
    }
    return current;
}
const MAX_CONFLICT_PATHS_SHOWN = 6;
function readNonEmptyString(value) {
    if (typeof value !== "string")
        return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}
function readStringArray(value) {
    if (!Array.isArray(value))
        return undefined;
    const items = [];
    for (const item of value) {
        const str = readNonEmptyString(item);
        if (str)
            items.push(str);
    }
    return items.length > 0 ? items : undefined;
}
function readAppliedCommits(result) {
    if (!isRecord(result))
        return undefined;
    const value = result.appliedCommits;
    if (!Array.isArray(value))
        return undefined;
    const commits = [];
    for (const commit of value) {
        if (!isRecord(commit))
            continue;
        const subject = commit.subject;
        if (typeof subject !== "string" || subject.length === 0)
            continue;
        const sha = commit.sha;
        commits.push({
            subject,
            sha: typeof sha === "string" && sha.length > 0 ? sha : undefined,
        });
    }
    return commits;
}
function readLegacyAppliedCommitCount(result) {
    if (!isRecord(result))
        return undefined;
    const value = result.appliedCommitCount;
    return typeof value === "number" ? value : undefined;
}
const CopyableCode = ({ value, displayValue, tooltipLabel, className }) => {
    const { copied, copyToClipboard } = useCopyToClipboard();
    return (_jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("button", { type: "button", className: cn("min-w-0 font-mono text-[11px] text-link opacity-90 hover:opacity-100 hover:underline underline-offset-2 truncate", className), onClick: () => void copyToClipboard(value), children: displayValue ?? value }) }), _jsx(TooltipContent, { children: copied ? "Copied" : tooltipLabel })] }));
};
const ErrorOutput = ({ error }) => (_jsx(ErrorBox, { children: _jsx("pre", { className: "m-0 max-h-[200px] overflow-y-auto break-words whitespace-pre-wrap", children: error }) }));
export const TaskApplyGitPatchToolCall = ({ args, result, status = "pending", }) => {
    const unwrappedResult = unwrapJsonContainer(result);
    const successResult = isRecord(unwrappedResult) && unwrappedResult.success === true
        ? unwrappedResult
        : null;
    const errorResult = isRecord(unwrappedResult) && unwrappedResult.success === false
        ? unwrappedResult
        : null;
    const taskIdFromResult = isRecord(unwrappedResult) &&
        typeof unwrappedResult.taskId === "string"
        ? unwrappedResult.taskId
        : undefined;
    const taskId = taskIdFromResult ?? args.task_id;
    const dryRunFromResult = isRecord(unwrappedResult) && typeof unwrappedResult.dryRun === "boolean"
        ? unwrappedResult.dryRun
        : undefined;
    const isDryRun = dryRunFromResult === true || args.dry_run === true;
    // Result schema guarantees appliedCommits, but older persisted history might only have
    // appliedCommitCount. Be defensive and support both.
    const appliedCommits = successResult ? readAppliedCommits(successResult) : undefined;
    const legacyAppliedCommitCount = successResult
        ? readLegacyAppliedCommitCount(successResult)
        : undefined;
    const appliedCommitCount = appliedCommits
        ? appliedCommits.length
        : (legacyAppliedCommitCount ?? 0);
    const errorPreview = typeof errorResult?.error === "string" ? errorResult.error.split("\n")[0]?.trim() : undefined;
    // Auto-expand on failures so the user sees actionable notes (git am --continue/--abort, etc.).
    const { expanded, toggleExpanded } = useToolExpansion(Boolean(errorResult));
    const { copied: copiedError, copyToClipboard: copyErrorToClipboard } = useCopyToClipboard();
    const effectiveThreeWay = args.three_way !== false;
    const errorNote = errorResult && "note" in errorResult ? errorResult.note : undefined;
    // Optional structured diagnostics (added to the tool output over time).
    const errorDiagnostics = errorResult && isRecord(unwrappedResult) ? unwrappedResult : null;
    const failedPatchSubject = errorDiagnostics
        ? readNonEmptyString(errorDiagnostics.failedPatchSubject)
        : undefined;
    const conflictPaths = errorDiagnostics
        ? readStringArray(errorDiagnostics.conflictPaths)
        : undefined;
    const shownConflictPaths = conflictPaths?.slice(0, MAX_CONFLICT_PATHS_SHOWN);
    const remainingConflictPaths = conflictPaths && shownConflictPaths
        ? Math.max(0, conflictPaths.length - shownConflictPaths.length)
        : 0;
    return (_jsxs(ToolContainer, { expanded: expanded, className: "@container", children: [_jsxs(ToolHeader, { onClick: toggleExpanded, children: [_jsx(ExpandIcon, { expanded: expanded, children: "\u25B6" }), _jsx(ToolIcon, { toolName: "task_apply_git_patch" }), _jsx(ToolName, { children: "Apply patch" }), _jsx("span", { className: "text-muted ml-1 max-w-40 truncate text-[10px]", children: taskId }), isDryRun && _jsx("span", { className: "text-backgrounded text-[10px] font-medium", children: "dry-run" }), successResult && (_jsx("span", { className: "text-secondary ml-2 text-[10px] whitespace-nowrap", children: formatCommitCount(appliedCommitCount) })), successResult?.headCommitSha && (_jsxs("span", { className: "text-secondary ml-2 hidden text-[10px] whitespace-nowrap @sm:inline", children: ["HEAD ", formatShortSha(successResult.headCommitSha)] })), errorPreview && (_jsx("span", { className: "text-danger ml-2 max-w-64 truncate text-[10px]", children: errorPreview })), _jsx(StatusIndicator, { status: status, children: getStatusDisplay(status) })] }), expanded && (_jsxs(ToolDetails, { children: [_jsxs(DetailSection, { children: [_jsx(DetailLabel, { children: "Patch source" }), _jsx("div", { className: "bg-code-bg flex flex-wrap gap-4 rounded px-2 py-1.5 text-[11px] leading-[1.4]", children: _jsxs("div", { className: "flex min-w-0 items-center gap-1.5", children: [_jsx("span", { className: "text-secondary shrink-0 font-medium", children: "Task ID:" }), _jsx(CopyableCode, { value: taskId, tooltipLabel: "Copy task ID", className: "max-w-[260px]" })] }) })] }), _jsxs(DetailSection, { children: [_jsx(DetailLabel, { children: "Options" }), _jsxs("div", { className: "bg-code-bg flex flex-wrap gap-4 rounded px-2 py-1.5 text-[11px] leading-[1.4]", children: [_jsxs("div", { className: "flex items-center gap-1.5", children: [_jsx("span", { className: "text-secondary font-medium", children: "dry_run:" }), _jsx("span", { className: "text-text font-mono", children: args.dry_run === true ? "true" : "false" })] }), _jsxs("div", { className: "flex items-center gap-1.5", children: [_jsx("span", { className: "text-secondary font-medium", children: "three_way:" }), _jsx("span", { className: "text-text font-mono", children: effectiveThreeWay ? "true" : "false" })] }), _jsxs("div", { className: "flex items-center gap-1.5", children: [_jsx("span", { className: "text-secondary font-medium", children: "force:" }), _jsx("span", { className: "text-text font-mono", children: args.force === true ? "true" : "false" })] })] })] }), status === "executing" && !result && (_jsx(DetailSection, { children: _jsxs(DetailContent, { children: ["Applying patch", _jsx(LoadingDots, {})] }) })), successResult && (_jsxs(_Fragment, { children: [_jsxs(DetailSection, { children: [_jsx(DetailLabel, { children: "Result" }), _jsxs("div", { className: "bg-code-bg flex flex-wrap gap-4 rounded px-2 py-1.5 text-[11px] leading-[1.4]", children: [_jsxs("div", { className: "flex items-center gap-1.5", children: [_jsxs("span", { className: "text-secondary font-medium", children: [isDryRun ? "Would apply" : "Applied", ":"] }), _jsx("span", { className: "text-text font-mono", children: formatCommitCount(appliedCommitCount) })] }), successResult.headCommitSha && (_jsxs("div", { className: "flex min-w-0 items-center gap-1.5", children: [_jsx("span", { className: "text-secondary shrink-0 font-medium", children: "HEAD:" }), _jsx(CopyableCode, { value: successResult.headCommitSha, displayValue: formatShortSha(successResult.headCommitSha), tooltipLabel: "Copy HEAD SHA" })] }))] })] }), appliedCommits && appliedCommits.length > 0 && (_jsxs(DetailSection, { children: [_jsx(DetailLabel, { children: "Commits" }), _jsx("div", { className: "bg-code-bg flex flex-col gap-1 rounded px-2 py-1.5 text-[11px] leading-[1.4]", children: appliedCommits.map((commit, index) => (_jsxs("div", { className: "flex min-w-0 items-start gap-2", children: [commit.sha ? (_jsx(CopyableCode, { value: commit.sha, displayValue: formatShortSha(commit.sha), tooltipLabel: "Copy commit SHA", className: "shrink-0" })) : (_jsxs("span", { className: "text-secondary shrink-0 font-mono text-[11px]", children: [index + 1, "."] })), _jsx("span", { className: "text-text min-w-0 break-words", children: commit.subject })] }, `${commit.sha ?? index}-${commit.subject}`))) })] })), successResult.note && (_jsxs(DetailSection, { children: [_jsx(DetailLabel, { children: "Note" }), _jsx(DetailContent, { className: "px-2 py-1.5", children: successResult.note })] }))] })), errorResult && (_jsxs(_Fragment, { children: [_jsxs(DetailSection, { children: [_jsxs(DetailLabel, { className: "flex items-center justify-between gap-2", children: [_jsx("span", { children: "Error" }), _jsx(HeaderButton, { type: "button", onClick: () => void copyErrorToClipboard(errorResult.error), active: copiedError, children: copiedError ? "Copied" : "Copy" })] }), (failedPatchSubject ?? (shownConflictPaths && shownConflictPaths.length > 0)) && (_jsxs("div", { className: "bg-code-bg mb-2 flex flex-col gap-1 rounded px-2 py-1.5 text-[11px] leading-[1.4]", children: [failedPatchSubject && (_jsxs("div", { className: "flex min-w-0 items-start gap-1.5", children: [_jsx("span", { className: "text-secondary shrink-0 font-medium", children: "Failed patch:" }), _jsx("span", { className: "text-text min-w-0 break-words", children: failedPatchSubject })] })), shownConflictPaths && shownConflictPaths.length > 0 && (_jsxs("div", { className: "flex min-w-0 items-start gap-1.5", children: [_jsx("span", { className: "text-secondary shrink-0 font-medium", children: "Conflicts:" }), _jsxs("span", { className: "text-text min-w-0 font-mono break-words", children: [shownConflictPaths.join(", "), remainingConflictPaths > 0 && (_jsxs("span", { className: "text-secondary", children: [" +", remainingConflictPaths, " more"] }))] })] }))] })), _jsx(ErrorOutput, { error: errorResult.error })] }), errorNote && (_jsxs(DetailSection, { children: [_jsx(DetailLabel, { children: "Note" }), _jsx(DetailContent, { className: "px-2 py-1.5", children: errorNote })] }))] }))] }))] }));
};
//# sourceMappingURL=TaskApplyGitPatchToolCall.js.map