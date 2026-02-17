import { jsx as _jsx } from "react/jsx-runtime";
/**
 * Skeleton component for loading placeholders.
 *
 * Supports two variants:
 * - "pulse" (default): Tailwind animate-pulse (simple opacity animation)
 * - "shimmer": GPU-accelerated gradient sweep (Vercel-like effect)
 *
 * Use this to reserve layout space and prevent flashing when async data arrives.
 */
import { cn } from "@/common/lib/utils";
export function Skeleton({ className, variant = "pulse" }) {
    if (variant === "shimmer") {
        return (_jsx("span", { "aria-hidden": true, className: cn("relative inline-block overflow-hidden rounded bg-white/5", className), children: _jsx("span", { className: cn("pointer-events-none absolute inset-0", "bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.06),transparent)]", "animate-[shimmer-slide_1.5s_infinite_linear]") }) }));
    }
    // Default: pulse variant
    return (_jsx("span", { "aria-hidden": true, className: cn("inline-block animate-pulse rounded bg-white/5", className) }));
}
//# sourceMappingURL=skeleton.js.map