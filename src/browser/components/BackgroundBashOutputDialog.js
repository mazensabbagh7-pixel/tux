import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { CopyButton } from "./ui/CopyButton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { DetailContent } from "./tools/shared/ToolPrimitives";
import { useAPI } from "@/browser/contexts/API";
import { appendLiveBashOutputChunk, } from "@/browser/utils/messages/liveBashOutputBuffer";
import { BASH_TRUNCATE_MAX_TOTAL_BYTES } from "@/common/constants/toolLimits";
const BACKGROUND_BASH_INITIAL_TAIL_BYTES = 64000;
const BACKGROUND_BASH_POLL_INTERVAL_MS = 500;
export const BackgroundBashOutputDialog = (props) => (_jsx(Dialog, { open: props.open, onOpenChange: props.onOpenChange, children: _jsxs(DialogContent, { className: "max-h-[80vh] max-w-4xl overflow-hidden", children: [_jsx(DialogHeader, { children: _jsxs(DialogTitle, { className: "flex items-center gap-2", children: [_jsx("span", { className: "font-mono text-sm", children: props.displayName ?? props.processId }), props.displayName && (_jsx("code", { className: "rounded bg-[var(--color-bg-tertiary)] px-1.5 py-0.5 font-mono text-[10px]", children: props.processId }))] }) }), _jsx(BackgroundBashOutputViewer, { workspaceId: props.workspaceId, processId: props.processId })] }) }));
const BackgroundBashOutputViewer = (props) => {
    const { api } = useAPI();
    const [output, setOutput] = useState(undefined);
    const [status, setStatus] = useState("running");
    const [truncatedStart, setTruncatedStart] = useState(false);
    const [error, setError] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    useEffect(() => {
        setOutput(undefined);
        setStatus("running");
        setTruncatedStart(false);
        setError(null);
        setIsLoading(true);
        if (!api) {
            setIsLoading(false);
            setError("API unavailable");
            return;
        }
        let cancelled = false;
        const run = async () => {
            let offset = undefined;
            while (!cancelled) {
                const result = await api.workspace.backgroundBashes.getOutput(offset === undefined
                    ? {
                        workspaceId: props.workspaceId,
                        processId: props.processId,
                        tailBytes: BACKGROUND_BASH_INITIAL_TAIL_BYTES,
                    }
                    : {
                        workspaceId: props.workspaceId,
                        processId: props.processId,
                        fromOffset: offset,
                    });
                if (cancelled)
                    return;
                setIsLoading(false);
                if (!result.success) {
                    setError(result.error);
                    return;
                }
                setStatus(result.data.status);
                if (result.data.truncatedStart) {
                    setTruncatedStart(true);
                }
                offset = result.data.nextOffset;
                if (result.data.output.length > 0) {
                    setOutput((prev) => appendLiveBashOutputChunk(prev, { text: result.data.output, isError: false }, BASH_TRUNCATE_MAX_TOTAL_BYTES));
                }
                if (result.data.status !== "running") {
                    return;
                }
                await new Promise((resolve) => setTimeout(resolve, BACKGROUND_BASH_POLL_INTERVAL_MS));
            }
        };
        void run();
        return () => {
            cancelled = true;
        };
    }, [api, props.processId, props.workspaceId]);
    const text = output?.combined ?? "";
    const isTruncatedToMaxBytes = output?.truncated ?? false;
    return (_jsxs("div", { className: "flex min-h-0 flex-col gap-2 overflow-hidden", children: [_jsxs("div", { className: "flex items-center justify-between gap-3", children: [_jsxs("div", { className: "text-muted font-mono text-[11px]", children: ["status: ", status] }), _jsx(CopyButton, { text: text, className: "h-6" })] }), truncatedStart && (_jsxs("div", { className: "text-muted text-[10px] italic", children: ["Showing last ", Math.round(BACKGROUND_BASH_INITIAL_TAIL_BYTES / 1000), "KB"] })), isTruncatedToMaxBytes && (_jsx("div", { className: "text-muted text-[10px] italic", children: "Output truncated (showing last ~1MB)" })), error && _jsx("div", { className: "text-error text-[11px]", children: error }), _jsx(DetailContent, { className: "max-h-[60vh] min-h-[200px] px-2 py-1.5", children: isLoading ? "Loading…" : text.length > 0 ? text : error ? "" : "No output yet" })] }));
};
//# sourceMappingURL=BackgroundBashOutputDialog.js.map