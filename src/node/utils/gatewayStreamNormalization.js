/**
 * Gateway stream normalization utilities.
 *
 * The @ai-sdk/gateway SDK declares specificationVersion "v3", so the AI SDK
 * core expects v3-format stream events. But the mux gateway server may send
 * "finish" events with flat v2-style usage or plain string finishReason.
 * These utilities detect and convert to v3 format so the AI SDK can extract
 * usage (inputTokens, outputTokens, etc.) correctly.
 *
 * Without this normalization, asLanguageModelUsage() does usage.inputTokens.total
 * which yields undefined when inputTokens is a number (flat v2 format), causing
 * the Cost panel to show 0 tokens.
 */
/**
 * Check whether a usage value is already in v3 nested format.
 * V3 usage has inputTokens as an object with a `total` field;
 * v2/flat usage has inputTokens as a number.
 */
export function isV3Usage(usage) {
    if (typeof usage !== "object" || usage == null)
        return false;
    const u = usage;
    return typeof u.inputTokens === "object" && u.inputTokens != null;
}
/**
 * Convert flat (v2-style) usage to v3 nested format.
 */
export function flatUsageToV3(usage) {
    const inputTokens = typeof usage.inputTokens === "number" ? usage.inputTokens : undefined;
    const outputTokens = typeof usage.outputTokens === "number" ? usage.outputTokens : undefined;
    const cachedInputTokens = typeof usage.cachedInputTokens === "number" ? usage.cachedInputTokens : undefined;
    const reasoningTokens = typeof usage.reasoningTokens === "number" ? usage.reasoningTokens : undefined;
    return {
        inputTokens: {
            total: inputTokens,
            noCache: inputTokens != null && cachedInputTokens != null
                ? inputTokens - cachedInputTokens
                : undefined,
            cacheRead: cachedInputTokens,
            cacheWrite: undefined,
        },
        outputTokens: {
            total: outputTokens,
            text: outputTokens != null && reasoningTokens != null
                ? outputTokens - reasoningTokens
                : undefined,
            reasoning: reasoningTokens,
        },
        raw: usage,
    };
}
/**
 * Normalize a finish-reason value to v3 format { unified, raw }.
 * The gateway server may send a plain string instead of the nested object.
 */
export function normalizeFinishReason(fr) {
    if (fr == null)
        return undefined;
    if (typeof fr === "object" && "unified" in fr) {
        return fr;
    }
    // Plain string → convert to v3 object
    const str = typeof fr === "string" ? fr : "other";
    return { unified: str === "unknown" ? "other" : str, raw: str };
}
/**
 * Normalize a doGenerate result from the gateway.
 * Converts flat usage and plain-string finishReason to v3 nested format.
 */
export function normalizeGatewayGenerateResult(result) {
    const normalized = { ...result };
    if (result.usage != null && !isV3Usage(result.usage)) {
        normalized.usage = flatUsageToV3(result.usage);
    }
    if (result.finishReason != null) {
        const fr = normalizeFinishReason(result.finishReason);
        if (fr)
            normalized.finishReason = fr;
    }
    return normalized;
}
/**
 * TransformStream that normalizes gateway SSE stream events.
 *
 * Only transforms "finish" events; all other chunks pass through unchanged.
 */
export function normalizeGatewayStreamUsage() {
    return new TransformStream({
        transform(chunk, controller) {
            if (typeof chunk !== "object" || chunk == null) {
                controller.enqueue(chunk);
                return;
            }
            const c = chunk;
            if (c.type !== "finish") {
                controller.enqueue(chunk);
                return;
            }
            // Normalize usage: convert flat → v3 nested if needed
            let usage = c.usage;
            if (usage != null && !isV3Usage(usage)) {
                usage = flatUsageToV3(usage);
            }
            // Normalize finishReason: convert string → { unified, raw } if needed
            const finishReason = normalizeFinishReason(c.finishReason);
            controller.enqueue({
                ...c,
                ...(usage != null && { usage }),
                ...(finishReason != null && { finishReason }),
            });
        },
    });
}
//# sourceMappingURL=gatewayStreamNormalization.js.map