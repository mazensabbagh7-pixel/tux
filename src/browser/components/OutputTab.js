import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useReducer, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { useAPI } from "@/browser/contexts/API";
import { usePersistedState } from "@/browser/hooks/usePersistedState";
import { isAbortError } from "@/browser/utils/isAbortError";
import { MAX_LOG_ENTRIES } from "@/common/constants/ui";
function reduceLogState(state, event) {
    switch (event.type) {
        case "snapshot":
            return {
                epoch: event.epoch,
                entries: event.entries,
            };
        case "append": {
            if (event.epoch !== state.epoch) {
                return state;
            }
            const merged = [...state.entries, ...event.entries];
            return {
                epoch: state.epoch,
                entries: merged.length > MAX_LOG_ENTRIES ? merged.slice(-MAX_LOG_ENTRIES) : merged,
            };
        }
        case "reset":
            return {
                epoch: event.epoch,
                entries: [],
            };
    }
}
const LOG_LEVELS = ["debug", "info", "warn", "error"];
export function OutputTab(_props) {
    const { api } = useAPI();
    const [logState, dispatch] = useReducer(reduceLogState, {
        epoch: 0,
        entries: [],
    });
    const [levelFilter, setLevelFilter] = usePersistedState("output-tab-level", "info");
    const [autoScroll, setAutoScroll] = useState(true);
    const scrollRef = useRef(null);
    useEffect(() => {
        if (!api)
            return;
        const controller = new AbortController();
        const { signal } = controller;
        let iterator = null;
        void (async () => {
            try {
                const subscribedIterator = await api.general.subscribeLogs({ level: levelFilter }, { signal });
                // oRPC iterators don’t eagerly close. If we’re already aborted, explicitly close.
                if (signal.aborted) {
                    void subscribedIterator.return?.();
                    return;
                }
                iterator = subscribedIterator;
                for await (const event of subscribedIterator) {
                    if (signal.aborted)
                        break;
                    dispatch(event);
                }
            }
            catch (error) {
                if (signal.aborted || isAbortError(error))
                    return;
                console.warn("Log subscription error:", error);
            }
        })();
        return () => {
            controller.abort();
            void iterator?.return?.();
        };
    }, [api, levelFilter]);
    // Auto-scroll on new entries when the user is at the bottom.
    useEffect(() => {
        if (!autoScroll)
            return;
        if (!scrollRef.current)
            return;
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, [logState.entries, autoScroll]);
    const handleScroll = (e) => {
        const el = e.currentTarget;
        const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 20;
        setAutoScroll(isAtBottom);
    };
    const handleDelete = () => {
        if (!api) {
            dispatch({ type: "reset", epoch: 0 });
            return;
        }
        api.general
            .clearLogs()
            .then((result) => {
            if (!result.success) {
                console.warn("Log files could not be fully deleted:", result.error);
            }
        })
            .catch((error) => {
            console.warn("Failed to delete logs:", error);
        });
    };
    return (_jsxs("div", { className: "flex h-full flex-col", children: [_jsxs("div", { className: "border-border flex items-center gap-2 border-b px-3 py-1.5", children: [_jsx(LevelFilterDropdown, { value: levelFilter, onChange: setLevelFilter }), _jsx("button", { type: "button", className: "text-muted hover:text-foreground hover:bg-hover flex h-6 w-6 items-center justify-center rounded border-none bg-transparent p-0 transition-colors", onClick: handleDelete, title: "Delete", "aria-label": "Delete output logs", children: _jsx(Trash2, { className: "h-3.5 w-3.5" }) })] }), _jsx("div", { ref: scrollRef, onScroll: handleScroll, className: "flex-1 overflow-y-auto font-mono text-xs", children: logState.entries.map((entry, i) => (_jsx(LogLine, { entry: entry }, i))) })] }));
}
function LevelFilterDropdown(props) {
    return (_jsxs("label", { className: "text-muted flex items-center gap-2 text-xs", children: [_jsx("span", { children: "Level" }), _jsx("select", { className: "border-border bg-background-secondary hover:bg-hover h-7 rounded border px-2 py-1 text-xs", value: props.value, onChange: (e) => {
                    const next = e.currentTarget.value;
                    if (LOG_LEVELS.includes(next)) {
                        props.onChange(next);
                    }
                }, children: LOG_LEVELS.map((level) => (_jsx("option", { value: level, children: level }, level))) })] }));
}
function LogLine(props) {
    const { entry } = props;
    const levelColor = entry.level === "error"
        ? "var(--color-error)"
        : entry.level === "warn"
            ? "var(--color-warning)"
            : entry.level === "debug"
                ? "var(--color-muted-foreground)"
                : "var(--color-foreground)";
    // Inline flow layout — wraps naturally at any panel width instead of
    // forcing fixed-width columns that crush the message content.
    return (_jsxs("div", { className: "hover:bg-hover px-3 py-0.5 break-words", children: [_jsx("span", { className: "text-muted-foreground", children: formatTime(entry.timestamp) }), " ", _jsx("span", { style: { color: levelColor }, children: entry.level.toUpperCase() }), " ", _jsxs("span", { className: "text-muted-foreground", children: ["[", shortenLocation(entry.location), "]"] }), " ", _jsx("span", { children: entry.message })] }));
}
/** Strip common path prefixes to show just the meaningful part. e.g.
 *  "src/node/services/log.ts:486" → "log.ts:486"
 *  "/home/user/.mux/src/cmux/.../log.ts:486" → "log.ts:486"  */
function shortenLocation(location) {
    // Grab the last path segment (filename:line)
    const lastSlash = location.lastIndexOf("/");
    if (lastSlash >= 0) {
        return location.slice(lastSlash + 1);
    }
    return location;
}
function formatTime(timestampMs) {
    const date = new Date(timestampMs);
    const hh = String(date.getHours()).padStart(2, "0");
    const mm = String(date.getMinutes()).padStart(2, "0");
    const ss = String(date.getSeconds()).padStart(2, "0");
    const ms = String(date.getMilliseconds()).padStart(3, "0");
    return `${hh}:${mm}:${ss}.${ms}`;
}
//# sourceMappingURL=OutputTab.js.map