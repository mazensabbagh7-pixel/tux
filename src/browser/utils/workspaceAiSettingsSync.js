const pendingAiSettingsByWorkspace = new Map();
function getPendingKey(workspaceId, agentId) {
    return `${workspaceId}:${agentId}`;
}
export function markPendingWorkspaceAiSettings(workspaceId, agentId, settings) {
    if (!workspaceId || !agentId) {
        return;
    }
    pendingAiSettingsByWorkspace.set(getPendingKey(workspaceId, agentId), settings);
}
export function clearPendingWorkspaceAiSettings(workspaceId, agentId) {
    if (!workspaceId || !agentId) {
        return;
    }
    pendingAiSettingsByWorkspace.delete(getPendingKey(workspaceId, agentId));
}
export function shouldApplyWorkspaceAiSettingsFromBackend(workspaceId, agentId, incoming) {
    if (!workspaceId || !agentId) {
        return true;
    }
    const key = getPendingKey(workspaceId, agentId);
    const pending = pendingAiSettingsByWorkspace.get(key);
    if (!pending) {
        return true;
    }
    const matches = pending.model === incoming.model && pending.thinkingLevel === incoming.thinkingLevel;
    if (matches) {
        pendingAiSettingsByWorkspace.delete(key);
        return true;
    }
    return false;
}
//# sourceMappingURL=workspaceAiSettingsSync.js.map