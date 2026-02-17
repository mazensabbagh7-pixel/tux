"use client";
import { jsx as _jsx } from "react/jsx-runtime";
import { cn } from "@/common/lib/utils";
import { memo } from "react";
/**
 * Shimmer text effect using CSS background-clip: text.
 *
 * Uses a gradient background clipped to text shape, animated via
 * background-position. This is much lighter than the previous
 * canvas + Web Worker approach:
 * - No JS animation loop
 * - No canvas rendering
 * - No worker message passing
 * - Browser handles animation natively
 *
 * Note: background-position isn't compositor-only, but for small text
 * elements like "Thinking..." the repaint cost is negligible compared
 * to the overhead of canvas/worker solutions.
 */
const ShimmerComponent = ({ children, as: Component = "span", className, duration = 2, colorClass = "var(--color-muted-foreground)", }) => {
    return (_jsx(Component, { className: cn("shimmer-text", className), "data-chromatic": "ignore", style: {
            "--shimmer-duration": `${duration}s`,
            "--shimmer-color": colorClass,
        }, children: children }));
};
export const Shimmer = memo(ShimmerComponent);
//# sourceMappingURL=shimmer.js.map