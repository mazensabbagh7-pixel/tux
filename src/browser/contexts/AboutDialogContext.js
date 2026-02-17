import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useContext, useState } from "react";
const AboutDialogContext = createContext(null);
export function useAboutDialog() {
    const ctx = useContext(AboutDialogContext);
    if (!ctx)
        throw new Error("useAboutDialog must be used within AboutDialogProvider");
    return ctx;
}
export function AboutDialogProvider(props) {
    const [isOpen, setIsOpen] = useState(false);
    return (_jsx(AboutDialogContext.Provider, { value: {
            isOpen,
            open: () => setIsOpen(true),
            close: () => setIsOpen(false),
        }, children: props.children }));
}
//# sourceMappingURL=AboutDialogContext.js.map