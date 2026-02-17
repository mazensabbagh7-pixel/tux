import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { cn } from "@/common/lib/utils";
import { formatTimestamp } from "@/browser/utils/ui/dateTime";
import { Code2Icon } from "lucide-react";
import { useMemo, useState } from "react";
import { useChatHostContext } from "@/browser/contexts/ChatHostContext";
import { Tooltip, TooltipTrigger, TooltipContent } from "../ui/tooltip";
import { Button } from "../ui/button";
export const MessageWindow = ({ label, variant = "assistant", message, buttons = [], children, rightLabel, backgroundEffect, }) => {
    const [showJson, setShowJson] = useState(false);
    const { uiSupport } = useChatHostContext();
    const canShowJson = uiSupport.jsonRawView === "supported";
    const isShowingJson = canShowJson && showJson;
    // Get timestamp from message if available
    const timestamp = "timestamp" in message && typeof message.timestamp === "number" ? message.timestamp : null;
    // Memoize formatted timestamp to avoid recalculating on every render
    const formattedTimestamp = useMemo(() => (timestamp ? formatTimestamp(timestamp) : null), [timestamp]);
    const isLastPartOfMessage = useMemo(() => {
        if ("isLastPartOfMessage" in message && message.isLastPartOfMessage && !message.isPartial) {
            return true;
        }
        return false;
    }, [message]);
    // We do not want to display these on every message, otherwise it spams the UI
    // with buttons and timestamps
    const showMetaRow = useMemo(() => {
        return variant === "user" || isLastPartOfMessage;
    }, [variant, isLastPartOfMessage]);
    return (_jsxs("div", { className: cn("mt-4 mb-1 flex flex-col relative isolate", variant === "user" && "ml-auto w-fit max-w-full", variant === "assistant" && "w-full text-foreground", isLastPartOfMessage && "mb-4"), "data-message-block": true, children: [_jsxs("div", { className: cn(variant === "user" &&
                    "bg-[var(--color-user-surface)] border border-[var(--color-user-border)] rounded-lg px-3 py-2 overflow-x-auto shadow-sm", variant === "assistant" && "px-1 py-1"), children: [backgroundEffect, _jsx("div", { className: "relative z-10 flex flex-col gap-2", children: _jsx("div", { "data-message-content": true, children: isShowingJson ? (_jsx("pre", { className: "m-0 overflow-x-auto rounded-xl border border-[var(--color-message-debug-border)] bg-[var(--color-message-debug-bg)] p-3 text-[12px] leading-snug whitespace-pre-wrap text-[var(--color-message-debug-text)]", children: JSON.stringify(message, null, 2) })) : (children) }) })] }), showMetaRow && (_jsxs("div", { className: cn("mt-2 flex flex-wrap items-center justify-between gap-3 text-[11px]", variant === "user" ? "ml-auto text-muted" : "text-muted"), "data-message-meta": true, children: [_jsxs("div", { className: "flex flex-wrap items-center gap-0.5", "data-message-meta-actions": true, children: [buttons.map((button, index) => (_jsx(IconActionButton, { button: button }, index))), canShowJson && (_jsx(IconActionButton, { button: {
                                    label: isShowingJson ? "Hide JSON" : "Show JSON",
                                    icon: _jsx(Code2Icon, {}),
                                    active: isShowingJson,
                                    onClick: () => setShowJson(!isShowingJson),
                                    tooltip: isShowingJson ? "Hide raw JSON" : "Show raw JSON",
                                } }))] }), _jsxs("div", { className: "text-muted flex min-w-0 flex-1 flex-wrap items-center gap-2 text-xs", "data-message-meta-right": true, children: [rightLabel, label && (_jsx("div", { className: "inline-flex min-w-0 items-center gap-2 whitespace-nowrap", children: label })), formattedTimestamp && _jsx("span", { "data-message-timestamp": true, children: formattedTimestamp })] })] }))] }));
};
export const IconActionButton = ({ button }) => {
    // If a custom component is provided, render it directly
    if (button.component) {
        return _jsx(_Fragment, { children: button.component });
    }
    const content = (_jsx(Button, { onClick: button.onClick, disabled: button.disabled, "aria-label": button.label, variant: "ghost", size: "icon", className: "text-placeholder flex h-6 w-6 items-center justify-center [&_svg]:size-3.5", children: button.icon ?? (_jsx("span", { className: "text-[10px] font-semibold tracking-wide uppercase", children: button.label })) }));
    if (button.tooltip || button.label) {
        return (_jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: content }), _jsx(TooltipContent, { align: "center", children: button.tooltip ?? button.label })] }));
    }
    return content;
};
//# sourceMappingURL=MessageWindow.js.map