/**
 * Safe JSON.stringify variant for *local* token counting.
 *
 * This is used for UI stats/weighting (Tokenizer tab, truncation heuristics),
 * not for provider payloads.
 *
 * The goal is to keep the serialized output stable-ish while redacting heavy
 * blobs (notably base64-encoded screenshots).
 */
const DATA_URL_BASE64_MARKER = ";base64,";
function redactDataUrl(value) {
    if (!value.startsWith("data:")) {
        return null;
    }
    const markerIndex = value.indexOf(DATA_URL_BASE64_MARKER);
    if (markerIndex === -1) {
        return null;
    }
    const mime = value.slice("data:".length, markerIndex) || "<unknown>";
    const base64Len = value.length - (markerIndex + DATA_URL_BASE64_MARKER.length);
    return `data:${mime}${DATA_URL_BASE64_MARKER}[omitted len=${base64Len}]`;
}
function isAiSdkMediaBlock(value) {
    if (value === null || typeof value !== "object") {
        return false;
    }
    const record = value;
    return (record.type === "media" &&
        typeof record.data === "string" &&
        typeof record.mediaType === "string");
}
export function safeStringifyForCounting(data) {
    try {
        const seen = new WeakSet();
        return JSON.stringify(data, (_key, value) => {
            if (typeof value === "string") {
                return redactDataUrl(value) ?? value;
            }
            if (isAiSdkMediaBlock(value)) {
                return {
                    ...value,
                    data: `[omitted base64 len=${value.data.length}]`,
                };
            }
            if (value !== null && typeof value === "object") {
                if (seen.has(value)) {
                    return "[circular]";
                }
                seen.add(value);
            }
            return value;
        });
    }
    catch {
        return "[unserializable]";
    }
}
//# sourceMappingURL=safeStringifyForCounting.js.map