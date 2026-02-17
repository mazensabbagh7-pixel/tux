import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * InlineReviewNote - compact review note UI (comment + status + actions).
 *
 * Used for inline review notes rendered inside diff views (e.g. the Review pane).
 * Does NOT include code chunk rendering; parent components provide that context.
 */
import { useState, useCallback, useEffect, useRef } from "react";
import { Pencil, Check, Trash2, Unlink, MessageSquare } from "lucide-react";
import { Button } from "../ui/button";
import { Tooltip, TooltipTrigger, TooltipContent } from "../ui/tooltip";
import { formatLineRangeCompact } from "@/browser/utils/review/lineRange";
import { matchesKeybind, formatKeybind, KEYBINDS } from "@/browser/utils/ui/keybinds";
import { cn } from "@/common/lib/utils";
// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * Compact inline review note with header, status, and optional actions.
 * Used for consistent review display in both ChatInput and Review pane.
 */
export const InlineReviewNote = ({ review, showFilePath = false, actions, className, }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editValue, setEditValue] = useState(review.data.userNote);
    const textareaRef = useRef(null);
    const isEditingRef = useRef(false);
    const actionsRef = useRef(actions);
    useEffect(() => {
        actionsRef.current = actions;
    }, [actions]);
    useEffect(() => {
        return () => {
            if (isEditingRef.current) {
                actionsRef.current?.onEditingChange?.(review.id, false);
            }
        };
    }, [review.id]);
    const handleStartEdit = useCallback(() => {
        setEditValue(review.data.userNote);
        setIsEditing(true);
        isEditingRef.current = true;
        actions?.onEditingChange?.(review.id, true);
        setTimeout(() => textareaRef.current?.focus(), 0);
    }, [review.data.userNote, review.id, actions]);
    const handleSaveEdit = useCallback(() => {
        if (actions?.onEditComment && editValue.trim() !== review.data.userNote) {
            actions.onEditComment(review.id, editValue.trim());
        }
        setIsEditing(false);
        isEditingRef.current = false;
        actions?.onEditingChange?.(review.id, false);
    }, [editValue, review.data.userNote, review.id, actions]);
    const handleCancelEdit = useCallback(() => {
        setEditValue(review.data.userNote);
        setIsEditing(false);
        isEditingRef.current = false;
        actions?.onEditingChange?.(review.id, false);
    }, [review.data.userNote, review.id, actions]);
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
    // Determine which actions are available based on status
    const canEdit = Boolean(actions?.onEditComment) && !isEditing;
    const canComplete = Boolean(actions?.onComplete) && review.status !== "checked";
    const canUncheck = Boolean(actions?.onUncheck) && review.status === "checked";
    const canDetach = Boolean(actions?.onDetach) && review.status === "attached";
    const canAttach = Boolean(actions?.onAttach) && review.status === "pending";
    const canDelete = Boolean(actions?.onDelete);
    const hasActions = [canEdit, canComplete, canUncheck, canDetach, canAttach, canDelete].some(Boolean);
    // Color based on status
    const tintColor = review.status === "checked" ? "var(--color-success)" : "var(--color-review-accent)";
    const containerBg = review.status === "checked"
        ? "hsl(from var(--color-success) h s l / 0.06)"
        : "hsl(from var(--color-review-accent) h s l / 0.08)";
    const borderColor = review.status === "checked"
        ? "hsl(from var(--color-success) h s l / 0.3)"
        : "hsl(from var(--color-review-accent) h s l / 0.3)";
    return (_jsxs("div", { className: cn("group/review-note flex w-full max-w-[560px] overflow-hidden rounded border shadow-sm", className), style: { background: containerBg, borderColor }, children: [_jsx("div", { className: "w-[3px] shrink-0", style: { background: tintColor } }), _jsxs("div", { className: "min-w-0 flex-1 px-2 py-1", children: [_jsxs("div", { className: "flex items-center gap-1.5 text-[10px]", children: [_jsx(MessageSquare, { className: "size-3 shrink-0", style: { color: tintColor } }), showFilePath ? (_jsxs("span", { className: "text-primary min-w-0 flex-1 truncate font-mono text-[10px]", children: [review.data.filePath, ":L", formatLineRangeCompact(review.data.lineRange)] })) : (_jsxs("span", { className: "text-muted font-mono", children: ["L", formatLineRangeCompact(review.data.lineRange)] })), _jsx("span", { className: cn("shrink-0 rounded px-1 py-0.5 text-[9px] font-medium uppercase", review.status === "checked"
                                    ? "bg-success/20 text-success"
                                    : review.status === "attached"
                                        ? "bg-warning/20 text-warning"
                                        : "bg-muted/20 text-muted"), children: review.status }), hasActions && (_jsxs("div", { className: "ml-auto flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/review-note:opacity-100", children: [canEdit && (_jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("button", { type: "button", onClick: handleStartEdit, "aria-label": "Edit comment", className: "text-muted hover:text-secondary flex items-center justify-center rounded p-0.5 transition-colors", children: _jsx(Pencil, { className: "size-3" }) }) }), _jsx(TooltipContent, { children: "Edit comment" })] })), canComplete && (_jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("button", { type: "button", onClick: () => actions?.onComplete?.(review.id), "aria-label": "Mark as done", className: "text-muted hover:text-success flex items-center justify-center rounded p-0.5 transition-colors", children: _jsx(Check, { className: "size-3" }) }) }), _jsx(TooltipContent, { children: "Mark as done" })] })), canUncheck && (_jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("button", { type: "button", onClick: () => actions?.onUncheck?.(review.id), "aria-label": "Uncheck", className: "text-muted hover:text-warning flex items-center justify-center rounded p-0.5 transition-colors", children: _jsx(Check, { className: "size-3" }) }) }), _jsx(TooltipContent, { children: "Uncheck (back to pending)" })] })), canAttach && (_jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("button", { type: "button", onClick: () => actions?.onAttach?.(review.id), "aria-label": "Attach to message", className: "text-muted hover:text-review-accent flex items-center justify-center rounded p-0.5 transition-colors", children: _jsx(MessageSquare, { className: "size-3" }) }) }), _jsx(TooltipContent, { children: "Attach to message" })] })), canDetach && (_jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("button", { type: "button", onClick: () => actions?.onDetach?.(review.id), "aria-label": "Detach from message", className: "text-muted hover:text-secondary flex items-center justify-center rounded p-0.5 transition-colors", children: _jsx(Unlink, { className: "size-3" }) }) }), _jsx(TooltipContent, { children: "Detach from message" })] })), canDelete && (_jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("button", { type: "button", onClick: () => actions?.onDelete?.(review.id), "aria-label": "Delete review", className: "text-muted hover:text-error flex items-center justify-center rounded p-0.5 transition-colors", children: _jsx(Trash2, { className: "size-3" }) }) }), _jsx(TooltipContent, { children: "Delete review" })] }))] }))] }), (review.data.userNote || actions?.onEditComment) && (_jsx("div", { className: "mt-1", children: isEditing ? (_jsxs("div", { className: "space-y-1", children: [_jsx("textarea", { ref: textareaRef, value: editValue, onChange: (e) => setEditValue(e.target.value), onKeyDown: handleKeyDown, className: "text-primary w-full resize-none rounded border border-[var(--color-review-accent)]/40 bg-[var(--color-review-accent)]/10 px-1.5 py-1 text-[11px] focus:border-[var(--color-review-accent)]/60 focus:outline-none", rows: 2, placeholder: "Your comment..." }), _jsxs("div", { className: "flex items-center justify-end gap-1", children: [_jsxs("span", { className: "text-muted text-[9px]", children: [formatKeybind(KEYBINDS.SAVE_EDIT), " \u00B7 ", formatKeybind(KEYBINDS.CANCEL_EDIT)] }), _jsx(Button, { variant: "ghost", size: "sm", className: "h-5 px-1.5 text-[10px]", onClick: handleCancelEdit, children: "Cancel" }), _jsx(Button, { variant: "secondary", size: "sm", className: "h-5 px-1.5 text-[10px]", onClick: handleSaveEdit, children: "Save" })] })] })) : review.data.userNote ? (_jsx("div", { className: "text-secondary text-[11px] leading-[1.4] whitespace-pre-wrap", children: review.data.userNote })) : null }))] })] }));
};
//# sourceMappingURL=InlineReviewNote.js.map