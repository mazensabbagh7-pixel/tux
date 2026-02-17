import { jsx as _jsx } from "react/jsx-runtime";
/**
 * React context for TerminalSessionRouter.
 *
 * Provides centralized terminal session management to all TerminalView components.
 * Must be wrapped inside APIProvider since it depends on the API client.
 */
import { createContext, useContext, useEffect, useState } from "react";
import { useAPI } from "@/browser/contexts/API";
import { TerminalSessionRouter } from "./TerminalSessionRouter";
const TerminalRouterContext = createContext(null);
/**
 * Provides TerminalSessionRouter to the component tree.
 *
 * Creates a single router instance that lives for the lifetime of the provider.
 * The router is recreated if the API client changes (e.g., reconnection).
 *
 * Always renders children so the app UI stays visible during reconnection.
 * The router may be null when API is unavailable; consumers must handle this.
 */
export function TerminalRouterProvider(props) {
    const { api } = useAPI();
    const [router, setRouter] = useState(null);
    useEffect(() => {
        if (!api) {
            setRouter(null);
            return;
        }
        // Create/cleanup after commit to avoid render-time disposal in concurrent mode.
        const nextRouter = new TerminalSessionRouter(api);
        setRouter(nextRouter);
        return () => {
            nextRouter.dispose();
        };
    }, [api]);
    const routerForContext = api && router?.getApi() === api ? router : null;
    // Always render children - the router may be null during reconnection.
    // Consumers (useTerminalRouter) must handle the null case gracefully.
    return (_jsx(TerminalRouterContext.Provider, { value: routerForContext, children: props.children }));
}
/**
 * Hook to access the TerminalSessionRouter.
 *
 * Returns null when the API is disconnected (e.g., during reconnection).
 * Callers should handle the null case gracefully.
 *
 * @throws If used outside of TerminalRouterProvider
 */
export function useTerminalRouter() {
    return useContext(TerminalRouterContext);
}
//# sourceMappingURL=TerminalRouterContext.js.map