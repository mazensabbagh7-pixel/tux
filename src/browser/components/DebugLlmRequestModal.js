import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useState } from "react";
import { Download } from "lucide-react";
import { useAPI } from "@/browser/contexts/API";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/browser/components/ui/dialog";
import { Button } from "@/browser/components/ui/button";
import { useCopyToClipboard } from "@/browser/hooks/useCopyToClipboard";
import { copyToClipboard } from "@/browser/utils/clipboard";
const JsonOutput = ({ children }) => (_jsx("div", { className: "bg-code-bg text-text mt-3 w-full max-w-full min-w-0 overflow-x-auto rounded-sm", children: _jsx("pre", { className: "min-w-max p-3 font-mono text-xs leading-relaxed whitespace-pre", children: children }) }));
export const DebugLlmRequestModal = ({ workspaceId, open, onOpenChange, }) => {
    const { api } = useAPI();
    const { copied, copyToClipboard: copy } = useCopyToClipboard(copyToClipboard);
    const [snapshot, setSnapshot] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const fetchSnapshot = useCallback(async () => {
        if (!api)
            return;
        setLoading(true);
        setError(null);
        try {
            const result = await api.workspace.getLastLlmRequest({ workspaceId });
            if (!result.success) {
                setError(result.error);
                setSnapshot(null);
                return;
            }
            setSnapshot(result.data);
        }
        catch (err) {
            setError(err instanceof Error ? err.message : String(err));
            setSnapshot(null);
        }
        finally {
            setLoading(false);
        }
    }, [api, workspaceId]);
    useEffect(() => {
        if (!open || !api)
            return;
        void fetchSnapshot();
    }, [open, api, fetchSnapshot]);
    const json = snapshot ? JSON.stringify(snapshot, null, 2) : "";
    const capturedAtLabel = snapshot ? new Date(snapshot.capturedAt).toLocaleString() : null;
    const handleDownload = () => {
        if (!snapshot)
            return;
        const timestamp = new Date(snapshot.capturedAt).toISOString().replace(/[:.]/g, "-");
        const fileName = `mux-llm-request-${workspaceId}-${timestamp}.json`;
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    };
    return (_jsx(Dialog, { open: open, onOpenChange: onOpenChange, children: _jsxs(DialogContent, { maxWidth: "900px", maxHeight: "85vh", className: "min-w-0 gap-5 overflow-x-hidden", children: [_jsx(DialogHeader, { className: "min-w-0 space-y-3", children: _jsxs("div", { className: "flex flex-wrap items-start justify-between gap-3", children: [_jsxs("div", { className: "space-y-1", children: [_jsx(DialogTitle, { children: "Last LLM request" }), _jsx("div", { className: "text-muted text-xs", children: "Captures the exact payload sent to the provider for this workspace." })] }), _jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [_jsx(Button, { variant: "secondary", size: "sm", onClick: () => void fetchSnapshot(), disabled: !api || loading, children: loading ? "Loading..." : "Refresh" }), _jsx(Button, { variant: "secondary", size: "sm", onClick: () => void copy(json), disabled: !snapshot || loading, children: copied ? "Copied" : "Copy JSON" }), _jsxs(Button, { variant: "secondary", size: "sm", onClick: handleDownload, disabled: !snapshot || loading, children: [_jsx(Download, { className: "size-3.5" }), "Download"] })] })] }) }), _jsxs("div", { className: "min-w-0 space-y-4", children: [error && _jsx("div", { className: "text-danger-soft text-sm", children: error }), loading && !snapshot && (_jsx("div", { className: "text-muted text-sm", children: "Loading last request..." })), !loading && !error && !snapshot && (_jsx("div", { className: "text-muted text-sm", children: "No request captured yet. Send a message, then open this modal again." })), snapshot && (_jsxs("div", { className: "min-w-0 space-y-4", children: [_jsxs("div", { className: "border-border-light bg-foreground/5 rounded-md border p-3 text-xs", children: [_jsxs("div", { className: "text-muted flex flex-wrap items-center gap-x-2 gap-y-1", children: [_jsx("span", { className: "text-foreground font-mono", children: snapshot.providerName }), _jsx("span", { children: "\u2022" }), _jsx("span", { className: "text-foreground font-mono", children: snapshot.model }), _jsx("span", { children: "\u2022" }), _jsxs("span", { className: "text-foreground font-mono", children: ["thinking=", snapshot.thinkingLevel] }), snapshot.mode && (_jsxs(_Fragment, { children: [_jsx("span", { children: "\u2022" }), _jsxs("span", { className: "text-foreground font-mono", children: ["mode=", snapshot.mode] })] })), snapshot.agentId && (_jsxs(_Fragment, { children: [_jsx("span", { children: "\u2022" }), _jsxs("span", { className: "text-foreground font-mono", children: ["agent=", snapshot.agentId] })] })), snapshot.maxOutputTokens && (_jsxs(_Fragment, { children: [_jsx("span", { children: "\u2022" }), _jsxs("span", { className: "text-foreground font-mono", children: ["maxTokens=", snapshot.maxOutputTokens] })] }))] }), capturedAtLabel && (_jsxs("div", { className: "text-muted mt-2 text-[11px]", children: ["Captured ", capturedAtLabel] }))] }), _jsxs("div", { className: "min-w-0 space-y-3", children: [_jsxs("details", { open: true, className: "border-border-light bg-modal-bg min-w-0 rounded-md border p-3", children: [_jsx("summary", { className: "text-foreground cursor-pointer text-sm font-medium", children: "System message" }), _jsx("pre", { className: "bg-code-bg text-text mt-3 rounded-sm p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap", children: snapshot.systemMessage })] }), _jsxs("details", { className: "border-border-light bg-modal-bg min-w-0 rounded-md border p-3", children: [_jsx("summary", { className: "text-foreground cursor-pointer text-sm font-medium", children: "Messages" }), _jsx(JsonOutput, { children: JSON.stringify(snapshot.messages, null, 2) })] }), _jsxs("details", { className: "border-border-light bg-modal-bg min-w-0 rounded-md border p-3", children: [_jsx("summary", { className: "text-foreground cursor-pointer text-sm font-medium", children: "Response" }), snapshot.response ? (_jsx(JsonOutput, { children: JSON.stringify(snapshot.response, null, 2) })) : (_jsx("div", { className: "text-muted mt-3 text-xs", children: "No response captured yet (wait for the stream to finish)." }))] }), _jsxs("details", { className: "border-border-light bg-modal-bg min-w-0 rounded-md border p-3", children: [_jsx("summary", { className: "text-foreground cursor-pointer text-sm font-medium", children: "Full JSON" }), _jsx(JsonOutput, { children: json })] })] })] }))] })] }) }));
};
//# sourceMappingURL=DebugLlmRequestModal.js.map