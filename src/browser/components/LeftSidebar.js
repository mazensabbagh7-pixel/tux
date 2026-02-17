import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState, useRef } from "react";
import { cn } from "@/common/lib/utils";
import ProjectSidebar from "./ProjectSidebar";
import { isDesktopMode } from "@/browser/hooks/useDesktopTitlebar";
export function LeftSidebar(props) {
    const { collapsed, onToggleCollapsed, widthPx, isResizing, onStartResize, ...projectSidebarProps } = props;
    const isDesktop = isDesktopMode();
    const isMobileTouch = typeof window !== "undefined" &&
        window.matchMedia("(max-width: 768px) and (pointer: coarse)").matches;
    const width = collapsed ? "40px" : `${widthPx ?? 288}px`;
    // Track whether the sidebar content should be visible.
    // Hidden on initial mount (to prevent squished flash) and during
    // expand transitions (collapsed → expanded) until the width
    // animation finishes.
    const [contentVisible, setContentVisible] = useState(false);
    const [enableTransition, setEnableTransition] = useState(false);
    const prevCollapsed = useRef(collapsed);
    const isInitialMount = useRef(true);
    // Initial mount: reveal content after one frame (width has settled).
    useEffect(() => {
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                setContentVisible(true);
                setEnableTransition(true);
                isInitialMount.current = false;
            });
        });
    }, []);
    // When expanding (collapsed → not collapsed), hide content during
    // the width transition, then reveal after it completes.
    useEffect(() => {
        if (isInitialMount.current) {
            prevCollapsed.current = collapsed;
            return;
        }
        if (prevCollapsed.current && !collapsed) {
            // Expanding: hide content immediately, show after width transition.
            setContentVisible(false);
            const timer = setTimeout(() => {
                setContentVisible(true);
            }, 220); // slightly longer than the 200ms width transition
            prevCollapsed.current = collapsed;
            return () => clearTimeout(timer);
        }
        prevCollapsed.current = collapsed;
    }, [collapsed]);
    return (_jsxs(_Fragment, { children: [_jsx("div", { className: cn("hidden mobile-overlay fixed inset-0 bg-black/50 z-40 backdrop-blur-sm", collapsed && "!hidden"), onClick: onToggleCollapsed }), _jsxs("div", { "data-testid": "left-sidebar", className: cn("h-full bg-sidebar border-r border-border flex flex-col shrink-0 overflow-hidden relative z-20", enableTransition && !isResizing && "transition-[width] duration-200", "mobile-sidebar", collapsed && "mobile-sidebar-collapsed", isDesktop &&
                    collapsed &&
                    "border-r-0 after:absolute after:right-0 after:top-0 after:bottom-0 after:w-px after:bg-border"), style: { width }, children: [_jsx("div", { className: cn("flex flex-col flex-1 min-h-0", contentVisible ? "opacity-100" : "opacity-0"), style: { transition: contentVisible ? "opacity 100ms ease-in" : "none" }, children: _jsx(ProjectSidebar, { ...projectSidebarProps, collapsed: collapsed, onToggleCollapsed: onToggleCollapsed }) }), !collapsed && !isMobileTouch && onStartResize && (_jsx("div", { "data-testid": "left-sidebar-resize-handle", className: cn("absolute right-0 top-0 bottom-0 w-0.5 z-10 cursor-col-resize transition-[background] duration-150", isResizing ? "bg-accent" : "bg-border-light hover:bg-accent"), onMouseDown: (e) => onStartResize(e) }))] })] }));
}
//# sourceMappingURL=LeftSidebar.js.map