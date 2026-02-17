import { jsx as _jsx } from "react/jsx-runtime";
import React, { useMemo } from "react";
import { cn } from "@/common/lib/utils";
import { MarkdownCore } from "./MarkdownCore";
import { StreamingContext } from "./StreamingContext";
// Use React.memo to prevent unnecessary re-renders from parent
export const TypewriterMarkdown = React.memo(function TypewriterMarkdown({ deltas, isComplete, className, preserveLineBreaks, }) {
    // Simply join all deltas - no artificial delays or character-by-character rendering
    const content = deltas.join("");
    // Show cursor only when streaming (not complete)
    const isStreaming = !isComplete && content.length > 0;
    const streamingContextValue = useMemo(() => ({ isStreaming }), [isStreaming]);
    return (_jsx(StreamingContext.Provider, { value: streamingContextValue, children: _jsx("div", { className: cn("markdown-content", className), children: _jsx(MarkdownCore, { content: content, parseIncompleteMarkdown: isStreaming, preserveLineBreaks: preserveLineBreaks }) }) }));
});
//# sourceMappingURL=TypewriterMarkdown.js.map