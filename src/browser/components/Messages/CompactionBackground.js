import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Animated background for compaction streaming.
 * Combines a subtle gradient with a GPU-accelerated shimmer effect.
 *
 * Uses CSS transform animation (compositor thread) instead of background-position
 * (main thread repaint) to avoid frame drops during heavy streaming work.
 */
export const CompactionBackground = () => {
    return (_jsxs("div", { className: "pointer-events-none absolute inset-0 overflow-hidden rounded-md", children: [_jsx("div", { className: "absolute inset-0 opacity-40", style: {
                    background: "linear-gradient(-45deg, var(--color-plan-mode-alpha), color-mix(in srgb, var(--color-plan-mode) 30%, transparent), var(--color-plan-mode-alpha), color-mix(in srgb, var(--color-plan-mode) 25%, transparent))",
                } }), _jsx("div", { className: "absolute inset-0 animate-[shimmer-slide_3s_infinite_linear]", "data-chromatic": "ignore", style: {
                    background: "linear-gradient(90deg, transparent 0%, transparent 40%, var(--color-plan-mode-alpha) 50%, transparent 60%, transparent 100%)",
                    width: "300%",
                    marginLeft: "-180%",
                } })] }));
};
//# sourceMappingURL=CompactionBackground.js.map