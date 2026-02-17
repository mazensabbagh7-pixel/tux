import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
/**
 * ReviewBlock - Renders review data as styled components
 *
 * Used in:
 * - UserMessage to display submitted reviews (from metadata)
 * - ChatInput preview to show reviews before sending
 */
import { useState, useCallback, useRef, useMemo } from "react";
import { Pencil, Check, Trash2, Unlink } from "lucide-react";
import { DiffRenderer } from "./DiffRenderer";
import { Button } from "../ui/button";
import { Tooltip, TooltipTrigger, TooltipContent } from "../ui/tooltip";
import { formatLineRangeCompact } from "@/browser/utils/review/lineRange";
import { matchesKeybind, formatKeybind, KEYBINDS } from "@/browser/utils/ui/keybinds";
/**
 * Core review block rendering - used by both ReviewBlock and ReviewBlockFromData
 */
const ReviewBlockCore = ({ filePath, lineRange, code, diff, oldStart, newStart, comment, onDetach, onComplete, onDelete, onEditComment, compact = false, }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editValue, setEditValue] = useState(comment);
    const textareaRef = useRef(null);
    // Check if code has embedded line numbers (from review selection)
    // Format: "12 14 + content" or " 1  2   content"
    const hasEmbeddedLineNumbers = useMemo(() => {
        if (!code)
            return false;
        const firstLine = code.split("\n")[0] ?? "";
        // Match: optional digits, space, optional digits, space, then +/-/space
        return /^\s*\d*\s+\d*\s+[+-\s]/.test(firstLine);
    }, [code]);
    const handleStartEdit = useCallback(() => {
        setEditValue(comment);
        setIsEditing(true);
        setTimeout(() => textareaRef.current?.focus(), 0);
    }, [comment]);
    const handleSaveEdit = useCallback(() => {
        if (onEditComment && editValue.trim() !== comment) {
            onEditComment(editValue.trim());
        }
        setIsEditing(false);
    }, [editValue, comment, onEditComment]);
    const handleCancelEdit = useCallback(() => {
        setEditValue(comment);
        setIsEditing(false);
    }, [comment]);
    const handleKeyDown = useCallback((e) => {
        if (matchesKeybind(e, KEYBINDS.SAVE_EDIT)) {
            e.preventDefault();
            handleSaveEdit();
        }
        else if (matchesKeybind(e, KEYBINDS.CANCEL_EDIT)) {
            e.preventDefault();
            handleCancelEdit();
        }
    }, [handleSaveEdit, handleCancelEdit]);
    // Has any action available
    const hasActions = Boolean(onComplete ?? onDetach ?? onDelete ?? onEditComment);
    return (_jsxs("div", { className: "group/review min-w-0 overflow-hidden rounded border border-[var(--color-review-accent)]/30 bg-[var(--color-review-accent)]/5", children: [_jsxs("div", { className: "flex items-center gap-1.5 border-b border-[var(--color-review-accent)]/20 bg-[var(--color-review-accent)]/10 px-2 py-1 text-xs", children: [!compact && (_jsxs("span", { className: "text-primary min-w-0 flex-1 truncate font-mono text-[11px]", children: [filePath, ":L", formatLineRangeCompact(lineRange)] })), compact && (_jsxs("span", { className: "text-muted min-w-0 flex-1 truncate font-mono text-[10px]", children: ["L", formatLineRangeCompact(lineRange)] })), hasActions && (_jsxs("div", { className: "flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/review:opacity-100", children: [onEditComment && !isEditing && (_jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("button", { type: "button", onClick: handleStartEdit, "aria-label": "Edit comment", className: "text-muted hover:text-secondary flex items-center justify-center rounded p-1 transition-colors", children: _jsx(Pencil, { className: "size-3" }) }) }), _jsx(TooltipContent, { children: "Edit comment" })] })), onComplete && (_jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("button", { type: "button", onClick: onComplete, "aria-label": "Mark as done", className: "text-muted hover:text-success flex items-center justify-center rounded p-1 transition-colors", children: _jsx(Check, { className: "size-3" }) }) }), _jsx(TooltipContent, { children: "Mark as done" })] })), onDetach && (_jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("button", { type: "button", onClick: onDetach, "aria-label": "Detach from message", className: "text-muted hover:text-secondary flex items-center justify-center rounded p-1 transition-colors", children: _jsx(Unlink, { className: "size-3" }) }) }), _jsx(TooltipContent, { children: "Detach from message" })] })), onDelete && (_jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("button", { type: "button", onClick: onDelete, "aria-label": "Delete review", className: "text-muted hover:text-error flex items-center justify-center rounded p-1 transition-colors", children: _jsx(Trash2, { className: "size-3" }) }) }), _jsx(TooltipContent, { children: "Delete review" })] }))] }))] }), (diff ?? code) && (_jsx("div", { className: "max-h-48 overflow-auto text-[11px]", children: diff ? (_jsx(DiffRenderer, { content: diff, showLineNumbers: true, oldStart: oldStart ?? 1, newStart: newStart ?? 1, fontSize: "11px", filePath: filePath, maxHeight: "none", className: "min-w-fit rounded-none" })) : hasEmbeddedLineNumbers ? (
                // Legacy: code with embedded line numbers - render as plain monospace
                _jsx("pre", { className: "font-monospace bg-code-bg p-1.5 text-[11px] leading-[1.4] whitespace-pre", children: code })) : (
                // Standard diff format (without reliable start numbers) - highlight but omit gutters
                _jsx(DiffRenderer, { content: code, showLineNumbers: false, fontSize: "11px", filePath: filePath, maxHeight: "none", className: "min-w-fit rounded-none" })) })), (comment || onEditComment) && (_jsx("div", { className: "border-t border-[var(--color-review-accent)]/20 px-2 py-1", children: isEditing ? (_jsxs("div", { className: "space-y-1", children: [_jsx("textarea", { ref: textareaRef, value: editValue, onChange: (e) => setEditValue(e.target.value), onKeyDown: handleKeyDown, className: "text-primary w-full resize-none rounded border border-[var(--color-review-accent)]/40 bg-[var(--color-review-accent)]/10 px-1.5 py-1 text-xs focus:border-[var(--color-review-accent)]/60 focus:outline-none", rows: 2, placeholder: "Your comment..." }), _jsxs("div", { className: "flex items-center justify-end gap-1", children: [_jsxs("span", { className: "text-muted text-[10px]", children: [formatKeybind(KEYBINDS.SAVE_EDIT), " \u00B7 ", formatKeybind(KEYBINDS.CANCEL_EDIT)] }), _jsx(Button, { variant: "ghost", size: "sm", className: "h-5 px-1.5 text-[10px]", onClick: handleCancelEdit, children: "Cancel" }), _jsx(Button, { variant: "secondary", size: "sm", className: "h-5 px-1.5 text-[10px]", onClick: handleSaveEdit, children: "Save" })] })] })) : (_jsx("blockquote", { className: "text-secondary border-l-2 border-[var(--color-review-accent)]/50 pl-2 text-xs leading-relaxed whitespace-pre-wrap", children: comment || _jsx("span", { className: "text-muted italic", children: "No comment" }) })) }))] }));
};
/**
 * ReviewBlock that takes structured data directly (preferred)
 * Used when review data is available from muxMetadata
 */
export const ReviewBlockFromData = ({ data, onDetach, onComplete, onDelete, onEditComment, compact, }) => {
    return (_jsx(ReviewBlockCore, { filePath: data.filePath, lineRange: data.lineRange, code: data.selectedCode, diff: data.selectedDiff, oldStart: data.oldStart, newStart: data.newStart, comment: data.userNote, onDetach: onDetach, compact: compact, onComplete: onComplete, onDelete: onDelete, onEditComment: onEditComment }));
};
//# sourceMappingURL=ReviewBlock.js.map