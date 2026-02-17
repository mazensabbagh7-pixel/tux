import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { cn } from "@/common/lib/utils";
export const CompactionBoundaryMessage = (props) => {
    const epochLabel = typeof props.message.compactionEpoch === "number" ? ` #${props.message.compactionEpoch}` : "";
    const label = `Compaction boundary${epochLabel}`;
    return (_jsxs("div", { className: cn("my-4 flex items-center gap-3 text-[11px] uppercase tracking-[0.08em]", props.className), "data-testid": "compaction-boundary", role: "separator", "aria-orientation": "horizontal", "aria-label": label, children: [_jsx("span", { className: "bg-border h-px flex-1" }), _jsx("span", { className: "text-muted font-medium", children: label }), _jsx("span", { className: "bg-border h-px flex-1" })] }));
};
//# sourceMappingURL=CompactionBoundaryMessage.js.map