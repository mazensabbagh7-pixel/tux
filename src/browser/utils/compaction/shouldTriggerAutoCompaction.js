/**
 * Determines if auto-compaction should trigger based on usage check result.
 * Used by ChatInput to decide whether to auto-compact before sending a message.
 */
export function shouldTriggerAutoCompaction(autoCompactionCheck, isCompacting, isEditing, hasQueuedCompaction) {
    if (!autoCompactionCheck)
        return false;
    if (isCompacting)
        return false;
    if (isEditing)
        return false;
    // Don't trigger auto-compaction if there's already a /compact queued
    if (hasQueuedCompaction)
        return false;
    return autoCompactionCheck.usagePercentage >= autoCompactionCheck.thresholdPercentage;
}
//# sourceMappingURL=shouldTriggerAutoCompaction.js.map