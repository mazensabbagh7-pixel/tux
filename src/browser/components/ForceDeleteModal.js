import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, ErrorSection, ErrorLabel, ErrorCodeBlock, WarningBox, WarningTitle, WarningText, } from "@/browser/components/ui/dialog";
import { Button } from "@/browser/components/ui/button";
export const ForceDeleteModal = ({ isOpen, workspaceId, error, onClose, onForceDelete, }) => {
    const [isDeleting, setIsDeleting] = useState(false);
    const handleForceDelete = () => {
        setIsDeleting(true);
        void (async () => {
            try {
                await onForceDelete(workspaceId);
                onClose();
            }
            catch (err) {
                console.error("Force delete failed:", err);
            }
            finally {
                setIsDeleting(false);
            }
        })();
    };
    const handleOpenChange = useCallback((open) => {
        if (!open && !isDeleting) {
            onClose();
        }
    }, [isDeleting, onClose]);
    return (_jsx(Dialog, { open: isOpen, onOpenChange: handleOpenChange, children: _jsxs(DialogContent, { maxWidth: "600px", maxHeight: "90vh", showCloseButton: false, children: [_jsxs(DialogHeader, { children: [_jsx(DialogTitle, { children: "Force Delete Workspace?" }), _jsx(DialogDescription, { children: "The workspace could not be removed normally" })] }), _jsxs(ErrorSection, { children: [_jsx(ErrorLabel, { children: "Git Error" }), _jsx(ErrorCodeBlock, { children: error })] }), _jsxs(WarningBox, { children: [_jsx(WarningTitle, { children: "This action cannot be undone" }), _jsxs(WarningText, { children: ["Force deleting will permanently remove the workspace and its local branch, and", " ", error.includes("unpushed commits:")
                                    ? "discard the unpushed commits shown above"
                                    : "may discard uncommitted work or lose data", ". This action cannot be undone."] })] }), _jsxs(DialogFooter, { className: "justify-center", children: [_jsx(Button, { variant: "secondary", onClick: onClose, disabled: isDeleting, children: "Cancel" }), _jsx(Button, { variant: "destructive", onClick: handleForceDelete, disabled: isDeleting, children: isDeleting ? "Deleting..." : "Force Delete" })] })] }) }));
};
//# sourceMappingURL=ForceDeleteModal.js.map