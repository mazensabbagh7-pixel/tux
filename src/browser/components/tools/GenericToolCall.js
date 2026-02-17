import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { ToolContainer, ToolHeader, ExpandIcon, ToolIcon, TOOL_NAME_TO_ICON, ToolName, StatusIndicator, ToolDetails, DetailSection, DetailLabel, DetailContent, LoadingDots, } from "./shared/ToolPrimitives";
import { useToolExpansion, getStatusDisplay } from "./shared/toolUtils";
import { JsonHighlight } from "./shared/HighlightedCode";
import { ToolResultImages, extractImagesFromToolResult } from "./shared/ToolResultImages";
/**
 * Filter out image data from result for JSON display (to avoid showing huge base64 strings).
 * Replaces media content with a placeholder indicator.
 */
function filterResultForDisplay(result) {
    if (typeof result !== "object" || result === null)
        return result;
    const contentResult = result;
    if (contentResult.type !== "content" || !Array.isArray(contentResult.value))
        return result;
    // Replace media entries with placeholder
    const filteredValue = contentResult.value.map((item) => {
        if (typeof item === "object" && item !== null && item.type === "media") {
            const mediaItem = item;
            return { type: "media", mediaType: mediaItem.mediaType, data: "[image data]" };
        }
        return item;
    });
    return { ...contentResult, value: filteredValue };
}
export const GenericToolCall = ({ toolName, args, result, status = "pending", }) => {
    const { expanded, toggleExpanded } = useToolExpansion();
    const hasDetails = args !== undefined || result !== undefined;
    const images = extractImagesFromToolResult(result);
    const hasImages = images.length > 0;
    // Auto-expand if there are images to show
    const shouldShowDetails = expanded || hasImages;
    return (_jsxs(ToolContainer, { expanded: shouldShowDetails, children: [_jsxs(ToolHeader, { onClick: () => hasDetails && toggleExpanded(), children: [hasDetails && _jsx(ExpandIcon, { expanded: shouldShowDetails, children: "\u25B6" }), TOOL_NAME_TO_ICON[toolName] && _jsx(ToolIcon, { toolName: toolName }), _jsx(ToolName, { children: toolName }), _jsx(StatusIndicator, { status: status, children: getStatusDisplay(status) })] }), hasImages && _jsx(ToolResultImages, { result: result }), expanded && hasDetails && (_jsxs(ToolDetails, { children: [args !== undefined && (_jsxs(DetailSection, { children: [_jsx(DetailLabel, { children: "Arguments" }), _jsx(DetailContent, { children: _jsx(JsonHighlight, { value: args }) })] })), result !== undefined && (_jsxs(DetailSection, { children: [_jsx(DetailLabel, { children: "Result" }), _jsx(DetailContent, { children: _jsx(JsonHighlight, { value: filterResultForDisplay(result) }) })] })), status === "executing" && !result && (_jsx(DetailSection, { children: _jsxs(DetailContent, { children: ["Waiting for result", _jsx(LoadingDots, {})] }) })), status === "redacted" && (_jsx(DetailSection, { children: _jsx(DetailContent, { className: "text-muted italic", children: "Output excluded from shared transcript" }) }))] }))] }));
};
//# sourceMappingURL=GenericToolCall.js.map