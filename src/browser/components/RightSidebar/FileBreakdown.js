import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React from "react";
import { FileIcon } from "@/browser/components/FileIcon";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/browser/components/ui/tooltip";
// Format token display - show k for thousands with 1 decimal
const formatTokens = (tokens) => tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}k` : tokens.toLocaleString();
// Strip "./" prefix from file paths for cleaner display
const formatPath = (path) => (path.startsWith("./") ? path.slice(2) : path);
const FileBreakdownComponent = ({ files, totalTokens }) => {
    if (files.length === 0) {
        return null;
    }
    return (_jsx("div", { className: "flex flex-col gap-1", children: files.map((file) => {
            const percentage = totalTokens > 0 ? (file.tokens / totalTokens) * 100 : 0;
            const displayPath = formatPath(file.path);
            return (_jsxs("div", { className: "flex items-center gap-1.5", children: [_jsx(FileIcon, { filePath: file.path, className: "text-secondary shrink-0 text-xs" }), _jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { className: "dir-rtl text-foreground min-w-0 flex-1 truncate text-left text-xs", children: _jsx("bdi", { children: displayPath }) }), _jsx(TooltipContent, { side: "left", children: displayPath })] }), _jsxs("span", { className: "text-muted shrink-0 text-[11px]", children: [formatTokens(file.tokens), " (", percentage.toFixed(1), "%)"] })] }, file.path));
        }) }));
};
export const FileBreakdown = React.memo(FileBreakdownComponent);
//# sourceMappingURL=FileBreakdown.js.map