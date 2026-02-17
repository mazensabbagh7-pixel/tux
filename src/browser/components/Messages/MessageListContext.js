import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useContext } from "react";
const MessageListContext = createContext(null);
export const MessageListProvider = (props) => {
    return (_jsx(MessageListContext.Provider, { value: props.value, children: props.children }));
};
export function useOptionalMessageListContext() {
    return useContext(MessageListContext);
}
export function useMessageListContext() {
    const context = useContext(MessageListContext);
    if (!context) {
        throw new Error("useMessageListContext must be used within MessageListProvider");
    }
    return context;
}
//# sourceMappingURL=MessageListContext.js.map