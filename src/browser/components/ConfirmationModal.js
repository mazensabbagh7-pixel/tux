import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, WarningBox, WarningTitle, WarningText, } from "@/browser/components/ui/dialog";
import { Button } from "@/browser/components/ui/button";
/**
 * Reusable confirmation modal for destructive actions
 */
export const ConfirmationModal = (props) => {
    const [isConfirming, setIsConfirming] = useState(false);
    // Extract callbacks to satisfy exhaustive-deps rule
    const onConfirm = props.onConfirm;
    const onCancel = props.onCancel;
    const handleConfirm = useCallback(async () => {
        if (isConfirming)
            return;
        setIsConfirming(true);
        try {
            await onConfirm();
        }
        finally {
            setIsConfirming(false);
        }
    }, [isConfirming, onConfirm]);
    const handleOpenChange = useCallback((open) => {
        if (!open && !isConfirming) {
            onCancel();
        }
    }, [isConfirming, onCancel]);
    return (_jsx(Dialog, { open: props.isOpen, onOpenChange: handleOpenChange, children: _jsxs(DialogContent, { maxWidth: "450px", showCloseButton: false, children: [_jsxs(DialogHeader, { children: [_jsx(DialogTitle, { children: props.title }), props.description && _jsx(DialogDescription, { children: props.description })] }), props.warning && (_jsxs(WarningBox, { children: [_jsx(WarningTitle, { children: "Warning" }), _jsx(WarningText, { children: props.warning })] })), _jsxs(DialogFooter, { className: "justify-center", children: [_jsx(Button, { variant: "secondary", onClick: onCancel, disabled: isConfirming, children: props.cancelLabel ?? "Cancel" }), _jsx(Button, { variant: "destructive", onClick: () => void handleConfirm(), disabled: isConfirming, children: isConfirming ? "Processing..." : (props.confirmLabel ?? "Confirm") })] })] }) }));
};
//# sourceMappingURL=ConfirmationModal.js.map