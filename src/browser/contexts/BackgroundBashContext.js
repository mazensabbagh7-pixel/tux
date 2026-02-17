import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useContext, useMemo } from "react";
import { usePopoverError } from "@/browser/hooks/usePopoverError";
import { useBackgroundBashStoreRaw } from "@/browser/stores/BackgroundBashStore";
const BackgroundBashActionsContext = createContext(undefined);
const BackgroundBashErrorContext = createContext(undefined);
export const BackgroundBashProvider = (props) => {
    const store = useBackgroundBashStoreRaw();
    const error = usePopoverError();
    const actions = useMemo(() => ({
        terminate: (processId) => {
            store.terminate(props.workspaceId, processId).catch((err) => {
                error.showError(processId, err.message);
            });
        },
        sendToBackground: (toolCallId) => {
            store.sendToBackground(props.workspaceId, toolCallId).catch((err) => {
                error.showError(`send-to-background-${toolCallId}`, err.message);
            });
        },
        autoBackgroundOnSend: () => {
            store.autoBackgroundOnSend(props.workspaceId);
        },
    }), [error, props.workspaceId, store]);
    return (_jsx(BackgroundBashActionsContext.Provider, { value: actions, children: _jsx(BackgroundBashErrorContext.Provider, { value: error, children: props.children }) }));
};
export function useBackgroundBashActions() {
    const context = useContext(BackgroundBashActionsContext);
    if (!context) {
        throw new Error("useBackgroundBashActions must be used within BackgroundBashProvider");
    }
    return context;
}
export function useBackgroundBashError() {
    const context = useContext(BackgroundBashErrorContext);
    if (!context) {
        throw new Error("useBackgroundBashError must be used within BackgroundBashProvider");
    }
    return context;
}
//# sourceMappingURL=BackgroundBashContext.js.map