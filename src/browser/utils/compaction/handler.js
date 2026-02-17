/**
 * Compaction interrupt handling
 *
 * Ctrl+C (cancel): Abort compaction, enters edit mode on compaction-request message
 * with original /compact command restored for re-editing.
 */
import { getCompactionFollowUpContent } from "@/common/types/message";
import { buildEditingStateFromCompaction, } from "@/browser/utils/chatEditing";
import { getFollowUpContentText } from "./format";
/**
 * Check if the workspace is currently in a compaction stream
 */
export function isCompactingStream(aggregator) {
    // Prefer active stream state (derived from stream-start mode) over scanning history.
    return aggregator.isCompacting();
}
/**
 * Find the compaction-request user message in message history
 */
export function findCompactionRequestMessage(aggregator) {
    const messages = aggregator.getAllMessages();
    return ([...messages]
        .reverse()
        .find((m) => m.role === "user" && m.metadata?.muxMetadata?.type === "compaction-request") ??
        null);
}
/**
 * Get the original /compact command from the last user message
 */
export function getCompactionCommand(aggregator) {
    const compactionMsg = findCompactionRequestMessage(aggregator);
    if (!compactionMsg)
        return null;
    const muxMeta = compactionMsg.metadata?.muxMetadata;
    if (muxMeta?.type !== "compaction-request")
        return null;
    const followUpText = getFollowUpContentText(getCompactionFollowUpContent(muxMeta));
    if (followUpText && !muxMeta.rawCommand.includes("\n")) {
        return `${muxMeta.rawCommand}\n${followUpText}`;
    }
    return muxMeta.rawCommand;
}
/**
 * Cancel compaction (Ctrl+C flow)
 *
 * Aborts the compaction stream and puts user in edit mode for compaction-request:
 * - Interrupts stream with abandonPartial=true flag (backend skips compaction)
 * - Enters edit mode on compaction-request message
 * - Restores original /compact command to input for re-editing
 * - Leaves compaction-request message in history (can edit or delete it)
 *
 * Flow:
 * 1. Interrupt stream with {abandonPartial: true} - backend detects and skips compaction
 * 2. Enter edit mode on compaction-request message with original command
 */
export async function cancelCompaction(client, workspaceId, aggregator, startEditingMessage) {
    // Find the compaction request message
    const compactionRequestMsg = findCompactionRequestMessage(aggregator);
    if (!compactionRequestMsg) {
        return false;
    }
    // Extract command before modifying history
    const command = getCompactionCommand(aggregator);
    if (!command) {
        return false;
    }
    // Extract follow-up content (attachments, reviews) that would be sent after compaction.
    // Without this, canceling compaction would lose any attached files or code reviews.
    const followUpContent = getCompactionFollowUpContent(compactionRequestMsg.metadata?.muxMetadata);
    // Enter edit mode first so any subsequent restore-to-input event from the interrupt can't
    // clobber the edit buffer. Use the compaction builder to preserve attachments/reviews.
    startEditingMessage(buildEditingStateFromCompaction(compactionRequestMsg.id, command, followUpContent));
    // Interrupt stream with abandonPartial flag
    // Backend detects this and skips compaction (Ctrl+C flow)
    await client.workspace.interruptStream({
        workspaceId,
        options: { abandonPartial: true },
    });
    return true;
}
//# sourceMappingURL=handler.js.map