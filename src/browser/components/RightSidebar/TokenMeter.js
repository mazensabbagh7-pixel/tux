import { jsx as _jsx } from "react/jsx-runtime";
import React from "react";
import { cn } from "@/common/lib/utils";
const TokenMeterComponent = ({ segments, orientation, className, trackClassName, style, ...rest }) => {
    return (_jsx("div", { className: cn("overflow-hidden flex", trackClassName ?? "bg-border-light", orientation === "horizontal"
            ? "rounded w-full h-1.5 flex-row"
            : "rounded-[4px] w-2 h-full flex-col", className), style: style, ...rest, "data-bar": "token-meter", children: segments.map((seg, i) => (_jsx("div", { className: cn("transition-all duration-300 ease-in-out", orientation === "horizontal" ? "h-full" : "w-full"), style: {
                background: seg.color,
                ...(orientation === "horizontal"
                    ? { width: `${seg.percentage}%` }
                    : { flex: seg.percentage }),
            }, "data-segment": seg.type, "data-segment-index": i, "data-segment-percentage": seg.percentage.toFixed(1), "data-segment-tokens": seg.tokens }, i))) }));
};
// Memoize to prevent re-renders when props haven't changed
export const TokenMeter = React.memo(TokenMeterComponent);
//# sourceMappingURL=TokenMeter.js.map