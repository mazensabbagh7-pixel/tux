import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * DiffRenderer - Shared diff rendering component
 * Used by FileEditToolCall for read-only diff display.
 * ReviewPanel uses SelectableDiffRenderer for interactive line selection.
 */
import React, { useEffect, useMemo, useState } from "react";
import { stopKeyboardPropagation } from "@/browser/utils/events";
import { cn } from "@/common/lib/utils";
import { getLanguageFromPath } from "@/common/utils/git/languageDetector";
import { useOverflowDetection } from "@/browser/hooks/useOverflowDetection";
import { MessageSquare } from "lucide-react";
import { InlineReviewNote } from "./InlineReviewNote";
import { Tooltip, TooltipTrigger, TooltipContent } from "../ui/tooltip";
import { groupDiffLines } from "@/browser/utils/highlighting/diffChunking";
import { useTheme } from "@/browser/contexts/ThemeContext";
import { escapeHtml, highlightDiffChunk, } from "@/browser/utils/highlighting/highlightDiffChunk";
import { LRUCache } from "lru-cache";
import { highlightSearchMatches, } from "@/browser/utils/highlighting/highlightSearchTerms";
import { parseReviewLineRange, } from "@/common/types/review";
const tint = (base, transparentPct) => `color-mix(in srgb, ${base}, transparent ${transparentPct}%)`;
const DIFF_LINE_STYLES = {
    add: {
        tintBase: "var(--color-success)",
        codeTintTransparentPct: 94,
        gutterTintTransparentPct: 86,
        contentColor: "var(--color-text)",
    },
    remove: {
        tintBase: "var(--color-danger)",
        codeTintTransparentPct: 94,
        gutterTintTransparentPct: 86,
        contentColor: "var(--color-text)",
    },
    header: {
        tintBase: "var(--color-accent)",
        codeTintTransparentPct: 95,
        gutterTintTransparentPct: 90,
        contentColor: "var(--color-accent-light)",
    },
    context: {
        tintBase: null,
        codeTintTransparentPct: 100,
        gutterTintTransparentPct: 100,
        contentColor: "var(--color-text-secondary)",
    },
};
// Helper function for the diff *code* background. This should stay relatively subtle.
const getDiffLineBackground = (type) => {
    const style = DIFF_LINE_STYLES[type];
    return style.tintBase ? tint(style.tintBase, style.codeTintTransparentPct) : "transparent";
};
// Helper function for the diff *gutter* background (line numbers / +/- area).
// This is intentionally more saturated than the code background for contrast.
// Context lines have no special background (same as code area).
const getDiffLineGutterBackground = (type) => {
    const style = DIFF_LINE_STYLES[type];
    return style.tintBase ? tint(style.tintBase, style.gutterTintTransparentPct) : "transparent";
};
// Helper function for getting line content color.
// Only headers/context are tinted; actual code stays the normal foreground color.
const getLineContentColor = (type) => DIFF_LINE_STYLES[type].contentColor;
// Split diff into lines while preserving indices.
// We only remove the trailing empty line if the input ends with a newline.
const splitDiffLines = (diff) => {
    const lines = diff.split(/\r?\n/);
    if (lines.length > 0 && lines[lines.length - 1] === "") {
        lines.pop();
    }
    return lines;
};
// Line number color - brighter for changed lines, dimmed for context.
const getLineNumberColor = (type) => {
    return type === "context"
        ? "color-mix(in srgb, var(--color-muted) 40%, transparent)"
        : "var(--color-text)";
};
// Indicator (+/-/space) character and color
const getIndicatorChar = (type) => {
    switch (type) {
        case "add":
            return "+";
        case "remove":
            return "−"; // Use proper minus sign for aesthetics
        default:
            return " ";
    }
};
const REVIEW_RANGE_TINT = "hsl(from var(--color-review-accent) h s l / 0.08)";
const applyReviewRangeOverlay = (base, isActive) => {
    if (!isActive)
        return base;
    return `linear-gradient(${REVIEW_RANGE_TINT}, ${REVIEW_RANGE_TINT}), ${base}`;
};
const doesLineMatchReviewRange = (line, range) => {
    const matchesOld = Boolean(range.old &&
        line.oldLineNum !== null &&
        line.oldLineNum >= range.old.start &&
        line.oldLineNum <= range.old.end);
    const matchesNew = Boolean(range.new &&
        line.newLineNum !== null &&
        line.newLineNum >= range.new.start &&
        line.newLineNum <= range.new.end);
    return matchesOld || matchesNew;
};
const getIndicatorColor = (type) => {
    switch (type) {
        case "add":
            return "var(--color-success)";
        case "remove":
            return "var(--color-danger)";
        default:
            return "transparent";
    }
};
const getLineNumberModeFlags = (lineNumberMode) => ({
    showOld: lineNumberMode !== "new",
    showNew: lineNumberMode !== "old",
});
/**
 * Calculate minimum column widths needed to display line numbers.
 * Works with any iterable of lines that have old/new line number properties.
 */
function calculateLineNumberWidths(lines, lineNumberMode) {
    let oldWidthCh = 0;
    let newWidthCh = 0;
    const { showOld, showNew } = getLineNumberModeFlags(lineNumberMode);
    for (const line of lines) {
        if (showOld && line.oldLineNum !== null) {
            oldWidthCh = Math.max(oldWidthCh, String(line.oldLineNum).length);
        }
        if (showNew && line.newLineNum !== null) {
            newWidthCh = Math.max(newWidthCh, String(line.newLineNum).length);
        }
    }
    return {
        oldWidthCh: showOld ? Math.max(2, oldWidthCh) : 0,
        newWidthCh: showNew ? Math.max(2, newWidthCh) : 0,
    };
}
const DiffLineGutter = ({ type, oldLineNum, newLineNum, showLineNumbers, lineNumberMode, lineNumberWidths, background, }) => {
    const { showOld, showNew } = getLineNumberModeFlags(lineNumberMode);
    const resolvedBackground = background ?? getDiffLineGutterBackground(type);
    return (_jsx("span", { className: "flex shrink-0 items-center gap-0.5 px-1 tabular-nums select-none", style: { background: resolvedBackground }, children: showLineNumbers && (_jsxs(_Fragment, { children: [showOld && (_jsx("span", { className: "text-right", style: {
                        width: `${lineNumberWidths.oldWidthCh}ch`,
                        color: getLineNumberColor(type),
                    }, children: oldLineNum ?? "" })), showNew && (_jsx("span", { className: showOld ? "ml-3 text-right" : "text-right", style: {
                        width: `${lineNumberWidths.newWidthCh}ch`,
                        color: getLineNumberColor(type),
                    }, children: newLineNum ?? "" }))] })) }));
};
const DiffIndicator = ({ type, background, reviewButton, onMouseDown, onMouseEnter, isInteractive, lineIndex, }) => (_jsxs("span", { "data-diff-indicator": true, "data-line-index": lineIndex, className: cn("relative text-center select-none", isInteractive && "cursor-pointer"), style: { background }, onMouseDown: onMouseDown, onMouseEnter: onMouseEnter, children: [_jsx("span", { className: cn("transition-opacity", reviewButton && "group-hover:opacity-0"), style: { color: getIndicatorColor(type) }, children: getIndicatorChar(type) }), reviewButton] }));
/**
 * Container component for diff rendering - exported for custom diff displays
 * Used by FileEditToolCall for wrapping custom diff content
 *
 * Uses CSS Grid for layout alignment:
 * - Column 1 (gutter): auto-sized to fit line numbers
 * - Column 2 (indicator): fixed 1rem for +/- symbols
 * - Column 3 (code): fills remaining space
 *
 * This ensures PaddingStrip alignment matches diff lines by construction,
 * without any JS-side width calculations.
 */
export const DiffContainer = ({ children, fontSize, maxHeight, className, firstLineType, lastLineType }) => {
    const resolvedMaxHeight = maxHeight ?? "400px";
    const [isExpanded, setIsExpanded] = React.useState(false);
    const contentRef = React.useRef(null);
    const clampContent = resolvedMaxHeight !== "none" && !isExpanded;
    React.useEffect(() => {
        if (maxHeight === "none") {
            setIsExpanded(false);
        }
    }, [maxHeight]);
    // Use RAF-throttled overflow detection to avoid forced reflows during React commit
    const isOverflowing = useOverflowDetection(contentRef, { enabled: clampContent });
    const showOverflowControls = clampContent && isOverflowing;
    // PaddingStrip uses CSS Grid columns to align with diff lines:
    // - Gutter cell (col 1): saturated background
    // - Code cells (cols 2-3): less saturated background
    // Alignment is guaranteed by CSS Grid - no width calculation needed.
    const PaddingStrip = ({ lineType }) => (_jsxs(_Fragment, { children: [_jsx("div", { className: "h-1.5", style: { background: lineType ? getDiffLineGutterBackground(lineType) : undefined } }), _jsx("div", { className: "col-span-2 h-1.5", style: { background: lineType ? getDiffLineBackground(lineType) : undefined } })] }));
    return (_jsxs("div", { className: cn("relative m-0 overflow-x-auto rounded-sm border border-border-light bg-code-bg [&_*]:text-[inherit]", className), children: [_jsxs("div", { ref: contentRef, className: cn("font-monospace grid", clampContent ? "overflow-y-hidden" : "overflow-y-visible", showOverflowControls && "pb-6"), style: {
                    fontSize: fontSize ?? "12px",
                    lineHeight: 1.4,
                    maxHeight: clampContent ? resolvedMaxHeight : undefined,
                    // CSS Grid columns: [gutter] auto | [indicator] 1rem | [code] 1fr
                    gridTemplateColumns: "auto 1rem 1fr",
                    // Ensure grid expands to content width so backgrounds span full width when scrolling
                    minWidth: "max-content",
                }, children: [_jsx(PaddingStrip, { lineType: firstLineType }), children, _jsx(PaddingStrip, { lineType: lastLineType })] }), showOverflowControls && (_jsxs(_Fragment, { children: [_jsx("div", { className: "via-[color-mix(in srgb, var(--color-code-bg) 80%, transparent)] pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-[var(--color-code-bg)] to-transparent" }), _jsx("div", { className: "absolute inset-x-0 bottom-0 flex justify-center pb-1.5", children: _jsx("button", { className: "bg-dark/60 text-foreground/80 hover:text-foreground border border-white/20 px-2 py-0.5 text-[10px] tracking-wide uppercase backdrop-blur transition hover:border-white/40", onClick: () => setIsExpanded(true), children: "Expand diff" }) })] }))] }));
};
/**
 * Module-level cache for fully-highlighted diff results.
 * Key: `${content.length}:${oldStart}:${newStart}:${language}:${themeMode}`
 * (Using content.length instead of full content as a fast differentiator - collisions are rare
 * and just cause re-highlighting, not incorrect rendering)
 *
 * This allows synchronous cache hits, eliminating the "Processing" flash when
 * re-rendering the same diff content (e.g., scrolling back to a previously-viewed message).
 */
const highlightedDiffCache = new LRUCache({
    max: 10000, // High limit - rely on maxSize for eviction
    maxSize: 4 * 1024 * 1024, // 4MB total
    sizeCalculation: (chunks) => chunks.reduce((total, chunk) => total + chunk.lines.reduce((lineTotal, line) => lineTotal + line.html.length * 2, 0), 0),
});
// Fast string hash (djb2 algorithm) - O(n) but very low constant factor
function hashString(str) {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
    }
    return hash >>> 0; // Convert to unsigned 32-bit
}
function getDiffCacheKey(content, language, oldStart, newStart, themeMode) {
    // Use hash of full content to avoid collisions where diffs differ only in the middle
    // (e.g., deletion vs addition of same line - only the +/- prefix differs)
    const contentHash = hashString(content);
    return `${contentHash}:${content.length}:${oldStart}:${newStart}:${language}:${themeMode}`;
}
/** Synchronous plain-text chunks for instant rendering (no "Processing..." flash) */
function createPlainTextChunks(content, oldStart, newStart) {
    const lines = splitDiffLines(content);
    return groupDiffLines(lines, oldStart, newStart).map((chunk) => ({
        type: chunk.type,
        lines: chunk.lines.map((line, i) => ({
            html: escapeHtml(line),
            oldLineNumber: chunk.oldLineNumbers[i],
            newLineNumber: chunk.newLineNumbers[i],
            originalIndex: chunk.startIndex + i,
        })),
        usedFallback: true,
    }));
}
/**
 * Hook to highlight diff content. Returns plain-text immediately, then upgrades
 * to syntax-highlighted when ready. Never returns null (no loading flash).
 */
function useHighlightedDiff(content, language, oldStart, newStart, themeMode) {
    const cacheKey = getDiffCacheKey(content, language, oldStart, newStart, themeMode);
    const cachedResult = highlightedDiffCache.get(cacheKey);
    // Sync fallback: plain-text chunks for instant render
    const plainText = useMemo(() => createPlainTextChunks(content, oldStart, newStart), [content, oldStart, newStart]);
    const [chunks, setChunks] = useState(cachedResult ?? plainText);
    const hasRealHighlightRef = React.useRef(false);
    useEffect(() => {
        const cached = highlightedDiffCache.get(cacheKey);
        if (cached) {
            setChunks(cached);
            if (language !== "text")
                hasRealHighlightRef.current = true;
            return;
        }
        // Keep syntax-highlighted version when toggling to language="text"
        if (language === "text" && hasRealHighlightRef.current)
            return;
        // Show plain-text immediately, then upgrade async
        setChunks(plainText);
        let cancelled = false;
        void (async () => {
            const lines = splitDiffLines(content);
            const diffChunks = groupDiffLines(lines, oldStart, newStart);
            const highlighted = await Promise.all(diffChunks.map((chunk) => highlightDiffChunk(chunk, language, themeMode)));
            if (!cancelled) {
                highlightedDiffCache.set(cacheKey, highlighted);
                setChunks(highlighted);
                if (language !== "text")
                    hasRealHighlightRef.current = true;
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [cacheKey, content, language, oldStart, newStart, themeMode, plainText]);
    return cachedResult ?? chunks;
}
/**
 * DiffRenderer - Renders diff content with consistent styling
 *
 * Expects content with standard diff format:
 * - Lines starting with '+' are additions (green)
 * - Lines starting with '-' are removals (red)
 * - Lines starting with ' ' or anything else are context
 * - Lines starting with '@@' are headers (blue)
 */
export const DiffRenderer = ({ content, showLineNumbers = true, lineNumberMode = "both", oldStart = 1, newStart = 1, filePath, fontSize, maxHeight, className, }) => {
    // Detect language for syntax highlighting (memoized to prevent repeated detection)
    const { theme } = useTheme();
    const language = React.useMemo(() => (filePath ? getLanguageFromPath(filePath) : "text"), [filePath]);
    const highlightedChunks = useHighlightedDiff(content, language, oldStart, newStart, theme);
    const lineNumberWidths = React.useMemo(() => {
        if (!showLineNumbers || !highlightedChunks) {
            return { oldWidthCh: 2, newWidthCh: 2 };
        }
        // Flatten chunks and map HighlightedLine property names to common interface
        const lines = highlightedChunks.flatMap((chunk) => chunk.lines.map((line) => ({
            oldLineNum: line.oldLineNumber,
            newLineNum: line.newLineNumber,
        })));
        return calculateLineNumberWidths(lines, lineNumberMode);
    }, [highlightedChunks, showLineNumbers, lineNumberMode]);
    // Get first and last line types for padding background colors
    const firstLineType = highlightedChunks[0]?.type;
    const lastLineType = highlightedChunks[highlightedChunks.length - 1]?.type;
    return (_jsx(DiffContainer, { fontSize: fontSize, maxHeight: maxHeight, className: className, firstLineType: firstLineType, lastLineType: lastLineType, children: highlightedChunks.flatMap((chunk) => chunk.lines.map((line) => {
            const codeBg = getDiffLineBackground(chunk.type);
            // Each line renders as 3 CSS Grid cells: gutter | indicator | code
            return (_jsxs(React.Fragment, { children: [_jsx(DiffLineGutter, { type: chunk.type, oldLineNum: line.oldLineNumber, newLineNum: line.newLineNumber, showLineNumbers: showLineNumbers, lineNumberMode: lineNumberMode, lineNumberWidths: lineNumberWidths }), _jsx(DiffIndicator, { type: chunk.type, background: codeBg }), _jsx("span", { className: "min-w-0 whitespace-pre [&_span:not(.search-highlight)]:!bg-transparent", style: {
                            background: codeBg,
                            color: getLineContentColor(chunk.type),
                        }, dangerouslySetInnerHTML: { __html: line.html } })] }, line.originalIndex));
        })) }));
};
// CSS class for diff line wrapper - used by arbitrary selector in CommentButton
const SELECTABLE_DIFF_LINE_CLASS = "selectable-diff-line";
const ReviewNoteInput = React.memo(({ selection, lineData, filePath, showLineNumbers, lineNumberMode, lineNumberWidths, onSubmit, onCancel, }) => {
    const { showOld, showNew } = getLineNumberModeFlags(lineNumberMode);
    const [noteText, setNoteText] = React.useState("");
    const textareaRef = React.useRef(null);
    // Auto-focus on mount
    React.useEffect(() => {
        textareaRef.current?.focus();
    }, []);
    // Auto-expand textarea as user types
    React.useEffect(() => {
        const textarea = textareaRef.current;
        if (!textarea)
            return;
        textarea.style.height = "auto";
        textarea.style.height = `${textarea.scrollHeight}px`;
    }, [noteText]);
    const handleSubmit = () => {
        const text = textareaRef.current?.value ?? noteText;
        if (!text.trim())
            return;
        const [start, end] = [selection.startIndex, selection.endIndex].sort((a, b) => a - b);
        const selectedLineData = lineData.slice(start, end + 1);
        const oldLineNumbers = selectedLineData
            .map((lineInfo) => lineInfo.oldLineNum)
            .filter((lineNum) => lineNum !== null);
        const newLineNumbers = selectedLineData
            .map((lineInfo) => lineInfo.newLineNum)
            .filter((lineNum) => lineNum !== null);
        const formatRange = (nums) => {
            if (nums.length === 0)
                return null;
            const min = Math.min(...nums);
            const max = Math.max(...nums);
            return min === max ? `${min}` : `${min}-${max}`;
        };
        const oldRange = formatRange(oldLineNumbers);
        const newRange = formatRange(newLineNumbers);
        const lineRange = [oldRange ? `-${oldRange}` : null, newRange ? `+${newRange}` : null]
            .filter((part) => Boolean(part))
            .join(" ");
        const oldWidth = Math.max(1, ...oldLineNumbers.map((n) => String(n).length));
        const newWidth = Math.max(1, ...newLineNumbers.map((n) => String(n).length));
        const allLines = selectedLineData.map((lineInfo) => {
            const indicator = lineInfo.raw[0] ?? " "; // +, -, or space
            const content = lineInfo.raw.slice(1); // Remove the indicator
            const oldStr = lineInfo.oldLineNum === null ? "" : String(lineInfo.oldLineNum);
            const newStr = lineInfo.newLineNum === null ? "" : String(lineInfo.newLineNum);
            return `${oldStr.padStart(oldWidth)} ${newStr.padStart(newWidth)} ${indicator} ${content}`;
        });
        // Elide middle lines if more than 20 lines selected (show 10 at start, 10 at end)
        let selectedCode;
        const CONTEXT_LINES = 10;
        const MAX_FULL_LINES = CONTEXT_LINES * 2;
        if (allLines.length <= MAX_FULL_LINES) {
            selectedCode = allLines.join("\n");
        }
        else {
            const omittedCount = allLines.length - MAX_FULL_LINES;
            selectedCode = [
                ...allLines.slice(0, CONTEXT_LINES),
                `    (${omittedCount} lines omitted)`,
                ...allLines.slice(-CONTEXT_LINES),
            ].join("\n");
        }
        const selectedDiff = selectedLineData.map((lineInfo) => lineInfo.raw).join("\n");
        const oldStart = oldLineNumbers.length ? Math.min(...oldLineNumbers) : 1;
        const newStart = newLineNumbers.length ? Math.min(...newLineNumbers) : 1;
        // Pass structured data instead of formatted message
        onSubmit({
            filePath,
            lineRange,
            selectedCode,
            selectedDiff,
            oldStart,
            newStart,
            userNote: text.trim(),
        });
    };
    // Determine the predominant line type for background matching
    const [start, end] = [selection.startIndex, selection.endIndex].sort((a, b) => a - b);
    const selectedTypes = lineData.slice(start, end + 1).map((l) => l.type);
    // Use the last selected line's type (where the input appears)
    const lineType = selectedTypes[selectedTypes.length - 1] ?? "context";
    const codeBg = getDiffLineBackground(lineType);
    // Renders as a subgrid row with 3 cells to align with diff lines: gutter | indicator | input
    return (_jsxs("div", { className: "col-span-3 grid grid-cols-subgrid", children: [_jsx("span", { className: "flex shrink-0 items-center gap-0.5 px-1 tabular-nums select-none", style: { background: getDiffLineGutterBackground(lineType) }, children: showLineNumbers && (_jsxs(_Fragment, { children: [showOld && _jsx("span", { style: { width: `${lineNumberWidths.oldWidthCh}ch` } }), showNew && (_jsx("span", { className: showOld ? "ml-3" : undefined, style: { width: `${lineNumberWidths.newWidthCh}ch` } }))] })) }), _jsx("span", { style: { background: codeBg } }), _jsx("div", { className: "min-w-0 py-1.5 pr-3", style: { background: codeBg }, children: _jsxs("div", { className: "flex w-full max-w-[560px] overflow-hidden rounded border border-[var(--color-review-accent)]/30 shadow-sm", style: {
                        background: "hsl(from var(--color-review-accent) h s l / 0.08)",
                    }, children: [_jsx("div", { className: "w-[3px] shrink-0", style: { background: "var(--color-review-accent)" } }), _jsx("textarea", { ref: textareaRef, className: "text-primary placeholder:text-muted/70 min-w-0 flex-1 resize-none overflow-y-hidden bg-transparent px-2 py-1.5 text-[12px] leading-[1.5] transition-colors focus:outline-none", style: {
                                minHeight: "calc(12px * 1.5 * 2 + 12px)",
                            }, placeholder: "Add a review note\u2026 (Enter to submit, Shift+Enter for newline, Esc to cancel)", value: noteText, onChange: (e) => setNoteText(e.target.value), onClick: (e) => e.stopPropagation(), onKeyDown: (e) => {
                                stopKeyboardPropagation(e);
                                const isEnter = e.key === "Enter" || e.keyCode === 13;
                                const isEscape = e.key === "Escape" || e.keyCode === 27;
                                if (isEnter) {
                                    if (e.shiftKey) {
                                        // Shift+Enter: allow newline (default behavior)
                                        return;
                                    }
                                    // Enter: submit
                                    e.preventDefault();
                                    handleSubmit();
                                }
                                else if (isEscape) {
                                    e.preventDefault();
                                    onCancel();
                                }
                            } }), _jsx("button", { type: "button", className: "text-muted hover:text-primary shrink-0 px-2", "aria-label": "Submit review note", onClick: (e) => {
                                e.stopPropagation();
                                handleSubmit();
                            }, children: "\u21B5" })] }) })] }));
});
ReviewNoteInput.displayName = "ReviewNoteInput";
const InlineReviewNoteRow = React.memo(({ review, lineType, showLineNumbers, lineNumberMode, lineNumberWidths, reviewActions }) => {
    const codeBg = getDiffLineBackground(lineType);
    const { showOld, showNew } = getLineNumberModeFlags(lineNumberMode);
    return (_jsxs("div", { className: "col-span-3 grid grid-cols-subgrid", "data-inline-review-note": true, "data-review-id": review.id, children: [_jsx("span", { className: "flex shrink-0 items-center gap-0.5 px-1 tabular-nums select-none", style: { background: getDiffLineGutterBackground(lineType) }, children: showLineNumbers && (_jsxs(_Fragment, { children: [showOld && _jsx("span", { style: { width: `${lineNumberWidths.oldWidthCh}ch` } }), showNew && (_jsx("span", { className: showOld ? "ml-3" : undefined, style: { width: `${lineNumberWidths.newWidthCh}ch` } }))] })) }), _jsx("span", { style: { background: codeBg } }), _jsx("div", { className: "min-w-0 py-0.5 pr-3", style: { background: codeBg }, children: _jsx(InlineReviewNote, { review: review, showFilePath: false, actions: reviewActions }) })] }));
});
InlineReviewNoteRow.displayName = "InlineReviewNoteRow";
export const SelectableDiffRenderer = React.memo(({ content, showLineNumbers = true, lineNumberMode = "both", oldStart = 1, newStart = 1, filePath, inlineReviews, fontSize, maxHeight, className, onReviewNote, onLineClick, searchConfig, enableHighlighting = true, onComposingChange, reviewActions, }) => {
    const dragAnchorRef = React.useRef(null);
    const [isDragging, setIsDragging] = React.useState(false);
    React.useEffect(() => {
        const stopDragging = () => {
            setIsDragging(false);
            dragAnchorRef.current = null;
        };
        window.addEventListener("mouseup", stopDragging);
        window.addEventListener("blur", stopDragging);
        return () => {
            window.removeEventListener("mouseup", stopDragging);
            window.removeEventListener("blur", stopDragging);
        };
    }, []);
    const { theme } = useTheme();
    const [selection, setSelection] = React.useState(null);
    // Notify parent when composition state changes
    React.useEffect(() => {
        onComposingChange?.(selection !== null);
    }, [selection, onComposingChange]);
    // On unmount, ensure we release the pause if we were composing
    // (separate effect with empty deps so cleanup only runs on unmount)
    React.useEffect(() => {
        return () => {
            onComposingChange?.(false);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally only clean up on unmount
    }, []);
    // Detect language for syntax highlighting (memoized to prevent repeated detection)
    const language = React.useMemo(() => (filePath ? getLanguageFromPath(filePath) : "text"), [filePath]);
    // Only highlight if enabled (for viewport optimization)
    const highlightedChunks = useHighlightedDiff(content, enableHighlighting ? language : "text", oldStart, newStart, theme);
    // Parse raw lines once for use in lineData
    const rawLines = React.useMemo(() => splitDiffLines(content), [content]);
    // Build lineData from highlighted chunks (memoized to prevent repeated parsing)
    // Includes raw content for review note submission
    const lineData = React.useMemo(() => {
        const data = [];
        highlightedChunks.forEach((chunk) => {
            chunk.lines.forEach((line) => {
                data.push({
                    index: line.originalIndex,
                    type: chunk.type,
                    oldLineNum: line.oldLineNumber,
                    newLineNum: line.newLineNumber,
                    html: line.html,
                    raw: rawLines[line.originalIndex] ?? "",
                });
            });
        });
        return data;
    }, [highlightedChunks, rawLines]);
    // Memoize highlighted line data to avoid re-parsing HTML on every render
    // Only recalculate when lineData or searchConfig changes
    const highlightedLineData = React.useMemo(() => {
        if (!searchConfig)
            return lineData;
        return lineData.map((line) => ({
            ...line,
            html: highlightSearchMatches(line.html, searchConfig),
        }));
    }, [lineData, searchConfig]);
    const lineNumberWidths = React.useMemo(() => showLineNumbers
        ? calculateLineNumberWidths(lineData, lineNumberMode)
        : { oldWidthCh: 2, newWidthCh: 2 }, [lineData, showLineNumbers, lineNumberMode]);
    const parsedInlineReviews = React.useMemo(() => {
        if (!inlineReviews?.length)
            return [];
        const parsed = [];
        for (const review of inlineReviews) {
            if (review.data?.filePath !== filePath)
                continue;
            const parsedRange = parseReviewLineRange(review.data?.lineRange ?? "");
            if (!parsedRange)
                continue;
            parsed.push({ review, range: parsedRange });
        }
        return parsed;
    }, [inlineReviews, filePath]);
    const { inlineReviewsByAnchor, reviewRangeByLineIndex } = React.useMemo(() => {
        if (!parsedInlineReviews.length) {
            return {
                inlineReviewsByAnchor: new Map(),
                reviewRangeByLineIndex: new Array(lineData.length).fill(false),
            };
        }
        const anchored = new Map();
        const rangeMatches = new Array(lineData.length).fill(false);
        for (const { review, range } of parsedInlineReviews) {
            let anchorIndex = null;
            for (let i = 0; i < lineData.length; i++) {
                const line = lineData[i];
                if (doesLineMatchReviewRange(line, range)) {
                    rangeMatches[i] = true;
                    anchorIndex = i;
                }
            }
            if (anchorIndex === null)
                continue;
            const existing = anchored.get(anchorIndex);
            if (existing) {
                existing.push(review);
            }
            else {
                anchored.set(anchorIndex, [review]);
            }
        }
        return {
            inlineReviewsByAnchor: anchored,
            reviewRangeByLineIndex: rangeMatches,
        };
    }, [lineData, parsedInlineReviews]);
    const startDragSelection = React.useCallback((lineIndex, shiftKey) => {
        if (!onReviewNote) {
            return;
        }
        // Notify parent that this hunk should become active
        onLineClick?.();
        const anchor = shiftKey && selection ? selection.startIndex : lineIndex;
        dragAnchorRef.current = anchor;
        setIsDragging(true);
        setSelection({ startIndex: anchor, endIndex: lineIndex });
    }, [onLineClick, onReviewNote, selection]);
    const updateDragSelection = React.useCallback((lineIndex) => {
        if (!isDragging || dragAnchorRef.current === null) {
            return;
        }
        setSelection({ startIndex: dragAnchorRef.current, endIndex: lineIndex });
    }, [isDragging]);
    const handleCommentButtonClick = (lineIndex, shiftKey) => {
        // Notify parent that this hunk should become active
        onLineClick?.();
        // Shift-click: extend existing selection
        if (shiftKey && selection) {
            const start = selection.startIndex;
            setSelection({
                startIndex: start,
                endIndex: lineIndex,
            });
            return;
        }
        // Regular click: start new selection
        setSelection({
            startIndex: lineIndex,
            endIndex: lineIndex,
        });
    };
    const handleSubmitNote = (data) => {
        if (!onReviewNote)
            return;
        onReviewNote(data);
        setSelection(null);
    };
    const handleCancelNote = () => {
        setSelection(null);
    };
    const isLineSelected = (index) => {
        if (!selection)
            return false;
        const [start, end] = [selection.startIndex, selection.endIndex].sort((a, b) => a - b);
        return index >= start && index <= end;
    };
    // Get first and last line types for padding background colors
    const firstLineType = highlightedLineData[0]?.type;
    const lastLineType = highlightedLineData[highlightedLineData.length - 1]?.type;
    // Selection highlight overlay - applied via box-shadow to avoid affecting grid layout
    const selectionHighlight = "inset 0 0 0 100vmax hsl(from var(--color-review-accent) h s l / 0.16)";
    return (_jsx(DiffContainer, { fontSize: fontSize, maxHeight: maxHeight, className: className, firstLineType: firstLineType, lastLineType: lastLineType, children: highlightedLineData.map((lineInfo, displayIndex) => {
            const isSelected = isLineSelected(displayIndex);
            const isInReviewRange = reviewRangeByLineIndex[displayIndex] ?? false;
            const baseCodeBg = getDiffLineBackground(lineInfo.type);
            const codeBg = applyReviewRangeOverlay(baseCodeBg, isInReviewRange);
            const gutterBg = applyReviewRangeOverlay(getDiffLineGutterBackground(lineInfo.type), isInReviewRange);
            const anchoredReviews = inlineReviewsByAnchor.get(displayIndex);
            // Each line renders as 3 CSS Grid cells: gutter | indicator | code
            // Use display:contents wrapper for selection state + group hover behavior
            return (_jsxs(React.Fragment, { children: [_jsxs("div", { className: cn(SELECTABLE_DIFF_LINE_CLASS, "group relative col-span-3 grid cursor-text grid-cols-subgrid"), "data-selected": isSelected ? "true" : "false", children: [_jsx(DiffLineGutter, { type: lineInfo.type, oldLineNum: lineInfo.oldLineNum, newLineNum: lineInfo.newLineNum, showLineNumbers: showLineNumbers, lineNumberMode: lineNumberMode, lineNumberWidths: lineNumberWidths, background: gutterBg }), _jsx(DiffIndicator, { type: lineInfo.type, background: codeBg, lineIndex: displayIndex, isInteractive: Boolean(onReviewNote), onMouseDown: (e) => {
                                    if (!onReviewNote)
                                        return;
                                    if (e.button !== 0)
                                        return;
                                    e.preventDefault();
                                    e.stopPropagation();
                                    startDragSelection(displayIndex, e.shiftKey);
                                }, onMouseEnter: () => {
                                    if (!onReviewNote)
                                        return;
                                    updateDragSelection(displayIndex);
                                }, reviewButton: onReviewNote && (_jsxs(Tooltip, { open: selection || isDragging ? false : undefined, children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("button", { className: "pointer-events-none absolute inset-0 flex items-center justify-center rounded-sm text-[var(--color-review-accent)]/60 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 hover:text-[var(--color-review-accent)] active:scale-90", onClick: (e) => {
                                                    e.stopPropagation();
                                                    handleCommentButtonClick(displayIndex, e.shiftKey);
                                                }, "aria-label": "Add review comment", children: _jsx(MessageSquare, { className: "size-3" }) }) }), _jsxs(TooltipContent, { side: "bottom", align: "start", children: ["Add review comment", _jsx("br", {}), "(Shift-click or drag to select range)"] })] })) }), _jsx("span", { className: "min-w-0 whitespace-pre [&_span:not(.search-highlight)]:!bg-transparent", style: {
                                    background: codeBg,
                                    color: getLineContentColor(lineInfo.type),
                                    boxShadow: isSelected ? selectionHighlight : undefined,
                                }, dangerouslySetInnerHTML: { __html: lineInfo.html } })] }), isSelected &&
                        selection &&
                        displayIndex === Math.max(selection.startIndex, selection.endIndex) && (_jsx(ReviewNoteInput, { selection: selection, lineData: lineData, filePath: filePath, showLineNumbers: showLineNumbers, lineNumberMode: lineNumberMode, lineNumberWidths: lineNumberWidths, onSubmit: handleSubmitNote, onCancel: handleCancelNote })), anchoredReviews?.map((review) => (_jsx(InlineReviewNoteRow, { review: review, lineType: lineInfo.type, showLineNumbers: showLineNumbers, lineNumberMode: lineNumberMode, lineNumberWidths: lineNumberWidths, reviewActions: reviewActions }, review.id)))] }, displayIndex));
        }) }));
});
SelectableDiffRenderer.displayName = "SelectableDiffRenderer";
//# sourceMappingURL=DiffRenderer.js.map