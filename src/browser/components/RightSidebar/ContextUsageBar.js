import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React from "react";
import { AlertTriangle } from "lucide-react";
import { TokenMeter } from "./TokenMeter";
import { HorizontalThresholdSlider } from "./ThresholdSlider";
import { formatTokens } from "@/common/utils/tokens/tokenMeterUtils";
import { Toggle1MContext } from "@/browser/components/Toggle1MContext";
const ContextUsageBarComponent = ({ data, autoCompaction, model, showTitle = true, testId, }) => {
    const totalDisplay = formatTokens(data.totalTokens);
    const maxDisplay = data.maxTokens ? ` / ${formatTokens(data.maxTokens)}` : "";
    const percentageDisplay = data.maxTokens ? ` (${data.totalPercentage.toFixed(1)}%)` : "";
    const showWarning = !data.maxTokens;
    const showThresholdSlider = Boolean(autoCompaction && data.maxTokens);
    const contextWarning = autoCompaction?.contextWarning;
    if (data.totalTokens === 0)
        return null;
    return (_jsxs("div", { "data-testid": testId, className: "relative flex flex-col gap-1", children: [_jsxs("div", { className: "flex items-baseline justify-between", children: [showTitle && (_jsx("span", { className: "text-foreground inline-flex items-baseline gap-1 font-medium", children: "Context Usage" })), _jsxs("span", { className: "text-muted text-xs", children: [totalDisplay, maxDisplay, percentageDisplay] })] }), _jsxs("div", { className: "relative w-full overflow-hidden py-2", children: [_jsx(TokenMeter, { segments: data.segments, orientation: "horizontal" }), showThresholdSlider && autoCompaction && (_jsx(HorizontalThresholdSlider, { config: autoCompaction }))] }), model && _jsx(Toggle1MContext, { model: model }), showWarning && (_jsx("div", { className: "text-subtle mt-2 text-[11px] italic", children: "Unknown model limits - showing relative usage only" })), contextWarning && (_jsxs("div", { className: "text-warning mt-2 flex items-start gap-1 text-[11px]", children: [_jsx(AlertTriangle, { "aria-hidden": "true", className: "mt-0.5 h-3 w-3 shrink-0" }), _jsxs("span", { children: ["Compaction model context (", formatTokens(contextWarning.compactionModelMaxTokens), ") is smaller than auto-compact threshold (", formatTokens(contextWarning.thresholdTokens), ")"] })] }))] }));
};
export const ContextUsageBar = React.memo(ContextUsageBarComponent);
//# sourceMappingURL=ContextUsageBar.js.map