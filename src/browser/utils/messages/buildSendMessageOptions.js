import { coerceThinkingLevel } from "@/common/types/thinking";
import { migrateGatewayModel } from "@/browser/hooks/useGatewayModels";
/** Normalize a preferred model string for routing (gateway migration + trimming). */
export function normalizeModelPreference(rawModel, fallbackModel) {
    const trimmed = typeof rawModel === "string" && rawModel.trim().length > 0 ? rawModel.trim() : null;
    return migrateGatewayModel(trimmed ?? fallbackModel);
}
export function normalizeSystem1Model(rawModel) {
    if (typeof rawModel !== "string")
        return undefined;
    const trimmed = rawModel.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}
export function normalizeSystem1ThinkingLevel(rawLevel) {
    return coerceThinkingLevel(rawLevel) ?? "off";
}
/**
 * Construct SendMessageOptions from normalized inputs.
 * Single source of truth for the send-option shape — backend enforces per-model policy.
 */
export function buildSendMessageOptions(input) {
    const system1Model = input.system1Model ? migrateGatewayModel(input.system1Model) : undefined;
    const system1ThinkingLevel = input.system1ThinkingLevel && input.system1ThinkingLevel !== "off"
        ? input.system1ThinkingLevel
        : undefined;
    return {
        thinkingLevel: input.thinkingLevel,
        model: input.model,
        ...(system1Model && { system1Model }),
        ...(system1ThinkingLevel && { system1ThinkingLevel }),
        agentId: input.agentId,
        providerOptions: input.providerOptions,
        experiments: { ...input.experiments },
        disableWorkspaceAgents: input.disableWorkspaceAgents ? true : undefined,
    };
}
//# sourceMappingURL=buildSendMessageOptions.js.map