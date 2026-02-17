import { countTokens, countTokensBatch } from "@/node/utils/main/tokenizer";
import { calculateTokenStats } from "@/common/utils/tokens/tokenStatsCalculator";
import assert from "@/common/utils/assert";
import { log } from "./log";
function getMaxHistorySequence(messages) {
    let max;
    for (const message of messages) {
        const seq = message.metadata?.historySequence;
        if (typeof seq !== "number") {
            continue;
        }
        if (max === undefined || seq > max) {
            max = seq;
        }
    }
    return max;
}
export class TokenizerService {
    constructor(sessionUsageService) {
        // Token stats calculations can overlap for a single workspace (e.g., rapid tool events).
        // The renderer ignores outdated results client-side, but the backend must also avoid
        // persisting stale `tokenStatsCache` data if an older calculation finishes after a newer one.
        this.latestCalcIdByWorkspace = new Map();
        this.nextCalcId = 0;
        this.sessionUsageService = sessionUsageService;
    }
    /**
     * Count tokens for a single string
     */
    async countTokens(model, text) {
        assert(typeof model === "string" && model.length > 0, "Tokenizer countTokens requires model name");
        assert(typeof text === "string", "Tokenizer countTokens requires text");
        return countTokens(model, text);
    }
    /**
     * Count tokens for a batch of strings
     */
    async countTokensBatch(model, texts) {
        assert(typeof model === "string" && model.length > 0, "Tokenizer countTokensBatch requires model name");
        assert(Array.isArray(texts), "Tokenizer countTokensBatch requires an array of strings");
        return countTokensBatch(model, texts);
    }
    /**
     * Calculate detailed token statistics for a chat history.
     */
    async calculateStats(workspaceId, messages, model) {
        assert(typeof workspaceId === "string" && workspaceId.length > 0, "Tokenizer calculateStats requires workspaceId");
        assert(Array.isArray(messages), "Tokenizer calculateStats requires an array of messages");
        assert(typeof model === "string" && model.length > 0, "Tokenizer calculateStats requires model name");
        const calcId = ++this.nextCalcId;
        this.latestCalcIdByWorkspace.set(workspaceId, calcId);
        const stats = await calculateTokenStats(messages, model);
        // Only persist the cache for the most recently-started calculation.
        // Older calculations can finish later and would otherwise overwrite a newer cache.
        if (this.latestCalcIdByWorkspace.get(workspaceId) !== calcId) {
            return stats;
        }
        const cache = {
            version: 1,
            computedAt: Date.now(),
            model: stats.model,
            tokenizerName: stats.tokenizerName,
            history: {
                messageCount: messages.length,
                maxHistorySequence: getMaxHistorySequence(messages),
            },
            consumers: stats.consumers,
            totalTokens: stats.totalTokens,
            topFilePaths: stats.topFilePaths,
        };
        // Defensive: keep cache invariants tight so we don't persist corrupt state.
        // Prefer returning stats over crashing the UI - if something is off, log and skip persisting.
        try {
            assert(cache.totalTokens >= 0, "Tokenizer calculateStats: cache.totalTokens must be >= 0");
            assert(cache.history.messageCount === messages.length, "Tokenizer calculateStats: cache.history.messageCount must match messages.length");
            for (const consumer of cache.consumers) {
                assert(typeof consumer.tokens === "number" && consumer.tokens >= 0, `Tokenizer calculateStats: consumer.tokens must be >= 0 (${consumer.name})`);
            }
            const sumConsumerTokens = cache.consumers.reduce((sum, consumer) => sum + consumer.tokens, 0);
            assert(sumConsumerTokens === cache.totalTokens, `Tokenizer calculateStats: totalTokens mismatch (sum=${sumConsumerTokens}, total=${cache.totalTokens})`);
        }
        catch (error) {
            log.warn("[TokenizerService] Token stats cache invariant check failed; skipping persist", {
                workspaceId,
                error,
            });
            return stats;
        }
        try {
            await this.sessionUsageService.setTokenStatsCache(workspaceId, cache);
        }
        catch (error) {
            log.warn("[TokenizerService] Failed to persist token stats cache", { workspaceId, error });
        }
        return stats;
    }
}
//# sourceMappingURL=tokenizerService.js.map