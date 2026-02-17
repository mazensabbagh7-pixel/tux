import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { AlertTriangle, Bug, ExternalLink } from "lucide-react";
import { Button } from "@/browser/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/browser/components/ui/tooltip";
import { useCompactAndRetry } from "@/browser/hooks/useCompactAndRetry";
import { CUSTOM_EVENTS, createCustomEvent } from "@/common/constants/events";
import { cn } from "@/common/lib/utils";
import { getModelProvider } from "@/common/utils/ai/models";
import { formatTokens } from "@/common/utils/tokens/tokenMeterUtils";
import { useOptionalMessageListContext } from "./MessageListContext";
function formatContextTokens(tokens) {
    return formatTokens(tokens).replace(/\.0([kM])$/, "$1");
}
const StreamErrorMessageBase = (props) => {
    const message = props.message;
    const className = props.className;
    const compactRetryAction = props.compactRetryAction;
    const compactionDetails = props.compactionDetails;
    const debugAction = (_jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx(Button, { variant: "ghost", size: "icon", onClick: () => {
                        window.dispatchEvent(createCustomEvent(CUSTOM_EVENTS.OPEN_DEBUG_LLM_REQUEST));
                    }, "aria-label": "Open last LLM request debug modal", className: "text-error/80 hover:text-error h-6 w-6", children: _jsx(Bug, { className: "h-3.5 w-3.5" }) }) }), _jsx(TooltipContent, { align: "center", children: _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { children: "Debug last LLM request" }), _jsx("code", { className: "bg-foreground/5 text-foreground/80 border-foreground/10 rounded-sm border px-1.5 py-0.5 font-mono text-[10px]", children: "/debug-llm-request" })] }) })] }));
    // Runtime unavailable gets a distinct, friendlier presentation.
    // This is a permanent failure (container/runtime doesn't exist), not a transient stream error.
    // The backend sends "Container unavailable..." for Docker or "Runtime unavailable..." for others.
    if (message.errorType === "runtime_not_ready") {
        // Extract title from error message (e.g., "Container unavailable" or "Runtime unavailable")
        const title = message.error?.split(".")[0] ?? "Runtime Unavailable";
        return (_jsxs("div", { className: cn("bg-error-bg border border-error rounded px-5 py-4 my-3", className), children: [_jsxs("div", { className: "font-primary text-error mb-2 flex items-center gap-2 text-[13px] font-semibold", children: [_jsx(AlertTriangle, { "aria-hidden": "true", className: "h-4 w-4" }), _jsx("span", { children: title }), _jsx("div", { className: "ml-auto flex items-center", children: debugAction })] }), _jsx("div", { className: "text-foreground/80 text-[13px] leading-relaxed", children: message.error })] }));
    }
    const provider = message.model ? getModelProvider(message.model) : "";
    const isAnthropicOverloaded = provider === "anthropic" &&
        message.errorType === "server_error" &&
        /\bHTTP\s*529\b|overloaded/i.test(message.error);
    const title = isAnthropicOverloaded ? "Service overloaded" : "Stream Error";
    const pill = isAnthropicOverloaded ? "overloaded" : message.errorType;
    const statusAction = isAnthropicOverloaded ? (_jsx(Button, { asChild: true, variant: "ghost", size: "sm", className: "text-error/80 hover:text-error h-6 px-2 text-[10px]", children: _jsxs("a", { href: "https://status.anthropic.com", target: "_blank", rel: "noopener noreferrer", children: ["Status ", _jsx(ExternalLink, { className: "ml-1 h-3 w-3" })] }) })) : null;
    const showCount = message.errorCount !== undefined && message.errorCount > 1;
    return (_jsxs("div", { className: cn("bg-error-bg border border-error rounded px-5 py-4 my-3", className), children: [_jsxs("div", { className: "font-primary text-error mb-3 flex items-center gap-2.5 text-[13px] font-semibold tracking-wide", children: [_jsx("span", { className: "text-base leading-none", children: "\u25CF" }), _jsx("span", { children: title }), _jsx("code", { className: "bg-foreground/5 text-foreground/80 border-foreground/10 rounded-sm border px-2 py-0.5 font-mono text-[10px] tracking-wider uppercase", children: pill }), _jsxs("div", { className: "ml-auto flex items-center gap-2", children: [showCount && (_jsxs("span", { className: "text-error rounded-sm bg-red-500/15 px-2 py-0.5 font-mono text-[10px] font-semibold tracking-wide", children: ["\u00D7", message.errorCount] })), statusAction, debugAction] })] }), _jsx("div", { className: "text-foreground font-mono text-[13px] leading-relaxed break-words whitespace-pre-wrap", children: message.error }), compactionDetails, compactRetryAction ? (_jsx("div", { className: "mt-3 flex items-center justify-start", children: compactRetryAction })) : null] }));
};
const StreamErrorMessageWithRetry = (props) => {
    const compactAndRetry = useCompactAndRetry({ workspaceId: props.workspaceId });
    const showCompactRetry = compactAndRetry.showCompactionUI;
    let compactRetryLabel = "Compact & retry";
    if (showCompactRetry) {
        if (compactAndRetry.isRetryingWithCompaction) {
            compactRetryLabel = "Starting...";
        }
        else if (!compactAndRetry.compactionSuggestion || !compactAndRetry.hasTriggerUserMessage) {
            compactRetryLabel = "Insert /compact";
        }
        else if (compactAndRetry.hasCompactionRequest) {
            compactRetryLabel = "Retry compaction";
        }
    }
    const compactRetryAction = showCompactRetry ? (_jsx(Button, { variant: "outline", size: "sm", onClick: () => {
            compactAndRetry.retryWithCompaction().catch(() => undefined);
        }, disabled: compactAndRetry.isRetryingWithCompaction, className: "border-warning/50 text-foreground bg-warning/10 hover:bg-warning/15 hover:text-foreground h-6 px-2 text-[10px]", children: compactRetryLabel })) : null;
    const compactionSuggestion = compactAndRetry.compactionSuggestion;
    const compactionDetails = showCompactRetry ? (_jsxs("div", { className: "font-primary text-foreground/80 mt-3 text-[12px]", children: [_jsx("span", { className: "text-foreground font-semibold", children: "Context window exceeded." }), " ", compactionSuggestion ? (compactionSuggestion.kind === "preferred" ? (_jsxs(_Fragment, { children: ["We'll compact with your configured compaction model", " ", _jsx("span", { className: "text-foreground font-semibold", children: compactionSuggestion.displayName }), compactionSuggestion.maxInputTokens !== null ? (_jsxs(_Fragment, { children: [" (", formatContextTokens(compactionSuggestion.maxInputTokens), " context)"] })) : null, " ", "to unblock you. Your workspace model stays the same."] })) : (_jsxs(_Fragment, { children: ["We'll compact with", " ", _jsx("span", { className: "text-foreground font-semibold", children: compactionSuggestion.displayName }), compactionSuggestion.maxInputTokens !== null ? (_jsxs(_Fragment, { children: [" (", formatContextTokens(compactionSuggestion.maxInputTokens), " context)"] })) : null, " ", "to unblock you with a higher-context model. Your workspace model stays the same."] }))) : (_jsx(_Fragment, { children: "Compact this chat to unblock you. Your workspace model stays the same." }))] })) : null;
    return (_jsx(StreamErrorMessageBase, { message: props.message, className: props.className, compactRetryAction: compactRetryAction, compactionDetails: compactionDetails }));
};
// RetryBarrier handles auto-retry; compaction retry UI lives here for stream errors.
export const StreamErrorMessage = (props) => {
    const messageListContext = useOptionalMessageListContext();
    const latestMessageId = messageListContext?.latestMessageId ?? null;
    const workspaceId = messageListContext?.workspaceId ?? null;
    const isLatestMessage = latestMessageId === props.message.id;
    if (!workspaceId || !isLatestMessage) {
        return _jsx(StreamErrorMessageBase, { message: props.message, className: props.className });
    }
    return (_jsx(StreamErrorMessageWithRetry, { message: props.message, className: props.className, workspaceId: workspaceId }));
};
//# sourceMappingURL=StreamErrorMessage.js.map