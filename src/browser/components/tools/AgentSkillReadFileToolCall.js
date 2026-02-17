import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { FileIcon } from "@/browser/components/FileIcon";
import { ToolContainer, ToolHeader, ExpandIcon, StatusIndicator, ToolDetails, DetailSection, DetailLabel, DetailContent, LoadingDots, ToolIcon, ErrorBox, } from "./shared/ToolPrimitives";
import { useToolExpansion, getStatusDisplay, isToolErrorResult, } from "./shared/toolUtils";
import { JsonHighlight } from "./shared/HighlightedCode";
function formatBytes(bytes) {
    if (bytes < 1024)
        return `${bytes}B`;
    if (bytes < 1024 * 1024)
        return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
function isFileReadSuccessResult(val) {
    if (!val || typeof val !== "object")
        return false;
    const record = val;
    if (record.success !== true)
        return false;
    return (typeof record.file_size === "number" &&
        typeof record.modifiedTime === "string" &&
        typeof record.lines_read === "number" &&
        typeof record.content === "string");
}
/**
 * Parse file_read content which comes formatted as:
 * LINE_NUMBER\tCONTENT
 * LINE_NUMBER\tCONTENT
 * ...
 */
function parseFileContent(content) {
    const lines = content.split("\n");
    const lineNumbers = [];
    const contentLines = [];
    for (const line of lines) {
        const tabIndex = line.indexOf("\t");
        if (tabIndex !== -1) {
            // Line has format: NUMBER\tCONTENT
            lineNumbers.push(line.substring(0, tabIndex));
            contentLines.push(line.substring(tabIndex + 1));
        }
        else {
            // Malformed or empty line - preserve as-is
            lineNumbers.push("");
            contentLines.push(line);
        }
    }
    const actualContent = contentLines.join("\n");
    // Calculate actual bytes (content + newlines, without line number prefixes)
    const actualBytes = new TextEncoder().encode(actualContent).length;
    return { lineNumbers, actualContent, actualBytes };
}
export const AgentSkillReadFileToolCall = ({ args, result, status = "pending", }) => {
    const { expanded, toggleExpanded } = useToolExpansion();
    const successResult = isFileReadSuccessResult(result) ? result : null;
    const errorResult = isToolErrorResult(result) ? result : null;
    const hasResult = result !== undefined && result !== null;
    const hasUnrecognizedResult = hasResult && !successResult && !errorResult;
    // Parse the file content to extract line numbers and actual content
    const parsedContent = successResult?.content ? parseFileContent(successResult.content) : null;
    const displayPath = `${args.name}/${args.filePath}`;
    return (_jsxs(ToolContainer, { expanded: expanded, className: "@container", children: [_jsxs(ToolHeader, { onClick: toggleExpanded, children: [_jsx(ExpandIcon, { expanded: expanded, children: "\u25B6" }), _jsx(ToolIcon, { toolName: "agent_skill_read_file" }), _jsxs("div", { className: "text-text flex max-w-96 min-w-0 items-center gap-1.5", children: [_jsx(FileIcon, { filePath: args.filePath, className: "text-[15px] leading-none" }), _jsx("span", { className: "font-monospace truncate", children: displayPath })] }), successResult && parsedContent && (_jsxs("span", { className: "text-secondary font-monospace ml-2 text-[10px] whitespace-nowrap", children: [_jsx("span", { className: "hidden @sm:inline", children: "read " }), formatBytes(parsedContent.actualBytes), _jsxs("span", { className: "hidden @lg:inline", children: [" of ", formatBytes(successResult.file_size)] })] })), _jsx(StatusIndicator, { status: status, children: getStatusDisplay(status) })] }), expanded && (_jsxs(ToolDetails, { children: [_jsx(DetailSection, { children: _jsxs("div", { className: "bg-code-bg flex flex-wrap gap-4 rounded px-2 py-1.5 text-[11px] leading-[1.4]", children: [_jsxs("div", { className: "flex items-baseline gap-1.5", children: [_jsx("span", { className: "text-secondary font-medium", children: "Skill:" }), _jsx("span", { className: "text-text font-monospace break-all", children: args.name })] }), _jsxs("div", { className: "flex items-baseline gap-1.5", children: [_jsx("span", { className: "text-secondary font-medium", children: "File:" }), _jsx("span", { className: "text-text font-monospace break-all", children: args.filePath })] }), args.offset != null && (_jsxs("div", { className: "flex items-baseline gap-1.5", children: [_jsx("span", { className: "text-secondary font-medium", children: "Offset:" }), _jsxs("span", { className: "text-text font-monospace break-all", children: ["line ", args.offset] })] })), args.limit != null && (_jsxs("div", { className: "flex items-baseline gap-1.5", children: [_jsx("span", { className: "text-secondary font-medium", children: "Limit:" }), _jsxs("span", { className: "text-text font-monospace break-all", children: [args.limit, " lines"] })] })), successResult && (_jsxs(_Fragment, { children: [_jsxs("div", { className: "flex items-baseline gap-1.5", children: [_jsx("span", { className: "text-secondary font-medium", children: "Modified:" }), _jsx("span", { className: "text-text font-monospace break-all", children: successResult.modifiedTime })] }), _jsxs("div", { className: "flex items-baseline gap-1.5", children: [_jsx("span", { className: "text-secondary font-medium", children: "Lines:" }), _jsx("span", { className: "text-text font-monospace break-all", children: successResult.lines_read })] }), _jsxs("div", { className: "flex items-baseline gap-1.5", children: [_jsx("span", { className: "text-secondary font-medium", children: "Size:" }), _jsx("span", { className: "text-text font-monospace break-all", children: formatBytes(successResult.file_size) })] })] }))] }) }), errorResult && (_jsxs(DetailSection, { children: [_jsx(DetailLabel, { children: "Error" }), _jsx(ErrorBox, { children: errorResult.error })] })), hasUnrecognizedResult && (_jsxs(_Fragment, { children: [_jsxs(DetailSection, { children: [_jsx(DetailLabel, { children: "Error" }), _jsx(ErrorBox, { children: "Unrecognized tool output shape" })] }), _jsxs(DetailSection, { children: [_jsx(DetailLabel, { children: "Result" }), _jsx(DetailContent, { children: _jsx(JsonHighlight, { value: result }) })] })] })), parsedContent && (_jsxs(DetailSection, { children: [_jsx(DetailLabel, { children: "Content" }), _jsxs("div", { className: "bg-code-bg m-0 flex max-h-[200px] overflow-y-auto rounded px-2 py-1.5 text-[11px] leading-[1.4]", children: [_jsx("div", { className: "text-secondary font-monospace mr-2 min-w-10 border-r border-white/10 pr-3 text-right opacity-40 select-none", children: parsedContent.lineNumbers.map((lineNum, i) => (_jsx("div", { children: lineNum }, i))) }), _jsx("pre", { className: "font-monospace m-0 flex-1 p-0 break-words whitespace-pre-wrap", children: parsedContent.actualContent })] })] })), status === "executing" && !hasResult && (_jsx(DetailSection, { children: _jsxs(DetailContent, { children: ["Reading skill file", _jsx(LoadingDots, {})] }) }))] }))] }));
};
//# sourceMappingURL=AgentSkillReadFileToolCall.js.map