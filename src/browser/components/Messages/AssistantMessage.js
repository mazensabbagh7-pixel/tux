import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCopyToClipboard } from "@/browser/hooks/useCopyToClipboard";
import { useStartHere } from "@/browser/hooks/useStartHere";
import { copyToClipboard } from "@/browser/utils/clipboard";
import { Clipboard, ClipboardCheck, FileText, ListStart, Moon, Package } from "lucide-react";
import { ShareMessagePopover } from "@/browser/components/ShareMessagePopover";
import { useOptionalWorkspaceContext } from "@/browser/contexts/WorkspaceContext";
import { Button } from "../ui/button";
import { useState } from "react";
import { CompactingMessageContent } from "./CompactingMessageContent";
import { CompactionBackground } from "./CompactionBackground";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { MessageWindow } from "./MessageWindow";
import { ModelDisplay } from "./ModelDisplay";
import { TypewriterMarkdown } from "./TypewriterMarkdown";
export const AssistantMessage = ({ message, className, workspaceId, isCompacting = false, clipboardWriteText = copyToClipboard, }) => {
    const [showRaw, setShowRaw] = useState(false);
    const workspaceContext = useOptionalWorkspaceContext();
    // Get workspace name from context for share filename
    const workspaceName = workspaceId
        ? workspaceContext?.workspaceMetadata.get(workspaceId)?.name
        : undefined;
    const content = message.content;
    const isStreaming = message.isStreaming;
    const isCompacted = message.isCompacted;
    const isStreamingCompaction = isStreaming && isCompacting;
    // Use Start Here hook for final assistant messages
    const { openModal: openStartHereModal, buttonLabel: startHereLabel, disabled: startHereDisabled, modal: startHereModal, } = useStartHere(workspaceId, content, isCompacted, {
        // Preserve legacy plan/exec markers so Start Here keeps plan→exec handoff for old history.
        sourceAgentId: message.agentId ?? message.mode,
    });
    // Copy to clipboard with feedback
    const { copied, copyToClipboard } = useCopyToClipboard(clipboardWriteText);
    // Keep only Copy button visible (most common action)
    // Kebab menu saves horizontal space by collapsing less-used actions into a single ⋮ button
    const copyButton = {
        label: copied ? "Copied" : "Copy",
        onClick: () => void copyToClipboard(content),
        icon: copied ? _jsx(ClipboardCheck, {}) : _jsx(Clipboard, {}),
    };
    const buttons = isStreaming ? [] : [copyButton];
    if (!isStreaming) {
        buttons.push({
            label: startHereLabel,
            onClick: openStartHereModal,
            disabled: startHereDisabled,
            tooltip: "Start a new context from this message and preserve earlier chat history",
            icon: _jsx(ListStart, {}),
        });
        buttons.push({
            label: "Share",
            component: (_jsx(ShareMessagePopover, { content: content, model: message.model, disabled: !content, workspaceName: workspaceName })),
        });
        buttons.push({
            label: showRaw ? "Show Markdown" : "Show Text",
            onClick: () => setShowRaw(!showRaw),
            active: showRaw,
            icon: _jsx(FileText, {}),
        });
    }
    // Render appropriate content based on state
    const renderContent = () => {
        // Empty streaming state
        if (isStreaming && !content) {
            return _jsx("div", { className: "font-primary text-secondary italic", children: "Waiting for response..." });
        }
        // Streaming text gets typewriter effect
        if (isStreaming) {
            const contentElement = _jsx(TypewriterMarkdown, { deltas: [content], isComplete: false });
            // Wrap streaming compaction in special container
            if (isStreamingCompaction) {
                return _jsx(CompactingMessageContent, { children: contentElement });
            }
            return contentElement;
        }
        // Completed text renders as static content
        return content ? (showRaw ? (_jsxs("div", { className: "relative", children: [_jsx("pre", { className: "text-text bg-code-bg m-0 rounded-sm p-2 pb-8 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap", children: content }), _jsx("div", { className: "absolute right-2 bottom-2", children: _jsxs(Button, { type: "button", variant: "outline", size: "sm", className: "h-6 px-2 text-[11px] [&_svg]:size-3.5", onClick: () => void copyToClipboard(content), children: [copied ? _jsx(ClipboardCheck, {}) : _jsx(Clipboard, {}), copied ? "Copied" : "Copy to clipboard"] }) })] })) : (_jsx(MarkdownRenderer, { content: content }))) : null;
    };
    // Create label with model name and compacted indicator if applicable
    const renderLabel = () => {
        const modelName = message.model;
        const isCompacted = message.isCompacted;
        const isIdleCompacted = message.isIdleCompacted;
        return (_jsxs("div", { className: "flex items-center gap-2", children: [modelName && (_jsx(ModelDisplay, { modelString: modelName, routedThroughGateway: message.routedThroughGateway })), isCompacted && (_jsxs("span", { className: "text-plan-mode bg-plan-mode/10 inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[10px] font-medium uppercase", children: [isIdleCompacted ? (_jsx(Moon, { "aria-hidden": "true", className: "h-3 w-3" })) : (_jsx(Package, { "aria-hidden": "true", className: "h-3 w-3" })), _jsx("span", { children: isIdleCompacted ? "idle-compacted" : "compacted" })] }))] }));
    };
    return (_jsxs(_Fragment, { children: [_jsx(MessageWindow, { label: renderLabel(), variant: "assistant", message: message, buttons: buttons, className: className, backgroundEffect: isStreamingCompaction ? _jsx(CompactionBackground, {}) : undefined, children: renderContent() }), startHereModal] }));
};
//# sourceMappingURL=AssistantMessage.js.map