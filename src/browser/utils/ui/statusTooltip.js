import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { ModelDisplay } from "@/browser/components/Messages/ModelDisplay";
import { formatRelativeTime } from "@/browser/utils/ui/dateTime";
/**
 * Compute tooltip content for StatusIndicator based on workspace state.
 * Handles both sidebar (with unread/recency) and header (simpler) cases.
 */
export function getStatusTooltip(options) {
    const { isStreaming, isAwaitingInput, streamingModel, agentStatus, isUnread, recencyTimestamp } = options;
    // If agent status is set, show message and URL (if available)
    if (agentStatus) {
        if (agentStatus.url) {
            return (_jsxs(_Fragment, { children: [agentStatus.message, _jsx("br", {}), _jsx("span", { style: { opacity: 0.7, fontSize: "0.9em" }, children: agentStatus.url })] }));
        }
        return agentStatus.message;
    }
    // Show awaiting input status
    if (isAwaitingInput) {
        return "Awaiting your input";
    }
    // Otherwise show streaming/idle status
    if (isStreaming && streamingModel) {
        return (_jsxs("span", { children: [_jsx(ModelDisplay, { modelString: streamingModel, showTooltip: false }), " - streaming..."] }));
    }
    if (isStreaming) {
        return "Assistant - streaming...";
    }
    // Only show unread if explicitly provided (sidebar only)
    if (isUnread) {
        return "Unread messages";
    }
    // Show recency if available (sidebar only)
    if (recencyTimestamp) {
        return `Idle • Last used ${formatRelativeTime(recencyTimestamp)}`;
    }
    return "Idle";
}
//# sourceMappingURL=statusTooltip.js.map