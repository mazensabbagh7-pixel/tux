import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useState } from "react";
import { MessageWindow } from "./MessageWindow";
import { UserMessageContent } from "./UserMessageContent";
import { Pencil } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "../ui/tooltip";
export const QueuedMessage = ({ message, className, onEdit, onSendImmediately, }) => {
    const { content } = message;
    const [isSending, setIsSending] = useState(false);
    const handleSendImmediately = useCallback(async () => {
        if (isSending || !onSendImmediately)
            return;
        setIsSending(true);
        try {
            await onSendImmediately();
        }
        finally {
            setIsSending(false);
        }
    }, [isSending, onSendImmediately]);
    const buttons = onEdit
        ? [
            {
                label: "Edit",
                onClick: onEdit,
                icon: _jsx(Pencil, {}),
            },
        ]
        : [];
    // Clickable "Queued" label with tooltip
    const queuedLabel = onSendImmediately ? (_jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("button", { type: "button", onClick: () => void handleSendImmediately(), disabled: isSending, className: "cursor-pointer hover:underline disabled:cursor-not-allowed disabled:opacity-50", children: "Queued" }) }), _jsx(TooltipContent, { align: "center", children: "Click to send immediately" })] })) : ("Queued");
    return (_jsx(MessageWindow, { label: queuedLabel, variant: "user", message: message, className: className, buttons: buttons, children: _jsx(UserMessageContent, { content: content, reviews: message.reviews, fileParts: message.fileParts, variant: "queued" }) }));
};
//# sourceMappingURL=QueuedMessage.js.map