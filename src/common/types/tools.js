/**
 * Shared type definitions for AI tools
 * These types are used by both the tool implementations and UI components
 */
export const FILE_EDIT_DIFF_OMITTED_MESSAGE = "[diff omitted in context - call file_read on the target file if needed]";
export const FILE_EDIT_TOOL_NAMES = [
    "file_edit_replace_string",
    "file_edit_replace_lines",
    "file_edit_insert",
];
/**
 * Prefix for file write denial error messages.
 * This consistent prefix helps both the UI and models detect when writes fail.
 */
export const WRITE_DENIED_PREFIX = "WRITE DENIED, FILE UNMODIFIED:";
/**
 * Prefix for edit failure notes (agent-only messages).
 * This prefix signals to the agent that the file was not modified.
 */
export const EDIT_FAILED_NOTE_PREFIX = "EDIT FAILED - file was NOT modified.";
/**
 * Common note fragments for DRY error messages
 */
export const NOTE_READ_FILE_RETRY = "Read the file to get current content, then retry.";
export const NOTE_READ_FILE_FIRST_RETRY = "Read the file first to get the exact current content, then retry.";
export const NOTE_READ_FILE_AGAIN_RETRY = "Read the file again and retry.";
/**
 * Tool description warning for file edit tools
 */
export const TOOL_EDIT_WARNING = "Always check the tool result before proceeding with other operations.";
//# sourceMappingURL=tools.js.map