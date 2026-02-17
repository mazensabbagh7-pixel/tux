import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, } from "@/browser/components/ui/dialog";
import { Button } from "@/browser/components/ui/button";
const AUTH_TOKEN_STORAGE_KEY = "mux:auth-token";
export function getStoredAuthToken() {
    try {
        return localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
    }
    catch {
        return null;
    }
}
export function setStoredAuthToken(token) {
    try {
        localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
    }
    catch {
        // Ignore storage errors
    }
}
export function clearStoredAuthToken() {
    try {
        localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
    }
    catch {
        // Ignore storage errors
    }
}
export function AuthTokenModal(props) {
    const [token, setToken] = useState("");
    const { onSubmit } = props;
    const handleSubmit = useCallback((e) => {
        e.preventDefault();
        if (token.trim()) {
            setStoredAuthToken(token.trim());
            onSubmit(token.trim());
        }
    }, [token, onSubmit]);
    // This modal cannot be dismissed without providing a token
    const handleOpenChange = useCallback(() => {
        // Do nothing - modal cannot be closed without submitting
    }, []);
    return (_jsx(Dialog, { open: props.isOpen, onOpenChange: handleOpenChange, children: _jsxs(DialogContent, { showCloseButton: false, children: [_jsxs(DialogHeader, { children: [_jsx(DialogTitle, { children: "Authentication Required" }), _jsx(DialogDescription, { children: "This server requires an authentication token. Enter the token provided when the server was started." })] }), _jsxs("form", { onSubmit: handleSubmit, className: "flex flex-col gap-4", children: [props.error && (_jsx("div", { className: "bg-error-bg text-error rounded p-2 px-3 text-[13px]", children: props.error })), _jsx("input", { type: "password", value: token, onChange: (e) => setToken(e.target.value), placeholder: "Enter auth token", autoFocus: true, className: "bg-modal-bg border-border-medium focus:border-accent placeholder:text-muted text-foreground rounded border px-3 py-2.5 text-sm focus:outline-none" }), _jsx(DialogFooter, { className: "pt-0", children: _jsx(Button, { type: "submit", disabled: !token.trim(), className: "w-full", children: "Connect" }) })] })] }) }));
}
//# sourceMappingURL=AuthTokenModal.js.map