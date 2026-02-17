import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Server-Side Rendered Code Block Component
 * Used by mdbook-shiki preprocessor to generate static HTML
 * Reuses CopyIcon and styles from main app to ensure consistency
 */
import React from "react";
import { CopyIcon } from "../icons/CopyIcon";
export function CodeBlockSSR({ code, highlightedLines }) {
    return (_jsxs("div", { className: "code-block-wrapper", "data-code": code, children: [_jsx("div", { className: "code-block-container", children: highlightedLines.map((lineHtml, idx) => (_jsxs(React.Fragment, { children: [_jsx("div", { className: "line-number", children: idx + 1 }), _jsx("div", { className: "code-line", dangerouslySetInnerHTML: { __html: lineHtml } })] }, idx))) }), _jsx("button", { className: "copy-button code-copy-button", "aria-label": "Copy to clipboard", children: _jsx(CopyIcon, { className: "copy-icon" }) })] }));
}
//# sourceMappingURL=CodeBlockSSR.js.map