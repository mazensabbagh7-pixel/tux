import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, } from "@/browser/components/ui/dialog";
import { Button } from "@/browser/components/ui/button";
export const StartHereModal = ({ isOpen, onClose, onConfirm }) => {
    const [isExecuting, setIsExecuting] = useState(false);
    const handleCancel = useCallback(() => {
        if (!isExecuting) {
            onClose();
        }
    }, [isExecuting, onClose]);
    const handleConfirm = useCallback(async () => {
        if (isExecuting)
            return;
        setIsExecuting(true);
        try {
            await onConfirm();
            onClose();
        }
        catch (error) {
            console.error("Start Here error:", error);
            setIsExecuting(false);
        }
    }, [isExecuting, onConfirm, onClose]);
    const handleOpenChange = useCallback((open) => {
        if (!open && !isExecuting) {
            handleCancel();
        }
    }, [isExecuting, handleCancel]);
    return (_jsx(Dialog, { open: isOpen, onOpenChange: handleOpenChange, children: _jsxs(DialogContent, { showCloseButton: false, children: [_jsxs(DialogHeader, { children: [_jsx(DialogTitle, { children: "Start Here" }), _jsx(DialogDescription, { children: "This will start a new context from this message and preserve earlier chat history." })] }), _jsxs(DialogFooter, { className: "justify-center", children: [_jsx(Button, { variant: "secondary", onClick: handleCancel, disabled: isExecuting, children: "Cancel" }), _jsx(Button, { onClick: () => void handleConfirm(), disabled: isExecuting, children: isExecuting ? "Starting..." : "OK" })] })] }) }));
};
//# sourceMappingURL=StartHereModal.js.map