import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useRef } from "react";
import { cn } from "@/common/lib/utils";
import { RIGHT_SIDEBAR_WIDTH_KEY } from "@/common/constants/storage";
import { useResizableSidebar } from "@/browser/hooks/useResizableSidebar";
import { useResizeObserver } from "@/browser/hooks/useResizeObserver";
import { useOpenTerminal } from "@/browser/hooks/useOpenTerminal";
import { RightSidebar } from "./RightSidebar";
import { PopoverError } from "./PopoverError";
import { useBackgroundBashError } from "@/browser/contexts/BackgroundBashContext";
import { useWorkspaceState } from "@/browser/stores/WorkspaceStore";
import { useReviews } from "@/browser/hooks/useReviews";
import { ConnectionStatusToast } from "./ConnectionStatusToast";
import { ChatPane } from "./ChatPane";
// ChatPane uses tailwind `min-w-96`.
const CHAT_PANE_MIN_WIDTH_PX = 384;
const RIGHT_SIDEBAR_DEFAULT_WIDTH_PX = 400;
const RIGHT_SIDEBAR_MIN_WIDTH_PX = 300;
const RIGHT_SIDEBAR_ABS_MAX_WIDTH_PX = 1200;
// Guard against subpixel rounding (e.g. zoom/devicePixelRatio) producing a 1px horizontal
// overflow that would trigger the WorkspaceShell scrollbar.
const RIGHT_SIDEBAR_OVERFLOW_GUARD_PX = 1;
const WorkspacePlaceholder = (props) => (_jsxs("div", { className: cn("relative flex flex-1 flex-row bg-dark text-light overflow-x-auto overflow-y-hidden [@media(max-width:768px)]:flex-col", props.className), style: { containerType: "inline-size" }, children: [_jsx("div", { className: "pointer-events-none absolute right-[15px] bottom-[15px] left-[15px] z-[1000] [&>*]:pointer-events-auto", children: _jsx(ConnectionStatusToast, { wrap: false }) }), _jsxs("div", { className: "text-placeholder flex h-full flex-1 flex-col items-center justify-center text-center", children: [_jsx("h3", { className: "m-0 mb-2.5 text-base font-medium", children: props.title }), props.description && _jsx("p", { className: "m-0 text-[13px]", children: props.description })] })] }));
export const WorkspaceShell = (props) => {
    const shellRef = useRef(null);
    const shellSize = useResizeObserver(shellRef);
    // WorkspaceShell switches to flex-col at this breakpoint, so in that stacked mode the
    // right sidebar doesn't need to "leave room" for ChatPane beside it.
    const isStacked = typeof window !== "undefined" && window.matchMedia("(max-width: 768px)").matches;
    const containerWidthPx = shellSize?.width ?? 0;
    // happy-dom / early-mount fallback: treat 0 as "unknown"
    const usableWidthPx = containerWidthPx > 0
        ? containerWidthPx
        : typeof window !== "undefined"
            ? window.innerWidth
            : 1200;
    // Prevent ChatPane + RightSidebar from overflowing the workspace shell (which would show a
    // horizontal scrollbar due to WorkspaceShell's `overflow-x-auto`).
    const effectiveMaxWidthPx = isStacked
        ? RIGHT_SIDEBAR_ABS_MAX_WIDTH_PX
        : Math.min(RIGHT_SIDEBAR_ABS_MAX_WIDTH_PX, Math.max(RIGHT_SIDEBAR_MIN_WIDTH_PX, usableWidthPx - CHAT_PANE_MIN_WIDTH_PX - RIGHT_SIDEBAR_OVERFLOW_GUARD_PX));
    const sidebar = useResizableSidebar({
        enabled: true,
        defaultWidth: RIGHT_SIDEBAR_DEFAULT_WIDTH_PX,
        minWidth: RIGHT_SIDEBAR_MIN_WIDTH_PX,
        maxWidth: effectiveMaxWidthPx,
        storageKey: RIGHT_SIDEBAR_WIDTH_KEY,
    });
    const { width: sidebarWidth, isResizing, startResize } = sidebar;
    const addTerminalRef = useRef(null);
    const openTerminalPopout = useOpenTerminal();
    const handleOpenTerminal = useCallback((options) => {
        // On mobile touch devices, always use popout since the right sidebar is hidden
        const isMobileTouch = window.matchMedia("(max-width: 768px) and (pointer: coarse)").matches;
        if (isMobileTouch) {
            void openTerminalPopout(props.workspaceId, props.runtimeConfig, options);
        }
        else {
            addTerminalRef.current?.(options);
        }
    }, [openTerminalPopout, props.workspaceId, props.runtimeConfig]);
    const reviews = useReviews(props.workspaceId);
    const { addReview } = reviews;
    const handleReviewNote = useCallback((data) => {
        addReview(data);
    }, [addReview]);
    const workspaceState = useWorkspaceState(props.workspaceId);
    const backgroundBashError = useBackgroundBashError();
    if (!workspaceState || workspaceState.loading) {
        return _jsx(WorkspacePlaceholder, { title: "Loading workspace...", className: props.className });
    }
    if (!props.projectName || !props.workspaceName) {
        return (_jsx(WorkspacePlaceholder, { title: "No Workspace Selected", description: "Select a workspace from the sidebar to view and interact with Claude", className: props.className }));
    }
    return (_jsxs("div", { ref: shellRef, className: cn("flex flex-1 flex-row bg-dark text-light overflow-x-auto overflow-y-hidden [@media(max-width:768px)]:flex-col", props.className), style: { containerType: "inline-size" }, children: [_jsx(ChatPane, { workspaceId: props.workspaceId, workspaceState: workspaceState, projectPath: props.projectPath, projectName: props.projectName, workspaceName: props.workspaceName, namedWorkspacePath: props.namedWorkspacePath, leftSidebarCollapsed: props.leftSidebarCollapsed, onToggleLeftSidebarCollapsed: props.onToggleLeftSidebarCollapsed, runtimeConfig: props.runtimeConfig, onOpenTerminal: handleOpenTerminal }, `chat-${props.workspaceId}`), _jsx(RightSidebar, { workspaceId: props.workspaceId, workspacePath: props.namedWorkspacePath, projectPath: props.projectPath, width: sidebarWidth, onStartResize: startResize, isResizing: isResizing, onReviewNote: handleReviewNote, isCreating: props.isInitializing === true, addTerminalRef: addTerminalRef }, props.workspaceId), _jsx(PopoverError, { error: backgroundBashError.error, prefix: "Failed to terminate:", onDismiss: backgroundBashError.clearError })] }));
};
//# sourceMappingURL=WorkspaceShell.js.map