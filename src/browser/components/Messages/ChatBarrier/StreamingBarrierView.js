import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { CircleStopIcon } from "lucide-react";
import { BaseBarrier } from "./BaseBarrier";
/**
 * Presentation-only StreamingBarrier.
 *
 * Keep this file free of WorkspaceStore imports so it can be reused by alternate
 * frontends (e.g. the VS Code webview) without pulling in the desktop state layer.
 */
export const StreamingBarrierView = (props) => {
    return (_jsxs("div", { className: `flex items-center justify-between gap-4 ${props.className ?? ""}`, children: [_jsxs("div", { className: "flex flex-1 items-center gap-2", children: [_jsx(BaseBarrier, { text: props.statusText, color: "var(--color-assistant-border)", animate: true }), props.hintElement, props.tokenCount !== undefined && (_jsxs("span", { className: "text-assistant-border font-mono text-[11px] whitespace-nowrap select-none", children: ["~", props.tokenCount.toLocaleString(), " tokens", props.tps !== undefined && props.tps > 0 && (_jsxs("span", { className: "text-dim ml-1", children: ["@ ", props.tps, " t/s"] }))] }))] }), _jsx("div", { className: "ml-auto", children: props.onCancel && props.cancelText.length > 0 ? (_jsxs("button", { type: "button", onClick: props.onCancel, title: props.cancelShortcutText, className: "text-muted hover:text-foreground inline-flex h-6 cursor-pointer items-center rounded-sm px-1.5 py-0.5 text-[11px] leading-none font-medium transition-colors duration-200", "aria-label": "Stop streaming", children: [_jsx(CircleStopIcon, { className: "h-3.5 w-3.5 shrink-0", strokeWidth: 2.2 }), _jsx("span", { className: "ml-1 leading-none", children: "Stop" }), props.cancelShortcutText && (_jsx("span", { className: "border-border-medium text-muted ml-2 hidden items-center rounded border px-1 py-[1px] text-[10px] leading-none sm:inline-flex", children: props.cancelShortcutText }))] })) : (_jsx("span", { className: "text-muted text-[11px] whitespace-nowrap select-none", children: props.cancelText })) })] }));
};
//# sourceMappingURL=StreamingBarrierView.js.map