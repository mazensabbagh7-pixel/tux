import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { useRef, useCallback, useState, useEffect } from "react";
import { Menu } from "lucide-react";
import { cn } from "@/common/lib/utils";
import { AgentProvider } from "@/browser/contexts/AgentContext";
import { ThinkingProvider } from "@/browser/contexts/ThinkingContext";
import { ChatInput } from "./ChatInput/index";
import { ProjectMCPOverview } from "./ProjectMCPOverview";
import { ArchivedWorkspaces } from "./ArchivedWorkspaces";
import { useAPI } from "@/browser/contexts/API";
import { isWorkspaceArchived } from "@/common/utils/archive";
import { GitInitBanner } from "./GitInitBanner";
import { ConfiguredProvidersBar } from "./ConfiguredProvidersBar";
import { ConfigureProvidersPrompt } from "./ConfigureProvidersPrompt";
import { useProvidersConfig } from "@/browser/hooks/useProvidersConfig";
import { AgentsInitBanner } from "./AgentsInitBanner";
import { usePersistedState, updatePersistedState, readPersistedState, } from "@/browser/hooks/usePersistedState";
import { getAgentIdKey, getAgentsInitNudgeKey, getArchivedWorkspacesKey, getDraftScopeId, getInputKey, getPendingScopeId, getProjectScopeId, } from "@/common/constants/storage";
import { Button } from "@/browser/components/ui/button";
import { Skeleton } from "@/browser/components/ui/skeleton";
import { isDesktopMode } from "@/browser/hooks/useDesktopTitlebar";
/** Compare archived workspace lists by ID set (order doesn't matter for equality) */
function archivedListsEqual(prev, next) {
    if (prev.length !== next.length)
        return false;
    const prevIds = new Set(prev.map((w) => w.id));
    return next.every((w) => prevIds.has(w.id));
}
/** Check if any provider is configured (uses backend-computed isConfigured) */
function hasConfiguredProvider(config) {
    if (!config)
        return false;
    return Object.values(config).some((provider) => provider?.isConfigured);
}
/**
 * Project page shown when a project is selected but no workspace is active.
 * Combines workspace creation with archived workspaces view.
 */
export const ProjectPage = ({ projectPath, projectName, leftSidebarCollapsed, onToggleLeftSidebarCollapsed, pendingDraftId, pendingSectionId, onWorkspaceCreated, }) => {
    const { api } = useAPI();
    const chatInputRef = useRef(null);
    const pendingAgentsInitSendRef = useRef(false);
    // Initialize from localStorage cache to avoid flash when archived workspaces appear
    const [archivedWorkspaces, setArchivedWorkspaces] = useState(() => readPersistedState(getArchivedWorkspacesKey(projectPath), []));
    const [showAgentsInitNudge, setShowAgentsInitNudge] = usePersistedState(getAgentsInitNudgeKey(projectPath), false, { listener: true });
    const { config: providersConfig, loading: providersLoading } = useProvidersConfig();
    const hasProviders = hasConfiguredProvider(providersConfig);
    const shouldShowAgentsInitBanner = !providersLoading && hasProviders && showAgentsInitNudge;
    // Git repository state for the banner
    const [branchesLoaded, setBranchesLoaded] = useState(false);
    const [hasBranches, setHasBranches] = useState(true); // Assume git repo until proven otherwise
    const [branchRefreshKey, setBranchRefreshKey] = useState(0);
    // Load branches to determine if this is a git repository.
    // Uses local cancelled flag (not ref) to handle StrictMode double-renders correctly.
    useEffect(() => {
        if (!api)
            return;
        let cancelled = false;
        (async () => {
            // Don't reset branchesLoaded - it starts false, becomes true after first load.
            // This keeps banner mounted during refetch so success message stays visible.
            try {
                const result = await api.projects.listBranches({ projectPath });
                if (cancelled)
                    return;
                setHasBranches(result.branches.length > 0);
            }
            catch (err) {
                console.error("Failed to load branches:", err);
                if (cancelled)
                    return;
                setHasBranches(true); // On error, don't show banner
            }
            finally {
                if (!cancelled) {
                    setBranchesLoaded(true);
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [api, projectPath, branchRefreshKey]);
    const isNonGitRepo = branchesLoaded && !hasBranches;
    // Trigger branch refetch after git init to verify it worked
    const handleGitInitSuccess = useCallback(() => {
        setBranchRefreshKey((k) => k + 1);
    }, []);
    // Track archived workspaces in a ref; only update state when the list actually changes
    const archivedMapRef = useRef(new Map());
    const syncArchivedState = useCallback(() => {
        const next = Array.from(archivedMapRef.current.values());
        setArchivedWorkspaces((prev) => {
            if (archivedListsEqual(prev, next))
                return prev;
            // Persist to localStorage for optimistic cache on next load
            updatePersistedState(getArchivedWorkspacesKey(projectPath), next);
            return next;
        });
    }, [projectPath]);
    // Fetch archived workspaces for this project on mount
    useEffect(() => {
        if (!api)
            return;
        let cancelled = false;
        const loadArchived = async () => {
            try {
                const allArchived = await api.workspace.list({ archived: true });
                if (cancelled)
                    return;
                const projectArchived = allArchived.filter((w) => w.projectPath === projectPath);
                archivedMapRef.current = new Map(projectArchived.map((w) => [w.id, w]));
                syncArchivedState();
            }
            catch (error) {
                console.error("Failed to load archived workspaces:", error);
            }
        };
        void loadArchived();
        return () => {
            cancelled = true;
        };
    }, [api, projectPath, syncArchivedState]);
    // Subscribe to metadata events to reactively update archived list
    useEffect(() => {
        if (!api)
            return;
        const controller = new AbortController();
        (async () => {
            try {
                const iterator = await api.workspace.onMetadata(undefined, { signal: controller.signal });
                for await (const event of iterator) {
                    if (controller.signal.aborted)
                        break;
                    const meta = event.metadata;
                    // Only care about workspaces in this project
                    if (meta && meta.projectPath !== projectPath)
                        continue;
                    // For deletions, check if it was in our map (i.e., was in this project)
                    if (!meta && !archivedMapRef.current.has(event.workspaceId))
                        continue;
                    const isArchived = meta && isWorkspaceArchived(meta.archivedAt, meta.unarchivedAt);
                    if (isArchived) {
                        archivedMapRef.current.set(meta.id, meta);
                    }
                    else {
                        archivedMapRef.current.delete(event.workspaceId);
                    }
                    syncArchivedState();
                }
            }
            catch (err) {
                if (!controller.signal.aborted) {
                    console.error("Failed to subscribe to metadata for archived workspaces:", err);
                }
            }
        })();
        return () => controller.abort();
    }, [api, projectPath, syncArchivedState]);
    const didAutoFocusRef = useRef(false);
    const handleDismissAgentsInit = useCallback(() => {
        setShowAgentsInitNudge(false);
    }, [setShowAgentsInitNudge]);
    const handleRunAgentsInit = useCallback(() => {
        // Switch project-scope mode to exec.
        updatePersistedState(getAgentIdKey(getProjectScopeId(projectPath)), "exec");
        // Run the /init skill and start the creation chat.
        if (chatInputRef.current) {
            chatInputRef.current.restoreText("/init");
            requestAnimationFrame(() => {
                void chatInputRef.current?.send();
            });
        }
        else {
            pendingAgentsInitSendRef.current = true;
            const pendingScopeId = typeof pendingDraftId === "string" && pendingDraftId.trim().length > 0
                ? getDraftScopeId(projectPath, pendingDraftId)
                : getPendingScopeId(projectPath);
            updatePersistedState(getInputKey(pendingScopeId), "/init");
        }
        setShowAgentsInitNudge(false);
    }, [projectPath, pendingDraftId, setShowAgentsInitNudge]);
    const handleChatReady = useCallback((api) => {
        chatInputRef.current = api;
        if (pendingAgentsInitSendRef.current) {
            pendingAgentsInitSendRef.current = false;
            didAutoFocusRef.current = true;
            api.restoreText("/init");
            requestAnimationFrame(() => {
                void api.send();
            });
            return;
        }
        // Auto-focus the prompt once when entering the creation screen.
        // Defensive: avoid re-focusing on unrelated re-renders (e.g. workspace list updates),
        // which can move the user's caret.
        if (didAutoFocusRef.current) {
            return;
        }
        didAutoFocusRef.current = true;
        api.focus();
    }, []);
    return (_jsx(AgentProvider, { projectPath: projectPath, children: _jsx(ThinkingProvider, { projectPath: projectPath, children: _jsxs("div", { className: "bg-dark relative flex flex-1 flex-col overflow-hidden", children: [_jsx("div", { className: cn("bg-sidebar border-border-light mobile-sticky-header flex shrink-0 items-center border-b px-2 [@media(max-width:768px)]:h-auto [@media(max-width:768px)]:py-2", isDesktopMode() ? "h-10 titlebar-drag" : "h-8"), children: leftSidebarCollapsed && (_jsx(Button, { variant: "ghost", size: "icon", onClick: onToggleLeftSidebarCollapsed, title: "Open sidebar", "aria-label": "Open sidebar menu", className: cn("hidden mobile-menu-btn h-6 w-6 shrink-0 text-muted hover:text-foreground", isDesktopMode() && "titlebar-no-drag"), children: _jsx(Menu, { className: "h-4 w-4" }) })) }), _jsxs("div", { className: "min-h-0 flex-1 overflow-y-auto", children: [_jsx("div", { className: "flex min-h-[50vh] flex-col items-center justify-center px-4 py-6", children: _jsxs("div", { className: "flex w-full max-w-3xl flex-col gap-4", children: [isNonGitRepo && (_jsx(GitInitBanner, { projectPath: projectPath, onSuccess: handleGitInitSuccess })), !providersLoading && !hasProviders ? (_jsx(ConfigureProvidersPrompt, {})) : (_jsxs(_Fragment, { children: [shouldShowAgentsInitBanner && (_jsx(AgentsInitBanner, { onRunInit: handleRunAgentsInit, onDismiss: handleDismissAgentsInit })), providersLoading ? (
                                                // Skeleton placeholder matching ConfiguredProvidersBar height
                                                _jsx("div", { className: "flex items-center justify-center gap-2 py-1.5", children: _jsx(Skeleton, { className: "h-7 w-32" }) })) : (hasProviders &&
                                                    providersConfig && (_jsx(ConfiguredProvidersBar, { providersConfig: providersConfig }))), _jsx(ChatInput
                                                // Key by draft so switching drafts fully resets ephemeral UI state (and avoids
                                                // draft A's "creating workspace" overlay leaking into draft B).
                                                , { variant: "creation", projectPath: projectPath, projectName: projectName, pendingSectionId: pendingSectionId, pendingDraftId: pendingDraftId, onReady: handleChatReady, onWorkspaceCreated: onWorkspaceCreated }, pendingDraftId ?? "__pending__")] }))] }) }), _jsx("div", { className: "flex justify-center px-4 pb-4", children: _jsx("div", { className: "w-full max-w-3xl", children: _jsx(ProjectMCPOverview, { projectPath: projectPath }) }) }), archivedWorkspaces.length > 0 && (_jsx("div", { className: "flex justify-center px-4 pb-4", children: _jsx("div", { className: "w-full max-w-3xl", children: _jsx(ArchivedWorkspaces, { projectPath: projectPath, projectName: projectName, workspaces: archivedWorkspaces, onWorkspacesChanged: () => {
                                            // Refresh archived list after unarchive/delete
                                            if (!api)
                                                return;
                                            void api.workspace.list({ archived: true }).then((all) => {
                                                setArchivedWorkspaces(all.filter((w) => w.projectPath === projectPath));
                                            });
                                        } }) }) }))] })] }) }) }));
};
//# sourceMappingURL=ProjectPage.js.map