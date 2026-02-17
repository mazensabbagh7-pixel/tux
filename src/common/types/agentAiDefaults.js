import { AgentIdSchema } from "@/common/orpc/schemas";
import { coerceThinkingLevel } from "./thinking";
export function normalizeAgentAiDefaults(raw) {
    const record = raw && typeof raw === "object" ? raw : {};
    const result = {};
    for (const [agentIdRaw, entryRaw] of Object.entries(record)) {
        const agentId = agentIdRaw.trim().toLowerCase();
        if (!agentId)
            continue;
        if (!AgentIdSchema.safeParse(agentId).success)
            continue;
        if (!entryRaw || typeof entryRaw !== "object")
            continue;
        const entry = entryRaw;
        const modelString = typeof entry.modelString === "string" && entry.modelString.trim().length > 0
            ? entry.modelString.trim()
            : undefined;
        const thinkingLevel = coerceThinkingLevel(entry.thinkingLevel);
        const enabled = typeof entry.enabled === "boolean" ? entry.enabled : undefined;
        if (!modelString && !thinkingLevel && enabled === undefined) {
            continue;
        }
        result[agentId] = { modelString, thinkingLevel, enabled };
    }
    return result;
}
//# sourceMappingURL=agentAiDefaults.js.map