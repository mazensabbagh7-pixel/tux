/**
 * Tests for compaction options transformation
 */
import { applyCompactionOverrides } from "./compactionOptions";
import { KNOWN_MODELS } from "@/common/constants/knownModels";
describe("applyCompactionOverrides", () => {
    const baseOptions = {
        model: KNOWN_MODELS.SONNET.id,
        thinkingLevel: "medium",
        toolPolicy: [],
        agentId: "exec",
    };
    it("uses workspace model when no override specified", () => {
        const compactData = {};
        const result = applyCompactionOverrides(baseOptions, compactData);
        expect(result.model).toBe(KNOWN_MODELS.SONNET.id);
        expect(result.agentId).toBe("compact");
    });
    it("applies custom model override", () => {
        const compactData = {
            model: KNOWN_MODELS.HAIKU.id,
        };
        const result = applyCompactionOverrides(baseOptions, compactData);
        expect(result.model).toBe(KNOWN_MODELS.HAIKU.id);
    });
    it("falls back to workspace model when override is empty", () => {
        const compactData = {
            model: "",
        };
        const result = applyCompactionOverrides(baseOptions, compactData);
        expect(result.model).toBe(KNOWN_MODELS.SONNET.id);
    });
    it("falls back to workspace model when override is whitespace", () => {
        const compactData = {
            model: "   ",
        };
        const result = applyCompactionOverrides(baseOptions, compactData);
        expect(result.model).toBe(KNOWN_MODELS.SONNET.id);
    });
    it("enforces thinking policy for the compaction model", () => {
        // Test Anthropic model (supports medium)
        const anthropicData = {
            model: KNOWN_MODELS.HAIKU.id,
        };
        const anthropicResult = applyCompactionOverrides(baseOptions, anthropicData);
        expect(anthropicResult.thinkingLevel).toBe("medium");
        // Test OpenAI model (gpt-5-pro only supports high)
        const openaiData = {
            model: "openai:gpt-5-pro",
        };
        const openaiResult = applyCompactionOverrides(baseOptions, openaiData);
        expect(openaiResult.thinkingLevel).toBe("high");
    });
    it("applies maxOutputTokens override", () => {
        const compactData = {
            maxOutputTokens: 8000,
        };
        const result = applyCompactionOverrides(baseOptions, compactData);
        expect(result.maxOutputTokens).toBe(8000);
    });
    it("sets compact mode and disables all tools", () => {
        const compactData = {};
        const result = applyCompactionOverrides(baseOptions, compactData);
        expect(result.agentId).toBe("compact");
        expect(result.skipAiSettingsPersistence).toBe(true);
        expect(result.toolPolicy).toEqual([{ regex_match: ".*", action: "disable" }]);
    });
    it("disables all tools even when base options has tool policy", () => {
        const baseWithTools = {
            ...baseOptions,
            toolPolicy: [{ regex_match: "bash", action: "enable" }],
        };
        const compactData = {};
        const result = applyCompactionOverrides(baseWithTools, compactData);
        expect(result.agentId).toBe("compact");
        expect(result.toolPolicy).toEqual([{ regex_match: ".*", action: "disable" }]); // Tools always disabled for compaction
    });
    it("applies all overrides together", () => {
        const compactData = {
            model: KNOWN_MODELS.GPT.id,
            maxOutputTokens: 5000,
        };
        const result = applyCompactionOverrides(baseOptions, compactData);
        expect(result.model).toBe(KNOWN_MODELS.GPT.id);
        expect(result.maxOutputTokens).toBe(5000);
        expect(result.agentId).toBe("compact");
        expect(result.thinkingLevel).toBe("medium"); // Non-Anthropic preserves original
    });
});
//# sourceMappingURL=compactionOptions.test.js.map