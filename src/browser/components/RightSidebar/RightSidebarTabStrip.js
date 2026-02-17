import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { cn } from "@/common/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useDroppable, useDndContext } from "@dnd-kit/core";
import { Plus } from "lucide-react";
import { isDesktopMode, getTitlebarRightInset, DESKTOP_TITLEBAR_MIN_HEIGHT_CLASS, } from "@/browser/hooks/useDesktopTitlebar";
// Re-export for consumers that import from this file
export { getTabName } from "./tabs";
/**
 * Individual sortable tab button using @dnd-kit.
 * Uses useSortable for drag + drop within the same tabset.
 */
const SortableTab = ({ item, index, tabsetId, isDesktop }) => {
    // Create a unique sortable ID that encodes tabset + tab
    const sortableId = `${tabsetId}:${item.tab}`;
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: sortableId,
        data: {
            tab: item.tab,
            sourceTabsetId: tabsetId,
            index,
        },
    });
    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };
    const sortableOnKeyDown = listeners?.onKeyDown;
    return (_jsx("div", { className: cn("relative shrink-0", isDesktop && "titlebar-no-drag"), style: style, children: _jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("div", { ref: setNodeRef, ...attributes, ...(listeners ?? {}), className: cn("flex min-w-0 max-w-[240px] items-baseline gap-1.5 whitespace-nowrap rounded-md px-3 py-1 text-xs font-medium transition-all duration-150", "cursor-grab touch-none active:cursor-grabbing", item.selected
                            ? "bg-hover text-foreground"
                            : "bg-transparent text-muted hover:bg-hover/50 hover:text-foreground", item.disabled && "pointer-events-none opacity-50", isDragging && "cursor-grabbing opacity-50"), onClick: item.onSelect, onKeyDown: (e) => {
                            // Ignore bubbled key events from nested elements (e.g. close/pop-out buttons)
                            // so Enter/Space still activates those buttons instead of selecting the tab.
                            if (e.currentTarget !== e.target) {
                                return;
                            }
                            sortableOnKeyDown?.(e);
                            if (e.defaultPrevented) {
                                return;
                            }
                            if (!item.disabled && (e.key === "Enter" || e.key === " ")) {
                                e.preventDefault();
                                item.onSelect();
                            }
                        }, onAuxClick: (e) => {
                            // Middle-click (button 1) closes closeable tabs
                            if (e.button === 1 && item.onClose) {
                                e.preventDefault();
                                item.onClose();
                            }
                        }, id: item.id, role: "tab", "aria-selected": item.selected, "aria-controls": item.panelId, "aria-disabled": item.disabled ? true : undefined, tabIndex: item.disabled ? -1 : (attributes.tabIndex ?? 0), children: item.label }) }), _jsx(TooltipContent, { side: "bottom", align: "center", children: item.tooltip })] }) }));
};
export const RightSidebarTabStrip = ({ items, ariaLabel = "Sidebar views", tabsetId, onAddTerminal, }) => {
    const { active } = useDndContext();
    const activeData = active?.data.current;
    // Track if we're dragging from this tabset (for visual feedback)
    const isDraggingFromHere = activeData?.sourceTabsetId === tabsetId;
    // Make the tabstrip a drop target for tabs from OTHER tabsets
    const { setNodeRef, isOver } = useDroppable({
        id: `tabstrip:${tabsetId}`,
        data: { tabsetId },
    });
    const canDrop = activeData !== undefined && activeData.sourceTabsetId !== tabsetId;
    const showDropHighlight = isOver && canDrop;
    // In desktop mode, add right padding for Windows/Linux titlebar overlay buttons
    const isDesktop = isDesktopMode();
    const rightInset = getTitlebarRightInset();
    return (_jsx("div", { ref: setNodeRef, className: cn("border-border-light flex min-w-0 items-center border-b px-2 py-1.5 transition-colors", isDesktop && DESKTOP_TITLEBAR_MIN_HEIGHT_CLASS, showDropHighlight && "bg-accent/30", isDraggingFromHere && "bg-accent/10", 
        // In desktop mode, make header draggable for window movement
        isDesktop && "titlebar-drag"), style: rightInset > 0 ? { paddingRight: rightInset } : undefined, role: "tablist", "aria-label": ariaLabel, children: _jsxs("div", { className: "flex min-w-0 flex-1 flex-wrap items-center gap-1", children: [items.map((item, index) => (_jsx(SortableTab, { item: item, index: index, tabsetId: tabsetId, isDesktop: isDesktop }, item.id))), onAddTerminal && (_jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("button", { type: "button", className: cn("text-muted hover:bg-hover hover:text-foreground shrink-0 rounded-md p-1 transition-colors", isDesktop && "titlebar-no-drag"), onClick: onAddTerminal, "aria-label": "New terminal", children: _jsx(Plus, { className: "h-3.5 w-3.5" }) }) }), _jsx(TooltipContent, { side: "bottom", children: "New terminal" })] }))] }) }));
};
//# sourceMappingURL=RightSidebarTabStrip.js.map