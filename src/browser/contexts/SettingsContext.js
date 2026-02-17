import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useRouter } from "@/browser/contexts/RouterContext";
const SettingsContext = createContext(null);
export function useSettings() {
    const ctx = useContext(SettingsContext);
    if (!ctx)
        throw new Error("useSettings must be used within SettingsProvider");
    return ctx;
}
const DEFAULT_SECTION = "general";
export function SettingsProvider(props) {
    const router = useRouter();
    const [providersExpandedProvider, setProvidersExpandedProvider] = useState(null);
    const isOpen = router.currentSettingsSection != null;
    const activeSection = router.currentSettingsSection ?? DEFAULT_SECTION;
    const open = useCallback((section, options) => {
        const nextSection = section ?? DEFAULT_SECTION;
        if (nextSection === "providers") {
            setProvidersExpandedProvider(options?.expandProvider ?? null);
        }
        else {
            setProvidersExpandedProvider(null);
        }
        router.navigateToSettings(nextSection);
    }, [router]);
    const close = useCallback(() => {
        setProvidersExpandedProvider(null);
        router.navigateFromSettings();
    }, [router]);
    const setActiveSection = useCallback((section) => {
        if (section !== "providers") {
            setProvidersExpandedProvider(null);
        }
        router.navigateToSettings(section);
    }, [router]);
    const value = useMemo(() => ({
        isOpen,
        activeSection,
        open,
        close,
        setActiveSection,
        providersExpandedProvider,
        setProvidersExpandedProvider,
    }), [isOpen, activeSection, open, close, setActiveSection, providersExpandedProvider]);
    return _jsx(SettingsContext.Provider, { value: value, children: props.children });
}
//# sourceMappingURL=SettingsContext.js.map