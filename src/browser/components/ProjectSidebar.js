import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import React, { useState, useEffect, useCallback } from "react";
import { VERSION } from "@/version";
import { cn } from "@/common/lib/utils";
import { isDesktopMode } from "@/browser/hooks/useDesktopTitlebar";
import MuxLogoDark from "@/browser/assets/logos/mux-logo-dark.svg?react";
import MuxLogoLight from "@/browser/assets/logos/mux-logo-light.svg?react";
import { useTheme } from "@/browser/contexts/ThemeContext";
import { usePersistedState } from "@/browser/hooks/usePersistedState";
import { useDebouncedValue } from "@/browser/hooks/useDebouncedValue";
import { useWorkspaceFallbackModel } from "@/browser/hooks/useWorkspaceFallbackModel";
import { useWorkspaceUnread } from "@/browser/hooks/useWorkspaceUnread";
import { useWorkspaceStoreRaw } from "@/browser/stores/WorkspaceStore";
import { EXPANDED_PROJECTS_KEY, getDraftScopeId, getInputKey, getWorkspaceNameStateKey, } from "@/common/constants/storage";
import { getDisplayTitleFromPersistedState } from "@/browser/hooks/useWorkspaceName";
import { DndProvider } from "react-dnd";
import { HTML5Backend, getEmptyImage } from "react-dnd-html5-backend";
import { useDrag, useDrop, useDragLayer } from "react-dnd";
import { sortProjectsByOrder, reorderProjects, normalizeOrder, } from "@/common/utils/projectOrdering";
import { matchesKeybind, formatKeybind, KEYBINDS } from "@/browser/utils/ui/keybinds";
import { PlatformPaths } from "@/common/utils/paths";
import { partitionWorkspacesByAge, partitionWorkspacesBySection, formatDaysThreshold, AGE_THRESHOLDS_DAYS, computeWorkspaceDepthMap, findNextNonEmptyTier, getTierKey, getSectionExpandedKey, getSectionTierKey, sortSectionsByLinkedList, } from "@/browser/utils/ui/workspaceFiltering";
import { Tooltip, TooltipTrigger, TooltipContent } from "./ui/tooltip";
import { ConfirmationModal } from "./ConfirmationModal";
import SecretsModal from "./SecretsModal";
import { WorkspaceListItem } from "./WorkspaceListItem";
import { WorkspaceStatusIndicator } from "./WorkspaceStatusIndicator";
import { RenameProvider } from "@/browser/contexts/WorkspaceRenameContext";
import { useProjectContext } from "@/browser/contexts/ProjectContext";
import { ChevronRight, MessageCircle, KeyRound, PanelLeftClose, PanelLeftOpen, Plus, Trash2, MoreVertical } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { MUX_HELP_CHAT_WORKSPACE_ID } from "@/common/constants/muxChat";
import { useWorkspaceActions } from "@/browser/contexts/WorkspaceContext";
import { useRouter } from "@/browser/contexts/RouterContext";
import { usePopoverError } from "@/browser/hooks/usePopoverError";
import { PopoverError } from "./PopoverError";
import { SectionHeader } from "./SectionHeader";
import { resolveSectionColor } from "@/common/constants/ui";
import { Button } from "@/browser/components/ui/button";
import { SettingsButton } from "./SettingsButton";
import { WorkspaceSectionDropZone } from "./WorkspaceSectionDropZone";
import { WorkspaceDragLayer } from "./WorkspaceDragLayer";
import { SectionDragLayer } from "./SectionDragLayer";
import { DraggableSection } from "./DraggableSection";
// Draggable project item moved to module scope to avoid remounting on every parent render.
// Defining components inside another component causes a new function identity each render,
// which forces React to unmount/remount the subtree. That led to hover flicker and high CPU.
/**
 * Compact button for opening Chat with Mux, showing an unread dot when there are
 * new messages since the user last viewed the workspace.
 */
const MuxChatHelpButton = ({ onClick, isSelected }) => {
    const { isUnread: hasUnread } = useWorkspaceUnread(MUX_HELP_CHAT_WORKSPACE_ID);
    const isUnread = hasUnread && !isSelected;
    return (_jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsxs(Button, { variant: "ghost", size: "icon", onClick: onClick, className: "border-border-light text-muted-foreground hover:border-border-medium/80 hover:bg-toggle-bg/70 relative h-5 w-5 border", "aria-label": "Open Chat with Mux", children: [_jsx(MessageCircle, { className: "h-3.5 w-3.5" }), isUnread && (_jsx("span", { className: "bg-accent absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full", "aria-label": "Unread messages" }))] }) }), _jsx(TooltipContent, { side: "bottom", children: "Chat with Mux" })] }));
};
// Keep the project header visible while scrolling through long workspace lists.
const PROJECT_ITEM_BASE_CLASS = "sticky top-0 z-10 py-2 pl-2 pr-2 flex items-center border-l-transparent bg-sidebar transition-colors duration-150";
function getProjectItemClassName(opts) {
    return cn(PROJECT_ITEM_BASE_CLASS, "group", opts.isDragging ? "cursor-grabbing opacity-35 [&_*]:!cursor-grabbing" : "cursor-pointer", opts.isOver && "bg-accent/[0.08]", opts.selected && "bg-hover border-l-accent", "hover:[&_button]:opacity-100 hover:[&_[data-drag-handle]]:opacity-100");
}
const DraggableProjectItemBase = ({ projectPath, onReorder, children, selected, ...rest }) => {
    const [{ isDragging }, drag, dragPreview] = useDrag(() => ({
        type: "PROJECT",
        item: { type: "PROJECT", projectPath },
        collect: (monitor) => ({ isDragging: monitor.isDragging() }),
    }), [projectPath]);
    // Hide native drag preview; we render a custom preview via DragLayer
    useEffect(() => {
        dragPreview(getEmptyImage(), { captureDraggingState: true });
    }, [dragPreview]);
    const [{ isOver }, drop] = useDrop(() => ({
        accept: "PROJECT",
        drop: (item) => {
            if (item.projectPath !== projectPath) {
                onReorder(item.projectPath, projectPath);
            }
        },
        collect: (monitor) => ({ isOver: monitor.isOver({ shallow: true }) }),
    }), [projectPath, onReorder]);
    return (_jsx("div", { ref: (node) => { drag(drop(node)); }, className: getProjectItemClassName({
            isDragging,
            isOver,
            selected: !!selected,
        }), style: { cursor: 'pointer' }, ...rest, children: children }));
};
const DraggableProjectItem = React.memo(DraggableProjectItemBase, (prev, next) => prev.projectPath === next.projectPath &&
    prev.onReorder === next.onReorder &&
    (prev["aria-expanded"] ?? false) === (next["aria-expanded"] ?? false));
// Debounce delay for sidebar preview updates during typing.
// Prevents constant re-renders while still providing timely feedback.
const DRAFT_PREVIEW_DEBOUNCE_MS = 1000;
function DraftWorkspaceListItemWrapper(props) {
    const scopeId = getDraftScopeId(props.projectPath, props.draftId);
    const [draftPrompt] = usePersistedState(getInputKey(scopeId), "", {
        listener: true,
    });
    const [workspaceNameState] = usePersistedState(getWorkspaceNameStateKey(scopeId), null, {
        listener: true,
    });
    // Debounce the preview values to avoid constant sidebar updates while typing.
    const debouncedPrompt = useDebouncedValue(draftPrompt, DRAFT_PREVIEW_DEBOUNCE_MS);
    const debouncedNameState = useDebouncedValue(workspaceNameState, DRAFT_PREVIEW_DEBOUNCE_MS);
    const workspaceTitle = getDisplayTitleFromPersistedState(debouncedNameState);
    // Collapse whitespace so multi-line prompts show up nicely as a single-line preview.
    const promptPreview = typeof debouncedPrompt === "string" ? debouncedPrompt.trim().replace(/\s+/g, " ") : "";
    const titleText = workspaceTitle.trim().length > 0 ? workspaceTitle.trim() : "Draft";
    return (_jsx(WorkspaceListItem, { variant: "draft", projectPath: props.projectPath, isSelected: props.isSelected, draft: {
            draftId: props.draftId,
            draftNumber: props.draftNumber,
            title: titleText,
            promptPreview,
            onOpen: props.onOpen,
            onDelete: props.onDelete,
        } }));
}
const ProjectDragLayer = () => {
    const dragState = useDragLayer((monitor) => ({
        isDragging: monitor.isDragging(),
        item: monitor.getItem(),
        currentOffset: monitor.getClientOffset(),
    }));
    const isDragging = dragState.isDragging;
    const item = dragState.item;
    const currentOffset = dragState.currentOffset;
    React.useEffect(() => {
        if (!isDragging)
            return;
        const originalBody = document.body.style.cursor;
        const originalHtml = document.documentElement.style.cursor;
        document.body.style.cursor = "grabbing";
        document.documentElement.style.cursor = "grabbing";
        return () => {
            document.body.style.cursor = originalBody;
            document.documentElement.style.cursor = originalHtml;
        };
    }, [isDragging]);
    // Only render for PROJECT type drags (not section reorder)
    if (!isDragging || !currentOffset || !item?.projectPath || item.type !== "PROJECT")
        return null;
    const abbrevPath = PlatformPaths.abbreviate(item.projectPath);
    const { basename } = PlatformPaths.splitAbbreviated(abbrevPath);
    return (_jsx("div", { className: "pointer-events-none fixed inset-0 z-[9999] cursor-grabbing", children: _jsx("div", { style: { transform: `translate(${currentOffset.x + 10}px, ${currentOffset.y + 10}px)` }, children: _jsxs("div", { className: cn(PROJECT_ITEM_BASE_CLASS, "w-fit max-w-64 rounded-sm shadow-lg"), children: [_jsx("span", { className: "text-secondary mr-2 flex h-5 w-5 shrink-0 items-center justify-center", children: _jsx(ChevronRight, { size: 16 }) }), _jsx("div", { className: "flex min-w-0 flex-1 items-center pr-2", children: _jsx("span", { className: "text-foreground truncate text-sm font-semibold", children: basename }) })] }) }) }));
};
function MuxChatStatusIndicator() {
    const fallbackModel = useWorkspaceFallbackModel(MUX_HELP_CHAT_WORKSPACE_ID);
    return (_jsx(WorkspaceStatusIndicator, { workspaceId: MUX_HELP_CHAT_WORKSPACE_ID, fallbackModel: fallbackModel, isCreating: false }));
}
const ProjectSidebarInner = ({ collapsed, onToggleCollapsed, sortedWorkspacesByProject, workspaceRecency, muxChatProjectPath, }) => {
    // Use the narrow actions context — does NOT subscribe to workspaceMetadata
    // changes, preventing the entire sidebar tree from re-rendering on every
    // workspace create/archive/rename.
    const { selectedWorkspace, setSelectedWorkspace: onSelectWorkspace, archiveWorkspace: onArchiveWorkspace, removeWorkspace, renameWorkspace: onRenameWorkspace, refreshWorkspaceMetadata, pendingNewWorkspaceProject, pendingNewWorkspaceDraftId, workspaceDraftsByProject, workspaceDraftPromotionsByProject, createWorkspaceDraft, openWorkspaceDraft, deleteWorkspaceDraft, } = useWorkspaceActions();
    const workspaceStore = useWorkspaceStoreRaw();
    const { navigateToProject } = useRouter();
    // Get project state and operations from context
    const { projects, openProjectCreateModal: onAddProject, removeProject: onRemoveProject, getSecrets: onGetSecrets, updateSecrets: onUpdateSecrets, createSection, updateSection, removeSection, reorderSections, assignWorkspaceToSection, } = useProjectContext();
    // Theme for logo variant
    const { theme } = useTheme();
    const MuxLogo = theme === "dark" || theme.endsWith("-dark") ? MuxLogoDark : MuxLogoLight;
    // Mobile breakpoint for auto-closing sidebar
    const MOBILE_BREAKPOINT = 768;
    // Wrapper to close sidebar on mobile after workspace selection
    const handleSelectWorkspace = useCallback((selection) => {
        onSelectWorkspace(selection);
        if (window.innerWidth <= MOBILE_BREAKPOINT && !collapsed) {
            onToggleCollapsed();
        }
    }, [onSelectWorkspace, collapsed, onToggleCollapsed]);
    // Wrapper to close sidebar on mobile after adding workspace
    const handleAddWorkspace = useCallback((projectPath, sectionId) => {
        createWorkspaceDraft(projectPath, sectionId);
        if (window.innerWidth <= MOBILE_BREAKPOINT && !collapsed) {
            onToggleCollapsed();
        }
    }, [createWorkspaceDraft, collapsed, onToggleCollapsed]);
    // Wrapper to close sidebar on mobile after opening an existing draft
    const handleOpenWorkspaceDraft = useCallback((projectPath, draftId, sectionId) => {
        openWorkspaceDraft(projectPath, draftId, sectionId);
        if (window.innerWidth <= MOBILE_BREAKPOINT && !collapsed) {
            onToggleCollapsed();
        }
    }, [openWorkspaceDraft, collapsed, onToggleCollapsed]);
    const handleOpenMuxChat = useCallback(() => {
        // Read metadata imperatively from the store (no subscription) to avoid
        // making this callback depend on the metadata Map.
        const meta = workspaceStore.getWorkspaceMetadata(MUX_HELP_CHAT_WORKSPACE_ID);
        handleSelectWorkspace(meta
            ? {
                workspaceId: meta.id,
                projectPath: meta.projectPath,
                projectName: meta.projectName,
                namedWorkspacePath: meta.namedWorkspacePath,
            }
            : {
                // Fallback: navigate by ID; metadata will fill in once refreshed.
                workspaceId: MUX_HELP_CHAT_WORKSPACE_ID,
                projectPath: "",
                projectName: "Mux",
                namedWorkspacePath: "",
            });
        if (!meta) {
            refreshWorkspaceMetadata().catch((error) => {
                console.error("Failed to refresh workspace metadata", error);
            });
        }
    }, [handleSelectWorkspace, refreshWorkspaceMetadata, workspaceStore]);
    // Workspace-specific subscriptions moved to WorkspaceListItem component
    // Store as array in localStorage, convert to Set for usage
    const [expandedProjectsArray, setExpandedProjectsArray] = usePersistedState(EXPANDED_PROJECTS_KEY, []);
    // Handle corrupted localStorage data (old Set stored as {}).
    // Use a plain array with .includes() instead of new Set() on every render —
    // the React Compiler cannot stabilize Set allocations (see AGENTS.md).
    // For typical sidebar sizes (< 20 projects) .includes() is equivalent perf.
    const expandedProjectsList = Array.isArray(expandedProjectsArray) ? expandedProjectsArray : [];
    // Track which projects have old workspaces expanded (per-project, per-tier)
    // Key format: getTierKey(projectPath, tierIndex) where tierIndex is 0, 1, 2 for 1/7/30 days
    const [expandedOldWorkspaces, setExpandedOldWorkspaces] = usePersistedState("expandedOldWorkspaces", {});
    // Track which sections are expanded
    const [expandedSections, setExpandedSections] = usePersistedState("expandedSections", {});
    const [archivingWorkspaceIds, setArchivingWorkspaceIds] = useState(new Set());
    const [removingWorkspaceIds, setRemovingWorkspaceIds] = useState(new Set());
    const workspaceArchiveError = usePopoverError();
    const workspaceRemoveError = usePopoverError();
    const [archiveConfirmation, setArchiveConfirmation] = useState(null);
    const projectRemoveError = usePopoverError();
    const sectionRemoveError = usePopoverError();
    const [secretsModalState, setSecretsModalState] = useState(null);
    const getProjectName = (path) => {
        if (!path || typeof path !== "string") {
            return "Unknown";
        }
        return PlatformPaths.getProjectName(path);
    };
    // Use functional update to avoid stale closure issues when clicking rapidly
    const toggleProject = useCallback((projectPath) => {
        setExpandedProjectsArray((prev) => {
            const prevSet = new Set(Array.isArray(prev) ? prev : []);
            if (prevSet.has(projectPath)) {
                prevSet.delete(projectPath);
            }
            else {
                prevSet.add(projectPath);
            }
            return Array.from(prevSet);
        });
    }, [setExpandedProjectsArray]);
    const toggleSection = (projectPath, sectionId) => {
        const key = getSectionExpandedKey(projectPath, sectionId);
        setExpandedSections((prev) => ({
            ...prev,
            [key]: !prev[key],
        }));
    };
    const handleCreateSection = async (projectPath, name) => {
        const result = await createSection(projectPath, name);
        if (result.success) {
            // Auto-expand the new section
            const key = getSectionExpandedKey(projectPath, result.data.id);
            setExpandedSections((prev) => ({ ...prev, [key]: true }));
        }
    };
    const performArchiveWorkspace = useCallback(async (workspaceId, buttonElement) => {
        // Mark workspace as being archived for UI feedback
        setArchivingWorkspaceIds((prev) => new Set(prev).add(workspaceId));
        try {
            const result = await onArchiveWorkspace(workspaceId);
            if (!result.success) {
                const error = result.error ?? "Failed to archive chat";
                let anchor;
                if (buttonElement) {
                    const rect = buttonElement.getBoundingClientRect();
                    anchor = {
                        top: rect.top + window.scrollY,
                        left: rect.right + 10,
                    };
                }
                workspaceArchiveError.showError(workspaceId, error, anchor);
            }
        }
        finally {
            // Clear archiving state
            setArchivingWorkspaceIds((prev) => {
                const next = new Set(prev);
                next.delete(workspaceId);
                return next;
            });
        }
    }, [onArchiveWorkspace, workspaceArchiveError]);
    const hasActiveStream = useCallback((workspaceId) => {
        const aggregator = workspaceStore.getAggregator(workspaceId);
        if (!aggregator)
            return false;
        const hasActiveStreams = aggregator.getActiveStreams().length > 0;
        const isStarting = aggregator.getPendingStreamStartTime() !== null && !hasActiveStreams;
        const awaitingUserQuestion = aggregator.hasAwaitingUserQuestion();
        return (hasActiveStreams || isStarting) && !awaitingUserQuestion;
    }, [workspaceStore]);
    const handleArchiveWorkspace = useCallback(async (workspaceId, buttonElement) => {
        if (hasActiveStream(workspaceId)) {
            // Read metadata imperatively (no subscription) to build the display title.
            const metadata = workspaceStore.getWorkspaceMetadata(workspaceId);
            const displayTitle = metadata?.title ?? metadata?.name ?? workspaceId;
            // Confirm before archiving if a stream is active so users don't interrupt in-progress work.
            setArchiveConfirmation({ workspaceId, displayTitle, buttonElement });
            return;
        }
        await performArchiveWorkspace(workspaceId, buttonElement);
    }, [hasActiveStream, performArchiveWorkspace, workspaceStore]);
    const handleArchiveWorkspaceConfirm = useCallback(async () => {
        if (!archiveConfirmation) {
            return;
        }
        try {
            await performArchiveWorkspace(archiveConfirmation.workspaceId, archiveConfirmation.buttonElement);
        }
        finally {
            setArchiveConfirmation(null);
        }
    }, [archiveConfirmation, performArchiveWorkspace]);
    const handleArchiveWorkspaceCancel = useCallback(() => {
        setArchiveConfirmation(null);
    }, []);
    const handleCancelWorkspaceCreation = useCallback(async (workspaceId) => {
        // Give immediate UI feedback (spinner / disabled row) while deletion is in-flight.
        setRemovingWorkspaceIds((prev) => new Set(prev).add(workspaceId));
        try {
            const result = await removeWorkspace(workspaceId, { force: true });
            if (!result.success) {
                workspaceRemoveError.showError(workspaceId, result.error ?? "Failed to cancel workspace creation");
            }
        }
        finally {
            setRemovingWorkspaceIds((prev) => {
                const next = new Set(prev);
                next.delete(workspaceId);
                return next;
            });
        }
    }, [removeWorkspace, workspaceRemoveError]);
    const handleRemoveSection = async (projectPath, sectionId, buttonElement) => {
        const result = await removeSection(projectPath, sectionId);
        if (!result.success) {
            const error = result.error ?? "Failed to remove section";
            if (buttonElement) {
                const rect = buttonElement.getBoundingClientRect();
                const anchor = {
                    top: rect.top + window.scrollY,
                    left: rect.right + 10,
                };
                sectionRemoveError.showError(sectionId, error, anchor);
            }
            else {
                sectionRemoveError.showError(sectionId, error, { top: 100, left: 100 });
            }
        }
    };
    const handleOpenSecrets = async (projectPath) => {
        const secrets = await onGetSecrets(projectPath);
        setSecretsModalState({
            isOpen: true,
            projectPath,
            projectName: getProjectName(projectPath),
            secrets,
        });
    };
    const handleSaveSecrets = async (secrets) => {
        if (secretsModalState) {
            await onUpdateSecrets(secretsModalState.projectPath, secrets);
        }
    };
    const handleCloseSecrets = () => {
        setSecretsModalState(null);
    };
    // UI preference: project order persists in localStorage
    const [projectOrder, setProjectOrder] = usePersistedState("mux:projectOrder", []);
    // Build a stable signature of the project keys so effects don't fire on Map identity churn
    const projectPathsSignature = React.useMemo(() => {
        // sort to avoid order-related churn
        const keys = Array.from(projects.keys()).sort();
        return keys.join("\u0001"); // use non-printable separator
    }, [projects]);
    // Normalize order when the set of projects changes (not on every parent render)
    useEffect(() => {
        // Skip normalization if projects haven't loaded yet (empty Map on initial render)
        // This prevents clearing projectOrder before projects load from backend
        if (projects.size === 0) {
            return;
        }
        const normalized = normalizeOrder(projectOrder, projects);
        if (normalized.length !== projectOrder.length ||
            normalized.some((p, i) => p !== projectOrder[i])) {
            setProjectOrder(normalized);
        }
        // Only re-run when project keys change (projectPathsSignature captures projects Map keys)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [projectPathsSignature]);
    // Memoize sorted project PATHS (not entries) to avoid capturing stale config objects.
    // Sorting depends only on keys + order; we read configs from the live Map during render.
    const sortedProjectPaths = React.useMemo(() => sortProjectsByOrder(projects, projectOrder).map(([p]) => p), 
    // projectPathsSignature captures projects Map keys
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projectPathsSignature, projectOrder]);
    // Hide the built-in Chat with Mux system project from the normal projects list.
    // We still render the mux-chat workspace as a dedicated pinned row above projects.
    // muxChatProjectPath is pre-computed in App.tsx and passed as a prop so we don't
    // need to subscribe to the WorkspaceMetadataContext here.
    const visibleProjectPaths = React.useMemo(() => muxChatProjectPath
        ? sortedProjectPaths.filter((projectPath) => projectPath !== muxChatProjectPath)
        : sortedProjectPaths, [sortedProjectPaths, muxChatProjectPath]);
    const handleReorder = useCallback((draggedPath, targetPath) => {
        const next = reorderProjects(projectOrder, projects, draggedPath, targetPath);
        setProjectOrder(next);
    }, [projectOrder, projects, setProjectOrder]);
    // Handle keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e) => {
            // Create new workspace for the project of the selected workspace
            if (matchesKeybind(e, KEYBINDS.NEW_WORKSPACE) && selectedWorkspace) {
                e.preventDefault();
                if (selectedWorkspace.workspaceId === MUX_HELP_CHAT_WORKSPACE_ID) {
                    return;
                }
                handleAddWorkspace(selectedWorkspace.projectPath);
            }
            else if (matchesKeybind(e, KEYBINDS.ARCHIVE_WORKSPACE) && selectedWorkspace) {
                e.preventDefault();
                void handleArchiveWorkspace(selectedWorkspace.workspaceId);
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [selectedWorkspace, handleAddWorkspace, handleArchiveWorkspace]);
    return (_jsx(RenameProvider, { onRenameWorkspace: onRenameWorkspace, children: _jsxs(DndProvider, { backend: HTML5Backend, children: [_jsx(ProjectDragLayer, {}), _jsx(WorkspaceDragLayer, {}), _jsx(SectionDragLayer, {}), _jsxs("div", { className: cn("font-primary bg-sidebar border-border-light flex flex-1 flex-col overflow-hidden border-r", 
                    // In desktop mode when collapsed, hide border (LeftSidebar handles the partial border)
                    isDesktopMode() && collapsed && "border-r-0"), role: "navigation", "aria-label": "Projects", children: [!collapsed && (_jsxs(_Fragment, { children: [_jsxs("div", { className: "border-border-light flex flex-col border-b py-3 pr-3 pl-4", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("div", { className: "flex min-w-0 items-center gap-2", children: _jsx("button", { onClick: handleOpenMuxChat, className: "shrink-0 cursor-pointer border-none bg-transparent p-0", "aria-label": "Open Chat with Mux", children: _jsx(MuxLogo, { className: "h-4 w-auto", "aria-hidden": "true" }) }) }), _jsxs("div", { className: "flex items-center gap-1.5", children: [muxChatProjectPath && (_jsxs(_Fragment, { children: [_jsx(MuxChatHelpButton, { onClick: handleOpenMuxChat, isSelected: selectedWorkspace?.workspaceId === MUX_HELP_CHAT_WORKSPACE_ID }), _jsx(MuxChatStatusIndicator, {})] })), _jsx(SettingsButton, {}), _jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx(Button, { variant: "ghost", size: "icon", onClick: onToggleCollapsed, "aria-label": "Collapse sidebar", className: "border-border-light text-muted-foreground hover:border-border-medium/80 hover:bg-toggle-bg/70 h-5 w-5 border", children: _jsx(PanelLeftClose, { className: "h-3.5 w-3.5", "aria-hidden": true }) }) }), _jsxs(TooltipContent, { children: ["Collapse sidebar (", formatKeybind(KEYBINDS.TOGGLE_SIDEBAR), ")"] })] })] })] }), _jsx("span", { className: "text-[10px] text-muted-foreground mt-1 tracking-wide", children: VERSION.git_describe ?? "(dev)" })] }), _jsx("div", { className: "flex-1 overflow-y-auto", children: visibleProjectPaths.length === 0 ? (_jsxs("div", { className: "px-4 py-8 text-center", children: [_jsx("p", { className: "text-muted mb-4 text-[13px]", children: "No projects" }), _jsx("button", { onClick: onAddProject, className: "bg-accent hover:bg-accent-dark cursor-pointer rounded border-none px-4 py-2 text-[13px] text-white transition-colors duration-200", children: "Add Project" })] })) : (visibleProjectPaths.map((projectPath) => {
                                        const config = projects.get(projectPath);
                                        if (!config)
                                            return null;
                                        const projectName = getProjectName(projectPath);
                                        const sanitizedProjectId = projectPath.replace(/[^a-zA-Z0-9_-]/g, "-") || "root";
                                        const workspaceListId = `workspace-list-${sanitizedProjectId}`;
                                        const isExpanded = expandedProjectsList.includes(projectPath);
                                        return (_jsxs("div", { className: "border-hover border-b", children: [_jsxs(DraggableProjectItem, { projectPath: projectPath, onReorder: handleReorder, selected: false, onClick: (e) => {
                                                        // Don't toggle if clicking the kebab menu button
                                                        const target = e.target;
                                                        if (target.closest('[data-kebab-menu]')) {
                                                            return;
                                                        }
                                                        toggleProject(projectPath);
                                                    }, onKeyDown: (e) => {
                                                        // Ignore key events from child buttons
                                                        if (e.target instanceof HTMLElement && e.target !== e.currentTarget) {
                                                            return;
                                                        }
                                                        if (e.key === "Enter" || e.key === " ") {
                                                            e.preventDefault();
                                                            toggleProject(projectPath);
                                                        }
                                                    }, role: "button", tabIndex: 0, "aria-expanded": isExpanded, "aria-controls": workspaceListId, "aria-label": `${isExpanded ? "Collapse" : "Expand"} project ${projectName}`, "data-project-path": projectPath, children: [_jsx("button", { onClick: (event) => {
                                                                event.stopPropagation();
                                                                toggleProject(projectPath);
                                                            }, "aria-label": `${isExpanded ? "Collapse" : "Expand"} project ${projectName}`, "data-project-path": projectPath, className: "text-secondary hover:bg-hover hover:border-border-light mr-1.5 flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded border border-transparent bg-transparent p-0 transition-all duration-200", children: _jsx(ChevronRight, { size: 16, className: "transition-transform duration-200", style: { transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)" } }) }), _jsx("div", { className: "flex min-w-0 flex-1 items-center pr-2", children: _jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("div", { className: "text-muted-dark flex gap-2 truncate text-sm", children: (() => {
                                                                                const abbrevPath = PlatformPaths.abbreviate(projectPath);
                                                                                const { basename } = PlatformPaths.splitAbbreviated(abbrevPath);
                                                                                return (_jsx("span", { className: "text-foreground truncate font-medium", children: basename }));
                                                                            })() }) }), _jsx(TooltipContent, { align: "start", children: projectPath })] }) }), _jsxs(Popover, { children: [_jsx(PopoverTrigger, { asChild: true, children: _jsx("button", { onClick: (e) => e.stopPropagation(), className: "text-muted-foreground hover:text-foreground hover:bg-hover ml-auto flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded border border-transparent bg-transparent p-0 hover:border-border-light", "aria-label": `Project menu for ${projectName}`, "data-kebab-menu": true, children: _jsx(MoreVertical, { size: 14 }) }) }), _jsxs(PopoverContent, { align: "start", side: "bottom", sideOffset: 4, className: "w-52 p-1", children: [_jsx("button", { className: "text-foreground bg-background hover:bg-hover w-full rounded-sm px-2 py-1.5 text-left text-xs whitespace-nowrap", onClick: (e) => { e.stopPropagation(); handleAddWorkspace(projectPath); }, children: "New workspace" }), _jsx("button", { className: "text-foreground bg-background hover:bg-hover w-full rounded-sm px-2 py-1.5 text-left text-xs whitespace-nowrap", onClick: (e) => { e.stopPropagation(); handleCreateSection(projectPath, "New section"); }, children: "Add section" }), _jsx("button", { className: "text-foreground bg-background hover:bg-hover w-full rounded-sm px-2 py-1.5 text-left text-xs whitespace-nowrap", onClick: (e) => { e.stopPropagation(); void handleOpenSecrets(projectPath); }, children: "Manage secrets" }), _jsx("div", { className: "my-1 h-px bg-white/10" }), _jsxs("button", { className: "text-danger hover:bg-hover w-full rounded-sm px-2 py-1.5 text-left text-xs whitespace-nowrap flex items-center gap-2", onClick: (e) => { e.stopPropagation(); const btn = e.currentTarget; void (async () => { const result = await onRemoveProject(projectPath); if (!result.success) {
                                                                                const rect = btn.getBoundingClientRect();
                                                                                projectRemoveError.showError(projectPath, result.error ?? 'Failed to remove project', { top: rect.top + window.scrollY, left: rect.right + 10 });
                                                                            } })(); }, children: [_jsx(Trash2, { className: "h-3 w-3 shrink-0" }), "Delete..."] })] })] }), _jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("button", { onClick: (event) => {
                                                                            event.stopPropagation();
                                                                            void handleOpenSecrets(projectPath);
                                                                        }, "aria-label": `Manage secrets for ${projectName}`, "data-project-path": projectPath, className: "hidden text-muted-dark mr-1 flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-[3px] border-none bg-transparent text-sm opacity-0 transition-all duration-200 hover:bg-yellow-500/10 hover:text-yellow-500", children: _jsx(KeyRound, { size: 12 }) }) }), _jsx(TooltipContent, { align: "end", children: "Manage secrets" })] }), _jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("button", { onClick: (event) => {
                                                                            event.stopPropagation();
                                                                            const buttonElement = event.currentTarget;
                                                                            void (async () => {
                                                                                const result = await onRemoveProject(projectPath);
                                                                                if (!result.success) {
                                                                                    const error = result.error ?? "Failed to remove project";
                                                                                    const rect = buttonElement.getBoundingClientRect();
                                                                                    const anchor = {
                                                                                        top: rect.top + window.scrollY,
                                                                                        left: rect.right + 10,
                                                                                    };
                                                                                    projectRemoveError.showError(projectPath, error, anchor);
                                                                                }
                                                                            })();
                                                                        }, "aria-label": `Remove project ${projectName}`, "data-project-path": projectPath, className: "hidden text-muted-dark hover:text-danger-light hover:bg-danger-light/10 mr-1 flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-[3px] border-none bg-transparent text-base opacity-0 transition-all duration-200", children: "\u00D7" }) }), _jsx(TooltipContent, { align: "end", children: "Remove project" })] }), _jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("button", { onClick: (event) => {
                                                                            event.stopPropagation();
                                                                            handleAddWorkspace(projectPath);
                                                                        }, "aria-label": `New chat in ${projectName}`, "data-project-path": projectPath, className: "hidden text-secondary hover:bg-hover hover:border-border-light flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded border border-transparent bg-transparent text-sm leading-none transition-all duration-200", children: "+" }) }), _jsxs(TooltipContent, { children: ["New chat (", formatKeybind(KEYBINDS.NEW_WORKSPACE), ")"] })] })] }), isExpanded && (_jsx("div", { id: workspaceListId, role: "region", "aria-label": `Workspaces for ${projectName}`, className: "pt-1", children: (() => {
                                                        // Archived workspaces are excluded from workspaceMetadata so won't appear here
                                                        const allWorkspaces = sortedWorkspacesByProject.get(projectPath) ?? [];
                                                        const draftsForProject = workspaceDraftsByProject[projectPath] ?? [];
                                                        const activeDraftIds = new Set(draftsForProject.map((draft) => draft.draftId));
                                                        const draftPromotionsForProject = workspaceDraftPromotionsByProject[projectPath] ?? {};
                                                        const activeDraftPromotions = Object.fromEntries(Object.entries(draftPromotionsForProject).filter(([draftId]) => activeDraftIds.has(draftId)));
                                                        const promotedWorkspaceIds = new Set(Object.values(activeDraftPromotions).map((metadata) => metadata.id));
                                                        const workspacesForNormalRendering = allWorkspaces.filter((workspace) => !promotedWorkspaceIds.has(workspace.id));
                                                        const sections = sortSectionsByLinkedList(config.sections ?? []);
                                                        const depthByWorkspaceId = computeWorkspaceDepthMap(allWorkspaces);
                                                        const sortedDrafts = draftsForProject
                                                            .slice()
                                                            .sort((a, b) => b.createdAt - a.createdAt);
                                                        const draftNumberById = new Map(sortedDrafts.map((draft, index) => [draft.draftId, index + 1]));
                                                        const sectionIds = new Set(sections.map((section) => section.id));
                                                        const normalizeDraftSectionId = (draft) => {
                                                            return typeof draft.sectionId === "string" &&
                                                                sectionIds.has(draft.sectionId)
                                                                ? draft.sectionId
                                                                : null;
                                                        };
                                                        // Drafts can reference a section that has since been deleted.
                                                        // Treat those as unsectioned so they remain accessible.
                                                        const unsectionedDrafts = [];
                                                        const draftsBySectionId = new Map();
                                                        for (const draft of sortedDrafts) {
                                                            const sectionId = normalizeDraftSectionId(draft);
                                                            if (sectionId === null) {
                                                                unsectionedDrafts.push(draft);
                                                                continue;
                                                            }
                                                            const existing = draftsBySectionId.get(sectionId);
                                                            if (existing) {
                                                                existing.push(draft);
                                                            }
                                                            else {
                                                                draftsBySectionId.set(sectionId, [draft]);
                                                            }
                                                        }
                                                        // Build parent-child relationship maps for connector lines
                                                        const childrenByParent = new Map();
                                                        const lastChildSet = new Set();
                                                        for (const ws of allWorkspaces) {
                                                            if (ws.parentWorkspaceId) {
                                                                const siblings = childrenByParent.get(ws.parentWorkspaceId) ?? [];
                                                                siblings.push(ws.id);
                                                                childrenByParent.set(ws.parentWorkspaceId, siblings);
                                                            }
                                                        }
                                                        // Mark last child in each group
                                                        for (const [, children] of childrenByParent) {
                                                            if (children.length > 0) {
                                                                lastChildSet.add(children[children.length - 1]);
                                                            }
                                                        }
                                                        const renderWorkspace = (metadata, sectionId, sectionColor) => (_jsx(WorkspaceListItem, { metadata: metadata, projectPath: projectPath, projectName: projectName, isSelected: selectedWorkspace?.workspaceId === metadata.id, isArchiving: archivingWorkspaceIds.has(metadata.id), isRemoving: removingWorkspaceIds.has(metadata.id) ||
                                                                metadata.isRemoving === true, onSelectWorkspace: handleSelectWorkspace, onArchiveWorkspace: handleArchiveWorkspace, onCancelCreation: handleCancelWorkspaceCreation, depth: depthByWorkspaceId[metadata.id] ?? 0, sectionId: sectionId, sectionColor: sectionColor, hasChildren: childrenByParent.has(metadata.id), isLastChild: lastChildSet.has(metadata.id) }, metadata.id));
                                                        const renderDraft = (draft) => {
                                                            const sectionId = normalizeDraftSectionId(draft);
                                                            const promotedMetadata = activeDraftPromotions[draft.draftId];
                                                            if (promotedMetadata) {
                                                                const liveMetadata = allWorkspaces.find((workspace) => workspace.id === promotedMetadata.id) ?? promotedMetadata;
                                                                return renderWorkspace(liveMetadata, sectionId ?? undefined);
                                                            }
                                                            const draftNumber = draftNumberById.get(draft.draftId) ?? 0;
                                                            const isSelected = pendingNewWorkspaceProject === projectPath &&
                                                                pendingNewWorkspaceDraftId === draft.draftId;
                                                            return (_jsx(DraftWorkspaceListItemWrapper, { projectPath: projectPath, draftId: draft.draftId, draftNumber: draftNumber, isSelected: isSelected, onOpen: () => handleOpenWorkspaceDraft(projectPath, draft.draftId, sectionId), onDelete: () => {
                                                                    if (isSelected) {
                                                                        const currentIndex = sortedDrafts.findIndex((d) => d.draftId === draft.draftId);
                                                                        const fallback = currentIndex >= 0
                                                                            ? (sortedDrafts[currentIndex + 1] ??
                                                                                sortedDrafts[currentIndex - 1])
                                                                            : undefined;
                                                                        if (fallback) {
                                                                            openWorkspaceDraft(projectPath, fallback.draftId, normalizeDraftSectionId(fallback));
                                                                        }
                                                                        else {
                                                                            navigateToProject(projectPath, sectionId ?? undefined);
                                                                        }
                                                                    }
                                                                    deleteWorkspaceDraft(projectPath, draft.draftId);
                                                                } }, draft.draftId));
                                                        };
                                                        // Render age tiers for a list of workspaces
                                                        const renderAgeTiers = (workspaces, tierKeyPrefix, sectionId, sectionColor) => {
                                                            const { recent, buckets } = partitionWorkspacesByAge(workspaces, workspaceRecency);
                                                            const renderTier = (tierIndex) => {
                                                                const bucket = buckets[tierIndex];
                                                                const remainingCount = buckets
                                                                    .slice(tierIndex)
                                                                    .reduce((sum, b) => sum + b.length, 0);
                                                                if (remainingCount === 0)
                                                                    return null;
                                                                const tierKey = `${tierKeyPrefix}:${tierIndex}`;
                                                                const isTierExpanded = expandedOldWorkspaces[tierKey] ?? false;
                                                                const thresholdDays = AGE_THRESHOLDS_DAYS[tierIndex];
                                                                const thresholdLabel = formatDaysThreshold(thresholdDays);
                                                                const displayCount = isTierExpanded
                                                                    ? bucket.length
                                                                    : remainingCount;
                                                                return (_jsxs(React.Fragment, { children: [_jsxs("button", { onClick: () => {
                                                                                setExpandedOldWorkspaces((prev) => ({
                                                                                    ...prev,
                                                                                    [tierKey]: !prev[tierKey],
                                                                                }));
                                                                            }, "aria-label": isTierExpanded
                                                                                ? `Collapse workspaces older than ${thresholdLabel}`
                                                                                : `Expand workspaces older than ${thresholdLabel}`, "aria-expanded": isTierExpanded, className: "text-muted border-hover hover:text-label [&:hover_.arrow]:text-label flex w-full cursor-pointer items-center justify-between border-t border-none bg-transparent px-3 py-2 pl-[22px] text-xs font-medium transition-all duration-150 hover:bg-white/[0.03]", children: [_jsxs("div", { className: "flex items-center gap-1.5", children: [_jsxs("span", { children: ["Older than ", thresholdLabel] }), _jsxs("span", { className: "text-dim font-normal", children: ["(", displayCount, ")"] })] }), _jsx("span", { className: "arrow text-dim text-[11px] transition-transform duration-200 ease-in-out", style: {
                                                                                        transform: isTierExpanded
                                                                                            ? "rotate(90deg)"
                                                                                            : "rotate(0deg)",
                                                                                    }, children: _jsx(ChevronRight, { size: 16 }) })] }), isTierExpanded && (_jsxs(_Fragment, { children: [bucket.map((ws) => renderWorkspace(ws, sectionId, sectionColor)), (() => {
                                                                                    const nextTier = findNextNonEmptyTier(buckets, tierIndex + 1);
                                                                                    return nextTier !== -1 ? renderTier(nextTier) : null;
                                                                                })()] }))] }, tierKey));
                                                            };
                                                            const firstTier = findNextNonEmptyTier(buckets, 0);
                                                            return (_jsxs(_Fragment, { children: [recent.map((ws) => renderWorkspace(ws, sectionId, sectionColor)), firstTier !== -1 && renderTier(firstTier)] }));
                                                        };
                                                        // Partition workspaces by section
                                                        const { unsectioned, bySectionId } = partitionWorkspacesBySection(workspacesForNormalRendering, sections);
                                                        // Handle workspace drop into section
                                                        const handleWorkspaceSectionDrop = (workspaceId, targetSectionId) => {
                                                            void (async () => {
                                                                const result = await assignWorkspaceToSection(projectPath, workspaceId, targetSectionId);
                                                                if (result.success) {
                                                                    // Refresh workspace metadata so UI shows updated sectionId
                                                                    await refreshWorkspaceMetadata();
                                                                }
                                                            })();
                                                        };
                                                        // Handle section reorder (drag section onto another section)
                                                        const handleSectionReorder = (draggedSectionId, targetSectionId) => {
                                                            void (async () => {
                                                                // Compute new order: move dragged section to position of target
                                                                const currentOrder = sections.map((s) => s.id);
                                                                const draggedIndex = currentOrder.indexOf(draggedSectionId);
                                                                const targetIndex = currentOrder.indexOf(targetSectionId);
                                                                if (draggedIndex === -1 || targetIndex === -1)
                                                                    return;
                                                                // Remove dragged from current position
                                                                const newOrder = [...currentOrder];
                                                                newOrder.splice(draggedIndex, 1);
                                                                // Insert at target position
                                                                newOrder.splice(targetIndex, 0, draggedSectionId);
                                                                await reorderSections(projectPath, newOrder);
                                                            })();
                                                        };
                                                        // Render section with its workspaces
                                                        const renderSection = (section) => {
                                                            const sectionWorkspaces = bySectionId.get(section.id) ?? [];
                                                            const sectionDrafts = draftsBySectionId.get(section.id) ?? [];
                                                            const sectionExpandedKey = getSectionExpandedKey(projectPath, section.id);
                                                            const isSectionExpanded = expandedSections[sectionExpandedKey] ?? true;
                                                            return (_jsx(DraggableSection, { sectionId: section.id, sectionName: section.name, projectPath: projectPath, onReorder: handleSectionReorder, children: _jsxs(WorkspaceSectionDropZone, { projectPath: projectPath, sectionId: section.id, onDrop: handleWorkspaceSectionDrop, children: [_jsx(SectionHeader, { section: section, isExpanded: isSectionExpanded, workspaceCount: sectionWorkspaces.length + sectionDrafts.length, onToggleExpand: () => toggleSection(projectPath, section.id), onAddWorkspace: () => {
                                                                                // Create workspace in this section
                                                                                handleAddWorkspace(projectPath, section.id);
                                                                            }, onRename: (name) => {
                                                                                void updateSection(projectPath, section.id, { name });
                                                                            }, onChangeColor: (color) => {
                                                                                void updateSection(projectPath, section.id, { color });
                                                                            }, onDelete: (e) => {
                                                                                void handleRemoveSection(projectPath, section.id, e.currentTarget);
                                                                            } }), isSectionExpanded && (_jsxs("div", { className: "", style: { backgroundColor: '#1e1e1e' }, children: [sectionDrafts.map((draft) => renderDraft(draft)), sectionWorkspaces.length > 0 ? (renderAgeTiers(sectionWorkspaces, getSectionTierKey(projectPath, section.id, 0).replace(":tier:0", ":tier"), section.id, resolveSectionColor(section.color))) : sectionDrafts.length === 0 ? (_jsxs("div", { className: "text-muted px-3 py-1.5 pb-2 text-center text-xs", style: { borderLeftWidth: 1, borderLeftColor: resolveSectionColor(section.color) }, children: ["No workspaces.", ' ', _jsx("button", { className: "text-muted-foreground hover:text-foreground cursor-pointer underline", onClick: () => handleAddWorkspace(projectPath, section.id), children: "Add" })] })) : null] }))] }) }, section.id));
                                                        };
                                                        return (_jsxs(_Fragment, { children: [sections.length > 0 ? (_jsxs(WorkspaceSectionDropZone, { projectPath: projectPath, sectionId: null, onDrop: handleWorkspaceSectionDrop, testId: "unsectioned-drop-zone", children: [unsectionedDrafts.map((draft) => renderDraft(draft)), unsectioned.length > 0 ? (renderAgeTiers(unsectioned, getTierKey(projectPath, 0).replace(":0", ""))) : null] })) : (_jsxs(_Fragment, { children: [unsectionedDrafts.map((draft) => renderDraft(draft)), unsectioned.length > 0 &&
                                                                            renderAgeTiers(unsectioned, getTierKey(projectPath, 0).replace(":0", ""))] })), sections.map(renderSection)] }));
                                                    })() }))] }, projectPath));
                                    })) })] })), !collapsed ? (_jsx("div", { className: "border-border-light mt-auto flex shrink-0 items-center justify-center border-t py-2", children: _jsxs("button", { onClick: onAddProject, "aria-label": "Add project", className: "text-muted hover:text-foreground flex cursor-pointer items-center gap-1.5 border-none bg-transparent text-sm transition-colors duration-200", children: [_jsx(Plus, { className: "h-4 w-4" }), _jsx("span", { children: "Project" })] }) })) : (_jsx("div", { className: "flex shrink-0 items-center justify-center pt-3 pb-2", children: _jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx(Button, { variant: "ghost", size: "icon", onClick: onToggleCollapsed, "aria-label": "Expand sidebar", className: "border-border-light text-muted-foreground hover:border-border-medium/80 hover:bg-toggle-bg/70 h-5 w-5 border", children: _jsx(PanelLeftOpen, { className: "h-3.5 w-3.5", "aria-hidden": true }) }) }), _jsxs(TooltipContent, { side: "right", children: ["Expand sidebar (", formatKeybind(KEYBINDS.TOGGLE_SIDEBAR), ")"] })] }) })), secretsModalState && (_jsx(SecretsModal, { isOpen: secretsModalState.isOpen, projectPath: secretsModalState.projectPath, projectName: secretsModalState.projectName, initialSecrets: secretsModalState.secrets, onClose: handleCloseSecrets, onSave: handleSaveSecrets })), _jsx(ConfirmationModal, { isOpen: archiveConfirmation !== null, title: archiveConfirmation
                                ? `Archive "${archiveConfirmation.displayTitle}" while streaming?`
                                : "Archive chat?", description: "This workspace is currently streaming a response.", warning: "Archiving will interrupt the active stream.", confirmLabel: "Archive", onConfirm: handleArchiveWorkspaceConfirm, onCancel: handleArchiveWorkspaceCancel }), _jsx(PopoverError, { error: workspaceArchiveError.error, prefix: "Failed to archive chat", onDismiss: workspaceArchiveError.clearError }), _jsx(PopoverError, { error: workspaceRemoveError.error, prefix: "Failed to cancel workspace creation", onDismiss: workspaceRemoveError.clearError }), _jsx(PopoverError, { error: projectRemoveError.error, prefix: "Failed to remove project", onDismiss: projectRemoveError.clearError }), _jsx(PopoverError, { error: sectionRemoveError.error, prefix: "Failed to remove section", onDismiss: sectionRemoveError.clearError })] })] }) }));
};
// Memoize to prevent re-renders when props haven't changed
const ProjectSidebar = React.memo(ProjectSidebarInner);
export default ProjectSidebar;
//# sourceMappingURL=ProjectSidebar.js.map