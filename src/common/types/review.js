/**
 * Types for code review system
 */
function parseNumberRange(rangeText) {
    const match = /^(\d+)(?:-(\d+))?$/.exec(rangeText.trim());
    if (!match)
        return null;
    const startNum = Number(match[1]);
    const endNum = match[2] ? Number(match[2]) : startNum;
    if (!Number.isFinite(startNum) || !Number.isFinite(endNum))
        return null;
    return {
        start: Math.min(startNum, endNum),
        end: Math.max(startNum, endNum),
    };
}
/**
 * Parse a ReviewNoteData.lineRange string into numeric old/new ranges.
 *
 * Supports:
 * - Current format: "-10-12 +14-16", "-10 +14", "-10", "+14-16"
 * - Legacy format: "42" or "42-45" (treated as both old and new)
 */
export function parseReviewLineRange(lineRange) {
    const tokens = lineRange.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0)
        return null;
    let oldRange;
    let newRange;
    for (const token of tokens) {
        if (token.startsWith("-") && token.length > 1) {
            const parsed = parseNumberRange(token.slice(1));
            if (parsed)
                oldRange = parsed;
            continue;
        }
        if (token.startsWith("+") && token.length > 1) {
            const parsed = parseNumberRange(token.slice(1));
            if (parsed)
                newRange = parsed;
            continue;
        }
        // Legacy: range without +/- prefix. Treat as matching either old or new line numbers.
        const legacyRange = parseNumberRange(token);
        if (legacyRange) {
            oldRange ?? (oldRange = legacyRange);
            newRange ?? (newRange = legacyRange);
        }
    }
    if (!oldRange && !newRange)
        return null;
    return {
        old: oldRange,
        new: newRange,
    };
}
/**
 * Format a ReviewNoteData into the message format for the model.
 * Used when preparing reviews for sending to chat.
 */
export function formatReviewForModel(data) {
    return `<review>\nRe ${data.filePath}:${data.lineRange}\n\`\`\`\n${data.selectedCode}\n\`\`\`\n> ${data.userNote.trim()}\n</review>`;
}
//# sourceMappingURL=review.js.map