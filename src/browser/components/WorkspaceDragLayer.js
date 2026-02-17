import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useDragLayer } from "react-dnd";
import { WORKSPACE_DRAG_TYPE } from "./WorkspaceSectionDropZone";
import { RuntimeBadge } from "./RuntimeBadge";
import { cn } from "@/common/lib/utils";
/**
 * Custom drag layer for workspace drag-drop.
 * Renders a clean preview of the workspace being dragged.
 */
export const WorkspaceDragLayer = () => {
    const dragState = useDragLayer((monitor) => ({
        isDragging: monitor.isDragging(),
        item: monitor.getItem(),
        itemType: monitor.getItemType(),
        currentOffset: monitor.getClientOffset(),
    }));
    const { isDragging, item, itemType, currentOffset } = dragState;
    // Only render for workspace drags
    if (!isDragging || itemType !== WORKSPACE_DRAG_TYPE || !currentOffset) {
        return null;
    }
    const workspaceItem = item;
    const displayTitle = workspaceItem.displayTitle ?? "Workspace";
    return (_jsx("div", { className: "pointer-events-none fixed inset-0 z-[9999]", children: _jsx("div", { style: {
                transform: `translate(${currentOffset.x + 10}px, ${currentOffset.y + 10}px)`,
            }, children: _jsxs("div", { className: cn("flex max-w-56 items-center gap-1.5 rounded-sm px-2 py-1.5", "bg-sidebar border-border border shadow-lg"), children: [_jsx(RuntimeBadge, { runtimeConfig: workspaceItem.runtimeConfig, isWorking: false }), _jsx("span", { className: "text-foreground truncate text-sm", children: displayTitle })] }) }) }));
};
//# sourceMappingURL=WorkspaceDragLayer.js.map