import { jsx as _jsx } from "react/jsx-runtime";
import { useState, useCallback, useRef } from "react";
import { GIT_STATUS_INDICATOR_MODE_KEY } from "@/common/constants/storage";
import { STORAGE_KEYS, WORKSPACE_DEFAULTS } from "@/constants/workspaceDefaults";
import { usePersistedState } from "@/browser/hooks/usePersistedState";
import { invalidateGitStatus, useGitStatusRefreshing } from "@/browser/stores/GitStatusStore";
import { GitStatusIndicatorView } from "./GitStatusIndicatorView";
import { useGitBranchDetails } from "./hooks/useGitBranchDetails";
/**
 * Container component for git status indicator.
 * Manages hover card visibility and data fetching.
 * Delegates rendering to GitStatusIndicatorView.
 */
export const GitStatusIndicator = ({ gitStatus, workspaceId, projectPath, tooltipPosition = "right", isWorking = false, }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [isPopoverOpen, setIsPopoverOpen] = useState(false);
    const pendingHoverCardCloseRef = useRef(false);
    const trimmedWorkspaceId = workspaceId.trim();
    const isRefreshing = useGitStatusRefreshing(trimmedWorkspaceId);
    const [mode, setMode] = usePersistedState(GIT_STATUS_INDICATOR_MODE_KEY, "line-delta", { listener: true });
    // Per-project default base (fallback for new workspaces)
    const [projectDefaultBase] = usePersistedState(STORAGE_KEYS.reviewDefaultBase(projectPath), WORKSPACE_DEFAULTS.reviewBase, { listener: true });
    // Per-workspace base ref (shared with review panel, syncs via listener)
    const [baseRef, setBaseRef] = usePersistedState(STORAGE_KEYS.reviewDiffBase(trimmedWorkspaceId), projectDefaultBase, { listener: true });
    const handleBaseChange = useCallback((value) => {
        setBaseRef(value);
        invalidateGitStatus(trimmedWorkspaceId);
    }, [setBaseRef, trimmedWorkspaceId]);
    // Prevent HoverCard from closing while the base selector popover is open.
    // If Radix requests a close while the popover is open, defer the close until
    // the popover closes (otherwise the hovercard can get "stuck" open).
    const handleHoverCardOpenChange = useCallback((open) => {
        if (!open && isPopoverOpen) {
            pendingHoverCardCloseRef.current = true;
            return;
        }
        pendingHoverCardCloseRef.current = false;
        setIsOpen(open);
    }, [isPopoverOpen]);
    const handlePopoverOpenChange = useCallback((open) => {
        setIsPopoverOpen(open);
        if (!open && pendingHoverCardCloseRef.current) {
            pendingHoverCardCloseRef.current = false;
            setIsOpen(false);
        }
    }, [setIsPopoverOpen]);
    const handleModeChange = useCallback((nextMode) => {
        setMode(nextMode);
    }, [setMode]);
    console.assert(trimmedWorkspaceId.length > 0, "GitStatusIndicator requires workspaceId to be a non-empty string.");
    // Fetch branch details only when hover card is open
    const { branchHeaders, commits, dirtyFiles, isLoading, errorMessage } = useGitBranchDetails(trimmedWorkspaceId, gitStatus, isOpen);
    return (_jsx(GitStatusIndicatorView, { mode: mode, gitStatus: gitStatus, tooltipPosition: tooltipPosition, branchHeaders: branchHeaders, commits: commits, dirtyFiles: dirtyFiles, isLoading: isLoading, errorMessage: errorMessage, isOpen: isOpen, onOpenChange: handleHoverCardOpenChange, onModeChange: handleModeChange, baseRef: baseRef, onBaseChange: handleBaseChange, onPopoverOpenChange: handlePopoverOpenChange, isWorking: isWorking, isRefreshing: isRefreshing }));
};
//# sourceMappingURL=GitStatusIndicator.js.map