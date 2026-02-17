import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import * as React from "react";
import { cn } from "@/common/lib/utils";
import { Popover, PopoverAnchor, PopoverContent } from "./popover";
// Invisible hit-area bridge for bottom-aligned hover popovers; covers the sideOffset gap.
const HOVER_BRIDGE_CLASSNAME = "overflow-visible before:pointer-events-auto before:absolute before:-top-2 before:right-0 before:left-0 before:h-2 before:content-['']";
function composeEventHandlers(userHandler, ourHandler) {
    return (event) => {
        userHandler?.(event);
        if (event.defaultPrevented)
            return;
        ourHandler?.(event);
    };
}
/**
 * Hover previews the content; click pins it open.
 * This keeps indicator popovers quick to inspect but persistent on demand.
 */
export const HoverClickPopover = (props) => {
    const [isPinned, setIsPinned] = React.useState(false);
    const [isHovering, setIsHovering] = React.useState(false);
    const [isInteracting, setIsInteracting] = React.useState(false);
    const triggerRef = React.useRef(null);
    const contentRef = React.useRef(null);
    const closeTimeoutRef = React.useRef(null);
    // Cleanup timeout on unmount
    React.useEffect(() => {
        return () => {
            if (closeTimeoutRef.current)
                clearTimeout(closeTimeoutRef.current);
        };
    }, []);
    const isOpen = isPinned || isHovering;
    const cancelPendingClose = () => {
        if (closeTimeoutRef.current) {
            clearTimeout(closeTimeoutRef.current);
            closeTimeoutRef.current = null;
        }
    };
    const scheduleClose = () => {
        if (isPinned || (props.interactiveContent && isInteracting))
            return;
        cancelPendingClose();
        closeTimeoutRef.current = setTimeout(() => {
            setIsHovering(false);
        }, 100); // Grace period for pointer to travel between elements
    };
    const handleOpenChange = (open) => {
        if (!open) {
            cancelPendingClose();
            setIsPinned(false);
            setIsHovering(false);
            setIsInteracting(false);
        }
        props.onOpenChange?.(open);
    };
    const handleTriggerClick = () => {
        setIsPinned((prev) => !prev);
    };
    const handleTriggerPointerEnter = (event) => {
        // Avoid disabling hover for mouse on hybrid devices: only ignore *touch* pointers.
        if (event.pointerType === "touch")
            return;
        cancelPendingClose();
        setIsHovering(true);
    };
    const handleTriggerPointerLeave = (event) => {
        if (event.pointerType === "touch")
            return;
        const relatedTarget = event.relatedTarget;
        if (relatedTarget instanceof Node && contentRef.current?.contains(relatedTarget)) {
            return;
        }
        scheduleClose();
    };
    const handleContentPointerEnter = (event) => {
        if (event.pointerType === "touch")
            return;
        cancelPendingClose();
        setIsHovering(true);
    };
    const handleContentPointerLeave = (event) => {
        if (event.pointerType === "touch")
            return;
        const relatedTarget = event.relatedTarget;
        if (relatedTarget instanceof Node && triggerRef.current?.contains(relatedTarget)) {
            return;
        }
        scheduleClose();
    };
    const handleContentMouseDown = () => {
        if (props.interactiveContent)
            setIsInteracting(true);
    };
    const handleContentMouseUp = () => {
        if (props.interactiveContent)
            setIsInteracting(false);
    };
    const triggerProps = props.children.props;
    const trigger = React.cloneElement(props.children, {
        ref: triggerRef,
        "aria-expanded": isOpen,
        "aria-haspopup": triggerProps["aria-haspopup"] ?? "dialog",
        onClick: composeEventHandlers(triggerProps.onClick, handleTriggerClick),
        onPointerEnter: composeEventHandlers(triggerProps.onPointerEnter, handleTriggerPointerEnter),
        onPointerLeave: composeEventHandlers(triggerProps.onPointerLeave, handleTriggerPointerLeave),
    });
    return (_jsxs(Popover, { open: isOpen, onOpenChange: handleOpenChange, children: [_jsx(PopoverAnchor, { asChild: true, children: trigger }), _jsx(PopoverContent, { ...props.contentProps, ref: contentRef, side: props.side, align: props.align, sideOffset: props.sideOffset, className: cn(HOVER_BRIDGE_CLASSNAME, props.contentClassName, props.contentProps?.className), onPointerEnter: composeEventHandlers(props.contentProps?.onPointerEnter, handleContentPointerEnter), onPointerLeave: composeEventHandlers(props.contentProps?.onPointerLeave, handleContentPointerLeave), onMouseDown: composeEventHandlers(props.contentProps?.onMouseDown, handleContentMouseDown), onMouseUp: composeEventHandlers(props.contentProps?.onMouseUp, handleContentMouseUp), children: props.content })] }));
};
//# sourceMappingURL=hover-click-popover.js.map