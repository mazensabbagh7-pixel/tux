import * as fs from "fs/promises";
import * as path from "path";
import writeFileAtomic from "write-file-atomic";
import assert from "@/common/utils/assert";
import { workspaceFileLocks } from "@/node/utils/concurrency/workspaceFileLocks";
import { sumUsageHistory } from "@/common/utils/tokens/usageAggregator";
import { createDisplayUsage } from "@/common/utils/tokens/displayUsage";
import { normalizeGatewayModel } from "@/common/utils/ai/models";
import { log } from "./log";
/**
 * Service for managing cumulative session usage tracking.
 *
 * Replaces O(n) message iteration with a persistent JSON file that stores
 * per-model usage breakdowns. Usage is accumulated on stream-end, never
 * subtracted, making costs immune to message deletion.
 */
export class SessionUsageService {
    constructor(config, historyService) {
        this.SESSION_USAGE_FILE = "session-usage.json";
        this.fileLocks = workspaceFileLocks;
        this.config = config;
        this.historyService = historyService;
    }
    /**
     * Collect all messages from iterateFullHistory into an array.
     * Usage rebuild needs every epoch for accurate totals.
     */
    async collectFullHistory(workspaceId) {
        const messages = [];
        const result = await this.historyService.iterateFullHistory(workspaceId, "forward", (chunk) => {
            messages.push(...chunk);
        });
        if (!result.success) {
            log.warn(`Failed to iterate history for ${workspaceId}: ${result.error}`);
            return [];
        }
        return messages;
    }
    getFilePath(workspaceId) {
        return path.join(this.config.getSessionDir(workspaceId), this.SESSION_USAGE_FILE);
    }
    async readFile(workspaceId) {
        try {
            const data = await fs.readFile(this.getFilePath(workspaceId), "utf-8");
            return JSON.parse(data);
        }
        catch (error) {
            if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
                return { byModel: {}, version: 1 };
            }
            throw error;
        }
    }
    async writeFile(workspaceId, data) {
        const filePath = this.getFilePath(workspaceId);
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await writeFileAtomic(filePath, JSON.stringify(data, null, 2));
    }
    /**
     * Record usage from a completed stream. Accumulates with existing usage
     * AND updates lastRequest in a single atomic write.
     * Model should already be normalized via normalizeGatewayModel().
     */
    async recordUsage(workspaceId, model, usage) {
        return this.fileLocks.withLock(workspaceId, async () => {
            const current = await this.readFile(workspaceId);
            const existing = current.byModel[model];
            // CRITICAL: Accumulate, don't overwrite
            current.byModel[model] = existing ? sumUsageHistory([existing, usage]) : usage;
            current.lastRequest = { model, usage, timestamp: Date.now() };
            await this.writeFile(workspaceId, current);
        });
    }
    /**
     * Persist derived token stats (consumer + file breakdown) as a cache.
     *
     * This is intentionally treated as a replaceable cache: if the cache is stale,
     * the next tokenizer.calculateStats call will overwrite it.
     */
    async setTokenStatsCache(workspaceId, cache) {
        assert(workspaceId.trim().length > 0, "setTokenStatsCache: workspaceId empty");
        assert(cache.version === 1, "setTokenStatsCache: cache.version must be 1");
        assert(cache.totalTokens >= 0, "setTokenStatsCache: totalTokens must be >= 0");
        assert(cache.history.messageCount >= 0, "setTokenStatsCache: history.messageCount must be >= 0");
        for (const consumer of cache.consumers) {
            assert(typeof consumer.tokens === "number" && consumer.tokens >= 0, `setTokenStatsCache: consumer tokens must be >= 0 (${consumer.name})`);
        }
        return this.fileLocks.withLock(workspaceId, async () => {
            // Defensive: don't create new session dirs for already-deleted workspaces.
            if (!this.config.findWorkspace(workspaceId)) {
                return;
            }
            let current;
            try {
                current = await this.readFile(workspaceId);
            }
            catch {
                // Parse errors or other read failures - best-effort rebuild.
                log.warn(`session-usage.json unreadable for ${workspaceId}, rebuilding before token stats cache update`);
                const messages = await this.collectFullHistory(workspaceId);
                if (messages.length > 0) {
                    await this.rebuildFromMessagesInternal(workspaceId, messages);
                    current = await this.readFile(workspaceId);
                }
                else {
                    current = { byModel: {}, version: 1 };
                }
            }
            current.tokenStatsCache = cache;
            await this.writeFile(workspaceId, current);
        });
    }
    /**
     * Merge child usage into the parent workspace.
     *
     * Used to preserve sub-agent costs when the child workspace is deleted.
     *
     * IMPORTANT:
     * - Does not update parent's lastRequest
     * - Uses an on-disk idempotency ledger (rolledUpFrom) to prevent double-counting
     */
    async rollUpUsageIntoParent(parentWorkspaceId, childWorkspaceId, childUsageByModel) {
        assert(parentWorkspaceId.trim().length > 0, "rollUpUsageIntoParent: parentWorkspaceId empty");
        assert(childWorkspaceId.trim().length > 0, "rollUpUsageIntoParent: childWorkspaceId empty");
        assert(parentWorkspaceId !== childWorkspaceId, "rollUpUsageIntoParent: parentWorkspaceId must differ from childWorkspaceId");
        // Defensive: don't create new session dirs for already-deleted parents.
        if (!this.config.findWorkspace(parentWorkspaceId)) {
            return { didRollUp: false };
        }
        const entries = Object.entries(childUsageByModel);
        if (entries.length === 0) {
            return { didRollUp: false };
        }
        return this.fileLocks.withLock(parentWorkspaceId, async () => {
            let current;
            try {
                current = await this.readFile(parentWorkspaceId);
            }
            catch {
                // Parse errors or other read failures - best-effort rebuild.
                log.warn(`session-usage.json unreadable for ${parentWorkspaceId}, rebuilding before roll-up`);
                const messages = await this.collectFullHistory(parentWorkspaceId);
                if (messages.length > 0) {
                    await this.rebuildFromMessagesInternal(parentWorkspaceId, messages);
                    current = await this.readFile(parentWorkspaceId);
                }
                else {
                    current = { byModel: {}, version: 1 };
                }
            }
            if (current.rolledUpFrom?.[childWorkspaceId]) {
                return { didRollUp: false };
            }
            for (const [model, usage] of entries) {
                const existing = current.byModel[model];
                current.byModel[model] = existing ? sumUsageHistory([existing, usage]) : usage;
            }
            current.rolledUpFrom = { ...(current.rolledUpFrom ?? {}), [childWorkspaceId]: true };
            await this.writeFile(parentWorkspaceId, current);
            return { didRollUp: true };
        });
    }
    /**
     * Read current session usage. Returns undefined if file missing/corrupted
     * and no messages to rebuild from.
     */
    async getSessionUsage(workspaceId) {
        return this.fileLocks.withLock(workspaceId, async () => {
            try {
                const filePath = this.getFilePath(workspaceId);
                const data = await fs.readFile(filePath, "utf-8");
                return JSON.parse(data);
            }
            catch (error) {
                // File missing or corrupted - try to rebuild from messages
                if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
                    const messages = await this.collectFullHistory(workspaceId);
                    if (messages.length > 0) {
                        await this.rebuildFromMessagesInternal(workspaceId, messages);
                        return this.readFile(workspaceId);
                    }
                    return undefined; // Truly empty session
                }
                // Parse error - try rebuild
                log.warn(`session-usage.json corrupted for ${workspaceId}, rebuilding`);
                const messages = await this.collectFullHistory(workspaceId);
                if (messages.length > 0) {
                    await this.rebuildFromMessagesInternal(workspaceId, messages);
                    return this.readFile(workspaceId);
                }
                return undefined;
            }
        });
    }
    /**
     * Batch fetch session usage for multiple workspaces.
     * Optimized for displaying costs in archived workspaces list.
     */
    async getSessionUsageBatch(workspaceIds) {
        const results = {};
        // Read files in parallel without rebuilding from messages (archived workspaces
        // should already have session-usage.json; skip rebuild to keep batch fast)
        await Promise.all(workspaceIds.map(async (workspaceId) => {
            try {
                const filePath = this.getFilePath(workspaceId);
                const data = await fs.readFile(filePath, "utf-8");
                results[workspaceId] = JSON.parse(data);
            }
            catch {
                results[workspaceId] = undefined;
            }
        }));
        return results;
    }
    /**
     * Rebuild session usage from messages (for migration/recovery).
     * Internal version - called within lock.
     */
    async rebuildFromMessagesInternal(workspaceId, messages) {
        const result = { byModel: {}, version: 1 };
        let lastAssistantUsage;
        for (const msg of messages) {
            if (msg.role === "assistant") {
                // Include historicalUsage from legacy compaction summaries.
                // This field was removed from MuxMetadata but may exist in persisted data.
                // It's a ChatUsageDisplay representing all pre-compaction costs (model-agnostic).
                const historicalUsage = msg.metadata
                    ?.historicalUsage;
                if (historicalUsage) {
                    const existing = result.byModel.historical;
                    result.byModel.historical = existing
                        ? sumUsageHistory([existing, historicalUsage])
                        : historicalUsage;
                }
                // Extract current message's usage
                if (msg.metadata?.usage) {
                    const rawModel = msg.metadata.model ?? "unknown";
                    const model = normalizeGatewayModel(rawModel);
                    const usage = createDisplayUsage(msg.metadata.usage, rawModel, msg.metadata.providerMetadata);
                    if (usage) {
                        const existing = result.byModel[model];
                        result.byModel[model] = existing ? sumUsageHistory([existing, usage]) : usage;
                        lastAssistantUsage = { model, usage };
                    }
                }
            }
        }
        if (lastAssistantUsage) {
            result.lastRequest = {
                model: lastAssistantUsage.model,
                usage: lastAssistantUsage.usage,
                timestamp: Date.now(),
            };
        }
        await this.writeFile(workspaceId, result);
        log.info(`Rebuilt session-usage.json for ${workspaceId} from ${messages.length} messages`);
    }
    /**
     * Public rebuild method (acquires lock).
     */
    async rebuildFromMessages(workspaceId, messages) {
        return this.fileLocks.withLock(workspaceId, async () => {
            await this.rebuildFromMessagesInternal(workspaceId, messages);
        });
    }
    /**
     * Delete session usage file (when workspace is deleted).
     */
    async deleteSessionUsage(workspaceId) {
        return this.fileLocks.withLock(workspaceId, async () => {
            try {
                await fs.unlink(this.getFilePath(workspaceId));
            }
            catch (error) {
                if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) {
                    throw error;
                }
            }
        });
    }
}
//# sourceMappingURL=sessionUsageService.js.map