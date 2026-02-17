import { collectToolConfigsFromResolvedChain } from "@/common/utils/agentTools";
// Runtime restrictions that cannot be overridden by agent definitions
const SUBAGENT_HARD_DENY = [
    { regex_match: "propose_plan", action: "disable" },
    { regex_match: "ask_user_question", action: "disable" },
];
const DEPTH_HARD_DENY = [
    { regex_match: "task", action: "disable" },
    { regex_match: "task_.*", action: "disable" },
];
/**
 * Resolves tool policy for an agent, including inherited tools from base agents.
 *
 * The policy is built from:
 * 1. Inheritance chain processed base → child:
 *    - Each layer's `tools.add` patterns (enable)
 *    - Each layer's `tools.remove` patterns (disable)
 * 2. Runtime restrictions (subagent limits, depth limits) applied last
 *
 * Example: ask (base: exec)
 * - exec has add: [.*], remove: [propose_plan, ask_user_question]
 * - ask has remove: [file_edit_.*]
 * - Result: deny-all → enable .* → disable propose_plan → disable ask_user_question → disable file_edit_.*
 *
 * Subagents always get `agent_report` enabled regardless of their tool list.
 */
export function resolveToolPolicyForAgent(options) {
    const { agents, isSubagent, disableTaskToolsForDepth } = options;
    // Start with deny-all baseline
    const agentPolicy = [{ regex_match: ".*", action: "disable" }];
    // Process inheritance chain: base → child
    const configs = collectToolConfigsFromResolvedChain(agents);
    for (const config of configs) {
        // Enable tools from add list (treated as regex patterns)
        if (config.add) {
            for (const pattern of config.add) {
                const trimmed = pattern.trim();
                if (trimmed.length > 0) {
                    agentPolicy.push({ regex_match: trimmed, action: "enable" });
                }
            }
        }
        // Disable tools from remove list
        if (config.remove) {
            for (const pattern of config.remove) {
                const trimmed = pattern.trim();
                if (trimmed.length > 0) {
                    agentPolicy.push({ regex_match: trimmed, action: "disable" });
                }
            }
        }
    }
    // Runtime restrictions (applied last, cannot be overridden)
    const runtimePolicy = [];
    if (disableTaskToolsForDepth) {
        runtimePolicy.push(...DEPTH_HARD_DENY);
    }
    if (isSubagent) {
        runtimePolicy.push(...SUBAGENT_HARD_DENY);
        // Subagents always need agent_report to return results
        runtimePolicy.push({ regex_match: "agent_report", action: "enable" });
    }
    return [...agentPolicy, ...runtimePolicy];
}
//# sourceMappingURL=resolveToolPolicy.js.map