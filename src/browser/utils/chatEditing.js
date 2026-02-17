import { getEditableUserMessageText } from "@/browser/utils/messages/messageUtils";
export const normalizeQueuedMessage = (queued) => ({
    content: queued.content,
    fileParts: queued.fileParts ?? [],
    reviews: queued.reviews ?? [],
});
export const buildPendingFromDisplayed = (message) => ({
    content: getEditableUserMessageText(message),
    fileParts: message.fileParts ?? [],
    reviews: message.reviews ?? [],
});
export const buildPendingFromContent = (content) => ({
    content,
    fileParts: [],
    reviews: [],
});
export const buildEditingStateFromDisplayed = (message) => ({
    id: message.historyId,
    pending: buildPendingFromDisplayed(message),
});
export const buildEditingStateFromContent = (messageId, content) => ({
    id: messageId,
    pending: buildPendingFromContent(content),
});
/**
 * Build editing state from a compaction command and its follow-up content.
 * Preserves file attachments and reviews that would be sent after compaction completes.
 */
export const buildEditingStateFromCompaction = (messageId, command, followUp) => ({
    id: messageId,
    pending: {
        content: command,
        fileParts: followUp?.fileParts ?? [],
        reviews: followUp?.reviews ?? [],
    },
});
//# sourceMappingURL=chatEditing.js.map