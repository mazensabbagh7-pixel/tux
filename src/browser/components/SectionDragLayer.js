import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useDragLayer } from "react-dnd";
import { cn } from "@/common/lib/utils";
import { SECTION_DRAG_TYPE } from "./DraggableSection";
import { ChevronRight } from "lucide-react";
/**
 * Custom drag layer for section drag-drop reordering.
 * Renders a preview of the section being dragged.
 */
export const SectionDragLayer = () => {
    const dragState = useDragLayer((monitor) => ({
        isDragging: monitor.isDragging(),
        item: monitor.getItem(),
        itemType: monitor.getItemType(),
        currentOffset: monitor.getClientOffset(),
    }));
    const { isDragging, item, itemType, currentOffset } = dragState;
    // Only render for section drags
    if (!isDragging || itemType !== SECTION_DRAG_TYPE || !currentOffset) {
        return null;
    }
    const sectionItem = item;
    const displayName = sectionItem.sectionName ?? "Section";
    return (_jsx("div", { className: "pointer-events-none fixed inset-0 z-[9999]", children: _jsx("div", { style: {
                transform: `translate(${currentOffset.x + 10}px, ${currentOffset.y + 10}px)`,
            }, children: _jsxs("div", { className: cn("flex max-w-48 items-center gap-1.5 rounded-sm px-2 py-1.5", "bg-sidebar border-border border shadow-lg"), children: [_jsx(ChevronRight, { size: 12, className: "text-muted shrink-0" }), _jsx("span", { className: "text-foreground truncate text-xs font-medium", children: displayName })] }) }) }));
};
//# sourceMappingURL=SectionDragLayer.js.map