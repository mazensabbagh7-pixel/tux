import { tool } from "ai";
import { TOOL_DEFINITIONS } from "@/common/utils/tools/toolDefinitions";
/**
 * Tool for listing background processes in the current workspace
 */
export const createBashBackgroundListTool = (config) => {
    return tool({
        description: TOOL_DEFINITIONS.bash_background_list.description,
        inputSchema: TOOL_DEFINITIONS.bash_background_list.schema,
        execute: async () => {
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
            const processes = await config.backgroundProcessManager.list(config.workspaceId);
            const now = Date.now();
            return {
                success: true,
                processes: processes.map((p) => ({
                    process_id: p.id,
                    status: p.status,
                    script: p.script,
                    uptime_ms: p.exitTime !== undefined ? p.exitTime - p.startTime : now - p.startTime,
                    exitCode: p.exitCode,
                    display_name: p.displayName,
                })),
            };
        },
    });
};
//# sourceMappingURL=bash_background_list.js.map