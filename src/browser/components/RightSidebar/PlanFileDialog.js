import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import assert from "@/common/utils/assert";
import { useAPI } from "@/browser/contexts/API";
import { MarkdownCore } from "@/browser/components/Messages/MarkdownCore";
import { PlanMarkdownContainer } from "@/browser/components/Messages/MarkdownRenderer";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/browser/components/ui/dialog";
export const PlanFileDialog = (props) => {
    const { api } = useAPI();
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [content, setContent] = useState(null);
    const [path, setPath] = useState(null);
    useEffect(() => {
        // PostCompactionSection renders this dialog while closed.
        // Delay IPC plan-file reads until the user explicitly opens the preview.
        if (!props.open) {
            return;
        }
        assert(props.workspaceId.trim().length > 0, "workspaceId is required to load plan preview");
        setIsLoading(true);
        setError(null);
        setContent(null);
        setPath(null);
        if (!api) {
            setIsLoading(false);
            setError("API unavailable");
            return;
        }
        let cancelled = false;
        const run = async () => {
            try {
                const result = await api.workspace.getPlanContent({ workspaceId: props.workspaceId });
                if (cancelled) {
                    return;
                }
                if (!result.success) {
                    setError(result.error);
                    setIsLoading(false);
                    return;
                }
                assert(result.data.path.length > 0, "Plan path should be non-empty");
                setContent(result.data.content);
                setPath(result.data.path);
                setIsLoading(false);
            }
            catch (error) {
                if (cancelled) {
                    return;
                }
                setError(error instanceof Error ? error.message : String(error));
                setIsLoading(false);
            }
        };
        void run();
        return () => {
            cancelled = true;
        };
    }, [api, props.open, props.workspaceId]);
    return (_jsx(Dialog, { open: props.open, onOpenChange: props.onOpenChange, children: _jsxs(DialogContent, { className: "flex max-h-[80vh] min-h-0 max-w-5xl flex-col overflow-hidden", children: [_jsx(DialogHeader, { children: _jsxs(DialogTitle, { className: "flex flex-col gap-1", children: [_jsx("span", { children: "Plan file" }), path && (_jsx("code", { className: "rounded bg-[var(--color-bg-tertiary)] px-1.5 py-0.5 font-mono text-[10px]", children: path }))] }) }), _jsx("div", { className: "min-h-0 flex-1 overflow-y-auto rounded bg-[var(--color-bg-secondary)] p-3", children: error ? (_jsx("div", { className: "text-error text-[11px]", "data-testid": "plan-file-dialog-error", children: error })) : isLoading ? (_jsx("div", { className: "text-muted text-[11px] italic", children: "Loading plan\u2026" })) : content !== null ? (content.length > 0 ? (_jsx(PlanMarkdownContainer, { children: _jsx(MarkdownCore, { content: content }) })) : (_jsx("div", { className: "text-muted text-[11px] italic", children: "Plan file is empty" }))) : (_jsx("div", { className: "text-muted text-[11px] italic", children: "No plan loaded" })) })] }) }));
};
//# sourceMappingURL=PlanFileDialog.js.map