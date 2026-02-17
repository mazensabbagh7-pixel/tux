import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useRef } from "react";
import { AUTO_COMPACTION_THRESHOLD_MIN, AUTO_COMPACTION_THRESHOLD_MAX, } from "@/common/constants/ui";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/browser/components/ui/tooltip";
// ----- Constants -----
/** Threshold at which we consider auto-compaction disabled (dragged all the way to end) */
const DISABLE_THRESHOLD = 100;
/** Size of the triangle markers in pixels */
const TRIANGLE_SIZE = 4;
// ----- Subcomponents -----
/** CSS triangle pointing up or down */
const Triangle = ({ direction, color }) => {
    const styles = {
        width: 0,
        height: 0,
        borderLeft: `${TRIANGLE_SIZE}px solid transparent`,
        borderRight: `${TRIANGLE_SIZE}px solid transparent`,
        ...(direction === "down"
            ? { borderTop: `${TRIANGLE_SIZE}px solid ${color}` }
            : { borderBottom: `${TRIANGLE_SIZE}px solid ${color}` }),
    };
    return _jsx("div", { style: styles });
};
// ----- Utilities -----
/** Clamp and snap percentage to valid threshold values */
const snapPercent = (raw) => {
    const clamped = Math.max(AUTO_COMPACTION_THRESHOLD_MIN, Math.min(100, raw));
    return Math.round(clamped / 5) * 5;
};
/** Apply threshold, handling the disable case */
const applyThreshold = (pct, setThreshold) => {
    setThreshold(pct >= DISABLE_THRESHOLD ? 100 : Math.min(pct, AUTO_COMPACTION_THRESHOLD_MAX));
};
/** Get tooltip text based on threshold */
const getTooltipText = (threshold) => {
    const isEnabled = threshold < DISABLE_THRESHOLD;
    return isEnabled
        ? `Auto-compact at ${threshold}% · Drag to adjust (per-model)`
        : `Auto-compact disabled · Drag left to enable (per-model)`;
};
// ----- Main component -----
/**
 * A draggable threshold indicator for horizontal progress bars.
 * Renders as a vertical line with up/down triangle handles.
 * Drag left/right to adjust threshold. Drag to 100% (right) to disable.
 *
 * USAGE: Place as a sibling AFTER the progress bar, both inside a relative container.
 *
 * NOTE: This component uses inline styles instead of Tailwind classes intentionally.
 * When using Tailwind classes (e.g., `className="absolute cursor-ew-resize"`), the
 * component would intermittently fail to render or receive pointer events, despite
 * the React component mounting correctly. The root cause appears to be related to
 * how Tailwind's JIT compiler or class application interacts with dynamically
 * rendered components in this context. Inline styles work reliably.
 */
export const ThresholdSlider = ({ config }) => {
    const containerRef = useRef(null);
    const handleMouseDown = (e) => {
        e.preventDefault();
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect)
            return;
        const calcPercent = (clientX) => snapPercent(((clientX - rect.left) / rect.width) * 100);
        const apply = (pct) => applyThreshold(pct, config.setThreshold);
        apply(calcPercent(e.clientX));
        const onMove = (ev) => apply(calcPercent(ev.clientX));
        const onUp = () => {
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", onUp);
        };
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
    };
    const isEnabled = config.threshold < DISABLE_THRESHOLD;
    const color = isEnabled ? "var(--color-plan-mode)" : "var(--color-muted)";
    const tooltipText = getTooltipText(config.threshold);
    // Container styles - covers the full bar area for drag handling
    // Uses pointer-events: none by default, only the indicator handle has pointer-events: auto
    // This allows the token meter tooltip to work when hovering elsewhere on the bar
    const containerStyle = {
        position: "absolute",
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        pointerEvents: "none",
    };
    // Drag handle around the indicator - this captures mouse events
    const DRAG_ZONE_SIZE = 16; // pixels on each side of the indicator
    const handleStyle = {
        position: "absolute",
        cursor: "ew-resize",
        pointerEvents: "auto",
        left: `calc(${config.threshold}% - ${DRAG_ZONE_SIZE}px)`,
        width: DRAG_ZONE_SIZE * 2,
        top: 0,
        bottom: 0,
    };
    // Indicator positioning
    const indicatorStyle = {
        position: "absolute",
        pointerEvents: "none",
        display: "flex",
        alignItems: "center",
        flexDirection: "column",
        left: `${config.threshold}%`,
        top: "50%",
        transform: "translate(-50%, -50%)",
    };
    return (_jsxs("div", { ref: containerRef, style: containerStyle, children: [_jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("div", { style: handleStyle, onMouseDown: handleMouseDown }) }), _jsx(TooltipContent, { side: "top", showArrow: false, children: tooltipText })] }), _jsxs("div", { style: indicatorStyle, children: [_jsx(Triangle, { direction: "down", color: color }), _jsx("div", { style: { width: 1, height: 6, background: color } }), _jsx(Triangle, { direction: "up", color: color })] })] }));
};
/** Horizontal threshold slider (alias for backwards compatibility) */
export const HorizontalThresholdSlider = ThresholdSlider;
//# sourceMappingURL=ThresholdSlider.js.map