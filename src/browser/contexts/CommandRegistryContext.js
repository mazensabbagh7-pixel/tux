import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useCallback, useContext, useMemo, useState } from "react";
const CommandRegistryContext = createContext(null);
export function useCommandRegistry() {
    const ctx = useContext(CommandRegistryContext);
    if (!ctx)
        throw new Error("useCommandRegistry must be used within CommandRegistryProvider");
    return ctx;
}
const RECENT_STORAGE_KEY = "commandPalette:recent";
export const CommandRegistryProvider = ({ children }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [initialQuery, setInitialQuery] = useState("");
    const [sources, setSources] = useState(new Set());
    const [recent, setRecent] = useState(() => {
        try {
            const raw = localStorage.getItem(RECENT_STORAGE_KEY);
            const parsed = raw ? JSON.parse(raw) : [];
            return Array.isArray(parsed) ? parsed.slice(0, 20) : [];
        }
        catch {
            return [];
        }
    });
    const persistRecent = useCallback((next) => {
        setRecent(next);
        try {
            localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(next.slice(0, 20)));
        }
        catch {
            /* ignore persistence errors */
        }
    }, []);
    const addRecent = useCallback((actionId) => {
        // Move to front, dedupe
        const next = [actionId, ...recent.filter((id) => id !== actionId)].slice(0, 20);
        persistRecent(next);
    }, [recent, persistRecent]);
    const open = useCallback((query) => {
        setInitialQuery(query ?? "");
        setIsOpen(true);
    }, []);
    const close = useCallback(() => setIsOpen(false), []);
    const registerSource = useCallback((source) => {
        setSources((prev) => new Set(prev).add(source));
        return () => setSources((prev) => {
            const copy = new Set(prev);
            copy.delete(source);
            return copy;
        });
    }, []);
    const getActions = useCallback(() => {
        const all = [];
        for (const s of sources) {
            try {
                const actions = s();
                for (const a of actions) {
                    if (a.visible && !a.visible())
                        continue;
                    all.push(a);
                }
            }
            catch (e) {
                console.error("Command source error:", e);
            }
        }
        return all;
    }, [sources]);
    const value = useMemo(() => ({
        isOpen,
        initialQuery,
        open,
        close,
        registerSource,
        getActions,
        addRecent,
        recent,
    }), [isOpen, initialQuery, open, close, registerSource, getActions, addRecent, recent]);
    return (_jsx(CommandRegistryContext.Provider, { value: value, children: children }));
};
//# sourceMappingURL=CommandRegistryContext.js.map