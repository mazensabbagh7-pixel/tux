import { readFileSync, existsSync } from "fs";
import { getMuxExtensionMetadataPath } from "@/common/constants/paths";
import { isThinkingLevel } from "@/common/types/thinking";
import { log } from "@/node/services/log";
/**
 * Get the path to the extension metadata file.
 * @param rootDir - Optional root directory (defaults to getMuxHome())
 */
export function getExtensionMetadataPath(rootDir) {
    return getMuxExtensionMetadataPath(rootDir);
}
/**
 * Read extension metadata from JSON file.
 * Returns a map of workspace ID to metadata.
 * Used by both the main app and VS Code extension.
 */
export function readExtensionMetadata() {
    const metadataPath = getExtensionMetadataPath();
    if (!existsSync(metadataPath)) {
        return new Map();
    }
    try {
        const content = readFileSync(metadataPath, "utf-8");
        const data = JSON.parse(content);
        // Validate structure
        if (typeof data !== "object" || data.version !== 1) {
            log.error("Invalid metadata file format");
            return new Map();
        }
        const map = new Map();
        for (const [workspaceId, metadata] of Object.entries(data.workspaces || {})) {
            const rawThinkingLevel = metadata.lastThinkingLevel;
            map.set(workspaceId, {
                recency: metadata.recency,
                streaming: metadata.streaming,
                lastModel: metadata.lastModel ?? null,
                lastThinkingLevel: isThinkingLevel(rawThinkingLevel) ? rawThinkingLevel : null,
            });
        }
        return map;
    }
    catch (error) {
        log.error("Failed to read metadata:", error);
        return new Map();
    }
}
//# sourceMappingURL=extensionMetadata.js.map