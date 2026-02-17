import assert from "@/common/utils/assert";
import { log } from "@/node/services/log";
export class NotificationEngine {
    constructor(sources) {
        this.seenContents = new Set();
        assert(Array.isArray(sources), "sources must be an array");
        this.sources = sources;
    }
    async pollAfterToolCall(ctx) {
        const results = [];
        for (const source of this.sources) {
            try {
                const notifications = await source.poll(ctx);
                for (const notification of notifications) {
                    if (!notification?.content)
                        continue;
                    if (this.seenContents.has(notification.content))
                        continue;
                    this.seenContents.add(notification.content);
                    results.push(notification.content);
                }
            }
            catch (error) {
                const ctorName = source.constructor?.name;
                const sourceName = typeof ctorName === "string" ? ctorName : "unknown";
                log.debug("[NotificationEngine] poll failed", {
                    error,
                    source: sourceName,
                });
            }
        }
        return results;
    }
}
//# sourceMappingURL=NotificationEngine.js.map