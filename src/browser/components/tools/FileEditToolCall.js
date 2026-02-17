import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import React from "react";
import { FileIcon } from "@/browser/components/FileIcon";
import { parsePatch } from "diff";
import { extractToolFilePath } from "@/common/utils/tools/toolInputFilePath";
import { getToolOutputUiOnly } from "@/common/utils/tools/toolOutputUiOnly";
import { ToolContainer, ToolHeader, ExpandIcon, StatusIndicator, ToolDetails, DetailSection, DetailLabel, LoadingDots, ToolIcon, ErrorBox, } from "./shared/ToolPrimitives";
import { useToolExpansion, getStatusDisplay } from "./shared/toolUtils";
import { useCopyToClipboard } from "@/browser/hooks/useCopyToClipboard";
import { DiffContainer, DiffRenderer, SelectableDiffRenderer } from "../shared/DiffRenderer";
import { KebabMenu } from "../KebabMenu";
import { JsonHighlight } from "./shared/HighlightedCode";
function renderDiff(diff, filePath, onReviewNote) {
    try {
        const patches = parsePatch(diff);
        if (patches.length === 0) {
            return _jsx("div", { style: { padding: "8px", color: "var(--color-muted)" }, children: "No changes" });
        }
        // Render each hunk using SelectableDiffRenderer if we have a callback, otherwise DiffRenderer
        return patches.map((patch, patchIdx) => (_jsx(React.Fragment, { children: patch.hunks.map((hunk, hunkIdx) => (_jsx(React.Fragment, { children: onReviewNote && filePath ? (_jsx(SelectableDiffRenderer, { content: hunk.lines.join("\n"), showLineNumbers: true, oldStart: hunk.oldStart, newStart: hunk.newStart, filePath: filePath, fontSize: "11px", onReviewNote: onReviewNote })) : (_jsx(DiffRenderer, { content: hunk.lines.join("\n"), showLineNumbers: true, oldStart: hunk.oldStart, newStart: hunk.newStart, filePath: filePath, fontSize: "11px" })) }, hunkIdx))) }, patchIdx)));
    }
    catch (error) {
        return _jsxs(ErrorBox, { children: ["Failed to parse diff: ", String(error)] });
    }
}
export const FileEditToolCall = ({ toolName, args, result, status = "pending", onReviewNote, }) => {
    // Collapse failed edits by default since they're common and expected
    const isFailed = result && !result.success;
    const initialExpanded = !isFailed;
    const { expanded, toggleExpanded } = useToolExpansion(initialExpanded);
    const [showRaw, setShowRaw] = React.useState(false);
    const [showInvocation, setShowInvocation] = React.useState(false);
    const uiOnlyDiff = getToolOutputUiOnly(result)?.file_edit?.diff;
    const diff = result && result.success ? (uiOnlyDiff ?? result.diff) : undefined;
    const filePath = extractToolFilePath(args);
    // Copy to clipboard with feedback
    const { copied, copyToClipboard } = useCopyToClipboard();
    // Build kebab menu items - only show menu when there's a result
    const kebabMenuItems = result
        ? [
            {
                label: showInvocation ? "Hide Invocation" : "Show Invocation",
                onClick: () => setShowInvocation(!showInvocation),
                active: showInvocation,
            },
            // Copy/show patch options only for successful edits with diffs
            ...(result.success && diff
                ? [
                    {
                        label: copied ? "Copied" : "Copy Patch",
                        onClick: () => void copyToClipboard(diff),
                    },
                    {
                        label: showRaw ? "Show Parsed" : "Show Patch",
                        onClick: () => setShowRaw(!showRaw),
                        active: showRaw,
                    },
                ]
                : []),
        ]
        : [];
    return (_jsxs(ToolContainer, { expanded: expanded, children: [_jsxs(ToolHeader, { className: "hover:text-secondary cursor-default", children: [_jsxs("div", { onClick: toggleExpanded, className: "hover:text-text flex flex-1 cursor-pointer items-center gap-2", children: [_jsx(ExpandIcon, { expanded: expanded, children: "\u25B6" }), _jsx(ToolIcon, { toolName: toolName }), _jsxs("div", { className: "text-text flex max-w-96 min-w-0 items-center gap-1.5", children: [_jsx(FileIcon, { filePath: filePath, className: "text-[15px] leading-none" }), _jsx("span", { className: "font-monospace truncate", children: filePath })] })] }), !(result && result.success && diff) && (_jsx(StatusIndicator, { status: status, children: getStatusDisplay(status) })), kebabMenuItems.length > 0 && (_jsx("div", { className: "mr-2", children: _jsx(KebabMenu, { items: kebabMenuItems }) }))] }), expanded && (_jsxs(ToolDetails, { children: [showInvocation && (_jsxs(DetailSection, { children: [_jsx(DetailLabel, { children: "Invocation" }), _jsx(JsonHighlight, { value: { tool: toolName, args } })] })), result && (_jsxs(_Fragment, { children: [result.success === false && result.error && (_jsxs(DetailSection, { children: [_jsx(DetailLabel, { children: "Error" }), _jsx(ErrorBox, { children: result.error })] })), result.success &&
                                diff &&
                                (showRaw ? (_jsx(DiffContainer, { children: _jsx("pre", { className: "font-monospace m-0 text-[11px] leading-[1.4] break-words whitespace-pre-wrap", children: diff }) })) : (renderDiff(diff, filePath, onReviewNote)))] })), status === "executing" && !result && (_jsx(DetailSection, { children: _jsxs("div", { className: "text-secondary text-[11px]", children: ["Waiting for result", _jsx(LoadingDots, {})] }) }))] }))] }));
};
//# sourceMappingURL=FileEditToolCall.js.map