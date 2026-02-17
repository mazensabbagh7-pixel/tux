import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import React from "react";
import { useWorkspaceUsage, useWorkspaceConsumers } from "@/browser/stores/WorkspaceStore";
import { getModelStats } from "@/common/utils/tokens/modelStats";
import { sumUsageHistory, formatCostWithDollar, } from "@/common/utils/tokens/usageAggregator";
import { usePersistedState } from "@/browser/hooks/usePersistedState";
import { PREFERRED_COMPACTION_MODEL_KEY } from "@/common/constants/storage";
import { resolveCompactionModel } from "@/browser/utils/messages/compactionModelPreference";
import { ToggleGroup } from "../ToggleGroup";
import { useProviderOptions } from "@/browser/hooks/useProviderOptions";
import { useSendMessageOptions } from "@/browser/hooks/useSendMessageOptions";
import { supports1MContext } from "@/common/utils/ai/models";
import { TOKEN_COMPONENT_COLORS, calculateTokenMeterData, formatTokens, } from "@/common/utils/tokens/tokenMeterUtils";
import { ConsumerBreakdown } from "./ConsumerBreakdown";
import { FileBreakdown } from "./FileBreakdown";
import { ContextUsageBar } from "./ContextUsageBar";
import { useAutoCompactionSettings } from "@/browser/hooks/useAutoCompactionSettings";
import { Tooltip, TooltipTrigger, TooltipContent } from "../ui/tooltip";
import { PostCompactionSection } from "./PostCompactionSection";
import { usePostCompactionState } from "@/browser/hooks/usePostCompactionState";
import { useOptionalWorkspaceContext } from "@/browser/contexts/WorkspaceContext";
/**
 * Calculate cost with elevated pricing for 1M context (200k-1M tokens)
 * For tokens above 200k, use elevated pricing rates
 */
const calculateElevatedCost = (tokens, standardRate, isInput) => {
    if (tokens <= 200000) {
        return tokens * standardRate;
    }
    const baseCost = 200000 * standardRate;
    const elevatedTokens = tokens - 200000;
    const elevatedMultiplier = isInput ? 2.0 : 1.5;
    const elevatedCost = elevatedTokens * standardRate * elevatedMultiplier;
    return baseCost + elevatedCost;
};
const VIEW_MODE_OPTIONS = [
    { value: "session", label: "Session" },
    { value: "last-request", label: "Last Request" },
];
const CostsTabComponent = ({ workspaceId }) => {
    const usage = useWorkspaceUsage(workspaceId);
    const consumers = useWorkspaceConsumers(workspaceId);
    const [viewMode, setViewMode] = usePersistedState("costsTab:viewMode", "session");
    const [preferredCompactionModel] = usePersistedState(PREFERRED_COMPACTION_MODEL_KEY, "", {
        listener: true,
    });
    const { has1MContext } = useProviderOptions();
    const pendingSendOptions = useSendMessageOptions(workspaceId);
    // Post-compaction context state for UI display
    const postCompactionState = usePostCompactionState(workspaceId);
    // Get runtimeConfig for SSH-aware editor opening
    const workspaceContext = useOptionalWorkspaceContext();
    const runtimeConfig = workspaceContext?.workspaceMetadata.get(workspaceId)?.runtimeConfig;
    // Token counts come from usage metadata, but context limits/1M eligibility should
    // follow the currently selected model unless a stream is actively running.
    const contextDisplayModel = usage.liveUsage?.model ?? pendingSendOptions.baseModel;
    // Align warning with /compact model resolution so it matches actual compaction behavior.
    const effectiveCompactionModel = resolveCompactionModel(preferredCompactionModel) ?? contextDisplayModel;
    // Auto-compaction settings: threshold per-model (100 = disabled)
    const { threshold: autoCompactThreshold, setThreshold: setAutoCompactThreshold } = useAutoCompactionSettings(workspaceId, contextDisplayModel);
    // Session usage for cost calculation
    // Uses sessionTotal (pre-computed) + liveCostUsage (cumulative during streaming)
    const sessionUsage = React.useMemo(() => {
        const parts = [];
        if (usage.sessionTotal)
            parts.push(usage.sessionTotal);
        if (usage.liveCostUsage)
            parts.push(usage.liveCostUsage);
        return parts.length > 0 ? sumUsageHistory(parts) : undefined;
    }, [usage.sessionTotal, usage.liveCostUsage]);
    const hasUsageData = usage &&
        (usage.sessionTotal !== undefined ||
            usage.lastContextUsage !== undefined ||
            usage.liveUsage !== undefined);
    const hasConsumerData = consumers && (consumers.totalTokens > 0 || consumers.isCalculating);
    const hasAnyData = hasUsageData || hasConsumerData;
    // Only show empty state if truly no data anywhere
    if (!hasAnyData) {
        return (_jsx("div", { className: "text-light font-primary text-[13px] leading-relaxed", children: _jsxs("div", { className: "text-secondary px-5 py-10 text-center", children: [_jsx("p", { children: "No messages yet." }), _jsx("p", { children: "Send a message to see token usage statistics." })] }) }));
    }
    // Last Request (for Cost section): from persisted data
    const lastRequestUsage = usage.lastRequest?.usage;
    // Cost and Details table use viewMode
    const displayUsage = viewMode === "last-request" ? lastRequestUsage : sessionUsage;
    return (_jsxs("div", { className: "text-light font-primary text-[13px] leading-relaxed", children: [hasUsageData && (_jsxs("div", { "data-testid": "context-usage-section", className: "mt-2 mb-5", children: [_jsx("div", { "data-testid": "context-usage-list", className: "flex flex-col gap-3", children: (() => {
                            const contextUsage = usage.liveUsage ?? usage.lastContextUsage;
                            const contextUsageData = contextUsage
                                ? calculateTokenMeterData(contextUsage, contextDisplayModel, has1MContext(contextDisplayModel), false)
                                : { segments: [], totalTokens: 0, totalPercentage: 0 };
                            // Warn when the compaction model can't fit the auto-compact threshold to avoid failures.
                            const contextWarning = (() => {
                                const maxTokens = contextUsageData.maxTokens;
                                if (!maxTokens || autoCompactThreshold >= 100 || !effectiveCompactionModel)
                                    return undefined;
                                const thresholdTokens = Math.round((autoCompactThreshold / 100) * maxTokens);
                                const compactionStats = getModelStats(effectiveCompactionModel);
                                const compactionMaxTokens = has1MContext(effectiveCompactionModel) &&
                                    supports1MContext(effectiveCompactionModel)
                                    ? 1000000
                                    : compactionStats?.max_input_tokens;
                                if (compactionMaxTokens && compactionMaxTokens < thresholdTokens) {
                                    return { compactionModelMaxTokens: compactionMaxTokens, thresholdTokens };
                                }
                                return undefined;
                            })();
                            return (_jsx(ContextUsageBar, { testId: "context-usage", data: contextUsageData, model: contextDisplayModel, autoCompaction: {
                                    threshold: autoCompactThreshold,
                                    setThreshold: setAutoCompactThreshold,
                                    contextWarning,
                                } }));
                        })() }), _jsx(PostCompactionSection, { workspaceId: workspaceId, planPath: postCompactionState.planPath, trackedFilePaths: postCompactionState.trackedFilePaths, excludedItems: postCompactionState.excludedItems, onToggleExclusion: postCompactionState.toggleExclusion, runtimeConfig: runtimeConfig })] })), hasUsageData && (_jsx("div", { "data-testid": "cost-section", className: "mb-6", children: _jsx("div", { className: "flex flex-col gap-3", children: (() => {
                        // Cost and Details use viewMode-dependent data
                        // Get model from the displayUsage (which could be last request or session sum)
                        const model = displayUsage?.model ?? lastRequestUsage?.model ?? "unknown";
                        const modelStats = getModelStats(model);
                        const is1MActive = has1MContext(model) && supports1MContext(model);
                        // Helper to calculate cost percentage
                        const getCostPercentage = (cost, total) => total !== undefined && total > 0 && cost !== undefined ? (cost / total) * 100 : 0;
                        // Recalculate costs with elevated pricing if 1M context is active
                        let adjustedInputCost = displayUsage?.input.cost_usd;
                        let adjustedOutputCost = displayUsage?.output.cost_usd;
                        let adjustedReasoningCost = displayUsage?.reasoning.cost_usd;
                        if (is1MActive && displayUsage && modelStats) {
                            // Recalculate input cost with elevated pricing
                            adjustedInputCost = calculateElevatedCost(displayUsage.input.tokens, modelStats.input_cost_per_token, true // isInput
                            );
                            // Recalculate output cost with elevated pricing
                            adjustedOutputCost = calculateElevatedCost(displayUsage.output.tokens, modelStats.output_cost_per_token, false // isOutput
                            );
                            // Recalculate reasoning cost with elevated pricing
                            adjustedReasoningCost = calculateElevatedCost(displayUsage.reasoning.tokens, modelStats.output_cost_per_token, false // isOutput
                            );
                        }
                        // Calculate total cost (undefined if any cost is unknown)
                        const totalCost = displayUsage
                            ? adjustedInputCost !== undefined &&
                                displayUsage.cached.cost_usd !== undefined &&
                                displayUsage.cacheCreate.cost_usd !== undefined &&
                                adjustedOutputCost !== undefined &&
                                adjustedReasoningCost !== undefined
                                ? adjustedInputCost +
                                    displayUsage.cached.cost_usd +
                                    displayUsage.cacheCreate.cost_usd +
                                    adjustedOutputCost +
                                    adjustedReasoningCost
                                : undefined
                            : undefined;
                        // Calculate cost percentages (using adjusted costs for 1M context)
                        const inputCostPercentage = getCostPercentage(adjustedInputCost, totalCost);
                        const cachedCostPercentage = getCostPercentage(displayUsage?.cached.cost_usd, totalCost);
                        const cacheCreateCostPercentage = getCostPercentage(displayUsage?.cacheCreate.cost_usd, totalCost);
                        const outputCostPercentage = getCostPercentage(adjustedOutputCost, totalCost);
                        const reasoningCostPercentage = getCostPercentage(adjustedReasoningCost, totalCost);
                        // Build component data for table (using adjusted costs for 1M context)
                        const components = displayUsage
                            ? [
                                {
                                    name: "Cache Read",
                                    tokens: displayUsage.cached.tokens,
                                    cost: displayUsage.cached.cost_usd,
                                    color: TOKEN_COMPONENT_COLORS.cached,
                                    show: displayUsage.cached.tokens > 0,
                                },
                                {
                                    name: "Cache Create",
                                    tokens: displayUsage.cacheCreate.tokens,
                                    cost: displayUsage.cacheCreate.cost_usd,
                                    color: TOKEN_COMPONENT_COLORS.cacheCreate,
                                    show: displayUsage.cacheCreate.tokens > 0,
                                },
                                {
                                    name: "Input",
                                    tokens: displayUsage.input.tokens,
                                    cost: adjustedInputCost,
                                    color: TOKEN_COMPONENT_COLORS.input,
                                    show: true,
                                },
                                {
                                    name: "Output",
                                    tokens: displayUsage.output.tokens,
                                    cost: adjustedOutputCost,
                                    color: TOKEN_COMPONENT_COLORS.output,
                                    show: true,
                                },
                                {
                                    name: "Thinking",
                                    tokens: displayUsage.reasoning.tokens,
                                    cost: adjustedReasoningCost,
                                    color: TOKEN_COMPONENT_COLORS.thinking,
                                    show: displayUsage.reasoning.tokens > 0,
                                },
                            ].filter((c) => c.show)
                            : [];
                        return (_jsxs(_Fragment, { children: [totalCost !== undefined && totalCost >= 0 && (_jsxs("div", { "data-testid": "cost-bar", className: "relative mb-2 flex flex-col gap-1", children: [_jsxs("div", { "data-testid": "cost-header", className: "mb-2 flex items-baseline justify-between", children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsx("span", { className: "text-foreground inline-flex items-baseline gap-1 font-medium", children: "Cost" }), _jsx(ToggleGroup, { options: VIEW_MODE_OPTIONS, value: viewMode, onChange: setViewMode })] }), _jsxs("span", { className: "text-muted flex items-center gap-1 text-xs", children: [formatCostWithDollar(totalCost), displayUsage?.hasUnknownCosts && (_jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("span", { className: "text-warning cursor-help", children: "?" }) }), _jsx(TooltipContent, { side: "bottom", className: "max-w-[200px]", children: "Cost may be incomplete \u2014 some models in this session have unknown pricing" })] }))] })] }), _jsx("div", { className: "relative w-full", children: _jsxs("div", { className: "bg-border-light flex h-1.5 w-full overflow-hidden rounded-[3px]", children: [cachedCostPercentage > 0 && (_jsx("div", { className: "h-full transition-[width] duration-300", style: {
                                                            width: `${cachedCostPercentage}%`,
                                                            background: TOKEN_COMPONENT_COLORS.cached,
                                                        } })), cacheCreateCostPercentage > 0 && (_jsx("div", { className: "h-full transition-[width] duration-300", style: {
                                                            width: `${cacheCreateCostPercentage}%`,
                                                            background: TOKEN_COMPONENT_COLORS.cacheCreate,
                                                        } })), _jsx("div", { className: "h-full transition-[width] duration-300", style: {
                                                            width: `${inputCostPercentage}%`,
                                                            background: TOKEN_COMPONENT_COLORS.input,
                                                        } }), _jsx("div", { className: "h-full transition-[width] duration-300", style: {
                                                            width: `${outputCostPercentage}%`,
                                                            background: TOKEN_COMPONENT_COLORS.output,
                                                        } }), reasoningCostPercentage > 0 && (_jsx("div", { className: "h-full transition-[width] duration-300", style: {
                                                            width: `${reasoningCostPercentage}%`,
                                                            background: TOKEN_COMPONENT_COLORS.thinking,
                                                        } }))] }) })] })), _jsxs("table", { "data-testid": "cost-details", className: "mt-1 w-full border-collapse text-[11px]", children: [_jsx("thead", { children: _jsxs("tr", { className: "border-border-light border-b", children: [_jsx("th", { className: "text-muted py-1 pr-2 text-left font-medium [&:last-child]:pr-0 [&:last-child]:text-right", children: "Component" }), _jsx("th", { className: "text-muted py-1 pr-2 text-left font-medium [&:last-child]:pr-0 [&:last-child]:text-right", children: "Tokens" }), _jsx("th", { className: "text-muted py-1 pr-2 text-left font-medium [&:last-child]:pr-0 [&:last-child]:text-right", children: "Cost" })] }) }), _jsx("tbody", { children: components.map((component) => {
                                                const costDisplay = formatCostWithDollar(component.cost);
                                                const isNegligible = component.cost !== undefined &&
                                                    component.cost > 0 &&
                                                    component.cost < 0.01;
                                                return (_jsxs("tr", { children: [_jsx("td", { className: "text-foreground py-1 pr-2 [&:last-child]:pr-0 [&:last-child]:text-right", children: _jsxs("div", { className: "flex items-center gap-1.5", children: [_jsx("div", { className: "h-2 w-2 shrink-0 rounded-sm", style: { background: component.color } }), component.name] }) }), _jsx("td", { className: "text-foreground py-1 pr-2 [&:last-child]:pr-0 [&:last-child]:text-right", children: formatTokens(component.tokens) }), _jsx("td", { className: "text-foreground py-1 pr-2 [&:last-child]:pr-0 [&:last-child]:text-right", children: isNegligible ? (_jsx("span", { className: "text-dim italic", children: costDisplay })) : (costDisplay) })] }, component.name));
                                            }) })] })] }));
                    })() }) })), consumers.topFilePaths && consumers.topFilePaths.length > 0 && (_jsxs("div", { className: "mb-4", children: [_jsxs("h3", { className: "text-subtle m-0 mb-2 flex items-center gap-1 text-xs font-semibold tracking-wide uppercase", children: ["File Breakdown", _jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("span", { className: "text-dim cursor-help text-[10px] font-normal", children: "\u24D8" }) }), _jsx(TooltipContent, { align: "start", className: "max-w-72 whitespace-normal", children: "Token usage from file_read and file_edit tools, aggregated by file path. Consider splitting large files to reduce context usage." })] })] }), _jsx(FileBreakdown, { files: consumers.topFilePaths, totalTokens: consumers.totalTokens })] })), consumers.consumers.length > 0 && (_jsxs("div", { className: "mb-4", children: [_jsx("h3", { className: "text-subtle m-0 mb-2 text-xs font-semibold tracking-wide uppercase", children: "Consumer Breakdown" }), consumers.isCalculating ? (_jsx("div", { className: "text-secondary py-2 text-xs italic", children: "Calculating..." })) : (_jsx(ConsumerBreakdown, { consumers: consumers.consumers, totalTokens: consumers.totalTokens }))] })), !consumers.isCalculating &&
                consumers.consumers.length === 0 &&
                (!consumers.topFilePaths || consumers.topFilePaths.length === 0) && (_jsx("div", { className: "text-dim py-2 text-xs italic", children: "No consumer data available" }))] }));
};
// Memoize to prevent re-renders when parent (AIView) re-renders during streaming
// Only re-renders when workspaceId changes or internal hook data (usage/consumers) updates
export const CostsTab = React.memo(CostsTabComponent);
//# sourceMappingURL=CostsTab.js.map