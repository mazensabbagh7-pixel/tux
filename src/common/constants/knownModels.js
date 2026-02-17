/**
 * Centralized model metadata. Update model versions here and everywhere else will follow.
 */
import { formatModelDisplayName } from "../utils/ai/modelDisplay";
// Model definitions. Note we avoid listing legacy models here. These represent the focal models
// of the community.
const MODEL_DEFINITIONS = {
    OPUS: {
        provider: "anthropic",
        providerModelId: "claude-opus-4-6",
        aliases: ["opus"],
        warm: true,
    },
    SONNET: {
        provider: "anthropic",
        providerModelId: "claude-sonnet-4-5",
        aliases: ["sonnet"],
        warm: true,
        tokenizerOverride: "anthropic/claude-sonnet-4.5",
    },
    HAIKU: {
        provider: "anthropic",
        providerModelId: "claude-haiku-4-5",
        aliases: ["haiku"],
        tokenizerOverride: "anthropic/claude-3.5-haiku",
    },
    GPT: {
        provider: "openai",
        providerModelId: "gpt-5.2",
        aliases: ["gpt"],
        warm: true,
        tokenizerOverride: "openai/gpt-5",
    },
    GPT_PRO: {
        provider: "openai",
        providerModelId: "gpt-5.2-pro",
        aliases: ["gpt-pro"],
    },
    GPT_52_CODEX: {
        provider: "openai",
        providerModelId: "gpt-5.2-codex",
        aliases: ["codex"],
        warm: true,
        tokenizerOverride: "openai/gpt-5",
    },
    GPT_53_CODEX: {
        provider: "openai",
        providerModelId: "gpt-5.3-codex",
        aliases: ["codex-5.3"],
        warm: true,
        tokenizerOverride: "openai/gpt-5",
    },
    GPT_CODEX: {
        provider: "openai",
        providerModelId: "gpt-5.1-codex",
        aliases: ["codex-5.1"],
        warm: true,
        tokenizerOverride: "openai/gpt-5",
    },
    GPT_MINI: {
        provider: "openai",
        providerModelId: "gpt-5.1-codex-mini",
        aliases: ["codex-mini"],
    },
    GPT_CODEX_MAX: {
        provider: "openai",
        providerModelId: "gpt-5.1-codex-max",
        aliases: ["codex-max"],
        warm: true,
        tokenizerOverride: "openai/gpt-5",
    },
    GEMINI_3_PRO: {
        provider: "google",
        providerModelId: "gemini-3-pro-preview",
        aliases: ["gemini", "gemini-3", "gemini-3-pro"],
        tokenizerOverride: "google/gemini-2.5-pro",
    },
    GEMINI_3_FLASH: {
        provider: "google",
        providerModelId: "gemini-3-flash-preview",
        aliases: ["gemini-3-flash"],
        tokenizerOverride: "google/gemini-2.5-pro",
    },
    GROK_4_1: {
        provider: "xai",
        providerModelId: "grok-4-1-fast",
        aliases: ["grok", "grok-4", "grok-4.1", "grok-4-1"],
    },
    GROK_CODE: {
        provider: "xai",
        providerModelId: "grok-code-fast-1",
        aliases: ["grok-code"],
    },
};
const MODEL_DEFINITION_ENTRIES = Object.entries(MODEL_DEFINITIONS);
export const KNOWN_MODELS = Object.fromEntries(MODEL_DEFINITION_ENTRIES.map(([key, definition]) => toKnownModelEntry(key, definition)));
function toKnownModelEntry(key, definition) {
    return [
        key,
        {
            ...definition,
            id: `${definition.provider}:${definition.providerModelId}`,
        },
    ];
}
export function getKnownModel(key) {
    return KNOWN_MODELS[key];
}
// ------------------------------------------------------------------------------------
// Derived collections
// ------------------------------------------------------------------------------------
/**
 * The default known model key.
 *
 * Keep this local (non-exported) to avoid confusion with storage keys.
 */
const DEFAULT_KNOWN_MODEL_KEY = "OPUS";
export const DEFAULT_MODEL = KNOWN_MODELS[DEFAULT_KNOWN_MODEL_KEY].id;
export const DEFAULT_WARM_MODELS = Object.values(KNOWN_MODELS)
    .filter((model) => model.warm)
    .map((model) => model.id);
export const MODEL_ABBREVIATIONS = Object.fromEntries(Object.values(KNOWN_MODELS)
    .flatMap((model) => (model.aliases ?? []).map((alias) => [alias, model.id]))
    .sort(([a], [b]) => a.localeCompare(b)));
export const TOKENIZER_MODEL_OVERRIDES = Object.fromEntries(Object.values(KNOWN_MODELS)
    .filter((model) => Boolean(model.tokenizerOverride))
    .map((model) => [model.id, model.tokenizerOverride]));
/** Tooltip-friendly abbreviation examples: show representative shortcuts */
export const MODEL_ABBREVIATION_EXAMPLES = ["opus", "sonnet"].map((abbrev) => ({
    abbrev,
    displayName: formatModelDisplayName(MODEL_ABBREVIATIONS[abbrev]?.split(":")[1] ?? abbrev),
}));
//# sourceMappingURL=knownModels.js.map