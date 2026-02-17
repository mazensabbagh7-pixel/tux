import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { useAPI } from "@/browser/contexts/API";
const wrapperClassName = "pointer-events-none absolute right-[15px] bottom-full left-[15px] z-[1000] mb-2 [&>*]:pointer-events-auto";
export const ConnectionStatusToast = ({ wrap = true }) => {
    const apiState = useAPI();
    // Don't show anything when connected or during initial connection.
    // Auth required is handled by a separate modal flow.
    if (apiState.status === "connected" ||
        apiState.status === "connecting" ||
        apiState.status === "auth_required") {
        return null;
    }
    if (apiState.status === "degraded" || apiState.status === "reconnecting") {
        const content = (_jsxs("div", { role: "status", "aria-live": "polite", className: "bg-background-secondary border-warning text-warning flex animate-[toastSlideIn_0.2s_ease-out] items-center gap-2 rounded border px-3 py-1.5 text-xs shadow-[0_4px_12px_rgba(0,0,0,0.3)]", children: [_jsx("span", { className: "bg-warning inline-block h-2 w-2 animate-pulse rounded-full" }), _jsx("span", { children: apiState.status === "degraded" ? ("Connection unstable — messages may be delayed") : (_jsxs(_Fragment, { children: ["Reconnecting to server", apiState.attempt > 1 && ` (attempt ${apiState.attempt})`, "\u2026"] })) })] }));
        if (!wrap)
            return content;
        return _jsx("div", { className: wrapperClassName, children: content });
    }
    if (apiState.status === "error") {
        const content = (_jsxs("div", { role: "alert", "aria-live": "assertive", className: "bg-toast-error-bg border-toast-error-border text-toast-error-text flex animate-[toastSlideIn_0.2s_ease-out] items-center gap-2 rounded border px-3 py-1.5 text-xs shadow-[0_4px_12px_rgba(0,0,0,0.3)]", children: [_jsx("span", { className: "bg-danger inline-block h-2 w-2 rounded-full" }), _jsx("span", { children: "Connection lost" }), _jsx("button", { type: "button", onClick: apiState.retry, className: "underline hover:no-underline", children: "Retry" })] }));
        if (!wrap)
            return content;
        return _jsx("div", { className: wrapperClassName, children: content });
    }
    return null;
};
//# sourceMappingURL=ConnectionStatusToast.js.map