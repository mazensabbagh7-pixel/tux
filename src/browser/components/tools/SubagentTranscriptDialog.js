import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { useAPI } from "@/browser/contexts/API";
import { StreamingMessageAggregator } from "@/browser/utils/messages/StreamingMessageAggregator";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/browser/components/ui/dialog";
import { ErrorBox, LoadingDots } from "./shared/ToolPrimitives";
import { MessageRenderer } from "@/browser/components/Messages/MessageRenderer";
import { ModelDisplay } from "@/browser/components/Messages/ModelDisplay";
export const SubagentTranscriptDialog = (props) => {
    const [model, setModel] = useState();
    const [thinkingLevel, setThinkingLevel] = useState();
    return (_jsx(Dialog, { open: props.open, onOpenChange: props.onOpenChange, children: _jsxs(DialogContent, { className: "flex max-h-[80vh] min-h-0 max-w-5xl flex-col overflow-hidden", children: [_jsx(DialogHeader, { children: _jsxs(DialogTitle, { className: "flex flex-col gap-1", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { children: "Transcript" }), _jsx("code", { className: "rounded bg-[var(--color-bg-tertiary)] px-1.5 py-0.5 font-mono text-[10px]", children: props.taskId })] }), (model !== undefined || thinkingLevel !== undefined) && (_jsxs("div", { className: "text-muted flex flex-wrap items-baseline gap-2 text-[11px] font-normal", children: [model && _jsx(ModelDisplay, { modelString: model }), thinkingLevel && (_jsxs("span", { className: "inline-flex items-center rounded bg-[var(--color-bg-tertiary)] px-1.5 py-0.5 font-mono text-[10px] leading-none", children: ["thinking: ", thinkingLevel] }))] }))] }) }), _jsx(SubagentTranscriptViewer, { open: props.open, workspaceId: props.workspaceId, taskId: props.taskId, setModel: setModel, setThinkingLevel: setThinkingLevel })] }) }));
};
const SubagentTranscriptViewer = (props) => {
    const { api } = useAPI();
    const open = props.open;
    const workspaceId = props.workspaceId;
    const taskId = props.taskId;
    const setModel = props.setModel;
    const setThinkingLevel = props.setThinkingLevel;
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [messages, setMessages] = useState(null);
    useEffect(() => {
        // TaskToolCall renders this dialog component for each completed task even while closed.
        // Avoid expensive disk/IPC transcript loads until the dialog is opened.
        if (!open) {
            return;
        }
        setIsLoading(true);
        setError(null);
        setMessages(null);
        setModel?.(undefined);
        setThinkingLevel?.(undefined);
        if (!api) {
            setIsLoading(false);
            setError("API unavailable");
            return;
        }
        let cancelled = false;
        const run = async () => {
            try {
                const transcript = await api.workspace.getSubagentTranscript({
                    taskId,
                    workspaceId,
                });
                if (cancelled)
                    return;
                setMessages(transcript.messages);
                setModel?.(transcript.model);
                setThinkingLevel?.(transcript.thinkingLevel);
                setIsLoading(false);
            }
            catch (err) {
                if (cancelled)
                    return;
                setIsLoading(false);
                setError(err instanceof Error ? err.message : String(err));
            }
        };
        void run();
        return () => {
            cancelled = true;
        };
    }, [api, open, taskId, workspaceId, setModel, setThinkingLevel]);
    const displayedMessages = useMemo(() => {
        if (!messages) {
            return null;
        }
        // Use a dedicated aggregator instance so transcript rendering matches the main chat UI.
        // We intentionally do not pass workspaceId to the aggregator: it persists some UI state to localStorage.
        // We DO pass workspaceId to MessageRenderer so nested "View transcript" tool calls can resolve
        // artifacts from the parent workspace that owns the transcript index (important after roll-up).
        const aggregator = new StreamingMessageAggregator(new Date().toISOString());
        aggregator.setShowAllMessages(true);
        for (const msg of messages) {
            const event = { ...msg, type: "message" };
            aggregator.handleMessage(event);
        }
        return aggregator.getDisplayedMessages();
    }, [messages]);
    return (_jsxs("div", { className: "flex min-h-0 flex-1 flex-col gap-2 overflow-hidden", children: [error && _jsx(ErrorBox, { children: error }), _jsx("div", { className: "min-h-0 flex-1 overflow-y-auto rounded bg-[var(--color-bg-secondary)] p-3", children: isLoading ? (_jsxs("div", { className: "text-muted text-[11px] italic", children: ["Loading transcript", _jsx(LoadingDots, {})] })) : displayedMessages ? (displayedMessages.length > 0 ? (_jsx("div", { className: "flex flex-col gap-2", children: displayedMessages.map((msg) => (_jsx(MessageRenderer, { message: msg, workspaceId: workspaceId }, msg.id))) })) : (_jsx("div", { className: "text-muted text-[11px] italic", children: "Transcript is empty" }))) : error ? null : (_jsx("div", { className: "text-muted text-[11px] italic", children: "No transcript loaded" })) })] }));
};
//# sourceMappingURL=SubagentTranscriptDialog.js.map