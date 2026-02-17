import { tool } from "ai";
import { TOOL_DEFINITIONS } from "@/common/utils/tools/toolDefinitions";
import { executeFileEditOperation } from "./file_edit_operation";
import { handleStringReplace } from "./file_edit_replace_shared";
/**
 * String-based file edit replace tool factory
 */
export const createFileEditReplaceStringTool = (config) => {
    return tool({
        description: TOOL_DEFINITIONS.file_edit_replace_string.description,
        inputSchema: TOOL_DEFINITIONS.file_edit_replace_string.schema,
        execute: async (args, { abortSignal }) => {
            return executeFileEditOperation({
                config,
                filePath: args.path,
                operation: (originalContent) => handleStringReplace(args, originalContent),
                abortSignal,
            });
        },
    });
};
//# sourceMappingURL=file_edit_replace_string.js.map