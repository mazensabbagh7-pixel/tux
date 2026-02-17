import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React, { useEffect, useRef } from "react";
import { cn } from "@/common/lib/utils";
import { Loader2, Wrench, CheckCircle2, AlertCircle } from "lucide-react";
import { Shimmer } from "../ai-elements/shimmer";
function formatDuration(ms) {
    if (ms < 1000)
        return `${Math.round(ms)}ms`;
    if (ms < 10000)
        return `${(ms / 1000).toFixed(1)}s`;
    if (ms < 60000)
        return `${Math.round(ms / 1000)}s`;
    const mins = Math.floor(ms / 60000);
    const secs = Math.round((ms % 60000) / 1000);
    return `${mins}m ${secs}s`;
}
export const InitMessage = React.memo(({ message, className }) => {
    const isError = message.status === "error";
    const isRunning = message.status === "running";
    const isSuccess = message.status === "success";
    const preRef = useRef(null);
    // Auto-scroll to bottom while running
    useEffect(() => {
        if (isRunning && preRef.current) {
            preRef.current.scrollTop = preRef.current.scrollHeight;
        }
    }, [isRunning, message.lines.length]);
    const durationText = message.durationMs !== null ? ` in ${formatDuration(message.durationMs)}` : "";
    return (_jsxs("div", { className: cn("my-2 rounded border px-3 py-2", isError ? "border-init-error-border bg-init-error-bg" : "border-init-border bg-init-bg", className), children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: cn("flex-shrink-0", isError ? "text-error" : isSuccess ? "text-success" : "text-accent"), children: isRunning ? (_jsx(Loader2, { className: "size-3.5 animate-spin" })) : isSuccess ? (_jsx(CheckCircle2, { className: "size-3.5" })) : isError ? (_jsx(AlertCircle, { className: "size-3.5" })) : (_jsx(Wrench, { className: "size-3.5" })) }), _jsx("span", { className: "font-primary text-foreground text-[12px]", children: isRunning ? (_jsx(Shimmer, { colorClass: "var(--color-accent)", children: "Running init hook..." })) : isSuccess ? (`Init hook completed${durationText}`) : (_jsxs("span", { className: "text-error", children: ["Init hook failed (exit code ", message.exitCode, ")", durationText] })) })] }), _jsx("div", { className: "text-muted mt-1 truncate font-mono text-[11px]", children: message.hookPath }), message.lines.length > 0 && (_jsxs("pre", { ref: preRef, className: cn("m-0 mt-2.5 max-h-[120px] overflow-auto rounded-sm", "bg-init-output-bg px-2 py-1.5 font-mono text-[11px] leading-relaxed whitespace-pre-wrap", isError ? "text-init-output-error-text" : "text-init-output-text"), children: [message.truncatedLines && (_jsxs("span", { className: "text-muted", children: ["... ", message.truncatedLines.toLocaleString(), " earlier lines truncated ...", "\n"] })), message.lines.map((line, idx) => (_jsxs("span", { className: line.isError ? "text-init-output-error-text" : undefined, children: [line.line, idx < message.lines.length - 1 ? "\n" : ""] }, idx)))] }))] }));
});
InitMessage.displayName = "InitMessage";
//# sourceMappingURL=InitMessage.js.map