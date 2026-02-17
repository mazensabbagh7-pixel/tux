import { jsx as _jsx } from "react/jsx-runtime";
import { useDrop } from "react-dnd";
import { cn } from "@/common/lib/utils";
const WORKSPACE_DRAG_TYPE = "WORKSPACE_TO_SECTION";
/**
 * Drop zone for dragging workspaces into/out of sections.
 */
export const WorkspaceSectionDropZone = ({ projectPath, sectionId, onDrop, children, className, testId, }) => {
    const [{ isOver, canDrop }, drop] = useDrop(() => ({
        accept: WORKSPACE_DRAG_TYPE,
        canDrop: (item) => {
            // Can only drop if from same project and moving to different section
            return item.projectPath === projectPath && item.currentSectionId !== sectionId;
        },
        drop: (item) => {
            onDrop(item.workspaceId, sectionId);
        },
        collect: (monitor) => ({
            isOver: monitor.isOver(),
            canDrop: monitor.canDrop(),
        }),
    }), [projectPath, sectionId, onDrop]);
    return (_jsx("div", { ref: drop, className: cn(className, isOver && canDrop && "bg-accent/10"), "data-testid": testId, "data-drop-section-id": sectionId ?? "unsectioned", children: children }));
};
export { WORKSPACE_DRAG_TYPE };
//# sourceMappingURL=WorkspaceSectionDropZone.js.map