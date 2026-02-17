function getTaskIdFromToolResult(result) {
    if (typeof result !== "object" || result === null)
        return null;
    if (!("taskId" in result))
        return null;
    const taskId = result.taskId;
    return typeof taskId === "string" && taskId.trim().length > 0 ? taskId : null;
}
function getTitleFromTaskToolArgs(args) {
    if (typeof args !== "object" || args === null)
        return null;
    if (!("title" in args))
        return null;
    const title = args.title;
    return typeof title === "string" && title.trim().length > 0 ? title.trim() : null;
}
/**
 * Render-time helper that links completed task reports (from `task_await`) back to the
 * original `task` tool call that spawned the background work.
 *
 * This is intentionally UI-only: it does not mutate persisted history/tool output; it just
 * helps the renderer place the final report in a more intuitive location.
 */
export function computeTaskReportLinking(messages) {
    // First pass: record which taskIds have a visible `task` tool call (and capture spawn titles).
    const taskToolCallTaskIds = new Set();
    const spawnTitleByTaskId = new Map();
    for (const msg of messages) {
        if (msg.type !== "tool" || msg.toolName !== "task")
            continue;
        const taskId = getTaskIdFromToolResult(msg.result);
        if (!taskId)
            continue;
        taskToolCallTaskIds.add(taskId);
        const title = getTitleFromTaskToolArgs(msg.args);
        if (title) {
            spawnTitleByTaskId.set(taskId, title);
        }
    }
    // Second pass: collect completed reports from `task_await` results.
    const reportByTaskId = new Map();
    for (const msg of messages) {
        if (msg.type !== "tool" || msg.toolName !== "task_await")
            continue;
        const rawResult = msg.result;
        if (typeof rawResult !== "object" || rawResult === null)
            continue;
        if (!("results" in rawResult))
            continue;
        const results = rawResult.results;
        if (!Array.isArray(results))
            continue;
        for (const r of results) {
            if (typeof r !== "object" || r === null)
                continue;
            const status = r.status;
            if (status !== "completed")
                continue;
            const taskId = r.taskId;
            if (typeof taskId !== "string" || taskId.trim().length === 0)
                continue;
            const reportMarkdown = r.reportMarkdown;
            if (typeof reportMarkdown !== "string")
                continue;
            const title = r.title;
            // Last-wins (history order)
            reportByTaskId.set(taskId, {
                taskId,
                reportMarkdown,
                title: typeof title === "string" ? title : undefined,
            });
        }
    }
    // If a task has both a visible spawn card and a non-empty report, suppress the report
    // duplication under `task_await`.
    const suppressReportInAwaitTaskIds = new Set();
    for (const [taskId, completed] of reportByTaskId) {
        if (!taskToolCallTaskIds.has(taskId))
            continue;
        if (completed.reportMarkdown.trim().length === 0)
            continue;
        suppressReportInAwaitTaskIds.add(taskId);
    }
    return { reportByTaskId, suppressReportInAwaitTaskIds, spawnTitleByTaskId };
}
//# sourceMappingURL=taskReportLinking.js.map