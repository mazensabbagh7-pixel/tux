import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { getToolComponent } from "../tools/shared/getToolComponent";
import { HookOutputDisplay, extractHookOutput, extractHookDuration, } from "../tools/shared/HookOutputDisplay";
export const ToolMessage = ({ message, className, workspaceId, onReviewNote, isLatestProposePlan, bashOutputGroup, taskReportLinking, }) => {
    const { toolName, args, result, status, toolCallId } = message;
    // Get the component from the registry (validates args, falls back to GenericToolCall)
    const ToolComponent = getToolComponent(toolName, args);
    // Compute tool-specific extras
    const groupPosition = bashOutputGroup?.position === "first" || bashOutputGroup?.position === "last"
        ? bashOutputGroup.position
        : undefined;
    // Extract hook output if present (only shown when hook produced output)
    const hookOutput = extractHookOutput(result);
    const hookDuration = extractHookDuration(result);
    return (_jsxs("div", { className: className, children: [_jsx(ToolComponent
            // Base props (all tools)
            , { 
                // Base props (all tools)
                args: args, result: result ?? null, status: status, toolName: toolName, 
                // Identity props (used by bash for live output, ask_user_question for caching)
                workspaceId: workspaceId, toolCallId: toolCallId, 
                // Bash-specific
                startedAt: message.timestamp, 
                // FileEdit-specific
                onReviewNote: onReviewNote, 
                // ProposePlan-specific
                isLatest: isLatestProposePlan, 
                // BashOutput-specific
                groupPosition: groupPosition, 
                // Task-specific
                taskReportLinking: taskReportLinking, 
                // CodeExecution-specific
                nestedCalls: message.nestedCalls }), hookOutput && _jsx(HookOutputDisplay, { output: hookOutput, durationMs: hookDuration })] }));
};
//# sourceMappingURL=ToolMessage.js.map