import { dirname } from "path";
import { mkdir, readFile, access } from "fs/promises";
import { constants } from "fs";
import writeFileAtomic from "write-file-atomic";
import { getExtensionMetadataPath, } from "@/node/utils/extensionMetadata";
import { log } from "@/node/services/log";
export class ExtensionMetadataService {
    toSnapshot(entry) {
        return {
            recency: entry.recency,
            streaming: entry.streaming,
            lastModel: entry.lastModel ?? null,
            lastThinkingLevel: entry.lastThinkingLevel ?? null,
        };
    }
    constructor(filePath) {
        this.filePath = filePath ?? getExtensionMetadataPath();
    }
    /**
     * Initialize the service by ensuring directory exists and clearing stale streaming flags.
     * Call this once on app startup.
     */
    async initialize() {
        // Ensure directory exists
        const dir = dirname(this.filePath);
        try {
            await access(dir, constants.F_OK);
        }
        catch {
            await mkdir(dir, { recursive: true });
        }
        // Clear stale streaming flags (from crashes)
        await this.clearStaleStreaming();
    }
    async load() {
        try {
            await access(this.filePath, constants.F_OK);
        }
        catch {
            return { version: 1, workspaces: {} };
        }
        try {
            const content = await readFile(this.filePath, "utf-8");
            const parsed = JSON.parse(content);
            // Validate structure
            if (typeof parsed !== "object" || parsed.version !== 1) {
                log.error("Invalid metadata file, resetting");
                return { version: 1, workspaces: {} };
            }
            return parsed;
        }
        catch (error) {
            log.error("Failed to load metadata:", error);
            return { version: 1, workspaces: {} };
        }
    }
    async save(data) {
        try {
            const content = JSON.stringify(data, null, 2);
            await writeFileAtomic(this.filePath, content, "utf-8");
        }
        catch (error) {
            log.error("Failed to save metadata:", error);
        }
    }
    /**
     * Update the recency timestamp for a workspace.
     * Call this on user messages or other interactions.
     */
    async updateRecency(workspaceId, timestamp = Date.now()) {
        const data = await this.load();
        if (!data.workspaces[workspaceId]) {
            data.workspaces[workspaceId] = {
                recency: timestamp,
                streaming: false,
                lastModel: null,
                lastThinkingLevel: null,
            };
        }
        else {
            data.workspaces[workspaceId].recency = timestamp;
        }
        await this.save(data);
        const workspace = data.workspaces[workspaceId];
        if (!workspace) {
            throw new Error(`Workspace ${workspaceId} metadata missing after update.`);
        }
        return this.toSnapshot(workspace);
    }
    /**
     * Set the streaming status for a workspace.
     * Call this when streams start/end.
     */
    async setStreaming(workspaceId, streaming, model, thinkingLevel) {
        const data = await this.load();
        const now = Date.now();
        if (!data.workspaces[workspaceId]) {
            data.workspaces[workspaceId] = {
                recency: now,
                streaming,
                lastModel: model ?? null,
                lastThinkingLevel: thinkingLevel ?? null,
            };
        }
        else {
            data.workspaces[workspaceId].streaming = streaming;
            if (model) {
                data.workspaces[workspaceId].lastModel = model;
            }
            if (thinkingLevel !== undefined) {
                data.workspaces[workspaceId].lastThinkingLevel = thinkingLevel;
            }
        }
        await this.save(data);
        const workspace = data.workspaces[workspaceId];
        if (!workspace) {
            throw new Error(`Workspace ${workspaceId} metadata missing after streaming update.`);
        }
        return this.toSnapshot(workspace);
    }
    /**
     * Get metadata for a single workspace.
     */
    async getMetadata(workspaceId) {
        const data = await this.load();
        const entry = data.workspaces[workspaceId];
        if (!entry)
            return null;
        return {
            workspaceId,
            updatedAt: entry.recency, // Use recency as updatedAt for backwards compatibility
            ...entry,
        };
    }
    /**
     * Get all workspace metadata, ordered by recency.
     * Used by VS Code extension to sort workspace list.
     */
    async getAllMetadata() {
        const data = await this.load();
        const map = new Map();
        // Convert to array, sort by recency, then create map
        const entries = Object.entries(data.workspaces);
        entries.sort((a, b) => b[1].recency - a[1].recency);
        for (const [workspaceId, entry] of entries) {
            map.set(workspaceId, {
                workspaceId,
                updatedAt: entry.recency, // Use recency as updatedAt for backwards compatibility
                ...entry,
            });
        }
        return map;
    }
    /**
     * Delete metadata for a workspace.
     * Call this when a workspace is deleted.
     */
    async deleteWorkspace(workspaceId) {
        const data = await this.load();
        if (data.workspaces[workspaceId]) {
            delete data.workspaces[workspaceId];
            await this.save(data);
        }
    }
    /**
     * Clear all streaming flags.
     * Call this on app startup to clean up stale streaming states from crashes.
     */
    async clearStaleStreaming() {
        const data = await this.load();
        let modified = false;
        for (const entry of Object.values(data.workspaces)) {
            if (entry.streaming) {
                entry.streaming = false;
                modified = true;
            }
        }
        if (modified) {
            await this.save(data);
        }
    }
    async getAllSnapshots() {
        const data = await this.load();
        const map = new Map();
        for (const [workspaceId, entry] of Object.entries(data.workspaces)) {
            map.set(workspaceId, this.toSnapshot(entry));
        }
        return map;
    }
}
//# sourceMappingURL=ExtensionMetadataService.js.map