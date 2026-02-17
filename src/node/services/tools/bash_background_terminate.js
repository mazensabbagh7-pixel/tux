import { tool } from "ai";
import { TOOL_DEFINITIONS } from "@/common/utils/tools/toolDefinitions";
/**
 * Tool for terminating background processes
 */
export const createBashBackgroundTerminateTool = (config) => {
    return tool({
        description: TOOL_DEFINITIONS.bash_background_terminate.description,
        inputSchema: TOOL_DEFINITIONS.bash_background_terminate.schema,
        execute: async ({ process_id }) => {
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
            // Verify process belongs to this workspace before terminating
            const process = await config.backgroundProcessManager.getProcess(process_id);
            if (process?.workspaceId !== config.workspaceId) {
                return {
                    success: false,
                    error: `Process not found: ${process_id}`,
                };
            }
            const result = await config.backgroundProcessManager.terminate(process_id);
            if (result.success) {
                return {
                    success: true,
                    message: `Process ${process_id} terminated`,
                    display_name: process.displayName,
                };
            }
            return result;
        },
    });
};
//# sourceMappingURL=bash_background_terminate.js.map