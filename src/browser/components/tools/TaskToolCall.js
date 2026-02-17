import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { Info } from "lucide-react";
import { ToolContainer, ToolHeader, ExpandIcon, ToolName, StatusIndicator, ToolDetails, LoadingDots, ErrorBox, } from "./shared/ToolPrimitives";
import { useToolExpansion, getStatusDisplay, isToolErrorResult, } from "./shared/toolUtils";
import { MarkdownRenderer } from "../Messages/MarkdownRenderer";
import { useOptionalMessageListContext } from "../Messages/MessageListContext";
import { SubagentTranscriptDialog } from "./SubagentTranscriptDialog";
import { cn } from "@/common/lib/utils";
import { Tooltip, TooltipTrigger, TooltipContent } from "../ui/tooltip";
import { useOptionalWorkspaceContext, toWorkspaceSelection, } from "@/browser/contexts/WorkspaceContext";
import { useTaskToolLiveTaskId } from "@/browser/stores/WorkspaceStore";
import { useCopyToClipboard } from "@/browser/hooks/useCopyToClipboard";
import { useBackgroundProcesses } from "@/browser/stores/BackgroundBashStore";
/**
 * Clean SVG icon for task tools - represents spawning/branching work
 */
const TaskIcon = ({ className, toolName }) => (_jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsxs("svg", { viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round", className: cn("h-3.5 w-3.5 text-task-mode", className), children: [_jsx("path", { d: "M4 2v5" }), _jsx("path", { d: "M4 7c0 2 2 3 4 3h4" }), _jsx("path", { d: "M10 8l2 2-2 2" }), _jsx("circle", { cx: "4", cy: "2", r: "1.5", fill: "currentColor", stroke: "none" })] }) }), _jsx(TooltipContent, { children: toolName })] }));
// Status badge component for task statuses
const TaskStatusBadge = ({ status, className }) => {
    const getStatusStyle = () => {
        switch (status) {
            case "completed":
            case "reported":
                return "bg-success/20 text-success";
            case "running":
            case "awaiting_report":
                return "bg-pending/20 text-pending";
            case "queued":
                return "bg-muted/20 text-muted";
            case "terminated":
                return "bg-interrupted/20 text-interrupted";
            case "not_found":
            case "invalid_scope":
            case "error":
                return "bg-danger/20 text-danger";
            default:
                return "bg-muted/20 text-muted";
        }
    };
    return (_jsx("span", { className: cn("inline-block shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap", getStatusStyle(), className), children: status }));
};
// Agent type badge
const AgentTypeBadge = ({ type, className }) => {
    const getTypeStyle = () => {
        switch (type) {
            case "explore":
                return "border-plan-mode/50 text-plan-mode";
            case "exec":
                return "border-exec-mode/50 text-exec-mode";
            default:
                return "border-muted/50 text-muted";
        }
    };
    return (_jsx("span", { className: cn("inline-block shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap", getTypeStyle(), className), children: type }));
};
// Task ID display with open/copy affordance.
// - If the task workspace exists locally, clicking opens it.
// - Otherwise, clicking copies the ID (so the user can search / share it).
const TaskId = ({ id, className }) => {
    const workspaceContext = useOptionalWorkspaceContext();
    const { copied, copyToClipboard } = useCopyToClipboard();
    const workspace = workspaceContext?.workspaceMetadata.get(id);
    const canOpenWorkspace = Boolean(workspace && workspaceContext);
    return (_jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("button", { type: "button", className: cn("font-mono text-[10px] text-muted opacity-70 hover:opacity-100 hover:underline underline-offset-2", className), onClick: () => {
                        if (workspace && workspaceContext) {
                            workspaceContext.setSelectedWorkspace(toWorkspaceSelection(workspace));
                            return;
                        }
                        void copyToClipboard(id);
                    }, children: id }) }), _jsx(TooltipContent, { children: canOpenWorkspace ? "Open workspace" : copied ? "Copied" : "Copy task ID" })] }));
};
const TaskRow = (props) => (_jsxs("div", { className: cn("bg-code-bg flex flex-wrap items-center gap-2 rounded-sm p-2", props.className), children: [_jsx(TaskId, { id: props.taskId }), _jsx(TaskStatusBadge, { status: props.status }), props.agentType && _jsx(AgentTypeBadge, { type: props.agentType }), props.title && (_jsx("span", { className: "text-foreground max-w-[200px] truncate text-[11px]", children: props.title })), typeof props.depth === "number" && props.depth > 0 && (_jsxs("span", { className: "text-muted text-[10px]", children: ["depth: ", props.depth] }))] }));
const MAX_TASK_DEPTH_TRAVERSAL = 50;
function computeWorkspaceDepthFromRoot(rootWorkspaceId, leafWorkspaceId, workspaceMetadata) {
    // Not a descendant task (or no nesting to measure).
    if (rootWorkspaceId === leafWorkspaceId) {
        return 0;
    }
    const visited = new Set();
    let depth = 0;
    let currentId = leafWorkspaceId;
    // DEFENSIVE: Guard against cycles or corrupted metadata.
    while (depth < MAX_TASK_DEPTH_TRAVERSAL) {
        if (!currentId) {
            return undefined;
        }
        if (visited.has(currentId)) {
            return undefined;
        }
        visited.add(currentId);
        const metadata = workspaceMetadata.get(currentId);
        const parentId = metadata?.parentWorkspaceId;
        if (typeof parentId !== "string" || parentId.trim().length === 0) {
            return undefined;
        }
        depth += 1;
        if (parentId === rootWorkspaceId) {
            return depth;
        }
        currentId = parentId;
    }
    return undefined;
}
function toTaskStatusFromBackgroundProcessStatus(status) {
    switch (status) {
        case "running":
            return "running";
        case "exited":
            return "completed";
        case "killed":
            return "terminated";
        case "failed":
            return "error";
        default:
            return String(status);
    }
}
function fromBashTaskId(taskId) {
    const prefix = "bash:";
    if (!taskId.startsWith(prefix)) {
        return null;
    }
    const processId = taskId.slice(prefix.length).trim();
    return processId.length > 0 ? processId : null;
}
export const TaskToolCall = ({ workspaceId, args, result, status = "pending", taskReportLinking, toolCallId, }) => {
    // Narrow result to error or success shape
    const errorResult = isToolErrorResult(result) ? result : null;
    const successResult = result && typeof result === "object" && "status" in result ? result : null;
    const liveTaskId = useTaskToolLiveTaskId(workspaceId, toolCallId);
    // Derive task state from the spawn response (or UI-only task-created event while executing)
    const taskId = successResult?.taskId ?? liveTaskId ?? undefined;
    const taskStatus = successResult?.status;
    // Render-time linking: if a later task_await produced the final report, display it here.
    // This keeps the report under the original spawn card without mutating history.
    const linkedReport = typeof taskId === "string" ? taskReportLinking?.reportByTaskId.get(taskId) : undefined;
    const hasLinkedCompletion = Boolean(linkedReport);
    const ownReportMarkdown = successResult?.status === "completed" ? successResult.reportMarkdown : undefined;
    const ownReportTitle = successResult?.status === "completed" ? successResult.title : undefined;
    const reportMarkdown = typeof ownReportMarkdown === "string" && ownReportMarkdown.trim().length > 0
        ? ownReportMarkdown
        : linkedReport?.reportMarkdown;
    const reportTitle = ownReportTitle ?? linkedReport?.title;
    const displayTaskStatus = hasLinkedCompletion ? "completed" : taskStatus;
    // Override status for background tasks: the aggregator sees success=true and marks "completed",
    // but if the task is still queued/running, we should show "backgrounded" instead.
    // If we have a linked completion report, show the task as completed.
    const effectiveStatus = hasLinkedCompletion
        ? "completed"
        : status === "completed" &&
            successResult &&
            (successResult.status === "queued" || successResult.status === "running")
            ? "backgrounded"
            : status;
    // Derive expansion: keep task cards collapsed by default (reports can be long),
    // but auto-expand on error. Always respect the user's explicit toggle.
    const hasReport = typeof reportMarkdown === "string" && reportMarkdown.trim().length > 0;
    const shouldAutoExpand = !!errorResult;
    const [userExpandedChoice, setUserExpandedChoice] = useState(null);
    const expanded = userExpandedChoice ?? shouldAutoExpand;
    const toggleExpanded = () => setUserExpandedChoice(!expanded);
    const isBackground = args.run_in_background;
    const title = args.title ?? "Task";
    const prompt = args.prompt ?? "";
    const agentType = args.agentId ?? args.subagent_type ?? "unknown";
    const kindBadge = _jsx(AgentTypeBadge, { type: agentType });
    const canViewTranscript = displayTaskStatus === "completed" && typeof taskId === "string";
    const [transcriptOpen, setTranscriptOpen] = useState(false);
    // Show preview (first line or truncated)
    const preview = prompt.length > 60 ? prompt.slice(0, 60).trim() + "…" : prompt.split("\n")[0];
    return (_jsxs(ToolContainer, { expanded: expanded, children: [_jsxs(ToolHeader, { onClick: toggleExpanded, children: [_jsx(ExpandIcon, { expanded: expanded, children: "\u25B6" }), _jsx(TaskIcon, { toolName: "task" }), _jsx(ToolName, { children: "task" }), kindBadge, isBackground && (_jsx("span", { className: "text-backgrounded text-[10px] font-medium", children: "background" })), _jsx(StatusIndicator, { status: effectiveStatus, children: getStatusDisplay(effectiveStatus) })] }), canViewTranscript && taskId && (_jsx(SubagentTranscriptDialog, { open: transcriptOpen, onOpenChange: setTranscriptOpen, workspaceId: workspaceId, taskId: taskId })), expanded && (_jsx(ToolDetails, { children: _jsxs("div", { className: "task-surface mt-1 rounded-md p-3", children: [_jsxs("div", { className: "task-divider mb-2 flex flex-wrap items-center gap-2 border-b pb-2", children: [_jsx("span", { className: "text-task-mode text-[12px] font-semibold", children: reportTitle ?? title }), taskId && _jsx(TaskId, { id: taskId }), displayTaskStatus && _jsx(TaskStatusBadge, { status: displayTaskStatus }), canViewTranscript && (_jsx("button", { type: "button", className: "text-link text-[10px] font-medium underline-offset-2 hover:underline", onClick: () => {
                                        setTranscriptOpen(true);
                                    }, children: "View transcript" }))] }), _jsxs("div", { className: "mb-2", children: [_jsx("div", { className: "text-muted mb-1 text-[10px] tracking-wide uppercase", children: "Prompt" }), _jsx("div", { className: "text-foreground bg-code-bg max-h-[140px] overflow-y-auto rounded-sm p-2 text-[11px] break-words whitespace-pre-wrap", children: prompt })] }), hasReport && reportMarkdown && (_jsxs("div", { className: "task-divider border-t pt-2", children: [_jsx("div", { className: "text-muted mb-1 text-[10px] tracking-wide uppercase", children: "Report" }), _jsx("div", { className: cn("text-[11px]", hasLinkedCompletion && "bg-code-bg rounded-sm p-2"), children: _jsx(MarkdownRenderer, { content: reportMarkdown }) })] })), effectiveStatus === "executing" && !hasReport && (_jsxs("div", { className: "text-muted text-[11px] italic", children: ["Task ", isBackground ? "running in background" : "executing", _jsx(LoadingDots, {})] })), errorResult && _jsx(ErrorBox, { className: "mt-2", children: errorResult.error })] }) })), !expanded && _jsx("div", { className: "text-muted mt-1 truncate text-[10px]", children: preview })] }));
};
export const TaskAwaitToolCall = ({ args, result, status = "pending", taskReportLinking, }) => {
    const taskIds = args.task_ids;
    const timeoutSecs = args.timeout_secs;
    const results = result?.results ?? [];
    const suppressReportInAwaitTaskIds = taskReportLinking?.suppressReportInAwaitTaskIds;
    const showConfigInfo = taskIds != null || timeoutSecs != null || args.filter != null || args.filter_exclude === true;
    // Summary for header
    const completedCount = results.filter((r) => r.status === "completed").length;
    const totalCount = results.length;
    const failedCount = results.filter((r) => r.status === "error" || r.status === "invalid_scope" || r.status === "not_found").length;
    const workspaceContext = useOptionalWorkspaceContext();
    const workspaceMetadata = workspaceContext?.workspaceMetadata;
    const messageListContext = useOptionalMessageListContext();
    const workspaceId = messageListContext?.workspaceId;
    const backgroundProcesses = useBackgroundProcesses(workspaceId);
    const awaitedRows = [];
    if (status === "executing" && results.length === 0 && Array.isArray(taskIds)) {
        for (const taskId of taskIds) {
            const processId = fromBashTaskId(taskId);
            if (processId) {
                const proc = backgroundProcesses.find((entry) => entry.id === processId);
                awaitedRows.push({
                    taskId,
                    status: proc ? toTaskStatusFromBackgroundProcessStatus(proc.status) : "waiting",
                    title: proc?.displayName ?? proc?.id,
                    depth: 1,
                });
                continue;
            }
            const metadata = workspaceMetadata?.get(taskId);
            if (!metadata) {
                awaitedRows.push({ taskId, status: "waiting" });
                continue;
            }
            const agentType = (metadata.agentId ?? metadata.agentType)?.trim();
            const title = metadata.title?.trim().length ? metadata.title : metadata.name;
            awaitedRows.push({
                taskId,
                status: metadata.taskStatus ?? "waiting",
                agentType: agentType && agentType.length > 0 ? agentType : undefined,
                title,
                depth: workspaceId && workspaceMetadata
                    ? computeWorkspaceDepthFromRoot(workspaceId, taskId, workspaceMetadata)
                    : undefined,
            });
        }
    }
    function getWorkspaceTitle(taskId) {
        const metadata = workspaceMetadata?.get(taskId);
        const title = metadata?.title?.trim();
        if (title && title.length > 0)
            return title;
        const name = metadata?.name?.trim();
        return name && name.length > 0 ? name : undefined;
    }
    // Keep task_await collapsed by default, but auto-expand when failures are present.
    // This avoids hiding failures behind a "completed" badge in the header.
    const shouldAutoExpand = failedCount > 0;
    const [userExpandedChoice, setUserExpandedChoice] = useState(null);
    const expanded = userExpandedChoice ?? shouldAutoExpand;
    const toggleExpanded = () => setUserExpandedChoice(!expanded);
    const effectiveStatus = status === "completed" && failedCount > 0 ? "failed" : status;
    return (_jsxs(ToolContainer, { expanded: expanded, children: [_jsxs(ToolHeader, { onClick: toggleExpanded, children: [_jsx(ExpandIcon, { expanded: expanded, children: "\u25B6" }), _jsx(TaskIcon, { toolName: "task_await" }), _jsx(ToolName, { children: "task_await" }), totalCount > 0 && (_jsxs("span", { className: "text-muted text-[10px]", children: [completedCount, "/", totalCount, " completed"] })), failedCount > 0 && _jsxs("span", { className: "text-danger text-[10px]", children: [failedCount, " failed"] }), _jsx(StatusIndicator, { status: effectiveStatus, children: getStatusDisplay(effectiveStatus) })] }), expanded && (_jsx(ToolDetails, { children: _jsxs("div", { className: "task-surface mt-1 rounded-md p-3", children: [showConfigInfo && (_jsxs("div", { className: "task-divider text-muted mb-2 flex flex-wrap gap-2 border-b pb-2 text-[10px]", children: [taskIds != null && _jsxs("span", { children: ["Waiting for: ", taskIds.length, " task(s)"] }), timeoutSecs != null && _jsxs("span", { children: ["Timeout: ", timeoutSecs, "s"] }), args.filter != null && _jsxs("span", { children: ["Filter: ", args.filter] }), args.filter_exclude === true && _jsx("span", { children: "Exclude: true" })] })), results.length > 0 ? (_jsx("div", { className: "space-y-3", children: results.map((r, idx) => {
                                const taskId = typeof r.taskId === "string" ? r.taskId : null;
                                const spawnTitle = taskId
                                    ? taskReportLinking?.spawnTitleByTaskId.get(taskId)
                                    : undefined;
                                const fallbackTitle = (spawnTitle && spawnTitle.trim().length > 0 ? spawnTitle.trim() : undefined) ??
                                    (taskId ? getWorkspaceTitle(taskId) : undefined);
                                return (_jsx(TaskAwaitResult, { result: r, fallbackTitle: fallbackTitle, suppressReport: taskId ? suppressReportInAwaitTaskIds?.has(taskId) : false }, taskId ?? idx));
                            }) })) : status === "executing" ? (_jsxs("div", { className: "space-y-2", children: [awaitedRows.map((row) => (_jsx(TaskRow, { ...row }, row.taskId))), _jsxs("div", { className: "text-muted text-[11px] italic", children: ["Waiting for tasks to complete", _jsx(LoadingDots, {})] })] })) : (_jsx("div", { className: "text-muted text-[11px] italic", children: "No tasks specified" }))] }) }))] }));
};
// Individual task_await result display
const TaskAwaitResult = ({ result, fallbackTitle, suppressReport }) => {
    const isCompleted = result.status === "completed";
    const reportMarkdown = isCompleted ? result.reportMarkdown : undefined;
    const rawReportTitle = isCompleted ? result.title : undefined;
    const reportTitle = typeof rawReportTitle === "string" && rawReportTitle.trim().length > 0
        ? rawReportTitle.trim()
        : undefined;
    const title = reportTitle ??
        (fallbackTitle && fallbackTitle.trim().length > 0 ? fallbackTitle.trim() : undefined);
    const output = "output" in result ? result.output : undefined;
    const note = "note" in result ? result.note : undefined;
    const exitCode = "exitCode" in result ? result.exitCode : undefined;
    const gitPatchArtifact = result.status === "completed" ? result.artifacts?.gitFormatPatch : undefined;
    const patchSummary = (() => {
        if (!gitPatchArtifact)
            return null;
        switch (gitPatchArtifact.status) {
            case "pending":
                return "Patch: pending";
            case "skipped":
                return "Patch: skipped (no commits)";
            case "ready": {
                const count = gitPatchArtifact.commitCount ?? 0;
                const label = count === 1 ? "commit" : "commits";
                return `Patch: ready (${count} ${label})`;
            }
            case "failed": {
                const error = gitPatchArtifact.error?.trim();
                const shortError = error && error.length > 80 ? `${error.slice(0, 77)}…` : (error ?? undefined);
                return shortError ? `Patch: failed (${shortError})` : "Patch: failed";
            }
            default:
                return `Patch: ${String(gitPatchArtifact.status)}`;
        }
    })();
    const elapsedMs = "elapsed_ms" in result ? result.elapsed_ms : undefined;
    const showDetails = suppressReport !== true;
    return (_jsxs("div", { className: "bg-code-bg rounded-sm p-2", children: [_jsxs("div", { className: cn("flex flex-wrap items-center gap-2", showDetails && "mb-1"), children: [_jsx(TaskId, { id: result.taskId }), _jsx(TaskStatusBadge, { status: result.status }), title && _jsx("span", { className: "text-foreground text-[11px] font-medium", children: title }), exitCode !== undefined && _jsxs("span", { className: "text-muted text-[10px]", children: ["exit ", exitCode] }), elapsedMs !== undefined && _jsxs("span", { className: "text-muted text-[10px]", children: [elapsedMs, "ms"] }), note && (_jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("button", { type: "button", "aria-label": "View notice", className: "text-muted hover:text-secondary translate-y-[-1px] rounded p-0.5 transition-colors", children: _jsx(Info, { size: 12 }) }) }), _jsx(TooltipContent, { children: _jsx("div", { className: "max-w-xs break-words whitespace-pre-wrap", children: note }) })] }))] }), showDetails && patchSummary && _jsx("div", { className: "text-muted text-[10px]", children: patchSummary }), showDetails && !isCompleted && output && output.length > 0 && (_jsx("div", { className: "text-foreground bg-code-bg max-h-[140px] overflow-y-auto rounded-sm p-2 text-[11px] break-words whitespace-pre-wrap", children: output })), showDetails && reportMarkdown && (_jsx("div", { className: "mt-2 text-[11px]", children: _jsx(MarkdownRenderer, { content: reportMarkdown }) })), "error" in result && result.error && (_jsx("div", { className: "text-danger mt-1 text-[11px]", children: result.error }))] }));
};
export const TaskListToolCall = ({ args, result, status = "pending", }) => {
    const tasks = result?.tasks ?? [];
    const { expanded, toggleExpanded } = useToolExpansion(false);
    const statusFilter = args.statuses;
    return (_jsxs(ToolContainer, { expanded: expanded, children: [_jsxs(ToolHeader, { onClick: toggleExpanded, children: [_jsx(ExpandIcon, { expanded: expanded, children: "\u25B6" }), _jsx(TaskIcon, { toolName: "task_list" }), _jsx(ToolName, { children: "task_list" }), _jsxs("span", { className: "text-muted text-[10px]", children: [tasks.length, " task(s)"] }), _jsx(StatusIndicator, { status: status, children: getStatusDisplay(status) })] }), expanded && (_jsx(ToolDetails, { children: _jsxs("div", { className: "task-surface mt-1 rounded-md p-3", children: [statusFilter && statusFilter.length > 0 && (_jsxs("div", { className: "task-divider text-muted mb-2 border-b pb-2 text-[10px]", children: ["Filter: ", statusFilter.join(", ")] })), tasks.length > 0 ? (_jsx("div", { className: "space-y-2", children: tasks.map((task) => (_jsx(TaskListItem, { task: task }, task.taskId))) })) : status === "executing" ? (_jsxs("div", { className: "text-muted text-[11px] italic", children: ["Fetching tasks", _jsx(LoadingDots, {})] })) : (_jsx("div", { className: "text-muted text-[11px] italic", children: "No tasks found" }))] }) }))] }));
};
// Individual task in list display
const TaskListItem = ({ task }) => (_jsx(TaskRow, { taskId: task.taskId, status: task.status, agentType: task.agentType, title: task.title, depth: task.depth }));
export const TaskTerminateToolCall = ({ args, result, status = "pending", }) => {
    const { expanded, toggleExpanded } = useToolExpansion(false);
    const taskIds = args.task_ids;
    const results = result?.results ?? [];
    const terminatedCount = results.filter((r) => r.status === "terminated").length;
    return (_jsxs(ToolContainer, { expanded: expanded, children: [_jsxs(ToolHeader, { onClick: toggleExpanded, children: [_jsx(ExpandIcon, { expanded: expanded, children: "\u25B6" }), _jsx(TaskIcon, { toolName: "task_terminate" }), _jsx(ToolName, { children: "task_terminate" }), _jsx("span", { className: "text-interrupted text-[10px]", children: terminatedCount > 0 ? `${terminatedCount} terminated` : `${taskIds.length} to terminate` }), _jsx(StatusIndicator, { status: status, children: getStatusDisplay(status) })] }), expanded && (_jsx(ToolDetails, { children: _jsx("div", { className: "task-surface mt-1 rounded-md p-3", children: results.length > 0 ? (_jsx("div", { className: "space-y-2", children: results.map((r, idx) => (_jsxs("div", { className: "bg-code-bg rounded-sm p-2", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx(TaskId, { id: r.taskId }), _jsx(TaskStatusBadge, { status: r.status })] }), "terminatedTaskIds" in r && r.terminatedTaskIds.length > 1 && (_jsxs("div", { className: "text-muted mt-1 text-[10px]", children: ["Also terminated:", " ", r.terminatedTaskIds.filter((id) => id !== r.taskId).join(", ")] })), "error" in r && r.error && (_jsx("div", { className: "text-danger mt-1 text-[11px]", children: r.error }))] }, r.taskId ?? idx))) })) : status === "executing" ? (_jsxs("div", { className: "text-muted text-[11px] italic", children: ["Terminating tasks", _jsx(LoadingDots, {})] })) : (_jsxs("div", { className: "text-muted text-[10px]", children: ["Tasks to terminate: ", taskIds.join(", ")] })) }) }))] }));
};
//# sourceMappingURL=TaskToolCall.js.map