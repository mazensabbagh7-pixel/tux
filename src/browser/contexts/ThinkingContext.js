import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useContext, useEffect, useMemo, useCallback } from "react";
import { THINKING_LEVEL_OFF } from "@/common/types/thinking";
import { readPersistedState, updatePersistedState, usePersistedState, } from "@/browser/hooks/usePersistedState";
import { getAgentIdKey, getModelKey, getProjectScopeId, getThinkingLevelByModelKey, getThinkingLevelKey, getWorkspaceAISettingsByAgentKey, GLOBAL_SCOPE_ID, } from "@/common/constants/storage";
import { getDefaultModel } from "@/browser/hooks/useModelsFromSettings";
import { migrateGatewayModel } from "@/browser/hooks/useGatewayModels";
import { enforceThinkingPolicy, getThinkingPolicyForModel } from "@/common/utils/thinking/policy";
import { useAPI } from "@/browser/contexts/API";
import { clearPendingWorkspaceAiSettings, markPendingWorkspaceAiSettings, } from "@/browser/utils/workspaceAiSettingsSync";
import { KEYBINDS, matchesKeybind } from "@/browser/utils/ui/keybinds";
const ThinkingContext = createContext(undefined);
function getScopeId(workspaceId, projectPath) {
    return workspaceId ?? (projectPath ? getProjectScopeId(projectPath) : GLOBAL_SCOPE_ID);
}
function getCanonicalModelForScope(scopeId, fallbackModel) {
    const rawModel = readPersistedState(getModelKey(scopeId), fallbackModel);
    return migrateGatewayModel(rawModel || fallbackModel);
}
export const ThinkingProvider = (props) => {
    const { api } = useAPI();
    const defaultModel = getDefaultModel();
    const scopeId = getScopeId(props.workspaceId, props.projectPath);
    const thinkingKey = getThinkingLevelKey(scopeId);
    // Workspace-scoped thinking. (No longer per-model.)
    const [thinkingLevel, setThinkingLevelInternal] = usePersistedState(thinkingKey, THINKING_LEVEL_OFF, { listener: true });
    // One-time migration: if the new workspace-scoped key is missing, seed from the legacy per-model key.
    useEffect(() => {
        const existing = readPersistedState(thinkingKey, undefined);
        if (existing !== undefined) {
            return;
        }
        const model = getCanonicalModelForScope(scopeId, defaultModel);
        const legacyKey = getThinkingLevelByModelKey(model);
        const legacy = readPersistedState(legacyKey, undefined);
        if (legacy === undefined) {
            return;
        }
        updatePersistedState(thinkingKey, legacy);
    }, [defaultModel, scopeId, thinkingKey]);
    const setThinkingLevel = useCallback((level) => {
        const model = getCanonicalModelForScope(scopeId, defaultModel);
        setThinkingLevelInternal(level);
        // Workspace variant: persist to backend so settings follow the workspace across devices.
        if (!props.workspaceId) {
            return;
        }
        const workspaceId = props.workspaceId;
        const normalizedAgentId = readPersistedState(getAgentIdKey(scopeId), "exec").trim().toLowerCase() || "exec";
        updatePersistedState(getWorkspaceAISettingsByAgentKey(workspaceId), (prev) => {
            const record = prev && typeof prev === "object" ? prev : {};
            return {
                ...record,
                [normalizedAgentId]: { model, thinkingLevel: level },
            };
        }, {});
        if (!api) {
            return;
        }
        // Avoid stale backend metadata clobbering newer local preferences when users
        // click through levels quickly (tests reproduce this by cycling to xhigh).
        markPendingWorkspaceAiSettings(workspaceId, normalizedAgentId, {
            model,
            thinkingLevel: level,
        });
        api.workspace
            .updateAgentAISettings({
            workspaceId,
            agentId: normalizedAgentId,
            aiSettings: { model, thinkingLevel: level },
        })
            .then((result) => {
            if (!result.success) {
                clearPendingWorkspaceAiSettings(workspaceId, normalizedAgentId);
            }
        })
            .catch(() => {
            clearPendingWorkspaceAiSettings(workspaceId, normalizedAgentId);
            // Best-effort only. If offline or backend is old, the next sendMessage will persist.
        });
    }, [api, defaultModel, props.workspaceId, scopeId, setThinkingLevelInternal]);
    // Global keybind: cycle thinking level (Ctrl/Cmd+Shift+T).
    // Implemented at the ThinkingProvider level so it works in both the workspace view
    // and the "New Workspace" creation screen (which doesn't mount AIView).
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (!matchesKeybind(e, KEYBINDS.TOGGLE_THINKING)) {
                return;
            }
            e.preventDefault();
            const model = getCanonicalModelForScope(scopeId, defaultModel);
            const allowed = getThinkingPolicyForModel(model);
            if (allowed.length <= 1) {
                return;
            }
            const effectiveThinkingLevel = enforceThinkingPolicy(model, thinkingLevel);
            const currentIndex = allowed.indexOf(effectiveThinkingLevel);
            const nextIndex = (currentIndex + 1) % allowed.length;
            setThinkingLevel(allowed[nextIndex]);
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [defaultModel, scopeId, thinkingLevel, setThinkingLevel]);
    // Memoize context value to prevent unnecessary re-renders of consumers.
    const contextValue = useMemo(() => ({ thinkingLevel, setThinkingLevel }), [thinkingLevel, setThinkingLevel]);
    return _jsx(ThinkingContext.Provider, { value: contextValue, children: props.children });
};
export const useThinking = () => {
    const context = useContext(ThinkingContext);
    if (!context) {
        throw new Error("useThinking must be used within a ThinkingProvider");
    }
    return context;
};
//# sourceMappingURL=ThinkingContext.js.map