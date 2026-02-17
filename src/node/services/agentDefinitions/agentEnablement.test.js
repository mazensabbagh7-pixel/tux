import { describe, expect, test } from "bun:test";
import { isAgentDisabledByFrontmatter, isAgentEffectivelyDisabled, resolveAgentEnabledOverride, } from "./agentEnablement";
function cfgWithOverrides(overrides) {
    return {
        projects: new Map(),
        agentAiDefaults: overrides,
    };
}
describe("agentEnablement", () => {
    test("disabled field takes precedence over ui.disabled", () => {
        const frontmatter = {
            name: "Test",
            disabled: false,
            ui: { disabled: true },
        };
        expect(isAgentDisabledByFrontmatter(frontmatter)).toBe(false);
    });
    test("falls back to ui.disabled when disabled is unset", () => {
        const frontmatter = {
            name: "Test",
            ui: { disabled: true },
        };
        expect(isAgentDisabledByFrontmatter(frontmatter)).toBe(true);
    });
    test("user override enabled:true re-enables a disabled agent", () => {
        const cfg = cfgWithOverrides({ foo: { enabled: true } });
        const frontmatter = { name: "Foo", disabled: true };
        expect(resolveAgentEnabledOverride(cfg, "foo")).toBe(true);
        expect(isAgentEffectivelyDisabled({
            cfg,
            agentId: "foo",
            resolvedFrontmatter: frontmatter,
        })).toBe(false);
    });
    test("user override enabled:false disables an enabled agent", () => {
        const cfg = cfgWithOverrides({ foo: { enabled: false } });
        const frontmatter = { name: "Foo" };
        expect(resolveAgentEnabledOverride(cfg, "foo")).toBe(false);
        expect(isAgentEffectivelyDisabled({
            cfg,
            agentId: "foo",
            resolvedFrontmatter: frontmatter,
        })).toBe(true);
    });
    test("core agents are never effectively disabled", () => {
        const cfg = cfgWithOverrides({ exec: { enabled: false } });
        const frontmatter = { name: "Exec", disabled: true };
        expect(isAgentEffectivelyDisabled({
            cfg,
            agentId: "exec",
            resolvedFrontmatter: frontmatter,
        })).toBe(false);
    });
});
//# sourceMappingURL=agentEnablement.test.js.map