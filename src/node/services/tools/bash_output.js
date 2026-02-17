import { tool } from "ai";
import { TOOL_DEFINITIONS } from "@/common/utils/tools/toolDefinitions";
/**
 * Tool for retrieving incremental output from background processes.
 * Mimics Claude Code's BashOutput tool - returns only new output since last check.
 */
export const createBashOutputTool = (config) => {
    return tool({
        description: TOOL_DEFINITIONS.bash_output.description,
        inputSchema: TOOL_DEFINITIONS.bash_output.schema,
        execute: async ({ process_id, filter, filter_exclude, timeout_secs }, { abortSignal }) => {
            if (!config.backgroundProcessManager) {
                return {
                    success: false,
                    error: "Background process manager not available",
                };
            }
            if (!config.workspaceId) {
                return {
                    success: false,
                    error: "Workspace ID not available",
                };
            }
            // Verify process belongs to this workspace
            const proc = await config.backgroundProcessManager.getProcess(process_id);
            if (proc?.workspaceId !== config.workspaceId) {
                return {
                    success: false,
                    error: `Process not found: ${process_id}. The process may have exited or the app was restarted. Do not retry - use bash_background_list to see active processes.`,
                };
            }
            // Get incremental output with blocking wait
            // Pass workspaceId so getOutput can check for queued messages
            return await config.backgroundProcessManager.getOutput(process_id, filter ?? undefined, filter_exclude ?? undefined, timeout_secs, abortSignal, config.workspaceId);
        },
    });
};
//# sourceMappingURL=bash_output.js.map