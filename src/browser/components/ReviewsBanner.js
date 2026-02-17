import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * ReviewsBanner - Self-contained reviews UI
 *
 * Features:
 * - Collapsible banner above chat input
 * - Full review display with diff and editable comments
 * - Pending reviews first, then completed with "show more"
 * - Relative timestamps
 * - Error boundary for corrupted data
 */
import { useState, useCallback, useMemo, Component, useRef } from "react";
import { ChevronDown, ChevronRight, Check, Undo2, Send, Trash2, MessageSquare, AlertTriangle, Pencil, X, } from "lucide-react";
import { cn } from "@/common/lib/utils";
import { Button } from "./ui/button";
import { Tooltip, TooltipTrigger, TooltipContent } from "./ui/tooltip";
import { useReviews } from "@/browser/hooks/useReviews";
import { formatRelativeTime } from "@/browser/utils/ui/dateTime";
import { DiffRenderer } from "./shared/DiffRenderer";
import { matchesKeybind, formatKeybind, KEYBINDS } from "@/browser/utils/ui/keybinds";
class BannerErrorBoundary extends Component {
    constructor() {
        super(...arguments);
        this.state = { hasError: false };
    }
    static getDerivedStateFromError() {
        return { hasError: true };
    }
    render() {
        if (this.state.hasError) {
            return (_jsxs("div", { className: "border-border bg-dark flex items-center gap-2 border-t px-3 py-1.5 text-xs", children: [_jsx(AlertTriangle, { className: "text-warning size-3.5" }), _jsx("span", { className: "text-muted", children: "Reviews data corrupted" }), _jsxs(Button, { variant: "ghost", size: "sm", className: "text-error h-5 px-2 text-xs", onClick: () => {
                            this.props.onClear();
                            this.setState({ hasError: false });
                        }, children: [_jsx(Trash2, { className: "mr-1 size-3" }), "Clear all"] })] }));
        }
        return this.props.children;
    }
}
const ReviewItem = ({ review, onCheck, onUncheck, onSendToChat, onRemove, onUpdateNote, }) => {
    const isChecked = review.status === "checked";
    const [isExpanded, setIsExpanded] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editValue, setEditValue] = useState(review.data.userNote);
    const textareaRef = useRef(null);
    const handleToggleExpand = useCallback(() => {
        setIsExpanded((prev) => !prev);
    }, []);
    const handleStartEdit = useCallback(() => {
        setEditValue(review.data.userNote);
        setIsEditing(true);
        // Focus textarea after render
        setTimeout(() => textareaRef.current?.focus(), 0);
    }, [review.data.userNote]);
    const handleSaveEdit = useCallback(() => {
        if (editValue.trim() !== review.data.userNote) {
            onUpdateNote(editValue.trim());
        }
        setIsEditing(false);
    }, [editValue, review.data.userNote, onUpdateNote]);
    const handleCancelEdit = useCallback(() => {
        setEditValue(review.data.userNote);
        setIsEditing(false);
    }, [review.data.userNote]);
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
    // Prefer selectedDiff (raw diff) when available so reviewers see syntax highlighting consistently.
    const diffContent = useMemo(() => {
        if (review.data.selectedDiff) {
            return review.data.selectedDiff;
        }
        // Legacy: selectedCode may be plain code or diff-ish text.
        const lines = review.data.selectedCode.split("\n");
        const hasDiffMarkers = lines.some((l) => /^[+-\s]/.test(l));
        if (hasDiffMarkers) {
            return review.data.selectedCode;
        }
        return lines.map((l) => ` ${l}`).join("\n");
    }, [review.data.selectedCode, review.data.selectedDiff]);
    const age = formatRelativeTime(review.createdAt);
    return (_jsxs("div", { className: cn("group rounded border transition-colors", isChecked
            ? "border-border-light bg-hover/50 opacity-70"
            : "border-border-medium bg-border-medium/20"), children: [_jsxs("div", { className: "flex items-center gap-2 px-2 py-1.5 text-xs", children: [_jsx("button", { type: "button", onClick: handleToggleExpand, className: "text-muted hover:text-secondary shrink-0", children: isExpanded ? (_jsx(ChevronDown, { className: "size-3.5" })) : (_jsx(ChevronRight, { className: "size-3.5" })) }), _jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx(Button, { variant: "ghost", size: "icon", className: cn("size-5 shrink-0 [&_svg]:size-3", isChecked && "text-success"), onClick: isChecked ? onUncheck : onCheck, children: isChecked ? _jsx(Undo2, {}) : _jsx(Check, {}) }) }), _jsx(TooltipContent, { children: isChecked ? "Mark as pending" : "Mark as done" })] }), !isChecked && (_jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx(Button, { variant: "ghost", size: "icon", className: "size-5 shrink-0 [&_svg]:size-3", onClick: onSendToChat, children: _jsx(Send, {}) }) }), _jsx(TooltipContent, { children: "Send to chat" })] })), _jsxs("button", { type: "button", onClick: handleToggleExpand, className: "flex min-w-0 flex-1 items-center gap-2 text-left", children: [_jsxs("span", { className: "shrink-0 truncate font-mono text-[var(--color-review-accent)]", children: [review.data.filePath, ":", review.data.lineRange] }), review.data.userNote && (_jsx("span", { className: "text-secondary min-w-0 flex-1 truncate italic", children: review.data.userNote.split("\n")[0] })), _jsx("span", { className: "text-muted shrink-0 text-[10px]", children: age })] }), _jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx(Button, { variant: "ghost", size: "icon", className: "text-error size-5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 [&_svg]:size-3", onClick: onRemove, children: _jsx(Trash2, {}) }) }), _jsx(TooltipContent, { children: "Remove" })] })] }), isExpanded && (_jsxs("div", { className: "border-border-light border-t", children: [_jsx("div", { className: "max-h-32 overflow-auto text-[11px]", children: _jsx(DiffRenderer, { content: diffContent, showLineNumbers: Boolean(review.data.selectedDiff), oldStart: review.data.oldStart ?? 1, newStart: review.data.newStart ?? 1, fontSize: "11px" }) }), _jsx("div", { className: "border-border-light border-t p-2", children: isEditing ? (_jsxs("div", { className: "space-y-1.5", children: [_jsx("textarea", { ref: textareaRef, value: editValue, onChange: (e) => setEditValue(e.target.value), onKeyDown: handleKeyDown, className: "bg-dark border-border text-secondary w-full resize-none rounded border p-2 text-xs focus:border-[var(--color-review-accent)] focus:outline-none", rows: 2, placeholder: "Your comment..." }), _jsxs("div", { className: "flex items-center justify-end gap-1", children: [_jsxs("span", { className: "text-muted mr-2 text-[10px]", children: [formatKeybind(KEYBINDS.SAVE_EDIT), " to save, Esc to cancel"] }), _jsxs(Button, { variant: "ghost", size: "sm", className: "h-5 px-2 text-xs", onClick: handleCancelEdit, children: [_jsx(X, { className: "mr-1 size-3" }), "Cancel"] }), _jsxs(Button, { variant: "secondary", size: "sm", className: "h-5 px-2 text-xs", onClick: handleSaveEdit, children: [_jsx(Check, { className: "mr-1 size-3" }), "Save"] })] })] })) : (_jsxs("div", { className: "group/comment flex items-start gap-2", children: [_jsx("blockquote", { className: "text-primary flex-1 border-l-2 border-[var(--color-review-accent)] pl-2 text-xs italic", children: review.data.userNote || _jsx("span", { className: "text-muted", children: "No comment" }) }), _jsx(Button, { variant: "ghost", size: "icon", className: "size-5 shrink-0 opacity-0 transition-opacity group-hover/comment:opacity-100 [&_svg]:size-3", onClick: handleStartEdit, children: _jsx(Pencil, {}) })] })) })] }))] }));
};
const ReviewsBannerInner = ({ workspaceId }) => {
    const reviewsHook = useReviews(workspaceId);
    const [isExpanded, setIsExpanded] = useState(false);
    const [showAllCompleted, setShowAllCompleted] = useState(false);
    const INITIAL_COMPLETED_COUNT = 3;
    // Separate pending and completed reviews
    // "attached" reviews are shown in ChatInput, so we only show "pending" and "checked" here
    const { pendingList, completedList } = useMemo(() => {
        const pending = reviewsHook.reviews.filter((r) => r.status === "pending");
        // Sort completed reviews recent-first (by when they were checked, falling back to creation time)
        const completed = reviewsHook.reviews
            .filter((r) => r.status === "checked")
            .sort((a, b) => (b.statusChangedAt ?? b.createdAt) - (a.statusChangedAt ?? a.createdAt));
        return { pendingList: pending, completedList: completed };
    }, [reviewsHook.reviews]);
    // Completed reviews to display (limited unless expanded)
    const displayedCompleted = useMemo(() => {
        if (showAllCompleted)
            return completedList;
        return completedList.slice(0, INITIAL_COMPLETED_COUNT);
    }, [completedList, showAllCompleted]);
    const hiddenCompletedCount = completedList.length - INITIAL_COMPLETED_COUNT;
    const handleToggle = useCallback(() => {
        setIsExpanded((prev) => !prev);
    }, []);
    const handleSendToChat = useCallback((reviewId) => {
        reviewsHook.attachReview(reviewId);
    }, [reviewsHook]);
    const handleUpdateNote = useCallback((reviewId, newNote) => {
        reviewsHook.updateReviewNote(reviewId, newNote);
    }, [reviewsHook]);
    // Don't show anything if no reviews
    if (reviewsHook.reviews.length === 0) {
        return null;
    }
    return (_jsxs("div", { className: "border-border bg-dark border-t px-[15px]", children: [_jsxs("button", { type: "button", onClick: handleToggle, className: "group mx-auto flex w-full max-w-4xl items-center gap-2 px-2 py-1 text-xs transition-colors", children: [_jsx(MessageSquare, { className: cn("size-3.5 transition-colors", reviewsHook.pendingCount > 0
                            ? "text-[var(--color-review-accent)]"
                            : "text-muted group-hover:text-secondary") }), _jsxs("span", { className: "text-muted group-hover:text-secondary transition-colors", children: [reviewsHook.pendingCount > 0 ? (_jsxs(_Fragment, { children: [_jsx("span", { className: "font-medium text-[var(--color-review-accent)]", children: reviewsHook.pendingCount }), " pending review", reviewsHook.pendingCount !== 1 && "s"] })) : (_jsx(_Fragment, { children: "No pending reviews" })), reviewsHook.checkedCount > 0 && _jsxs(_Fragment, { children: [" \u00B7 ", reviewsHook.checkedCount, " completed"] })] }), _jsx("div", { className: "ml-auto", children: isExpanded ? (_jsx(ChevronDown, { className: "text-muted group-hover:text-secondary size-3.5 transition-colors" })) : (_jsx(ChevronRight, { className: "text-muted group-hover:text-secondary size-3.5 transition-colors" })) })] }), isExpanded && (_jsxs("div", { className: "border-border mx-auto max-h-80 max-w-4xl space-y-3 overflow-y-auto border-t py-2", children: [pendingList.length > 0 && (_jsxs("div", { className: "space-y-1.5", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsxs("div", { className: "text-muted text-[10px]", children: ["Pending (", pendingList.length, ")"] }), pendingList.length > 1 && (_jsxs("button", { type: "button", onClick: reviewsHook.attachAllPending, className: "text-muted flex items-center gap-1 text-[10px] transition-colors hover:text-[var(--color-review-accent)]", children: [_jsx(Send, { className: "size-3" }), "Attach all"] }))] }), pendingList.map((review) => (_jsx(ReviewItem, { review: review, onCheck: () => reviewsHook.checkReview(review.id), onUncheck: () => reviewsHook.uncheckReview(review.id), onSendToChat: () => handleSendToChat(review.id), onRemove: () => reviewsHook.removeReview(review.id), onUpdateNote: (note) => handleUpdateNote(review.id, note) }, review.id)))] })), completedList.length > 0 && (_jsxs("div", { className: "space-y-1.5", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsxs("div", { className: "text-muted text-[10px]", children: ["Completed (", completedList.length, ")"] }), completedList.length > 0 && (_jsx("button", { type: "button", onClick: reviewsHook.clearChecked, className: "text-muted hover:text-error text-[10px] transition-colors", children: "Clear" }))] }), displayedCompleted.map((review) => (_jsx(ReviewItem, { review: review, onCheck: () => reviewsHook.checkReview(review.id), onUncheck: () => reviewsHook.uncheckReview(review.id), onSendToChat: () => handleSendToChat(review.id), onRemove: () => reviewsHook.removeReview(review.id), onUpdateNote: (note) => handleUpdateNote(review.id, note) }, review.id))), hiddenCompletedCount > 0 && !showAllCompleted && (_jsxs("button", { type: "button", onClick: () => setShowAllCompleted(true), className: "text-muted hover:text-secondary w-full py-1 text-center text-xs transition-colors", children: ["Show ", hiddenCompletedCount, " more completed review", hiddenCompletedCount !== 1 && "s"] }))] })), pendingList.length === 0 && completedList.length === 0 && (_jsx("div", { className: "text-muted py-3 text-center text-xs", children: "No reviews yet" }))] }))] }));
};
/**
 * Self-contained reviews banner.
 * Uses useReviews hook internally - only needs workspaceId.
 * Shows only "pending" and "checked" reviews (not "attached" which are in ChatInput).
 */
export const ReviewsBanner = ({ workspaceId }) => {
    const reviewsHook = useReviews(workspaceId);
    return (_jsx(BannerErrorBoundary, { onClear: reviewsHook.clearAll, children: _jsx(ReviewsBannerInner, { workspaceId: workspaceId }) }));
};
//# sourceMappingURL=ReviewsBanner.js.map