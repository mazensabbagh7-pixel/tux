import { jsx as _jsx } from "react/jsx-runtime";
import { cn } from "@/common/lib/utils";
import { MessageWindow } from "./MessageWindow";
import { UserMessageContent } from "./UserMessageContent";
import { TerminalOutput } from "./TerminalOutput";
import { formatKeybind, KEYBINDS } from "@/browser/utils/ui/keybinds";
import { useCopyToClipboard } from "@/browser/hooks/useCopyToClipboard";
import { copyToClipboard } from "@/browser/utils/clipboard";
import { buildEditingStateFromDisplayed, } from "@/browser/utils/chatEditing";
import { usePersistedState } from "@/browser/hooks/usePersistedState";
import { VIM_ENABLED_KEY } from "@/common/constants/storage";
import { ChevronLeft, ChevronRight, Clipboard, ClipboardCheck, Pencil } from "lucide-react";
export const UserMessage = ({ message, className, onEdit, isCompacting, clipboardWriteText = copyToClipboard, navigation, }) => {
    const isSynthetic = message.isSynthetic === true;
    const content = message.content;
    const [vimEnabled] = usePersistedState(VIM_ENABLED_KEY, false, { listener: true });
    const isMobileTouch = typeof window !== "undefined" &&
        window.matchMedia("(max-width: 768px) and (pointer: coarse)").matches;
    console.assert(typeof clipboardWriteText === "function", "UserMessage expects clipboardWriteText to be a callable function.");
    // Check if this is a local command output
    const isLocalCommandOutput = content.startsWith("<local-command-stdout>") && content.endsWith("</local-command-stdout>");
    // Extract the actual output if it's a local command
    const extractedOutput = isLocalCommandOutput
        ? content.slice("<local-command-stdout>".length, -"</local-command-stdout>".length).trim()
        : "";
    // Copy to clipboard with feedback
    const { copied, copyToClipboard } = useCopyToClipboard(clipboardWriteText);
    const handleEdit = () => {
        if (onEdit && !isLocalCommandOutput && !isSynthetic) {
            onEdit(buildEditingStateFromDisplayed(message));
        }
    };
    // Navigation buttons - always reserve space to avoid layout shift
    // Only show when navigation prop is provided (indicates more than one user message)
    const showNavigation = navigation !== undefined;
    const hasPrev = navigation?.prevUserMessageId !== undefined;
    const hasNext = navigation?.nextUserMessageId !== undefined;
    // Keep Copy and Edit buttons visible (most common actions)
    // Navigation buttons appear first when there are multiple user messages
    const buttons = [
        // Navigation: backward (previous user message)
        ...(showNavigation
            ? [
                {
                    label: "Previous message",
                    onClick: hasPrev
                        ? () => navigation.onNavigate(navigation.prevUserMessageId)
                        : undefined,
                    disabled: !hasPrev,
                    icon: _jsx(ChevronLeft, { className: !hasPrev ? "opacity-30" : undefined }),
                    tooltip: hasPrev ? "Go to previous message" : undefined,
                },
            ]
            : []),
        // Navigation: forward (next user message)
        ...(showNavigation
            ? [
                {
                    label: "Next message",
                    onClick: hasNext
                        ? () => navigation.onNavigate(navigation.nextUserMessageId)
                        : undefined,
                    disabled: !hasNext,
                    icon: _jsx(ChevronRight, { className: !hasNext ? "opacity-30" : undefined }),
                    tooltip: hasNext ? "Go to next message" : undefined,
                },
            ]
            : []),
        ...(onEdit && !isLocalCommandOutput && !isSynthetic
            ? [
                {
                    label: "Edit",
                    onClick: handleEdit,
                    disabled: isCompacting,
                    icon: _jsx(Pencil, {}),
                    tooltip: isCompacting
                        ? isMobileTouch
                            ? "Cannot edit while compacting"
                            : `Cannot edit while compacting (${formatKeybind(vimEnabled ? KEYBINDS.INTERRUPT_STREAM_VIM : KEYBINDS.INTERRUPT_STREAM_NORMAL)} to cancel)`
                        : undefined,
                },
            ]
            : []),
        {
            label: copied ? "Copied" : "Copy",
            onClick: () => void copyToClipboard(content),
            icon: copied ? _jsx(ClipboardCheck, {}) : _jsx(Clipboard, {}),
        },
    ];
    // If it's a local command output, render with TerminalOutput
    const label = isSynthetic ? (_jsx("span", { className: "bg-muted/20 text-muted rounded-sm px-1.5 py-0.5 text-[10px] font-medium uppercase", children: "auto" })) : null;
    const syntheticClassName = cn(className, isSynthetic && "opacity-70");
    if (isLocalCommandOutput) {
        return (_jsx(MessageWindow, { label: label, message: message, buttons: buttons, className: syntheticClassName, variant: "user", children: _jsx(TerminalOutput, { output: extractedOutput, isError: false }) }));
    }
    return (_jsx(MessageWindow, { label: label, message: message, buttons: buttons, className: syntheticClassName, variant: "user", children: _jsx(UserMessageContent, { content: content, commandPrefix: message.commandPrefix, agentSkillSnapshot: message.agentSkill?.snapshot, reviews: message.reviews, fileParts: message.fileParts, variant: "sent" }) }));
};
//# sourceMappingURL=UserMessage.js.map