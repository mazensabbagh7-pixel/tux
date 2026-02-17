/**
 * Context switch check utility
 *
 * Determines whether switching to a new model would exceed the model's context limit.
 * Used to warn users before they switch from a high-context model (e.g., Gemini 1M)
 * to a lower-context model (e.g., GPT 272K) when their current context is too large.
 */
import { getPreferredCompactionModel } from "@/browser/utils/messages/compactionModelPreference";
import { normalizeGatewayModel } from "@/common/utils/ai/models";
import { getEffectiveContextLimit } from "./contextLimit";
import { getExplicitCompactionSuggestion } from "./suggestion";
/** Safety buffer - warn if context exceeds 90% of target model's limit */
const CONTEXT_FIT_THRESHOLD = 0.9;
/**
 * Find the most recent assistant message's model from chat history.
 */
export function findPreviousModel(messages) {
    for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        if (msg.type === "assistant" && msg.model)
            return msg.model;
    }
    return null;
}
/**
 * Resolve compaction model: preferred (if fits + accessible) → previous (if fits + accessible) → null.
 */
function resolveCompactionModel(currentTokens, previousModel, use1M, options) {
    const preferred = getPreferredCompactionModel();
    if (preferred) {
        // Validate accessibility via getExplicitCompactionSuggestion (checks provider config + policy)
        const accessible = getExplicitCompactionSuggestion({
            modelId: preferred,
            providersConfig: options.providersConfig,
            policy: options.policy,
        });
        const limit = getEffectiveContextLimit(preferred, use1M);
        if (accessible && limit && limit > currentTokens)
            return preferred;
    }
    if (previousModel) {
        const accessible = getExplicitCompactionSuggestion({
            modelId: previousModel,
            providersConfig: options.providersConfig,
            policy: options.policy,
        });
        const limit = getEffectiveContextLimit(previousModel, use1M);
        if (accessible && limit && limit > currentTokens)
            return previousModel;
    }
    return null;
}
/**
 * Check if switching to targetModel would exceed its context limit.
 * Returns warning info if context doesn't fit, null otherwise.
 *
 * The `options` parameter validates compaction model accessibility via provider config and policy.
 */
export function checkContextSwitch(currentTokens, targetModel, previousModel, use1M, options, opts) {
    // Only warn on same-model changes when the caller knows the effective limit changed
    // (ex: 1M context toggle). Otherwise, workspace entry/sync should stay silent.
    if (!opts?.allowSameModel &&
        previousModel &&
        normalizeGatewayModel(targetModel) === normalizeGatewayModel(previousModel)) {
        return null;
    }
    const targetLimit = getEffectiveContextLimit(targetModel, use1M);
    // Unknown model or context fits with 10% buffer - no warning
    if (!targetLimit || currentTokens <= targetLimit * CONTEXT_FIT_THRESHOLD) {
        return null;
    }
    const compactionModel = resolveCompactionModel(currentTokens, previousModel, use1M, options);
    return {
        currentTokens,
        targetLimit,
        targetModel,
        compactionModel,
        errorMessage: compactionModel
            ? null
            : "Context too large. Use `/compact -m <model>` with a 1M context model.",
    };
}
//# sourceMappingURL=contextSwitchCheck.js.map