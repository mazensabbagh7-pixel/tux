import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useContext } from "react";
import { CHAT_UI_FEATURE_IDS, } from "@/common/constants/chatUiFeatures";
const DEFAULT_CHAT_UI_SUPPORT = CHAT_UI_FEATURE_IDS.reduce((acc, featureId) => {
    acc[featureId] = "supported";
    return acc;
}, {});
const ChatHostContext = createContext({
    uiSupport: DEFAULT_CHAT_UI_SUPPORT,
    actions: {},
});
export function ChatHostContextProvider(props) {
    return _jsx(ChatHostContext.Provider, { value: props.value, children: props.children });
}
export function useChatHostContext() {
    return useContext(ChatHostContext);
}
//# sourceMappingURL=ChatHostContext.js.map