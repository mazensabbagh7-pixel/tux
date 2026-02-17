import { usePersistedState, readPersistedState, updatePersistedState, } from "@/browser/hooks/usePersistedState";
import { getAutoRetryKey } from "@/common/constants/storage";
import { WORKSPACE_DEFAULTS } from "@/constants/workspaceDefaults";
export function useAutoRetryPreference(workspaceId) {
    return usePersistedState(getAutoRetryKey(workspaceId), WORKSPACE_DEFAULTS.autoRetry, {
        listener: true,
    });
}
export function readAutoRetryPreference(workspaceId) {
    return readPersistedState(getAutoRetryKey(workspaceId), WORKSPACE_DEFAULTS.autoRetry);
}
export function setAutoRetryPreference(workspaceId, value) {
    updatePersistedState(getAutoRetryKey(workspaceId), value);
}
export function enableAutoRetryPreference(workspaceId) {
    setAutoRetryPreference(workspaceId, true);
}
export function disableAutoRetryPreference(workspaceId) {
    setAutoRetryPreference(workspaceId, false);
}
//# sourceMappingURL=autoRetryPreference.js.map