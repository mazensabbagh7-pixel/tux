import { tool } from "ai";
import { TaskTerminateToolResultSchema, TOOL_DEFINITIONS, } from "@/common/utils/tools/toolDefinitions";
import { fromBashTaskId } from "./taskId";
import { dedupeStrings, parseToolResult, requireTaskService, requireWorkspaceId, } from "./toolUtils";
export const createTaskTerminateTool = (config) => {
    return tool({
        description: TOOL_DEFINITIONS.task_terminate.description,
        inputSchema: TOOL_DEFINITIONS.task_terminate.schema,
        execute: async (args) => {
            const workspaceId = requireWorkspaceId(config, "task_terminate");
            const taskService = requireTaskService(config, "task_terminate");
            const uniqueTaskIds = dedupeStrings(args.task_ids);
            const results = await Promise.all(uniqueTaskIds.map(async (taskId) => {
                const maybeProcessId = fromBashTaskId(taskId);
                if (taskId.startsWith("bash:") && !maybeProcessId) {
                    return { status: "error", taskId, error: "Invalid bash taskId." };
                }
                if (maybeProcessId) {
                    if (!config.backgroundProcessManager) {
                        return {
                            status: "error",
                            taskId,
                            error: "Background process manager not available",
                        };
                    }
                    const proc = await config.backgroundProcessManager.getProcess(maybeProcessId);
                    if (!proc) {
                        return { status: "not_found", taskId };
                    }
                    const inScope = proc.workspaceId === workspaceId ||
                        (await taskService.isDescendantAgentTask(workspaceId, proc.workspaceId));
                    if (!inScope) {
                        return { status: "invalid_scope", taskId };
                    }
                    const terminateResult = await config.backgroundProcessManager.terminate(maybeProcessId);
                    if (!terminateResult.success) {
                        return { status: "error", taskId, error: terminateResult.error };
                    }
                    return {
                        status: "terminated",
                        taskId,
                        terminatedTaskIds: [taskId],
                    };
                }
                const terminateResult = await taskService.terminateDescendantAgentTask(workspaceId, taskId);
                if (!terminateResult.success) {
                    const msg = terminateResult.error;
                    if (/not found/i.test(msg)) {
                        return { status: "not_found", taskId };
                    }
                    if (/descendant/i.test(msg) || /scope/i.test(msg)) {
                        return { status: "invalid_scope", taskId };
                    }
                    return { status: "error", taskId, error: msg };
                }
                return {
                    status: "terminated",
                    taskId,
                    terminatedTaskIds: terminateResult.data.terminatedTaskIds,
                };
            }));
            return parseToolResult(TaskTerminateToolResultSchema, { results }, "task_terminate");
        },
    });
};
//# sourceMappingURL=task_terminate.js.map