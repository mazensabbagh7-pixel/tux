import { readPersistedState } from "@/browser/hooks/usePersistedState";
function isRecord(value) {
    return typeof value === "object" && value !== null;
}
function isChatAttachment(value) {
    if (!isRecord(value))
        return false;
    return (typeof value.id === "string" &&
        typeof value.url === "string" &&
        typeof value.mediaType === "string" &&
        (value.filename === undefined || typeof value.filename === "string"));
}
export function parsePersistedChatAttachments(raw) {
    if (!Array.isArray(raw)) {
        return [];
    }
    const attachments = [];
    for (const item of raw) {
        if (!isChatAttachment(item)) {
            return [];
        }
        attachments.push({
            id: item.id,
            url: item.url,
            mediaType: item.mediaType,
            filename: item.filename,
        });
    }
    return attachments;
}
export function readPersistedChatAttachments(attachmentsKey) {
    return parsePersistedChatAttachments(readPersistedState(attachmentsKey, []));
}
export function estimatePersistedChatAttachmentsChars(attachments) {
    return JSON.stringify(attachments).length;
}
//# sourceMappingURL=draftAttachmentsStorage.js.map