import { jsx as _jsx } from "react/jsx-runtime";
import { useEffect } from "react";
import { useDrag, useDrop } from "react-dnd";
import { getEmptyImage } from "react-dnd-html5-backend";
import { cn } from "@/common/lib/utils";
const SECTION_DRAG_TYPE = "SECTION_REORDER";
/**
 * Wrapper that makes a section draggable for reordering.
 * Sections can be dragged and dropped onto other sections within the same project.
 */
export const DraggableSection = ({ sectionId, sectionName, projectPath, onReorder, children, }) => {
    const [{ isDragging }, drag, dragPreview] = useDrag(() => ({
        type: SECTION_DRAG_TYPE,
        item: {
            type: SECTION_DRAG_TYPE,
            sectionId,
            sectionName,
            projectPath,
        },
        collect: (monitor) => ({
            isDragging: monitor.isDragging(),
        }),
    }), [sectionId, sectionName, projectPath]);
    // Hide native drag preview
    useEffect(() => {
        dragPreview(getEmptyImage(), { captureDraggingState: true });
    }, [dragPreview]);
    const [{ isOver, canDrop }, drop] = useDrop(() => ({
        accept: SECTION_DRAG_TYPE,
        canDrop: (item) => {
            // Can only drop if from same project and different section
            return item.projectPath === projectPath && item.sectionId !== sectionId;
        },
        drop: (item) => {
            onReorder(item.sectionId, sectionId);
        },
        collect: (monitor) => ({
            isOver: monitor.isOver(),
            canDrop: monitor.canDrop(),
        }),
    }), [projectPath, sectionId, onReorder]);
    return (_jsx("div", { ref: (node) => drag(drop(node)), "data-section-drag-id": sectionId, className: cn(isDragging && "opacity-50", isOver && canDrop && "bg-accent/10"), children: children }));
};
export { SECTION_DRAG_TYPE };
//# sourceMappingURL=DraggableSection.js.map