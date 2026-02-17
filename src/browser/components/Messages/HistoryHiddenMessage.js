import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { cn } from "@/common/lib/utils";
import { showAllMessages } from "@/browser/stores/WorkspaceStore";
export const HistoryHiddenMessage = ({ message, workspaceId, className, }) => {
    const omittedParts = [];
    if (message.omittedMessageCounts?.tool) {
        omittedParts.push(`${message.omittedMessageCounts.tool} tool call${message.omittedMessageCounts.tool === 1 ? "" : "s"}`);
    }
    if (message.omittedMessageCounts?.reasoning) {
        omittedParts.push(`${message.omittedMessageCounts.reasoning} thinking block${message.omittedMessageCounts.reasoning === 1 ? "" : "s"}`);
    }
    const omittedSuffix = omittedParts.length > 0 ? ` (${omittedParts.join(", ")})` : "";
    return (_jsxs("div", { className: cn("my-4 flex flex-wrap items-center justify-center gap-2 text-center text-xs text-muted", className), children: [_jsx("svg", { "aria-hidden": "true", className: "text-border shrink-0", width: "24", height: "8", viewBox: "0 0 24 8", fill: "none", xmlns: "http://www.w3.org/2000/svg", children: _jsx("path", { d: "M0 4 Q4 0, 8 4 Q12 8, 16 4 Q20 0, 24 4", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", fill: "none" }) }), _jsxs("span", { className: "text-muted", children: ["Omitted ", message.hiddenCount, " message", message.hiddenCount !== 1 ? "s" : "", " for performance", omittedSuffix] }), workspaceId && (_jsx("button", { type: "button", className: "text-link hover:text-link-hover cursor-pointer border-none bg-transparent p-0 font-medium underline", onClick: () => showAllMessages(workspaceId), children: "Load all" })), _jsx("svg", { "aria-hidden": "true", className: "text-border shrink-0", width: "24", height: "8", viewBox: "0 0 24 8", fill: "none", xmlns: "http://www.w3.org/2000/svg", children: _jsx("path", { d: "M0 4 Q4 0, 8 4 Q12 8, 16 4 Q20 0, 24 4", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", fill: "none" }) })] }));
};
//# sourceMappingURL=HistoryHiddenMessage.js.map