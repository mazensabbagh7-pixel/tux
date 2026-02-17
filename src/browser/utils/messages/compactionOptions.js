/**
 * Compaction options transformation
 *
 * Single source of truth for converting compaction metadata into SendMessageOptions.
 * Used by both ChatInput (initial send) and useResumeManager (resume after interruption).
 */
import { readPersistedState } from "@/browser/hooks/usePersistedState";
import { AGENT_AI_DEFAULTS_KEY } from "@/common/constants/storage";
import { coerceThinkingLevel } from "@/common/types/thinking";
import { enforceThinkingPolicy } from "@/common/utils/thinking/policy";
/**
 * Apply compaction-specific option overrides to base options.
 *
 * This function is the single source of truth for how compaction metadata
 * transforms workspace defaults. Both initial sends and stream resumption
 * use this function to ensure consistent behavior.
 *
 * @param baseOptions - Workspace default options (from localStorage or useSendMessageOptions)
 * @param compactData - Compaction request metadata from /compact command
 * @returns Final SendMessageOptions with compaction overrides applied
 */
export function applyCompactionOverrides(baseOptions, compactData) {
    const compactionModelOverride = compactData.model?.trim();
    const compactionModel = compactionModelOverride === undefined || compactionModelOverride === ""
        ? baseOptions.model
        : compactionModelOverride;
    const agentAiDefaults = readPersistedState(AGENT_AI_DEFAULTS_KEY, {});
    const preferredThinking = agentAiDefaults.compact?.thinkingLevel;
    const requestedThinking = coerceThinkingLevel(preferredThinking ?? baseOptions.thinkingLevel) ?? "off";
    const thinkingLevel = enforceThinkingPolicy(compactionModel, requestedThinking);
    return {
        ...baseOptions,
        agentId: "compact",
        // Compaction shouldn't update persisted model/thinking defaults.
        skipAiSettingsPersistence: true,
        model: compactionModel,
        thinkingLevel,
        maxOutputTokens: compactData.maxOutputTokens,
        // Disable all tools during compaction - regex .* matches all tool names
        toolPolicy: [{ regex_match: ".*", action: "disable" }],
    };
}
//# sourceMappingURL=compactionOptions.js.map