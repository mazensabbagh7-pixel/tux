import { jsx as _jsx } from "react/jsx-runtime";
import { cn } from "@/common/lib/utils";
export function ToggleGroup({ options, value, onChange, compact = false, }) {
    // Compact mode: show only active option, click cycles to next option
    if (compact) {
        const currentIndex = options.findIndex((opt) => opt.value === value);
        const activeOption = options[currentIndex];
        const nextOption = options[(currentIndex + 1) % options.length];
        return (_jsx("button", { onClick: () => onChange(nextOption.value), type: "button", className: cn("px-1.5 py-0.5 text-[11px] font-sans rounded-sm border-none cursor-pointer transition-all duration-150", "text-toggle-text-active bg-toggle-active font-medium", activeOption?.activeClassName), "aria-label": `${activeOption.label} mode. Click to switch to ${nextOption.label}.`, children: activeOption.label }));
    }
    return (_jsx("div", { className: "bg-toggle-bg flex gap-0 rounded", children: options.map((option) => {
            const isActive = value === option.value;
            return (_jsx("button", { onClick: () => onChange(option.value), "aria-pressed": isActive, type: "button", className: cn("px-1.5 py-0.5 text-[11px] font-sans rounded-sm border-none cursor-pointer transition-all duration-150 bg-transparent", isActive
                    ? "text-toggle-text-active bg-toggle-active font-medium"
                    : "text-toggle-text font-normal hover:text-toggle-text-hover hover:bg-toggle-hover", isActive && option.activeClassName), children: option.label }, option.value));
        }) }));
}
//# sourceMappingURL=ToggleGroup.js.map