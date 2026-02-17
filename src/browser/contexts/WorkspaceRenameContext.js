import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useContext, useState, useCallback } from "react";
const RenameContext = createContext(null);
export const RenameProvider = ({ children, onRenameWorkspace }) => {
    const [editingWorkspaceId, setEditingWorkspaceId] = useState(null);
    const [originalName, setOriginalName] = useState("");
    const requestRename = useCallback((workspaceId, currentName) => {
        // Only allow one workspace to be edited at a time
        if (editingWorkspaceId !== null && editingWorkspaceId !== workspaceId) {
            return false;
        }
        setEditingWorkspaceId(workspaceId);
        setOriginalName(currentName);
        return true;
    }, [editingWorkspaceId]);
    const confirmRename = useCallback(async (workspaceId, newName) => {
        const trimmedName = newName.trim();
        // Short-circuit if name hasn't changed
        if (trimmedName === originalName) {
            setEditingWorkspaceId(null);
            setOriginalName("");
            return { success: true };
        }
        if (!trimmedName) {
            return { success: false, error: "Name cannot be empty" };
        }
        const result = await onRenameWorkspace(workspaceId, trimmedName);
        if (result.success) {
            setEditingWorkspaceId(null);
            setOriginalName("");
        }
        return result;
    }, [originalName, onRenameWorkspace]);
    const cancelRename = useCallback(() => {
        setEditingWorkspaceId(null);
        setOriginalName("");
    }, []);
    const value = {
        editingWorkspaceId,
        requestRename,
        confirmRename,
        cancelRename,
    };
    return _jsx(RenameContext.Provider, { value: value, children: children });
};
export const useRename = () => {
    const context = useContext(RenameContext);
    if (!context) {
        throw new Error("useRename must be used within a RenameProvider");
    }
    return context;
};
//# sourceMappingURL=WorkspaceRenameContext.js.map