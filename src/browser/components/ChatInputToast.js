import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { AlertTriangle, Check } from "lucide-react";
import React, { useEffect, useCallback } from "react";
import { cn } from "@/common/lib/utils";
const toastTypeStyles = {
    success: "bg-toast-success-bg border border-accent-dark text-toast-success-text",
    error: "bg-toast-error-bg border border-toast-error-border text-toast-error-text",
};
export const SolutionLabel = ({ children }) => (_jsx("div", { className: "text-muted-light mb-1 text-[10px] uppercase", children: children }));
const wrapperClassName = "pointer-events-none absolute right-[15px] bottom-full left-[15px] z-[1000] mb-2 [&>*]:pointer-events-auto";
export const ChatInputToast = ({ toast, onDismiss, wrap = true, }) => {
    const [isLeaving, setIsLeaving] = React.useState(false);
    // Avoid carrying the fade-out animation state across toast changes.
    // If we auto-dismiss or manually dismiss a toast, `isLeaving` becomes true.
    // Without resetting it on new toasts, subsequent toasts can render in a permanent
    // fade-out state and appear invisible.
    useEffect(() => {
        setIsLeaving(false);
    }, [toast?.id]);
    const handleDismiss = useCallback(() => {
        setIsLeaving(true);
        setTimeout(onDismiss, 200); // Wait for fade animation
    }, [onDismiss]);
    useEffect(() => {
        if (!toast)
            return;
        // Use longer duration in E2E tests to give assertions time to observe the toast
        const e2eDuration = 10000;
        const defaultSuccessDuration = window.api?.isE2E ? e2eDuration : 3000;
        // Auto-dismiss when duration is explicitly provided, regardless of toast type.
        // Otherwise, only success toasts auto-dismiss.
        const duration = toast.duration ?? (toast.type === "success" ? defaultSuccessDuration : null);
        if (duration !== null) {
            const timer = setTimeout(() => {
                handleDismiss();
            }, duration);
            return () => {
                clearTimeout(timer);
            };
        }
        // Error toasts stay until manually dismissed
        return () => {
            setIsLeaving(false);
        };
    }, [toast, handleDismiss]);
    if (!toast)
        return null;
    // Use rich error style when there's a title or solution
    const isRichError = toast.type === "error" && (toast.title ?? toast.solution);
    const content = isRichError ? (_jsx("div", { role: "alert", "aria-live": "assertive", className: "bg-toast-fatal-bg border-toast-fatal-border text-danger-soft animate-[toastSlideIn_0.2s_ease-out] rounded border px-3 py-2.5 text-xs shadow-[0_4px_12px_rgba(0,0,0,0.3)]", children: _jsxs("div", { className: "flex items-start gap-1.5", children: [_jsx(AlertTriangle, { "aria-hidden": "true", className: "mt-0.5 h-4 w-4 shrink-0" }), _jsxs("div", { className: "flex-1", children: [toast.title && _jsx("div", { className: "mb-1.5 font-semibold", children: toast.title }), _jsx("div", { className: "text-light mt-1.5 leading-[1.4]", children: toast.message }), toast.solution && (_jsx("div", { className: "bg-dark font-monospace text-code-type mt-2 rounded px-2 py-1.5 text-[11px]", children: toast.solution }))] }), _jsx("button", { onClick: handleDismiss, "aria-label": "Dismiss", className: "flex h-4 w-4 cursor-pointer items-center justify-center border-0 bg-transparent p-0 text-base leading-none text-inherit opacity-60 transition-opacity hover:opacity-100", children: "\u00D7" })] }) })) : (_jsxs("div", { role: toast.type === "error" ? "alert" : "status", "aria-live": toast.type === "error" ? "assertive" : "polite", className: cn("px-3 py-2 rounded text-xs shadow-[0_4px_12px_rgba(0,0,0,0.3)]", isLeaving
            ? "animate-[toastFadeOut_0.2s_ease-out_forwards]"
            : "animate-[toastSlideIn_0.2s_ease-out]", toastTypeStyles[toast.type]), children: [_jsxs("div", { className: "flex items-center gap-2", children: [toast.type === "success" ? (_jsx(Check, { "aria-hidden": "true", className: "h-4 w-4 shrink-0" })) : (_jsx(AlertTriangle, { "aria-hidden": "true", className: "h-4 w-4 shrink-0" })), toast.title && _jsx("span", { className: "flex-1 text-[11px] font-semibold", children: toast.title }), !toast.title && _jsx("span", { className: "flex-1" }), toast.type === "error" && (_jsx("button", { onClick: handleDismiss, "aria-label": "Dismiss", className: "flex h-4 w-4 cursor-pointer items-center justify-center border-0 bg-transparent p-0 text-base leading-none text-inherit opacity-60 transition-opacity hover:opacity-100", children: "\u00D7" }))] }), _jsx("div", { className: "mt-1.5 opacity-90", children: toast.message })] }));
    if (!wrap)
        return content;
    return _jsx("div", { className: wrapperClassName, children: content });
};
//# sourceMappingURL=ChatInputToast.js.map