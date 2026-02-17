import assert from "@/common/utils/assert";
/**
 * Reserved fields that may be injected into tool results for model-only consumption.
 *
 * IMPORTANT: These fields MUST be stripped before persisting tool outputs to disk or
 * sending them to the UI.
 */
export const MODEL_ONLY_TOOL_NOTIFICATIONS_FIELD = "__mux_notifications";
export function attachModelOnlyToolNotifications(result, notifications) {
    assert(Array.isArray(notifications), "notifications must be an array");
    if (notifications.length === 0) {
        return result;
    }
    if (!result || typeof result !== "object" || Array.isArray(result)) {
        return result;
    }
    const record = result;
    const existing = record[MODEL_ONLY_TOOL_NOTIFICATIONS_FIELD];
    const merged = Array.isArray(existing)
        ? [
            ...existing.filter((item) => typeof item === "string"),
            ...notifications,
        ]
        : notifications;
    return {
        ...record,
        [MODEL_ONLY_TOOL_NOTIFICATIONS_FIELD]: merged,
    };
}
/**
 * Strip model-only fields from tool results before persisting them to history/partial.
 */
export function stripInternalToolResultFields(result) {
    if (!result || typeof result !== "object" || Array.isArray(result)) {
        return result;
    }
    if (!(MODEL_ONLY_TOOL_NOTIFICATIONS_FIELD in result)) {
        return result;
    }
    const { [MODEL_ONLY_TOOL_NOTIFICATIONS_FIELD]: _notifications, ...rest } = result;
    void _notifications;
    return rest;
}
//# sourceMappingURL=internalToolResultFields.js.map