import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React from "react";
import { Hourglass } from "lucide-react";
import { HoverClickPopover } from "./ui/hover-click-popover";
import { TokenMeter } from "./RightSidebar/TokenMeter";
import { HorizontalThresholdSlider, } from "./RightSidebar/ThresholdSlider";
import { Switch } from "./ui/switch";
import { formatTokens } from "@/common/utils/tokens/tokenMeterUtils";
import { cn } from "@/common/lib/utils";
import { Toggle1MContext } from "./Toggle1MContext";
// Selector for Radix portal wrappers - used to detect when clicks/interactions
// originate from nested Radix components (like Tooltip inside the slider)
const RADIX_PORTAL_WRAPPER_SELECTOR = "[data-radix-popper-content-wrapper]";
/**
 * Prevents Popover from dismissing when interaction occurs within a nested
 * Radix portal (e.g., Tooltip inside the slider). Without this, clicking the
 * slider's drag handle triggers onPointerDownOutside because the Tooltip
 * renders to a separate portal outside the Popover's DOM tree.
 */
function preventDismissForRadixPortals(e) {
    const target = e.target;
    if (target instanceof HTMLElement && target.closest(RADIX_PORTAL_WRAPPER_SELECTOR)) {
        e.preventDefault();
    }
}
const CONTEXT_USAGE_POPOVER_CONTENT_PROPS = {
    onPointerDownOutside: preventDismissForRadixPortals,
};
/** Compact threshold tick mark for the button view */
const CompactThresholdIndicator = ({ threshold }) => {
    if (threshold >= 100)
        return null;
    return (_jsx("div", { className: "bg-plan-mode pointer-events-none absolute top-0 z-50 h-full w-px", style: { left: `${threshold}%` } }));
};
/** Tick marks with vertical lines attached to the meter */
const PercentTickMarks = () => {
    const ticks = [0, 25, 50, 75, 100];
    return (_jsx("div", { className: "relative -mt-1 h-5 w-full", children: ticks.map((pct) => {
            const transform = pct === 0 ? "translateX(0%)" : pct === 100 ? "translateX(-100%)" : "translateX(-50%)";
            return (_jsxs("div", { className: "absolute flex flex-col items-center", style: { left: `${pct}%`, transform }, children: [_jsx("div", { className: "bg-border-medium h-[3px] w-px" }), _jsx("span", { className: "text-muted text-[8px] leading-tight", children: pct })] }, pct));
        }) }));
};
/** Unified auto-compact settings panel */
const AutoCompactSettings = ({ data, usageConfig, idleConfig, model }) => {
    const [idleInputValue, setIdleInputValue] = React.useState(idleConfig?.hours?.toString() ?? "24");
    // Sync idle input when external hours change
    React.useEffect(() => {
        setIdleInputValue(idleConfig?.hours?.toString() ?? "24");
    }, [idleConfig?.hours]);
    const totalDisplay = formatTokens(data.totalTokens);
    const maxDisplay = data.maxTokens ? ` / ${formatTokens(data.maxTokens)}` : "";
    const percentageDisplay = data.maxTokens ? ` (${data.totalPercentage.toFixed(1)}%)` : "";
    const showUsageSlider = Boolean(usageConfig && data.maxTokens);
    const isIdleEnabled = idleConfig?.hours !== null && idleConfig?.hours !== undefined;
    const handleIdleToggle = (enabled) => {
        if (!idleConfig)
            return;
        const parsed = parseInt(idleInputValue, 10);
        idleConfig.setHours(enabled ? (Number.isNaN(parsed) || parsed < 1 ? 24 : parsed) : null);
    };
    const handleIdleBlur = (e) => {
        if (!idleConfig)
            return;
        const val = parseInt(e.target.value, 10);
        if (!isNaN(val) && val >= 1 && val !== idleConfig.hours && idleConfig.hours !== null) {
            idleConfig.setHours(val);
        }
        else if (e.target.value === "" || isNaN(val) || val < 1) {
            setIdleInputValue(idleConfig.hours?.toString() ?? "24");
        }
    };
    return (_jsxs("div", { className: "flex flex-col gap-2", children: [_jsxs("div", { children: [_jsxs("div", { className: "flex items-baseline justify-between", children: [_jsx("span", { className: "text-foreground font-medium", children: "Context Usage" }), _jsxs("span", { className: "text-muted text-xs", children: [totalDisplay, maxDisplay, percentageDisplay] })] }), showUsageSlider && (_jsx("div", { className: "text-muted mt-1 text-[10px]", children: "Drag blue slider to adjust usage-based auto-compaction" }))] }), _jsxs("div", { children: [_jsxs("div", { className: "relative w-full py-1.5", children: [_jsx(TokenMeter, { segments: data.segments, orientation: "horizontal" }), showUsageSlider && usageConfig && _jsx(HorizontalThresholdSlider, { config: usageConfig })] }), showUsageSlider && _jsx(PercentTickMarks, {})] }), model && _jsx(Toggle1MContext, { model: model }), idleConfig && (_jsxs("div", { className: "border-separator-light border-t pt-2", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsxs("div", { className: "flex items-center gap-1", children: [_jsx(Hourglass, { className: "text-muted h-2.5 w-2.5" }), _jsx("span", { className: "text-foreground text-[11px] font-medium", children: "Idle compaction" })] }), _jsxs("div", { className: "flex items-center gap-1.5", children: [_jsx("input", { type: "number", min: 1, value: idleInputValue, onChange: (e) => setIdleInputValue(e.target.value), onBlur: handleIdleBlur, disabled: !isIdleEnabled, className: cn("border-border-medium bg-background-secondary focus:border-accent h-5 w-10 rounded border px-1 text-center text-[11px] focus:outline-none", !isIdleEnabled && "opacity-50") }), _jsx("span", { className: cn("text-[10px]", isIdleEnabled ? "text-muted" : "text-muted/50"), children: "hrs" }), _jsx(Switch, { checked: isIdleEnabled, onCheckedChange: handleIdleToggle, className: "scale-75" })] })] }), _jsx("div", { className: "text-muted mt-0.5 text-[10px]", children: "Auto-compact after workspace inactivity" })] })), !data.maxTokens && (_jsx("div", { className: "text-subtle text-[10px] italic", children: "Unknown model limits - showing relative usage only" })), _jsxs("div", { className: "text-muted border-separator-light border-t pt-2 text-[10px]", children: ["Usage threshold saved per model", idleConfig && "; idle timer saved per project"] })] }));
};
export const ContextUsageIndicatorButton = ({ data, autoCompaction, idleCompaction, model, }) => {
    const isAutoCompactionEnabled = autoCompaction && autoCompaction.threshold < 100;
    const idleHours = idleCompaction?.hours;
    const isIdleCompactionEnabled = idleHours !== null && idleHours !== undefined;
    // Show nothing only if no tokens AND no idle compaction config to display
    // (idle compaction settings should always be accessible when the prop is passed)
    if (data.totalTokens === 0 && !idleCompaction)
        return null;
    const ariaLabel = data.maxTokens
        ? `Context usage: ${formatTokens(data.totalTokens)} / ${formatTokens(data.maxTokens)} (${data.totalPercentage.toFixed(1)}%)`
        : `Context usage: ${formatTokens(data.totalTokens)} (unknown limit)`;
    const compactLabel = data.maxTokens
        ? `${Math.round(data.totalPercentage)}%`
        : formatTokens(data.totalTokens);
    return (_jsx(HoverClickPopover, { content: _jsx(AutoCompactSettings, { data: data, usageConfig: autoCompaction, idleConfig: idleCompaction, model: model }), side: "bottom", align: "end", interactiveContent: true, contentClassName: "bg-modal-bg border-separator-light w-80 rounded px-[10px] py-[6px] text-[11px] font-normal shadow-[0_2px_8px_rgba(0,0,0,0.4)]", contentProps: CONTEXT_USAGE_POPOVER_CONTENT_PROPS, children: _jsxs("button", { "aria-label": ariaLabel, "aria-haspopup": "dialog", className: "hover:bg-sidebar-hover flex cursor-pointer items-center rounded py-0.5", type: "button", children: [isIdleCompactionEnabled && (_jsx("span", { title: `Auto-compact after ${idleHours}h idle`, className: "mr-1.5 [@container(max-width:420px)]:hidden", children: _jsx(Hourglass, { className: "text-muted h-3 w-3" }) })), data.totalTokens > 0 ? (_jsxs("div", { "data-context-usage-meter": true, className: "relative h-3 w-14 [@container(max-width:420px)]:hidden", children: [_jsx(TokenMeter, { segments: data.segments, orientation: "horizontal", className: "h-3", trackClassName: "bg-dark" }), isAutoCompactionEnabled && (_jsx(CompactThresholdIndicator, { threshold: autoCompaction.threshold }))] })) : (
                /* Empty meter placeholder - allows access to settings with no usage */
                _jsx("div", { "data-context-usage-meter": true, className: "bg-dark relative h-3 w-14 rounded-full [@container(max-width:420px)]:hidden" })), _jsx("span", { "data-context-usage-percent": true, className: "text-muted hidden text-[10px] font-medium tabular-nums [@container(max-width:420px)]:block", children: compactLabel })] }) }));
};
//# sourceMappingURL=ContextUsageIndicatorButton.js.map