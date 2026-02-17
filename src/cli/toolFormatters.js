/**
 * CLI tool output formatters for `mux run`
 *
 * Provides clean, readable formatting for recognized tool calls,
 * with emoji prefixes and structured output similar to the frontend UI.
 */
import { extractToolFilePath } from "@/common/utils/tools/toolInputFilePath";
import chalk from "chalk";
/** Tools that should have their result on a new line (multi-line results) */
const MULTILINE_RESULT_TOOLS = new Set([
    "file_edit_replace_string",
    "file_edit_replace_lines",
    "file_edit_insert",
    "bash",
    "task",
    "task_await",
    "code_execution",
]);
// ============================================================================
// Utilities
// ============================================================================
const TOOL_BLOCK_SEPARATOR = chalk.dim("─".repeat(40));
function isRecord(value) {
    return value !== null && typeof value === "object";
}
function extractFilePathArg(args) {
    return extractToolFilePath(args);
}
function formatFilePath(filePath) {
    return chalk.cyan(filePath);
}
function formatCommand(cmd) {
    // Truncate long commands
    const maxLen = 80;
    const truncated = cmd.length > maxLen ? cmd.slice(0, maxLen) + "…" : cmd;
    return chalk.yellow(truncated);
}
function formatDiff(diff) {
    // Color diff lines for terminal output
    return diff
        .split("\n")
        .map((line) => {
        if (line.startsWith("+") && !line.startsWith("+++")) {
            return chalk.green(line);
        }
        else if (line.startsWith("-") && !line.startsWith("---")) {
            return chalk.red(line);
        }
        else if (line.startsWith("@@")) {
            return chalk.cyan(line);
        }
        return line;
    })
        .join("\n");
}
function formatDuration(ms) {
    if (ms < 1000)
        return `${ms}ms`;
    if (ms < 60000)
        return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
}
function formatBytes(bytes) {
    if (bytes < 1024)
        return `${bytes}B`;
    if (bytes < 1024 * 1024)
        return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
function indent(text, spaces = 2) {
    const prefix = " ".repeat(spaces);
    return text
        .split("\n")
        .map((line) => prefix + line)
        .join("\n");
}
function renderUnknown(value) {
    if (typeof value === "string")
        return value;
    try {
        return JSON.stringify(value, null, 2);
    }
    catch {
        return String(value);
    }
}
// ============================================================================
// Tool Start Formatters
// ============================================================================
function formatFileEditStart(_toolName, args) {
    const filePath = extractFilePathArg(args);
    if (!filePath)
        return null;
    return `✏️  ${formatFilePath(filePath)}`;
}
function formatFileReadStart(_toolName, args) {
    const readArgs = args;
    const filePath = extractFilePathArg(args);
    if (!filePath)
        return null;
    let suffix = "";
    if (readArgs.offset != null || readArgs.limit != null) {
        const parts = [];
        if (readArgs.offset != null)
            parts.push(`L${readArgs.offset}`);
        if (readArgs.limit != null)
            parts.push(`+${readArgs.limit}`);
        suffix = chalk.dim(` (${parts.join(", ")})`);
    }
    return `📖 ${formatFilePath(filePath)}${suffix}`;
}
function formatBashStart(_toolName, args) {
    const bashArgs = args;
    if (!bashArgs?.script)
        return null;
    const bg = bashArgs.run_in_background ? chalk.dim(" [background]") : "";
    const timeout = bashArgs.timeout_secs ? chalk.dim(` timeout:${bashArgs.timeout_secs}s`) : "";
    return `🔧 ${formatCommand(bashArgs.script)}${bg}${timeout}`;
}
function formatTaskStart(_toolName, args) {
    const taskArgs = args;
    if (!taskArgs?.title)
        return null;
    const bg = taskArgs.run_in_background ? chalk.dim(" [background]") : "";
    return `🤖 ${chalk.magenta(taskArgs.title)}${bg}`;
}
function formatWebFetchStart(_toolName, args) {
    const fetchArgs = args;
    if (!fetchArgs?.url)
        return null;
    return `🌐 ${chalk.blue(fetchArgs.url)}`;
}
function formatWebSearchStart(_toolName, args) {
    const searchArgs = args;
    if (!searchArgs?.query)
        return null;
    return `🔍 ${chalk.blue(searchArgs.query)}`;
}
function formatTodoStart(_toolName, args) {
    const todoArgs = args;
    if (!todoArgs?.todos)
        return null;
    return `📋 ${chalk.dim(`${todoArgs.todos.length} items`)}`;
}
function formatNotifyStart(_toolName, args) {
    const notifyArgs = args;
    if (!notifyArgs?.title)
        return null;
    return `🔔 ${chalk.yellow(notifyArgs.title)}`;
}
function formatStatusSetStart(_toolName, args) {
    const statusArgs = args;
    if (!statusArgs?.message)
        return null;
    const emoji = statusArgs.emoji ?? "📌";
    return `${emoji} ${chalk.dim(statusArgs.message)}`;
}
function formatSetExitCodeStart(_toolName, args) {
    const exitArgs = args;
    if (exitArgs?.exit_code === undefined)
        return null;
    const code = exitArgs.exit_code;
    const color = code === 0 ? chalk.green : chalk.red;
    return `🚪 exit ${color(code)}`;
}
function formatAgentSkillReadStart(_toolName, args) {
    const skillArgs = args;
    if (!skillArgs?.name)
        return null;
    return `📚 ${chalk.cyan(skillArgs.name)}`;
}
function formatCodeExecutionStart(_toolName, args) {
    const codeArgs = args;
    if (!codeArgs?.code)
        return null;
    // Show first line or truncated preview of code
    const firstLine = codeArgs.code.split("\n")[0];
    const maxLen = 60;
    const preview = firstLine.length > maxLen ? firstLine.slice(0, maxLen) + "…" : firstLine;
    return `🧮 ${chalk.yellow(preview)}`;
}
// ============================================================================
// Tool End Formatters
// ============================================================================
function formatFileEditEnd(_toolName, _args, result) {
    const editResult = result;
    if (editResult?.success === false) {
        return `${chalk.red("✗")} ${chalk.red(editResult.error || "Edit failed")}`;
    }
    if (editResult?.success && editResult.diff) {
        return formatDiff(editResult.diff);
    }
    return chalk.green("✓");
}
function formatFileReadEnd(_toolName, _args, result) {
    const readResult = result;
    if (readResult?.success === false) {
        return `${chalk.red("✗")} ${chalk.red(readResult.error || "Read failed")}`;
    }
    if (readResult?.success) {
        const size = readResult.file_size ? chalk.dim(` (${formatBytes(readResult.file_size)})`) : "";
        const lines = readResult.lines_read ? chalk.dim(` ${readResult.lines_read} lines`) : "";
        return `${chalk.green("✓")}${lines}${size}`;
    }
    return null;
}
function formatBashEnd(_toolName, _args, result) {
    if (!isRecord(result))
        return null;
    const bashResult = result;
    // Background process started
    if ("backgroundProcessId" in bashResult) {
        return `${chalk.blue("→")} background: ${chalk.dim(bashResult.backgroundProcessId)}`;
    }
    const duration = bashResult.wall_duration_ms
        ? chalk.dim(` (${formatDuration(bashResult.wall_duration_ms)})`)
        : "";
    const exitCode = bashResult.exitCode;
    const exitStr = exitCode === 0 ? chalk.green("exit:0") : chalk.red(`exit:${exitCode}`);
    let output = `${exitStr}${duration}`;
    // Show truncated output if present
    if (bashResult.output) {
        const lines = bashResult.output.split("\n");
        const maxLines = 20;
        const truncated = lines.length > maxLines;
        const displayLines = truncated ? lines.slice(0, maxLines) : lines;
        const outputText = displayLines.join("\n");
        if (outputText.trim()) {
            output += "\n" + indent(chalk.dim(outputText));
            if (truncated) {
                output += "\n" + indent(chalk.dim(`... ${lines.length - maxLines} more lines`));
            }
        }
    }
    // Show error if present (only on failure)
    if (!bashResult.success && bashResult.error) {
        output += "\n" + indent(chalk.red(bashResult.error));
    }
    return output;
}
function formatTaskEnd(_toolName, _args, result) {
    if (!isRecord(result))
        return null;
    const taskResult = result;
    // Prefer showing the report for completed tasks.
    const status = taskResult.status;
    const taskId = taskResult.taskId;
    const reportMarkdown = taskResult.reportMarkdown;
    if (status === "completed" && typeof reportMarkdown === "string") {
        // Truncate long reports
        const maxLen = 500;
        const truncated = reportMarkdown.length > maxLen ? reportMarkdown.slice(0, maxLen) + "…" : reportMarkdown;
        const id = typeof taskId === "string" ? ` ${chalk.dim(taskId)}` : "";
        return `${chalk.green("✓")}${id}\n${indent(chalk.dim(truncated))}`;
    }
    if ((status === "queued" || status === "running") && typeof taskId === "string") {
        return `${chalk.blue("→")} ${status}: ${chalk.dim(taskId)}`;
    }
    return null;
}
function formatWebFetchEnd(_toolName, _args, result) {
    const fetchResult = result;
    if (fetchResult?.success === false) {
        return `${chalk.red("✗")} ${chalk.red(fetchResult.error ?? "Fetch failed")}`;
    }
    if (fetchResult?.success) {
        const title = fetchResult.title ? chalk.dim(` "${fetchResult.title}"`) : "";
        const len = fetchResult.length ? chalk.dim(` ${formatBytes(fetchResult.length)}`) : "";
        return `${chalk.green("✓")}${title}${len}`;
    }
    return null;
}
function formatCodeExecutionEnd(_toolName, _args, result) {
    if (result === undefined || result === null)
        return null;
    // Code execution results can be complex - show truncated summary
    const resultStr = typeof result === "string" ? result : renderUnknown(result);
    const lines = resultStr.split("\n");
    const maxLines = 10;
    const truncated = lines.length > maxLines;
    const displayLines = truncated ? lines.slice(0, maxLines) : lines;
    let output = chalk.green("✓");
    if (displayLines.join("").trim()) {
        output += "\n" + indent(chalk.dim(displayLines.join("\n")));
        if (truncated) {
            output += "\n" + indent(chalk.dim(`... ${lines.length - maxLines} more lines`));
        }
    }
    return output;
}
/** Simple success/error marker for inline tools that don't need detailed result formatting */
function formatSimpleSuccessEnd(_toolName, _args, result) {
    // Check for error results
    const resultObj = result;
    if (resultObj?.success === false) {
        return `${chalk.red("✗")} ${chalk.red(resultObj.error ?? "Failed")}`;
    }
    return chalk.green("✓");
}
// ============================================================================
// Registry and Public API
// ============================================================================
const startFormatters = {
    file_edit_replace_string: formatFileEditStart,
    file_edit_replace_lines: formatFileEditStart,
    file_edit_insert: formatFileEditStart,
    file_read: formatFileReadStart,
    bash: formatBashStart,
    task: formatTaskStart,
    web_fetch: formatWebFetchStart,
    web_search: formatWebSearchStart,
    todo_write: formatTodoStart,
    notify: formatNotifyStart,
    status_set: formatStatusSetStart,
    set_exit_code: formatSetExitCodeStart,
    agent_skill_read: formatAgentSkillReadStart,
    agent_skill_read_file: formatAgentSkillReadStart,
    code_execution: formatCodeExecutionStart,
};
const endFormatters = {
    file_edit_replace_string: formatFileEditEnd,
    file_edit_replace_lines: formatFileEditEnd,
    file_edit_insert: formatFileEditEnd,
    file_read: formatFileReadEnd,
    bash: formatBashEnd,
    task: formatTaskEnd,
    task_await: formatTaskEnd,
    web_fetch: formatWebFetchEnd,
    code_execution: formatCodeExecutionEnd,
    // Inline tools with simple success markers (prevents generic fallback)
    web_search: formatSimpleSuccessEnd,
    todo_write: formatSimpleSuccessEnd,
    notify: formatSimpleSuccessEnd,
    status_set: formatSimpleSuccessEnd,
    set_exit_code: formatSimpleSuccessEnd,
    agent_skill_read: formatSimpleSuccessEnd,
    agent_skill_read_file: formatSimpleSuccessEnd,
};
/**
 * Format a tool-call-start event for CLI output.
 * Returns formatted string, or null to use generic fallback.
 */
export function formatToolStart(payload) {
    const formatter = startFormatters[payload.toolName];
    if (!formatter)
        return null;
    try {
        return formatter(payload.toolName, payload.args);
    }
    catch {
        return null;
    }
}
/**
 * Format a tool-call-end event for CLI output.
 * Returns formatted string, or null to use generic fallback.
 */
export function formatToolEnd(payload, startArgs) {
    const formatter = endFormatters[payload.toolName];
    if (!formatter)
        return null;
    try {
        return formatter(payload.toolName, startArgs, payload.result);
    }
    catch {
        return null;
    }
}
/**
 * Generic fallback formatter for unrecognized tools.
 */
export function formatGenericToolStart(payload) {
    return [
        TOOL_BLOCK_SEPARATOR,
        `${chalk.bold(payload.toolName)} ${chalk.dim(`(${payload.toolCallId})`)}`,
        chalk.dim("Args:"),
        indent(renderUnknown(payload.args)),
        TOOL_BLOCK_SEPARATOR,
    ].join("\n");
}
/**
 * Generic fallback formatter for unrecognized tool results.
 */
export function formatGenericToolEnd(payload) {
    return [
        TOOL_BLOCK_SEPARATOR,
        `${chalk.bold(payload.toolName)} ${chalk.dim("result")}`,
        indent(renderUnknown(payload.result)),
        TOOL_BLOCK_SEPARATOR,
    ].join("\n");
}
/**
 * Check if a tool should have its result on a new line (multi-line output).
 * For single-line results (file_read, web_fetch, etc.), result appears inline.
 */
export function isMultilineResultTool(toolName) {
    return MULTILINE_RESULT_TOOLS.has(toolName);
}
//# sourceMappingURL=toolFormatters.js.map