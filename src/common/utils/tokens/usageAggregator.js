/**
 * Usage aggregation utilities for cost calculation
 *
 * IMPORTANT: This file must NOT import tokenizer to avoid pulling
 * 2MB+ of encoding data into the renderer process.
 *
 * Separated from tokenStatsCalculator.ts to keep tokenizer in main process only.
 */
/**
 * Sum multiple ChatUsageDisplay objects into a single cumulative display
 * Used for showing total costs across multiple API responses
 */
export function sumUsageHistory(usageHistory) {
    if (usageHistory.length === 0)
        return undefined;
    // Track if any costs are undefined (model pricing unknown)
    let hasUndefinedCosts = false;
    const sum = {
        input: { tokens: 0, cost_usd: 0 },
        cached: { tokens: 0, cost_usd: 0 },
        cacheCreate: { tokens: 0, cost_usd: 0 },
        output: { tokens: 0, cost_usd: 0 },
        reasoning: { tokens: 0, cost_usd: 0 },
    };
    for (const usage of usageHistory) {
        // Iterate over each component and sum tokens and costs
        const componentKeys = [
            "input",
            "cached",
            "cacheCreate",
            "output",
            "reasoning",
        ];
        for (const key of componentKeys) {
            sum[key].tokens += usage[key].tokens;
            if (usage[key].cost_usd === undefined) {
                hasUndefinedCosts = true;
            }
            else {
                sum[key].cost_usd = (sum[key].cost_usd ?? 0) + (usage[key].cost_usd ?? 0);
            }
        }
    }
    // Flag if any costs were undefined (partial/incomplete total)
    if (hasUndefinedCosts) {
        sum.hasUnknownCosts = true;
    }
    return sum;
}
/**
 * Calculate total cost from a ChatUsageDisplay object.
 * Returns undefined if no cost data is available.
 */
export function getTotalCost(usage) {
    if (!usage)
        return undefined;
    const components = ["input", "cached", "cacheCreate", "output", "reasoning"];
    let total = 0;
    let hasAnyCost = false;
    for (const key of components) {
        const cost = usage[key].cost_usd;
        if (cost !== undefined) {
            total += cost;
            hasAnyCost = true;
        }
    }
    return hasAnyCost ? total : undefined;
}
/**
 * Format cost for display with dollar sign.
 * Returns "~$0.00" for very small values, "$X.XX" otherwise.
 */
export function formatCostWithDollar(cost) {
    if (cost === undefined)
        return "";
    if (cost === 0)
        return "$0.00";
    if (cost < 0.01)
        return "~$0.00";
    return `$${cost.toFixed(2)}`;
}
//# sourceMappingURL=usageAggregator.js.map