import assert from "@/common/utils/assert";
const ALWAYS_ENABLED_AGENT_IDS = new Set(["exec", "plan", "compact", "mux"]);
export function isAgentDisabledByFrontmatter(frontmatter) {
    assert(frontmatter, "isAgentDisabledByFrontmatter: frontmatter is required");
    // `disabled` is the new top-level field.
    // When both are set, disabled takes precedence over ui.disabled.
    if (typeof frontmatter.disabled === "boolean") {
        return frontmatter.disabled;
    }
    if (typeof frontmatter.ui?.disabled === "boolean") {
        return frontmatter.ui.disabled;
    }
    return false;
}
export function resolveAgentEnabledOverride(cfg, agentId) {
    assert(cfg, "resolveAgentEnabledOverride: cfg is required");
    assert(agentId.length > 0, "resolveAgentEnabledOverride: agentId must be non-empty");
    const entry = cfg.agentAiDefaults?.[agentId];
    return typeof entry?.enabled === "boolean" ? entry.enabled : undefined;
}
export function isAgentEffectivelyDisabled(args) {
    assert(args, "isAgentEffectivelyDisabled: args is required");
    assert(args.cfg, "isAgentEffectivelyDisabled: cfg is required");
    assert(args.agentId.length > 0, "isAgentEffectivelyDisabled: agentId must be non-empty");
    assert(args.resolvedFrontmatter, "isAgentEffectivelyDisabled: resolvedFrontmatter is required");
    // Core agents must always remain available so mux can safely fall back.
    if (ALWAYS_ENABLED_AGENT_IDS.has(args.agentId)) {
        return false;
    }
    const override = resolveAgentEnabledOverride(args.cfg, args.agentId);
    if (override === true) {
        return false;
    }
    if (override === false) {
        return true;
    }
    return isAgentDisabledByFrontmatter(args.resolvedFrontmatter);
}
//# sourceMappingURL=agentEnablement.js.map