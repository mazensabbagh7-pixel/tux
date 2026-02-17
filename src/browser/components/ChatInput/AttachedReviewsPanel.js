import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { X } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "../ui/tooltip";
import { ReviewBlockFromData } from "../shared/ReviewBlock";
/**
 * Displays attached reviews in the chat input area.
 * Shows a header with count and "Clear all" button when multiple reviews attached.
 */
export const AttachedReviewsPanel = ({ reviews, onDetachAll, onDetach, onCheck, onDelete, onUpdateNote, }) => {
    if (reviews.length === 0)
        return null;
    return (_jsxs("div", { className: "border-border max-h-[50vh] space-y-2 overflow-y-auto border-b px-1.5 py-1.5", children: [_jsxs("div", { className: "flex items-center justify-between text-xs", children: [_jsxs("span", { className: "text-muted font-medium", children: [reviews.length, " review", reviews.length !== 1 && "s", " attached"] }), onDetachAll && reviews.length > 1 && (_jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsxs("button", { type: "button", onClick: onDetachAll, className: "text-muted hover:text-error flex items-center gap-1 text-xs transition-colors", children: [_jsx(X, { className: "size-3" }), "Clear all"] }) }), _jsx(TooltipContent, { children: "Remove all reviews from message" })] }))] }), reviews.map((review) => (_jsx(ReviewBlockFromData, { data: review.data, onComplete: onCheck ? () => onCheck(review.id) : undefined, onDetach: onDetach ? () => onDetach(review.id) : undefined, onDelete: onDelete ? () => onDelete(review.id) : undefined, onEditComment: onUpdateNote ? (newNote) => onUpdateNote(review.id, newNote) : undefined }, review.id)))] }));
};
//# sourceMappingURL=AttachedReviewsPanel.js.map