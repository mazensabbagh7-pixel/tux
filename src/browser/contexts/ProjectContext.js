import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, } from "react";
import { useAPI } from "@/browser/contexts/API";
import { readPersistedState, updatePersistedState } from "@/browser/hooks/usePersistedState";
import { WORKSPACE_DRAFTS_BY_PROJECT_KEY, deleteWorkspaceStorage, getDraftScopeId, } from "@/common/constants/storage";
const ProjectContext = createContext(undefined);
function deriveProjectName(projectPath) {
    if (!projectPath) {
        return "Project";
    }
    const segments = projectPath.split(/[\\/]/).filter(Boolean);
    return segments[segments.length - 1] ?? projectPath;
}
export function ProjectProvider(props) {
    const { api } = useAPI();
    const [projects, setProjects] = useState(new Map());
    const [loading, setLoading] = useState(true);
    const [isProjectCreateModalOpen, setProjectCreateModalOpen] = useState(false);
    const [workspaceModalState, setWorkspaceModalState] = useState({
        isOpen: false,
        projectPath: null,
        projectName: "",
        branches: [],
        defaultTrunkBranch: undefined,
        loadErrorMessage: null,
        isLoading: false,
    });
    const workspaceModalProjectRef = useRef(null);
    // Used to guard against refreshProjects() races.
    //
    // Example: the initial refresh (on mount) can start before a workspace fork, then
    // resolve after a fork-triggered refresh. Without this guard, the stale response
    // could overwrite the newer project list and make the forked workspace disappear
    // from the sidebar again.
    const projectsRefreshSeqRef = useRef(0);
    const latestAppliedProjectsRefreshSeqRef = useRef(0);
    const refreshProjects = useCallback(async () => {
        if (!api)
            return;
        const refreshSeq = projectsRefreshSeqRef.current + 1;
        projectsRefreshSeqRef.current = refreshSeq;
        try {
            const projectsList = await api.projects.list();
            // Ignore out-of-date refreshes so an older response can't clobber a newer success.
            if (refreshSeq < latestAppliedProjectsRefreshSeqRef.current) {
                return;
            }
            latestAppliedProjectsRefreshSeqRef.current = refreshSeq;
            setProjects(new Map(projectsList));
        }
        catch (error) {
            // Ignore out-of-date refreshes so an older error can't clobber a newer success.
            if (refreshSeq < latestAppliedProjectsRefreshSeqRef.current) {
                return;
            }
            // Keep the previous project list on error to avoid emptying the sidebar.
            console.error("Failed to load projects:", error);
        }
    }, [api]);
    useEffect(() => {
        void (async () => {
            await refreshProjects();
            setLoading(false);
        })();
    }, [refreshProjects]);
    const addProject = useCallback((normalizedPath, projectConfig) => {
        setProjects((prev) => {
            const next = new Map(prev);
            next.set(normalizedPath, projectConfig);
            return next;
        });
    }, []);
    const removeProject = useCallback(async (path) => {
        if (!api)
            return { success: false, error: "API not connected" };
        try {
            const result = await api.projects.remove({ projectPath: path });
            if (result.success) {
                setProjects((prev) => {
                    const next = new Map(prev);
                    next.delete(path);
                    return next;
                });
                // Clean up any UI-only workspace drafts for this project.
                const draftsValue = readPersistedState(WORKSPACE_DRAFTS_BY_PROJECT_KEY, {});
                if (draftsValue && typeof draftsValue === "object") {
                    const record = draftsValue;
                    const drafts = record[path];
                    if (drafts !== undefined) {
                        if (Array.isArray(drafts)) {
                            for (const draft of drafts) {
                                if (!draft || typeof draft !== "object")
                                    continue;
                                const draftId = draft.draftId;
                                if (typeof draftId === "string" && draftId.trim().length > 0) {
                                    deleteWorkspaceStorage(getDraftScopeId(path, draftId));
                                }
                            }
                        }
                        updatePersistedState(WORKSPACE_DRAFTS_BY_PROJECT_KEY, (prev) => {
                            const next = prev && typeof prev === "object" ? { ...prev } : {};
                            delete next[path];
                            return next;
                        }, {});
                    }
                }
                return { success: true };
            }
            else {
                console.error("Failed to remove project:", result.error);
                return { success: false, error: result.error };
            }
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error("Failed to remove project:", errorMessage);
            return { success: false, error: errorMessage };
        }
    }, [api]);
    const getBranchesForProject = useCallback(async (projectPath) => {
        if (!api) {
            return { branches: [], recommendedTrunk: "" };
        }
        const branchResult = await api.projects.listBranches({ projectPath });
        const branches = branchResult.branches;
        const sanitizedBranches = Array.isArray(branches)
            ? branches.filter((branch) => typeof branch === "string")
            : [];
        const recommended = typeof branchResult?.recommendedTrunk === "string" &&
            sanitizedBranches.includes(branchResult.recommendedTrunk)
            ? branchResult.recommendedTrunk
            : (sanitizedBranches[0] ?? "");
        return {
            branches: sanitizedBranches,
            recommendedTrunk: recommended,
        };
    }, [api]);
    const openWorkspaceModal = useCallback(async (projectPath, options) => {
        const projectName = options?.projectName ?? deriveProjectName(projectPath);
        workspaceModalProjectRef.current = projectPath;
        setWorkspaceModalState((prev) => ({
            ...prev,
            isOpen: true,
            projectPath,
            projectName,
            branches: [],
            defaultTrunkBranch: undefined,
            loadErrorMessage: null,
            isLoading: true,
        }));
        try {
            const { branches, recommendedTrunk } = await getBranchesForProject(projectPath);
            if (workspaceModalProjectRef.current !== projectPath) {
                return;
            }
            setWorkspaceModalState((prev) => ({
                ...prev,
                branches,
                defaultTrunkBranch: recommendedTrunk ?? undefined,
                loadErrorMessage: null,
                isLoading: false,
            }));
        }
        catch (error) {
            console.error("Failed to load branches for project:", error);
            if (workspaceModalProjectRef.current !== projectPath) {
                return;
            }
            const errorMessage = error instanceof Error ? error.message : "Failed to load branches for project";
            setWorkspaceModalState((prev) => ({
                ...prev,
                branches: [],
                defaultTrunkBranch: undefined,
                loadErrorMessage: errorMessage,
                isLoading: false,
            }));
        }
    }, [getBranchesForProject]);
    const closeWorkspaceModal = useCallback(() => {
        workspaceModalProjectRef.current = null;
        setWorkspaceModalState({
            isOpen: false,
            projectPath: null,
            projectName: "",
            branches: [],
            defaultTrunkBranch: undefined,
            loadErrorMessage: null,
            isLoading: false,
        });
    }, []);
    const getSecrets = useCallback(async (projectPath) => {
        if (!api)
            return [];
        return await api.secrets.get({ projectPath });
    }, [api]);
    const updateSecrets = useCallback(async (projectPath, secrets) => {
        if (!api)
            return;
        const result = await api.secrets.update({ projectPath, secrets });
        if (!result.success) {
            console.error("Failed to update secrets:", result.error);
        }
    }, [api]);
    // Section operations
    const createSection = useCallback(async (projectPath, name, color) => {
        if (!api)
            return { success: false, error: "API not connected" };
        const result = await api.projects.sections.create({ projectPath, name, color });
        if (result.success) {
            await refreshProjects();
        }
        return result;
    }, [api, refreshProjects]);
    const updateSection = useCallback(async (projectPath, sectionId, updates) => {
        if (!api)
            return { success: false, error: "API not connected" };
        const result = await api.projects.sections.update({ projectPath, sectionId, ...updates });
        if (result.success) {
            await refreshProjects();
        }
        return result;
    }, [api, refreshProjects]);
    const removeSection = useCallback(async (projectPath, sectionId) => {
        if (!api)
            return { success: false, error: "API not connected" };
        const result = await api.projects.sections.remove({ projectPath, sectionId });
        if (result.success) {
            await refreshProjects();
        }
        return result;
    }, [api, refreshProjects]);
    const reorderSections = useCallback(async (projectPath, sectionIds) => {
        if (!api)
            return { success: false, error: "API not connected" };
        const result = await api.projects.sections.reorder({ projectPath, sectionIds });
        if (result.success) {
            await refreshProjects();
        }
        return result;
    }, [api, refreshProjects]);
    const assignWorkspaceToSection = useCallback(async (projectPath, workspaceId, sectionId) => {
        if (!api)
            return { success: false, error: "API not connected" };
        const result = await api.projects.sections.assignWorkspace({
            projectPath,
            workspaceId,
            sectionId,
        });
        if (result.success) {
            await refreshProjects();
        }
        return result;
    }, [api, refreshProjects]);
    const value = useMemo(() => ({
        projects,
        loading,
        refreshProjects,
        addProject,
        removeProject,
        isProjectCreateModalOpen,
        openProjectCreateModal: () => setProjectCreateModalOpen(true),
        closeProjectCreateModal: () => setProjectCreateModalOpen(false),
        workspaceModalState,
        openWorkspaceModal,
        closeWorkspaceModal,
        getBranchesForProject,
        getSecrets,
        updateSecrets,
        createSection,
        updateSection,
        removeSection,
        reorderSections,
        assignWorkspaceToSection,
    }), [
        projects,
        loading,
        refreshProjects,
        addProject,
        removeProject,
        isProjectCreateModalOpen,
        workspaceModalState,
        openWorkspaceModal,
        closeWorkspaceModal,
        getBranchesForProject,
        getSecrets,
        updateSecrets,
        createSection,
        updateSection,
        removeSection,
        reorderSections,
        assignWorkspaceToSection,
    ]);
    return _jsx(ProjectContext.Provider, { value: value, children: props.children });
}
export function useProjectContext() {
    const context = useContext(ProjectContext);
    if (!context) {
        throw new Error("useProjectContext must be used within ProjectProvider");
    }
    return context;
}
//# sourceMappingURL=ProjectContext.js.map