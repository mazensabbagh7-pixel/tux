import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/common/lib/utils";
/**
 * Barrier shown when editing a message to indicate where the cutoff point is.
 * Messages below this barrier will be removed when the edit is submitted.
 */
export const EditCutoffBarrier = ({ className }) => {
    return (_jsxs("div", { className: cn("flex items-center gap-3 py-3 my-4", className), children: [_jsx("div", { className: "h-px flex-1", style: {
                    background: `linear-gradient(to right, transparent, var(--color-edit-mode) 20%, var(--color-edit-mode) 80%, transparent)`,
                } }), _jsxs("div", { className: "border-edit-mode/30 bg-edit-mode/10 text-edit-mode flex items-center gap-2 rounded-md border px-3 py-1.5 text-[11px] font-medium", children: [_jsx(AlertTriangle, { "aria-hidden": "true", className: "h-4 w-4" }), _jsx("span", { children: "Messages below will be removed when you submit" })] }), _jsx("div", { className: "h-px flex-1", style: {
                    background: `linear-gradient(to right, transparent, var(--color-edit-mode) 20%, var(--color-edit-mode) 80%, transparent)`,
                } })] }));
};
//# sourceMappingURL=EditCutoffBarrier.js.map