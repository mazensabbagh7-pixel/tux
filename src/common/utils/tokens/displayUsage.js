/**
 * Display usage utilities for renderer
 *
 * IMPORTANT: This file must NOT import tokenizer to avoid pulling Node.js
 * dependencies into the renderer bundle.
 */
import { getModelStats } from "./modelStats";
/**
 * Create a display-friendly usage object from AI SDK usage
 *
 * This function transforms raw AI SDK usage data into a format suitable
 * for display in the UI. It does NOT require the tokenizer.
 */
export function createDisplayUsage(usage, model, providerMetadata) {
    if (!usage)
        return undefined;
    // AI SDK v6 unified semantics: ALL providers now report inputTokens INCLUSIVE
    // of cached tokens. Previously Anthropic excluded cached tokens from inputTokens
    // but v6 changed this to match OpenAI/Google (inputTokens = total input including
    // cache_read + cache_write). We always subtract both cachedInputTokens and
    // cacheCreateTokens to get the true non-cached input count.
    const cachedTokens = usage.cachedInputTokens ?? 0;
    const rawInputTokens = usage.inputTokens ?? 0;
    // Extract cache creation tokens from provider metadata (Anthropic-specific)
    // Needed before computing inputTokens since we subtract it from the total.
    const cacheCreateTokens = providerMetadata?.anthropic
        ?.cacheCreationInputTokens ?? 0;
    // Subtract both cache-read and cache-create tokens to isolate non-cached input.
    // Math.max guards against pre-v6 historical data where inputTokens already excluded
    // cache tokens (subtraction would go negative).
    const inputTokens = Math.max(0, rawInputTokens - cachedTokens - cacheCreateTokens);
    // Extract reasoning tokens with fallback to provider metadata (OpenAI-specific)
    const reasoningTokens = usage.reasoningTokens ??
        providerMetadata?.openai?.reasoningTokens ??
        0;
    // Calculate output tokens excluding reasoning
    const outputWithoutReasoning = Math.max(0, (usage.outputTokens ?? 0) - reasoningTokens);
    // Get model stats for cost calculation
    const modelStats = getModelStats(model);
    const costsIncluded = providerMetadata?.mux?.costsIncluded === true;
    // Calculate costs based on model stats (undefined if model unknown)
    let inputCost;
    let cachedCost;
    let cacheCreateCost;
    let outputCost;
    let reasoningCost;
    if (modelStats) {
        inputCost = inputTokens * modelStats.input_cost_per_token;
        cachedCost = cachedTokens * (modelStats.cache_read_input_token_cost ?? 0);
        cacheCreateCost = cacheCreateTokens * (modelStats.cache_creation_input_token_cost ?? 0);
        outputCost = outputWithoutReasoning * modelStats.output_cost_per_token;
        reasoningCost = reasoningTokens * modelStats.output_cost_per_token;
    }
    if (costsIncluded) {
        inputCost = 0;
        cachedCost = 0;
        cacheCreateCost = 0;
        outputCost = 0;
        reasoningCost = 0;
    }
    return {
        input: {
            tokens: inputTokens,
            cost_usd: inputCost,
        },
        cached: {
            tokens: cachedTokens,
            cost_usd: cachedCost,
        },
        cacheCreate: {
            tokens: cacheCreateTokens,
            cost_usd: cacheCreateCost,
        },
        output: {
            tokens: outputWithoutReasoning,
            cost_usd: outputCost,
        },
        reasoning: {
            tokens: reasoningTokens,
            cost_usd: reasoningCost,
        },
        model, // Include model for display purposes
    };
}
//# sourceMappingURL=displayUsage.js.map