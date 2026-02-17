import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { AlertTriangle } from "lucide-react";
export const ErrorMessage = ({ title, message, details }) => {
    return (_jsxs("div", { className: "bg-error-bg text-error border-error my-2 rounded border p-3 font-mono text-sm leading-relaxed break-words whitespace-pre-wrap", children: [title && (_jsxs("div", { className: "mb-2 flex items-center gap-2 font-bold", children: [_jsx(AlertTriangle, { "aria-hidden": "true", className: "h-4 w-4" }), title] })), _jsx("div", { children: message }), details && _jsx("div", { className: "opacity-90", children: details })] }));
};
//# sourceMappingURL=ErrorMessage.js.map