import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { cn } from "@/common/lib/utils";
export const BaseBarrier = ({ text, color, animate = false, className, }) => {
    return (_jsxs("div", { className: cn("flex items-center gap-3 py-2 my-1", animate ? "animate-pulse opacity-100" : "opacity-60", className), children: [_jsx("div", { className: "h-px flex-1 opacity-30", style: {
                    background: `linear-gradient(to right, transparent, ${color} 20%, ${color} 80%, transparent)`,
                } }), _jsx("div", { className: "font-mono text-[10px] tracking-wide whitespace-nowrap uppercase", style: { color }, children: text }), _jsx("div", { className: "h-px flex-1 opacity-30", style: {
                    background: `linear-gradient(to right, transparent, ${color} 20%, ${color} 80%, transparent)`,
                } })] }));
};
//# sourceMappingURL=BaseBarrier.js.map