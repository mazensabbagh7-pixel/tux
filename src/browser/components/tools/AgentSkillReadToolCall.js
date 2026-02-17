import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { ToolContainer, ToolHeader, ExpandIcon, StatusIndicator, ToolDetails, DetailSection, DetailLabel, DetailContent, LoadingDots, ToolIcon, ErrorBox, } from "./shared/ToolPrimitives";
import { useToolExpansion, getStatusDisplay, isToolErrorResult, } from "./shared/toolUtils";
import { MarkdownRenderer } from "../Messages/MarkdownRenderer";
import { JsonHighlight } from "./shared/HighlightedCode";
function isAgentSkillPackage(val) {
    if (!val || typeof val !== "object")
        return false;
    const record = val;
    if (typeof record.scope !== "string")
        return false;
    if (typeof record.directoryName !== "string")
        return false;
    if (typeof record.body !== "string")
        return false;
    const frontmatter = record.frontmatter;
    if (!frontmatter || typeof frontmatter !== "object")
        return false;
    const fm = frontmatter;
    if (typeof fm.name !== "string")
        return false;
    if (typeof fm.description !== "string")
        return false;
    return true;
}
function isAgentSkillReadSuccessResult(val) {
    if (!val || typeof val !== "object")
        return false;
    const record = val;
    if (record.success !== true)
        return false;
    return isAgentSkillPackage(record.skill);
}
export const AgentSkillReadToolCall = ({ args, result, status = "pending", }) => {
    const { expanded, toggleExpanded } = useToolExpansion();
    const successResult = isAgentSkillReadSuccessResult(result) ? result : null;
    const errorResult = isToolErrorResult(result) ? result : null;
    const hasResult = result !== undefined && result !== null;
    const hasUnrecognizedResult = hasResult && !successResult && !errorResult;
    const frontmatter = successResult?.skill.frontmatter;
    return (_jsxs(ToolContainer, { expanded: expanded, className: "@container", children: [_jsxs(ToolHeader, { onClick: toggleExpanded, children: [_jsx(ExpandIcon, { expanded: expanded, children: "\u25B6" }), _jsx(ToolIcon, { toolName: "agent_skill_read" }), _jsxs("div", { className: "text-text font-monospace flex max-w-96 min-w-0 items-baseline gap-1.5", children: [_jsx("span", { className: "text-secondary whitespace-nowrap", children: "Read skill:" }), _jsx("span", { className: "truncate", children: args.name })] }), successResult && (_jsxs("span", { className: "text-secondary ml-2 text-[10px] whitespace-nowrap", children: [_jsx("span", { className: "hidden @sm:inline", children: "scope " }), successResult.skill.scope] })), _jsx(StatusIndicator, { status: status, children: getStatusDisplay(status) })] }), expanded && (_jsxs(ToolDetails, { children: [_jsx(DetailSection, { children: _jsxs("div", { className: "bg-code-bg flex flex-wrap gap-4 rounded px-2 py-1.5 text-[11px] leading-[1.4]", children: [_jsxs("div", { className: "flex items-baseline gap-1.5", children: [_jsx("span", { className: "text-secondary font-medium", children: "Skill:" }), _jsx("span", { className: "text-text font-monospace break-all", children: args.name })] }), successResult && (_jsxs(_Fragment, { children: [_jsxs("div", { className: "flex items-baseline gap-1.5", children: [_jsx("span", { className: "text-secondary font-medium", children: "Scope:" }), _jsx("span", { className: "text-text font-monospace break-all", children: successResult.skill.scope })] }), _jsxs("div", { className: "flex items-baseline gap-1.5", children: [_jsx("span", { className: "text-secondary font-medium", children: "Directory:" }), _jsx("span", { className: "text-text font-monospace break-all", children: successResult.skill.directoryName })] })] }))] }) }), errorResult && (_jsxs(DetailSection, { children: [_jsx(DetailLabel, { children: "Error" }), _jsx(ErrorBox, { children: errorResult.error })] })), hasUnrecognizedResult && (_jsxs(_Fragment, { children: [_jsxs(DetailSection, { children: [_jsx(DetailLabel, { children: "Error" }), _jsx(ErrorBox, { children: "Unrecognized tool output shape" })] }), _jsxs(DetailSection, { children: [_jsx(DetailLabel, { children: "Result" }), _jsx(DetailContent, { children: _jsx(JsonHighlight, { value: result }) })] })] })), successResult && frontmatter && (_jsxs(_Fragment, { children: [_jsxs(DetailSection, { children: [_jsx(DetailLabel, { children: "Description" }), _jsx(DetailContent, { className: "px-2 py-1.5", children: frontmatter.description })] }), frontmatter.license && (_jsxs(DetailSection, { children: [_jsx(DetailLabel, { children: "License" }), _jsx(DetailContent, { className: "px-2 py-1.5", children: frontmatter.license })] })), frontmatter.compatibility && (_jsxs(DetailSection, { children: [_jsx(DetailLabel, { children: "Compatibility" }), _jsx(DetailContent, { className: "px-2 py-1.5", children: frontmatter.compatibility })] })), frontmatter.metadata && (_jsxs(DetailSection, { children: [_jsx(DetailLabel, { children: "Metadata" }), _jsx(DetailContent, { children: _jsx(JsonHighlight, { value: frontmatter.metadata }) })] })), _jsxs(DetailSection, { children: [_jsx(DetailLabel, { children: "Contents" }), _jsx("div", { className: "bg-code-bg max-h-[300px] overflow-y-auto rounded px-3 py-2 text-[12px]", children: _jsx(MarkdownRenderer, { content: successResult.skill.body }) })] })] })), status === "executing" && !hasResult && (_jsx(DetailSection, { children: _jsxs("div", { className: "text-secondary text-[11px]", children: ["Reading skill", _jsx(LoadingDots, {})] }) }))] }))] }));
};
//# sourceMappingURL=AgentSkillReadToolCall.js.map