import assert from "@/common/utils/assert";
import CRC32 from "crc-32";
import { LRUCache } from "lru-cache";
import { getAvailableTools, getToolSchemas } from "@/common/utils/tools/toolDefinitions";
import { models } from "ai-tokenizer";
import { run } from "./workerPool";
import { TOKENIZER_MODEL_OVERRIDES, DEFAULT_WARM_MODELS } from "@/common/constants/knownModels";
import { normalizeGatewayModel } from "@/common/utils/ai/models";
import { log } from "@/node/services/log";
import { safeStringifyForCounting } from "@/common/utils/tokens/safeStringifyForCounting";
const APPROX_ENCODING = "approx-4";
function shouldUseApproxTokenizer() {
    // MUX_FORCE_REAL_TOKENIZER=1 overrides approx mode (for tests that need real tokenization)
    // MUX_APPROX_TOKENIZER=1 enables fast approximate mode (default in Jest)
    if (process.env.MUX_FORCE_REAL_TOKENIZER === "1") {
        return false;
    }
    return process.env.MUX_APPROX_TOKENIZER === "1";
}
function approximateCount(text) {
    if (typeof text !== "string" || text.length === 0) {
        return 0;
    }
    return Math.ceil(text.length / 4);
}
function getApproxTokenizer() {
    return {
        encoding: APPROX_ENCODING,
        countTokens: (input) => Promise.resolve(approximateCount(input)),
    };
}
const encodingPromises = new Map();
const inFlightCounts = new Map();
const tokenCountCache = new LRUCache({
    maxSize: 250000,
    sizeCalculation: () => 1,
});
// Track which models we've already warned about to avoid log spam
const warnedModels = new Set();
function normalizeModelKey(modelName) {
    assert(typeof modelName === "string" && modelName.length > 0, "Model name must be a non-empty string");
    const override = TOKENIZER_MODEL_OVERRIDES[modelName];
    const normalized = override ?? (modelName.includes(":") ? modelName.replace(":", "/") : modelName);
    if (!(normalized in models)) {
        // Return null for unknown models - caller can decide to fallback or error
        return null;
    }
    return normalized;
}
/**
 * Resolves a model string to a ModelName, falling back to a similar model if unknown.
 * Optionally logs a warning when falling back.
 */
function resolveModelName(modelString) {
    const normalized = normalizeGatewayModel(modelString);
    let modelName = normalizeModelKey(normalized);
    if (!modelName) {
        const provider = normalized.split(":")[0] || "anthropic";
        // GitHub Copilot hosts models from multiple providers.
        // Infer the tokenizer family from the model name prefix.
        let effectiveProvider = provider;
        if (provider === "github-copilot") {
            const modelId = normalized.split(":")[1] || "";
            if (modelId.startsWith("claude-")) {
                effectiveProvider = "anthropic";
            }
            else if (modelId.startsWith("gemini-")) {
                effectiveProvider = "google";
            }
            else {
                // gpt-*, grok-*, and unknown models use OpenAI tokenizer
                effectiveProvider = "openai";
            }
        }
        const fallbackModel = effectiveProvider === "anthropic"
            ? "anthropic/claude-sonnet-4.5"
            : effectiveProvider === "google"
                ? "google/gemini-2.5-pro"
                : "openai/gpt-5";
        // Only warn once per unknown model to avoid log spam
        if (!warnedModels.has(modelString)) {
            warnedModels.add(modelString);
            log.warn(`Unknown model '${modelString}', using ${fallbackModel} tokenizer for approximate token counting`);
        }
        modelName = fallbackModel;
    }
    return modelName;
}
function resolveEncoding(modelName) {
    let promise = encodingPromises.get(modelName);
    if (!promise) {
        promise = run("encodingName", modelName)
            .then((result) => {
            assert(typeof result === "string" && result.length > 0, "Token encoding name must be a non-empty string");
            return result;
        })
            .catch((error) => {
            encodingPromises.delete(modelName);
            throw error;
        });
        encodingPromises.set(modelName, promise);
    }
    return promise;
}
function buildCacheKey(modelName, text) {
    const checksum = CRC32.str(text);
    return `${modelName}:${checksum}:${text.length}`;
}
async function countTokensInternal(modelName, text) {
    assert(typeof text === "string", "Tokenizer countTokens expects string input");
    if (text.length === 0) {
        return 0;
    }
    const key = buildCacheKey(modelName, text);
    const cached = tokenCountCache.get(key);
    if (cached !== undefined) {
        return cached;
    }
    let pending = inFlightCounts.get(key);
    if (!pending) {
        const payload = { modelName, input: text };
        pending = run("countTokens", payload)
            .then((value) => {
            assert(typeof value === "number" && Number.isFinite(value) && value >= 0, "Tokenizer must return a non-negative finite token count");
            tokenCountCache.set(key, value);
            inFlightCounts.delete(key);
            return value;
        })
            .catch((error) => {
            inFlightCounts.delete(key);
            throw error;
        });
        inFlightCounts.set(key, pending);
    }
    return pending;
}
export function loadTokenizerModules(modelsToWarm = Array.from(DEFAULT_WARM_MODELS)) {
    if (shouldUseApproxTokenizer()) {
        const fulfilled = modelsToWarm.map(() => ({
            status: "fulfilled",
            value: APPROX_ENCODING,
        }));
        return Promise.resolve(fulfilled);
    }
    return Promise.allSettled(modelsToWarm.map((modelString) => {
        const modelName = normalizeModelKey(modelString);
        // Skip unknown models during warmup
        if (!modelName) {
            return Promise.reject(new Error(`Unknown model: ${modelString}`));
        }
        return resolveEncoding(modelName);
    }));
}
export async function getTokenizerForModel(modelString) {
    if (shouldUseApproxTokenizer()) {
        return getApproxTokenizer();
    }
    const modelName = resolveModelName(modelString);
    const encodingName = await resolveEncoding(modelName);
    return {
        encoding: encodingName,
        countTokens: (input) => countTokensInternal(modelName, input),
    };
}
export function countTokens(modelString, text) {
    if (shouldUseApproxTokenizer()) {
        return Promise.resolve(approximateCount(text));
    }
    const modelName = resolveModelName(modelString);
    return countTokensInternal(modelName, text);
}
export function countTokensBatch(modelString, texts) {
    assert(Array.isArray(texts), "Batch token counting expects an array of strings");
    if (shouldUseApproxTokenizer()) {
        return Promise.resolve(texts.map((text) => approximateCount(text)));
    }
    const modelName = resolveModelName(modelString);
    return Promise.all(texts.map((text) => countTokensInternal(modelName, text)));
}
export function countTokensForData(data, tokenizer) {
    const serialized = safeStringifyForCounting(data);
    return tokenizer.countTokens(serialized);
}
export async function getToolDefinitionTokens(toolName, modelString) {
    try {
        const availableTools = getAvailableTools(modelString);
        if (!availableTools.includes(toolName)) {
            return 0;
        }
        const toolSchemas = getToolSchemas();
        const toolSchema = toolSchemas[toolName];
        if (!toolSchema) {
            return 40;
        }
        return countTokens(modelString, JSON.stringify(toolSchema));
    }
    catch {
        const fallbackSizes = {
            bash: 65,
            file_read: 45,
            file_edit_replace_string: 70,
            file_edit_replace_lines: 80,
            file_edit_insert: 50,
            web_search: 50,
            google_search: 50,
        };
        return fallbackSizes[toolName] ?? 40;
    }
}
export function __resetTokenizerForTests() {
    encodingPromises.clear();
    tokenCountCache.clear();
    inFlightCounts.clear();
}
//# sourceMappingURL=tokenizer.js.map