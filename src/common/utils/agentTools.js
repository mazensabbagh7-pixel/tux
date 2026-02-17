function toolMatchesPatterns(toolName, patterns) {
    for (const pattern of patterns) {
        const regex = new RegExp(`^${pattern}$`);
        if (regex.test(toolName)) {
            return true;
        }
    }
    return false;
}
/**
 * Apply add/remove semantics to a single tool name.
 *
 * `configs` must be ordered base → child.
 *
 * Semantics:
 * - Baseline is deny-all.
 * - If a tool matches any `add` pattern it becomes enabled.
 * - If a tool matches any `remove` pattern it becomes disabled (overrides earlier adds).
 */
export function isToolEnabledByConfigs(toolName, configs) {
    let enabled = false;
    for (const config of configs) {
        if (config.add && toolMatchesPatterns(toolName, config.add)) {
            enabled = true;
        }
        if (config.remove && toolMatchesPatterns(toolName, config.remove)) {
            enabled = false;
        }
    }
    return enabled;
}
/**
 * Extract tool configs from a resolved inheritance chain.
 *
 * Input order: child → base (selected agent first)
 * Output order: base → child (for correct add/remove semantics)
 */
export function collectToolConfigsFromResolvedChain(agents, maxDepth = 10) {
    return [...agents]
        .slice(0, maxDepth)
        .reverse()
        .filter((agent) => agent.tools != null)
        .map((agent) => agent.tools);
}
/**
 * Extract tool configs by walking `base` pointers in a graph of unique agent IDs.
 *
 * This is intended for UI usage where the caller has a flat list from discovery.
 */
export function collectToolConfigsFromDefinitionGraph(agentId, agents, maxDepth = 10) {
    const byId = new Map();
    for (const agent of agents) {
        byId.set(agent.id, agent);
    }
    const configsChildToBase = [];
    const visited = new Set();
    let currentId = agentId;
    let depth = 0;
    while (currentId && depth < maxDepth) {
        if (visited.has(currentId)) {
            break;
        }
        visited.add(currentId);
        const agent = byId.get(currentId);
        if (!agent) {
            break;
        }
        if (agent.tools) {
            configsChildToBase.push(agent.tools);
        }
        currentId = agent.base;
        depth++;
    }
    return configsChildToBase.reverse();
}
export function isToolEnabledInResolvedChain(toolName, agents, maxDepth = 10) {
    return isToolEnabledByConfigs(toolName, collectToolConfigsFromResolvedChain(agents, maxDepth));
}
export function isPlanLikeInResolvedChain(agents, maxDepth = 10) {
    return isToolEnabledInResolvedChain("propose_plan", agents, maxDepth);
}
export function isExecLikeEditingCapableInResolvedChain(agents, maxDepth = 10) {
    const inheritsExec = agents.some((agent) => agent.id === "exec");
    if (!inheritsExec) {
        return false;
    }
    return (isToolEnabledInResolvedChain("file_edit_insert", agents, maxDepth) ||
        isToolEnabledInResolvedChain("file_edit_replace_string", agents, maxDepth));
}
//# sourceMappingURL=agentTools.js.map