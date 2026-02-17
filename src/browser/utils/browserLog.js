const MAX_ENTRIES = 500;
const entries = [];
const listeners = new Set();
// Preserve originals so DevTools still works
const originalConsole = {
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    debug: console.debug.bind(console),
};
const LEVEL_MAP = {
    log: "info",
    warn: "warn",
    error: "error",
    debug: "debug",
};
/** Call once at renderer entry (e.g. src/browser/main.tsx), before createRoot. */
export function installBrowserLogCapture() {
    for (const method of ["log", "warn", "error", "debug"]) {
        console[method] = (...args) => {
            originalConsole[method](...args); // pass through to DevTools
            const message = args
                .map((a) => {
                if (typeof a === "string")
                    return a;
                try {
                    return JSON.stringify(a);
                }
                catch {
                    return String(a);
                }
            })
                .join(" ");
            const entry = {
                timestamp: Date.now(),
                level: LEVEL_MAP[method],
                message,
            };
            entries.push(entry);
            if (entries.length > MAX_ENTRIES)
                entries.shift();
            for (const listener of listeners)
                listener(entry);
        };
    }
}
export function onBrowserLogEntry(listener) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}
export function getRecentBrowserLogs() {
    return [...entries];
}
//# sourceMappingURL=browserLog.js.map