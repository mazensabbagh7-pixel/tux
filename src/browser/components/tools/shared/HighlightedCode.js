import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React, { useState, useEffect } from "react";
import { highlightCode } from "@/browser/utils/highlighting/highlightWorkerClient";
import { extractShikiLines } from "@/browser/utils/highlighting/shiki-shared";
import { useTheme } from "@/browser/contexts/ThemeContext";
import { cn } from "@/common/lib/utils";
/**
 * Renders code with syntax highlighting using Shiki (via web worker)
 * Falls back to plain text on first render or if highlighting fails
 */
export const HighlightedCode = ({ code, language, className, showLineNumbers = false, startLineNumber = 1, }) => {
    const [highlightedLines, setHighlightedLines] = useState(null);
    const { theme: themeMode } = useTheme();
    const plainLines = code.split("\n").filter((line, i, arr) => i < arr.length - 1 || line !== "");
    useEffect(() => {
        let cancelled = false;
        const theme = themeMode === "light" || themeMode.endsWith("-light") ? "light" : "dark";
        setHighlightedLines(null);
        async function highlight() {
            try {
                const html = await highlightCode(code, language, theme);
                if (!cancelled) {
                    const lines = extractShikiLines(html);
                    const filtered = lines.filter((l, i, a) => i < a.length - 1 || l.trim() !== "");
                    setHighlightedLines(filtered.length > 0 ? filtered : null);
                }
            }
            catch (error) {
                console.warn(`Failed to highlight ${language}:`, error);
                if (!cancelled)
                    setHighlightedLines(null);
            }
        }
        void highlight();
        return () => {
            cancelled = true;
        };
    }, [code, language, themeMode]);
    const lines = highlightedLines ?? plainLines;
    if (showLineNumbers) {
        return (_jsx("div", { className: "code-block-container text-[11px]", children: lines.map((content, idx) => (_jsxs(React.Fragment, { children: [_jsx("div", { className: "line-number", children: startLineNumber + idx }), _jsx("div", { className: "code-line", ...(highlightedLines
                            ? { dangerouslySetInnerHTML: { __html: content } }
                            : { children: content }) })] }, idx))) }));
    }
    const baseClasses = cn("font-mono text-[11px] leading-relaxed", className);
    if (highlightedLines) {
        return (_jsx("div", { className: baseClasses, dangerouslySetInnerHTML: { __html: highlightedLines.join("\n") } }));
    }
    return _jsx("div", { className: baseClasses, children: code });
};
/** Renders a value as syntax-highlighted JSON with line numbers */
export const JsonHighlight = ({ value, className }) => {
    const jsonString = React.useMemo(() => {
        if (value === null || value === undefined)
            return "null";
        if (typeof value === "string") {
            try {
                return JSON.stringify(JSON.parse(value), null, 2);
            }
            catch {
                return value;
            }
        }
        try {
            return JSON.stringify(value, null, 2);
        }
        catch {
            return "[Complex Object]";
        }
    }, [value]);
    return (_jsx(HighlightedCode, { code: jsonString, language: "json", className: className, showLineNumbers: true }));
};
//# sourceMappingURL=HighlightedCode.js.map