import { tool } from "ai";
import { TOOL_DEFINITIONS } from "@/common/utils/tools/toolDefinitions";
import { executeFileEditOperation } from "./file_edit_operation";
import { handleLineReplace } from "./file_edit_replace_shared";
/**
 * Line-based file edit replace tool factory
 */
export const createFileEditReplaceLinesTool = (config) => {
    return tool({
        description: TOOL_DEFINITIONS.file_edit_replace_lines.description,
        inputSchema: TOOL_DEFINITIONS.file_edit_replace_lines.schema,
        execute: async (args, { abortSignal }) => {
            const result = await executeFileEditOperation({
                config,
                filePath: args.path,
                operation: (originalContent) => handleLineReplace(args, originalContent),
                abortSignal,
            });
            // handleLineReplace always returns lines_replaced and line_delta,
            // so we can safely assert this meets FileEditReplaceLinesToolResult
            if (result.success) {
                return {
                    success: true,
                    diff: result.diff,
                    ui_only: result.ui_only,
                    warning: result.warning,
                    edits_applied: result.edits_applied,
                    lines_replaced: result.lines_replaced,
                    line_delta: result.line_delta,
                };
            }
            return result;
        },
    });
};
//# sourceMappingURL=file_edit_replace_lines.js.map