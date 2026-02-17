import { jsx as _jsx } from "react/jsx-runtime";
import React from "react";
import { UserMessage } from "./UserMessage";
import { AssistantMessage } from "./AssistantMessage";
import { ToolMessage } from "./ToolMessage";
import { ReasoningMessage } from "./ReasoningMessage";
import { StreamErrorMessage } from "./StreamErrorMessage";
import { CompactionBoundaryMessage } from "./CompactionBoundaryMessage";
import { HistoryHiddenMessage } from "./HistoryHiddenMessage";
import { InitMessage } from "./InitMessage";
import { ProposePlanToolCall } from "../tools/ProposePlanToolCall";
import { removeEphemeralMessage } from "@/browser/stores/WorkspaceStore";
// Memoized to prevent unnecessary re-renders when parent (AIView) updates
export const MessageRenderer = React.memo(({ message, className, onEditUserMessage, workspaceId, isCompacting, onReviewNote, isLatestProposePlan, bashOutputGroup, taskReportLinking, userMessageNavigation, }) => {
    // Route based on message type
    switch (message.type) {
        case "user":
            return (_jsx(UserMessage, { message: message, className: className, onEdit: onEditUserMessage, isCompacting: isCompacting, navigation: userMessageNavigation }));
        case "assistant":
            return (_jsx(AssistantMessage, { message: message, className: className, workspaceId: workspaceId, isCompacting: isCompacting }));
        case "tool":
            return (_jsx(ToolMessage, { message: message, className: className, workspaceId: workspaceId, onReviewNote: onReviewNote, isLatestProposePlan: isLatestProposePlan, bashOutputGroup: bashOutputGroup, taskReportLinking: taskReportLinking }));
        case "reasoning":
            return _jsx(ReasoningMessage, { message: message, className: className });
        case "stream-error":
            return _jsx(StreamErrorMessage, { message: message, className: className });
        case "compaction-boundary":
            return _jsx(CompactionBoundaryMessage, { message: message, className: className });
        case "history-hidden":
            return (_jsx(HistoryHiddenMessage, { message: message, className: className, workspaceId: workspaceId }));
        case "workspace-init":
            return _jsx(InitMessage, { message: message, className: className });
        case "plan-display":
            return (_jsx(ProposePlanToolCall, { args: {}, isEphemeralPreview: true, content: message.content, path: message.path, workspaceId: workspaceId, onClose: () => {
                    if (workspaceId) {
                        removeEphemeralMessage(workspaceId, message.historyId);
                    }
                }, className: className }));
        default: {
            const _exhaustive = message;
            console.error("don't know how to render message", _exhaustive);
            return null;
        }
    }
});
MessageRenderer.displayName = "MessageRenderer";
//# sourceMappingURL=MessageRenderer.js.map