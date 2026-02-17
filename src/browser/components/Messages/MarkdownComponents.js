import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import React, { useState, useEffect } from "react";
import { Play } from "lucide-react";
import { Mermaid } from "./Mermaid";
import { useOptionalMessageListContext } from "./MessageListContext";
import { highlightCode } from "@/browser/utils/highlighting/highlightWorkerClient";
import { extractShikiLines } from "@/browser/utils/highlighting/shiki-shared";
import { useTheme } from "@/browser/contexts/ThemeContext";
import { CopyButton } from "@/browser/components/ui/CopyButton";
const RUNNABLE_SHELL_LANGUAGES = new Set([
    "bash",
    "sh",
    "shell",
    "zsh",
    "fish",
    "powershell",
    "pwsh",
    "cmd",
    "batch",
]);
function normalizeSuggestedShellCommand(code) {
    const lines = code.split("\n");
    // Trim leading/trailing blank lines (but preserve blank lines in the middle).
    while (lines.length > 0 && lines[0].trim() === "") {
        lines.shift();
    }
    while (lines.length > 0 && lines[lines.length - 1].trim() === "") {
        lines.pop();
    }
    let promptKind = null;
    return lines
        .map((line, idx) => {
        // Remove leading prompt characters (copy/paste friendly).
        // Examples:
        //   $ npm install
        //   $ cat <<EOF
        //   > line 1
        //   > EOF
        //   PS C:\Users\mike> npm install
        //   C:\Users\mike> npm install
        // Common Unix shell prompt marker.
        if (/^\s*\$\s+/.test(line)) {
            promptKind = "unix";
            return line.replace(/^\s*\$\s+/, "");
        }
        // PowerShell prompt marker.
        if (/^\s*PS(?:\s+[^>]+)?>\s*/.test(line)) {
            promptKind = "powershell";
            return line.replace(/^\s*PS(?:\s+[^>]+)?>\s*/, "");
        }
        // cmd.exe prompt marker.
        if (/^\s*[A-Za-z]:\\[^>]*>\s*/.test(line)) {
            promptKind = "cmd";
            return line.replace(/^\s*[A-Za-z]:\\[^>]*>\s*/, "");
        }
        // Avoid stripping leading `>` on the *first* line since it can be a valid
        // redirection operator (e.g. `> output.txt` truncates/creates a file).
        //
        // But if the snippet starts with a `$ ` prompt marker, then `> ` on subsequent
        // lines is usually a continuation prompt (PS2) and should be stripped.
        if (promptKind === "unix" && idx > 0) {
            return line.replace(/^\s*>\s+/, "");
        }
        // cmd.exe continuation prompt is just `>` (space after is optional).
        if (promptKind === "cmd" && idx > 0) {
            return line.replace(/^\s*>\s*/, "");
        }
        // PowerShell uses `>>` for continuation lines.
        if (promptKind === "powershell" && idx > 0) {
            return line.replace(/^\s*>>\s+/, "");
        }
        return line;
    })
        .join("\n")
        .trim();
}
function isRunnableShellLanguage(language) {
    return RUNNABLE_SHELL_LANGUAGES.has(language.toLowerCase());
}
/**
 * CodeBlock component with async Shiki highlighting
 * Displays code with line numbers in a CSS grid
 */
const CodeBlock = ({ code, language, highlightLanguage }) => {
    const [highlightedLines, setHighlightedLines] = useState(null);
    const shikiLanguage = highlightLanguage ?? language;
    const { theme: themeMode } = useTheme();
    // Split code into lines, removing trailing empty line
    const plainLines = code
        .split("\n")
        .filter((line, idx, arr) => idx < arr.length - 1 || line !== "");
    useEffect(() => {
        let cancelled = false;
        const isLight = themeMode === "light" || themeMode.endsWith("-light");
        const theme = isLight ? "light" : "dark";
        setHighlightedLines(null);
        async function highlight() {
            try {
                const html = await highlightCode(code, shikiLanguage, theme);
                if (!cancelled) {
                    const lines = extractShikiLines(html);
                    // Remove trailing empty line if present
                    const filteredLines = lines.filter((line, idx, arr) => idx < arr.length - 1 || line.trim() !== "");
                    setHighlightedLines(filteredLines.length > 0 ? filteredLines : null);
                }
            }
            catch (error) {
                console.warn(`Failed to highlight code block (${shikiLanguage}):`, error);
                if (!cancelled)
                    setHighlightedLines(null);
            }
        }
        void highlight();
        return () => {
            cancelled = true;
        };
    }, [code, shikiLanguage, themeMode]);
    const messageListContext = useOptionalMessageListContext();
    const openTerminal = messageListContext?.openTerminal;
    const runnableCommand = isRunnableShellLanguage(language)
        ? normalizeSuggestedShellCommand(code)
        : "";
    const showRunButton = Boolean(openTerminal) && runnableCommand.length > 0;
    const lines = highlightedLines ?? plainLines;
    const isSingleLine = lines.length === 1;
    return (_jsxs("div", { className: `code-block-wrapper${isSingleLine ? " code-block-single-line" : ""}${showRunButton ? " code-block-runnable" : ""}`, children: [_jsx("div", { className: "code-block-container", children: lines.map((content, idx) => (_jsxs(React.Fragment, { children: [_jsx("div", { className: "line-number", children: idx + 1 }), _jsx("div", { className: "code-line", ...(highlightedLines
                                ? { dangerouslySetInnerHTML: { __html: content } }
                                : { children: _jsx("code", { children: content }) }) })] }, idx))) }), showRunButton ? (_jsx("button", { type: "button", className: "copy-button code-run-button", "aria-label": "Run command", onClick: () => openTerminal?.({ initialCommand: runnableCommand }), children: _jsx(Play, { className: "copy-icon" }) })) : null, _jsx(CopyButton, { text: code, className: "code-copy-button" })] }));
};
// Custom components for markdown rendering
export const markdownComponents = {
    // Pass through pre element - let code component handle the wrapping
    pre: ({ children }) => _jsx(_Fragment, { children: children }),
    // Custom anchor to open links externally
    a: ({ href, children }) => (_jsx("a", { href: href, target: "_blank", rel: "noopener noreferrer", children: children })),
    // Custom details/summary for collapsible sections
    details: ({ children, open }) => (_jsx("details", { open: open, className: "bg-code-bg my-2 rounded border border-white/10 px-2 py-1 text-sm", children: children })),
    summary: ({ children }) => (_jsx("summary", { className: "cursor-pointer py-1 pl-1 font-semibold select-none", children: children })),
    // Custom code block renderer with async Shiki highlighting
    code: ({ inline, className, children, node, ...props }) => {
        const match = /language-([^\s]+)/.exec(className ?? "");
        const language = match ? match[1] : "";
        // Extract text content
        const childString = typeof children === "string" ? children : Array.isArray(children) ? children.join("") : "";
        const hasMultipleLines = childString.includes("\n");
        const isInline = inline ?? !hasMultipleLines;
        // Handle mermaid diagrams specially
        if (!isInline && language === "mermaid") {
            return _jsx(Mermaid, { chart: childString });
        }
        // Code blocks with language - use async Shiki highlighting
        if (!isInline && language) {
            const highlightLanguage = language === "shell-session" ? "shell" : language;
            return (_jsx(CodeBlock, { code: childString, language: language, highlightLanguage: highlightLanguage }));
        }
        // Code blocks without language (global CSS provides styling)
        if (!isInline) {
            return (_jsx("pre", { children: _jsx("code", { className: className, ...props, children: children }) }));
        }
        // Inline code (filter out node prop to avoid [object Object])
        return (_jsx("code", { className: className, ...props, children: children }));
    },
};
//# sourceMappingURL=MarkdownComponents.js.map