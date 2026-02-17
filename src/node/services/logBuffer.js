import { MAX_LOG_ENTRIES } from "@/common/constants/ui";
const buffer = [];
let epoch = 0;
const listeners = new Set();
const subscriberLevels = new Map();
export function pushLogEntry(entry) {
    buffer.push(entry);
    if (buffer.length > MAX_LOG_ENTRIES) {
        buffer.shift();
    }
    const appendEvent = { type: "append", epoch, entry };
    for (const listener of listeners) {
        listener(appendEvent);
    }
}
export function getRecentLogs() {
    return [...buffer];
}
export function getEpoch() {
    return epoch;
}
export function subscribeLogFeed(listener, requestedLevel) {
    listeners.add(listener);
    if (requestedLevel) {
        subscriberLevels.set(listener, requestedLevel);
    }
    return {
        snapshot: { epoch, entries: [...buffer] },
        unsubscribe: () => {
            listeners.delete(listener);
            subscriberLevels.delete(listener);
        },
    };
}
export function clearLogEntries() {
    buffer.length = 0;
    epoch += 1;
    const resetEvent = { type: "reset", epoch };
    for (const listener of listeners) {
        listener(resetEvent);
    }
}
export function onLogEntry(listener, requestedLevel) {
    listeners.add(listener);
    if (requestedLevel) {
        subscriberLevels.set(listener, requestedLevel);
    }
    return () => {
        listeners.delete(listener);
        subscriberLevels.delete(listener);
    };
}
export function hasDebugSubscriber() {
    for (const level of subscriberLevels.values()) {
        if (level === "debug") {
            return true;
        }
    }
    return false;
}
//# sourceMappingURL=logBuffer.js.map