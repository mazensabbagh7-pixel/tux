import { getAgentIdKey, getModelKey, getThinkingLevelByModelKey, getThinkingLevelKey, getDisableWorkspaceAgentsKey, PREFERRED_SYSTEM_1_MODEL_KEY, PREFERRED_SYSTEM_1_THINKING_LEVEL_KEY, } from "@/common/constants/storage";
import { readPersistedState, readPersistedString, updatePersistedState, } from "@/browser/hooks/usePersistedState";
import { getDefaultModel } from "@/browser/hooks/useModelsFromSettings";
import { buildSendMessageOptions, normalizeModelPreference, normalizeSystem1Model, normalizeSystem1ThinkingLevel, } from "@/browser/utils/messages/buildSendMessageOptions";
import { WORKSPACE_DEFAULTS } from "@/constants/workspaceDefaults";
import { isExperimentEnabled } from "@/browser/hooks/useExperiments";
import { EXPERIMENT_IDS } from "@/common/constants/experiments";
/**
 * Read provider options from localStorage
 */
function getProviderOptions() {
    const anthropic = readPersistedState("provider_options_anthropic", {});
    const google = readPersistedState("provider_options_google", {});
    return {
        anthropic,
        google,
    };
}
/**
 * Non-hook equivalent of useSendMessageOptions — reads current preferences from localStorage.
 * Used by compaction, resume, idle-compaction, and plan execution outside React context.
 */
export function getSendOptionsFromStorage(workspaceId) {
    const defaultModel = getDefaultModel();
    const rawModel = readPersistedState(getModelKey(workspaceId), defaultModel);
    const baseModel = normalizeModelPreference(rawModel, defaultModel);
    // Read thinking level (workspace-scoped).
    // Migration: if the workspace-scoped value is missing, fall back to legacy per-model storage
    // once, then persist into the workspace-scoped key.
    const scopedKey = getThinkingLevelKey(workspaceId);
    const existingScoped = readPersistedState(scopedKey, undefined);
    const thinkingLevel = existingScoped ??
        readPersistedState(getThinkingLevelByModelKey(baseModel), WORKSPACE_DEFAULTS.thinkingLevel);
    if (existingScoped === undefined) {
        // Best-effort: avoid losing a user's existing per-model preference.
        updatePersistedState(scopedKey, thinkingLevel);
    }
    const agentId = readPersistedState(getAgentIdKey(workspaceId), WORKSPACE_DEFAULTS.agentId);
    const providerOptions = getProviderOptions();
    const system1Model = normalizeSystem1Model(readPersistedString(PREFERRED_SYSTEM_1_MODEL_KEY));
    const system1ThinkingLevel = normalizeSystem1ThinkingLevel(readPersistedState(PREFERRED_SYSTEM_1_THINKING_LEVEL_KEY, "off"));
    const disableWorkspaceAgents = readPersistedState(getDisableWorkspaceAgentsKey(workspaceId), false);
    return buildSendMessageOptions({
        model: baseModel,
        system1Model,
        system1ThinkingLevel,
        agentId,
        thinkingLevel,
        providerOptions,
        disableWorkspaceAgents,
        experiments: {
            programmaticToolCalling: isExperimentEnabled(EXPERIMENT_IDS.PROGRAMMATIC_TOOL_CALLING),
            programmaticToolCallingExclusive: isExperimentEnabled(EXPERIMENT_IDS.PROGRAMMATIC_TOOL_CALLING_EXCLUSIVE),
            system1: isExperimentEnabled(EXPERIMENT_IDS.SYSTEM_1),
            execSubagentHardRestart: isExperimentEnabled(EXPERIMENT_IDS.EXEC_SUBAGENT_HARD_RESTART),
        },
    });
}
//# sourceMappingURL=sendOptions.js.map