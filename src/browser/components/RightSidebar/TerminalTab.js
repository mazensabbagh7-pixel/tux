import { jsx as _jsx } from "react/jsx-runtime";
import { TerminalView } from "@/browser/components/TerminalView";
import { getTerminalSessionId } from "@/browser/types/rightSidebar";
/**
 * Terminal tab component that renders a terminal view.
 *
 * Session ID is extracted directly from the tabType ("terminal:<sessionId>").
 * Sessions are created by RightSidebar before adding the tab, so tabType
 * always contains a valid sessionId (never the placeholder "terminal").
 */
export const TerminalTab = (props) => {
    // Extract session ID from tab type - must exist (sessions created before tab added)
    const sessionId = getTerminalSessionId(props.tabType);
    if (!sessionId) {
        // This should never happen - RightSidebar creates session before adding tab
        return (_jsx("div", { className: "flex h-full items-center justify-center text-red-400", children: "Invalid terminal tab: missing session ID" }));
    }
    return (_jsx(TerminalView, { workspaceId: props.workspaceId, sessionId: sessionId, visible: props.visible, setDocumentTitle: false, onTitleChange: props.onTitleChange, onAutoFocusConsumed: props.onAutoFocusConsumed, autoFocus: props.autoFocus ?? false, onExit: props.onExit }));
};
//# sourceMappingURL=TerminalTab.js.map