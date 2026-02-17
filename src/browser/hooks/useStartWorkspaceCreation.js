import { useCallback, useEffect } from "react";
import { CUSTOM_EVENTS } from "@/common/constants/events";
import { updatePersistedState } from "@/browser/hooks/usePersistedState";
import { getInputKey, getModelKey, getPendingScopeId, getProjectScopeId, getTrunkBranchKey, } from "@/common/constants/storage";
export function getFirstProjectPath(projects) {
    const iterator = projects.keys().next();
    return iterator.done ? null : iterator.value;
}
export function persistWorkspaceCreationPrefill(projectPath, detail, persist = updatePersistedState) {
    if (!detail) {
        return;
    }
    if (detail.startMessage !== undefined) {
        persist(getInputKey(getPendingScopeId(projectPath)), detail.startMessage);
    }
    if (detail.model !== undefined) {
        persist(getModelKey(getProjectScopeId(projectPath)), detail.model);
    }
    if (detail.trunkBranch !== undefined) {
        const normalizedTrunk = detail.trunkBranch.trim();
        persist(getTrunkBranchKey(projectPath), normalizedTrunk.length > 0 ? normalizedTrunk : undefined);
    }
    // Note: runtime is intentionally NOT persisted here - it's a one-time override.
    // The default runtime can only be changed via the icon selector.
}
function resolveProjectPath(projects, requestedPath) {
    if (projects.has(requestedPath)) {
        return requestedPath;
    }
    return getFirstProjectPath(projects);
}
export function useStartWorkspaceCreation({ projects, beginWorkspaceCreation, }) {
    const startWorkspaceCreation = useCallback((projectPath, detail) => {
        const resolvedProjectPath = resolveProjectPath(projects, projectPath);
        if (!resolvedProjectPath) {
            console.warn("No projects available for workspace creation");
            return;
        }
        persistWorkspaceCreationPrefill(resolvedProjectPath, detail);
        beginWorkspaceCreation(resolvedProjectPath);
    }, [projects, beginWorkspaceCreation]);
    useEffect(() => {
        const handleStartCreation = (event) => {
            const customEvent = event;
            const detail = customEvent.detail;
            if (!detail?.projectPath) {
                console.warn("START_WORKSPACE_CREATION event missing projectPath detail");
                return;
            }
            startWorkspaceCreation(detail.projectPath, detail);
        };
        window.addEventListener(CUSTOM_EVENTS.START_WORKSPACE_CREATION, handleStartCreation);
        return () => window.removeEventListener(CUSTOM_EVENTS.START_WORKSPACE_CREATION, handleStartCreation);
    }, [startWorkspaceCreation]);
    return startWorkspaceCreation;
}
//# sourceMappingURL=useStartWorkspaceCreation.js.map