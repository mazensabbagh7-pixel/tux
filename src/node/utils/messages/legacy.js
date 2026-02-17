/**
 * Normalize persisted messages from older builds.
 *
 * Migrations:
 * - `cmuxMetadata` → `muxMetadata` (mux rename)
 * - `{ compacted: true, idleCompacted: true }` → `{ compacted: "idle" }`
 */
export function normalizeLegacyMuxMetadata(message) {
    const metadata = message.metadata;
    if (!metadata)
        return message;
    let normalized = { ...metadata };
    let changed = false;
    // Migrate cmuxMetadata → muxMetadata
    if (metadata.cmuxMetadata !== undefined) {
        const { cmuxMetadata, ...rest } = normalized;
        normalized = rest;
        if (!metadata.muxMetadata) {
            normalized.muxMetadata = cmuxMetadata;
        }
        changed = true;
    }
    // Migrate idleCompacted: true → compacted: "idle"
    if (metadata.idleCompacted === true) {
        const { idleCompacted, ...rest } = normalized;
        normalized = { ...rest, compacted: "idle" };
        changed = true;
    }
    return changed ? { ...message, metadata: normalized } : message;
}
//# sourceMappingURL=legacy.js.map