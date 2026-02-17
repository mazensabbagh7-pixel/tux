import { tool } from "ai";
import { TOOL_DEFINITIONS } from "@/common/utils/tools/toolDefinitions";
export function createSystem1KeepRangesTool(_config, options) {
    let called = false;
    return tool({
        description: TOOL_DEFINITIONS.system1_keep_ranges.description,
        inputSchema: TOOL_DEFINITIONS.system1_keep_ranges.schema,
        execute: ({ keep_ranges }) => {
            // Defensive: the model should only call this once, but don't error-loop if it retries.
            if (called) {
                return { success: true };
            }
            called = true;
            options?.onKeepRanges?.(keep_ranges);
            return { success: true };
        },
    });
}
//# sourceMappingURL=system1_keep_ranges.js.map