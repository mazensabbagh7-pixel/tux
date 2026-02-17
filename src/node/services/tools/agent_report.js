import { tool } from "ai";
import { TOOL_DEFINITIONS } from "@/common/utils/tools/toolDefinitions";
import { requireTaskService, requireWorkspaceId } from "./toolUtils";
export const createAgentReportTool = (config) => {
    return tool({
        description: TOOL_DEFINITIONS.agent_report.description,
        inputSchema: TOOL_DEFINITIONS.agent_report.schema,
        execute: () => {
            const workspaceId = requireWorkspaceId(config, "agent_report");
            const taskService = requireTaskService(config, "agent_report");
            if (taskService.hasActiveDescendantAgentTasksForWorkspace(workspaceId)) {
                throw new Error("agent_report rejected: this task still has running/queued descendant tasks. " +
                    "Call task_await (or wait for tasks to finish) before reporting.");
            }
            // Intentionally no side-effects. The backend orchestrator consumes the tool-call args
            // via persisted history/partial state once the tool call completes successfully.
            // The stream continues after this so the SDK can record usage, while StreamManager
            // stops autonomous loops once it observes agent_report with output.success === true.
            return {
                success: true,
                message: "Report submitted successfully.",
            };
        },
    });
};
//# sourceMappingURL=agent_report.js.map