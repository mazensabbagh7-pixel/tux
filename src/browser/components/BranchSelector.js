import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useCallback, useEffect, useRef } from "react";
import { GitBranch, Loader2, Check, Copy, Globe, ChevronRight } from "lucide-react";
import { cn } from "@/common/lib/utils";
import { useAPI } from "@/browser/contexts/API";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Tooltip, TooltipTrigger, TooltipContent } from "./ui/tooltip";
import { useCopyToClipboard } from "@/browser/hooks/useCopyToClipboard";
import { invalidateGitStatus, useGitStatus } from "@/browser/stores/GitStatusStore";
import { createLRUCache } from "@/browser/utils/lruCache";
// LRU cache for persisting branch names across app restarts
const branchCache = createLRUCache({
    entryPrefix: "branch:",
    indexKey: "branchIndex",
    maxEntries: 100,
    // No TTL - branch info is fetched on mount anyway
});
// Max branches to fetch
const MAX_LOCAL_BRANCHES = 100;
const MAX_REMOTE_BRANCHES = 50;
/**
 * Displays the current git branch with a searchable popover for switching.
 * If not in a git repo, shows the workspace name without interactive features.
 * Remotes appear as expandable groups that lazy-load their branches.
 */
export function BranchSelector({ workspaceId, workspaceName, className }) {
    const { api } = useAPI();
    // null = not yet determined, false = not a git repo, string = current branch
    // Initialize from localStorage cache for instant display on app restart
    const [currentBranch, setCurrentBranch] = useState(() => branchCache.get(workspaceId));
    const [localBranches, setLocalBranches] = useState([]);
    const [localBranchesTruncated, setLocalBranchesTruncated] = useState(false);
    const [remotes, setRemotes] = useState([]);
    const [remoteStates, setRemoteStates] = useState({});
    const [expandedRemotes, setExpandedRemotes] = useState(new Set());
    const [search, setSearch] = useState("");
    const [isOpen, setIsOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isSwitching, setIsSwitching] = useState(false);
    const [error, setError] = useState(null);
    const { copied, copyToClipboard } = useCopyToClipboard();
    // Subscribe to GitStatusStore for branch changes detected during periodic refresh
    // (e.g., focus events, file-modifying tools). This keeps the branch selector in sync
    // when the user or mux changes the branch outside of the branch selector UI.
    const gitStatus = useGitStatus(workspaceId);
    const gitStatusBranch = gitStatus?.branch;
    useEffect(() => {
        if (!gitStatusBranch)
            return;
        setCurrentBranch((prev) => {
            if (prev === gitStatusBranch)
                return prev;
            branchCache.set(workspaceId, gitStatusBranch);
            return gitStatusBranch;
        });
    }, [gitStatusBranch, workspaceId]);
    // Track if we're refreshing with a cached value (for optimistic UI pulse effect)
    const isRefreshing = currentBranch !== null && currentBranch !== false && isSwitching;
    // Fetch current branch on mount to detect if we're in a git repo
    useEffect(() => {
        if (!api)
            return;
        let cancelled = false;
        void (async () => {
            try {
                const result = await api.workspace.executeBash({
                    workspaceId,
                    script: `git rev-parse --abbrev-ref HEAD 2>/dev/null`,
                    options: { timeout_secs: 5 },
                });
                if (cancelled)
                    return;
                if (result.success && result.data.success && result.data.output?.trim()) {
                    const branch = result.data.output.trim();
                    setCurrentBranch(branch);
                    // Persist to localStorage for instant display on app restart
                    branchCache.set(workspaceId, branch);
                }
                else {
                    // Not a git repo or git command failed
                    setCurrentBranch(false);
                }
            }
            catch {
                if (!cancelled) {
                    setCurrentBranch(false);
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [api, workspaceId]);
    const fetchLocalBranches = useCallback(async () => {
        if (!api || currentBranch === false)
            return;
        setIsLoading(true);
        try {
            // Fetch one extra to detect truncation
            const [branchResult, remoteResult] = await Promise.all([
                api.workspace.executeBash({
                    workspaceId,
                    script: `git branch --sort=-committerdate --format='%(refname:short)' 2>/dev/null | head -${MAX_LOCAL_BRANCHES + 1}`,
                    options: { timeout_secs: 5 },
                }),
                api.workspace.executeBash({
                    workspaceId,
                    script: `git remote 2>/dev/null`,
                    options: { timeout_secs: 5 },
                }),
            ]);
            if (branchResult.success && branchResult.data.success && branchResult.data.output) {
                const branchList = branchResult.data.output
                    .split("\n")
                    .map((b) => b.trim())
                    .filter((b) => b.length > 0);
                if (branchList.length > 0) {
                    const truncated = branchList.length > MAX_LOCAL_BRANCHES;
                    setLocalBranches(truncated ? branchList.slice(0, MAX_LOCAL_BRANCHES) : branchList);
                    setLocalBranchesTruncated(truncated);
                }
            }
            if (remoteResult.success && remoteResult.data.success && remoteResult.data.output) {
                const remoteList = remoteResult.data.output
                    .split("\n")
                    .map((r) => r.trim())
                    .filter((r) => r.length > 0);
                setRemotes(remoteList);
            }
        }
        catch {
            // Silently fail
        }
        finally {
            setIsLoading(false);
        }
    }, [api, workspaceId, currentBranch]);
    const fetchRemoteBranches = useCallback(async (remote) => {
        if (!api || remoteStates[remote]?.fetched)
            return;
        setRemoteStates((prev) => ({
            ...prev,
            [remote]: { branches: [], isLoading: true, fetched: false, truncated: false },
        }));
        try {
            // Fetch one extra to detect truncation
            const result = await api.workspace.executeBash({
                workspaceId,
                script: `git branch -r --list '${remote}/*' --sort=-committerdate --format='%(refname:short)' 2>/dev/null | head -${MAX_REMOTE_BRANCHES + 1}`,
                options: { timeout_secs: 5 },
            });
            if (result.success && result.data.success && result.data.output) {
                const branches = result.data.output
                    .split("\n")
                    .map((b) => b.trim())
                    .filter((b) => b.length > 0);
                const truncated = branches.length > MAX_REMOTE_BRANCHES;
                setRemoteStates((prev) => ({
                    ...prev,
                    [remote]: {
                        branches: truncated ? branches.slice(0, MAX_REMOTE_BRANCHES) : branches,
                        isLoading: false,
                        fetched: true,
                        truncated,
                    },
                }));
            }
            else {
                setRemoteStates((prev) => ({
                    ...prev,
                    [remote]: { branches: [], isLoading: false, fetched: true, truncated: false },
                }));
            }
        }
        catch {
            setRemoteStates((prev) => ({
                ...prev,
                [remote]: { branches: [], isLoading: false, fetched: true, truncated: false },
            }));
        }
    }, [api, workspaceId, remoteStates]);
    const switchBranch = useCallback(async (targetBranch, isRemote = false) => {
        if (!api)
            return;
        const checkoutTarget = isRemote ? targetBranch.replace(/^[^/]+\//, "") : targetBranch;
        if (checkoutTarget === currentBranch) {
            setIsOpen(false);
            return;
        }
        setIsSwitching(true);
        setError(null);
        setIsOpen(false);
        // Invalidate git status immediately to prevent stale data flash
        invalidateGitStatus(workspaceId);
        try {
            const result = await api.workspace.executeBash({
                workspaceId,
                script: `git checkout ${checkoutTarget} 2>&1`,
                options: { timeout_secs: 30 },
            });
            if (!result.success) {
                setError(result.error ?? "Checkout failed");
                // Re-fetch status since checkout failed (restore accurate state)
                invalidateGitStatus(workspaceId);
            }
            else if (!result.data.success) {
                const errorMsg = result.data.output?.trim() ?? result.data.error ?? "Checkout failed";
                setError(errorMsg);
                // Re-fetch status since checkout failed
                invalidateGitStatus(workspaceId);
            }
            else {
                // Update current branch on successful checkout
                setCurrentBranch(checkoutTarget);
                // Persist to localStorage for instant display on app restart
                branchCache.set(workspaceId, checkoutTarget);
                // Refresh git status with new branch state
                invalidateGitStatus(workspaceId);
            }
        }
        catch (err) {
            setError(err instanceof Error ? err.message : "Checkout failed");
        }
        finally {
            setIsSwitching(false);
        }
    }, [api, workspaceId, currentBranch]);
    useEffect(() => {
        if (error) {
            const timer = setTimeout(() => setError(null), 3000);
            return () => clearTimeout(timer);
        }
    }, [error]);
    useEffect(() => {
        if (isOpen) {
            void fetchLocalBranches();
        }
    }, [isOpen, fetchLocalBranches]);
    useEffect(() => {
        if (!isOpen) {
            setRemoteStates({});
            setExpandedRemotes(new Set());
            setSearch("");
        }
    }, [isOpen]);
    const inputRef = useRef(null);
    // Focus search input when popover opens
    useEffect(() => {
        if (isOpen) {
            // Small delay to ensure popover is rendered
            const timer = setTimeout(() => inputRef.current?.focus(), 50);
            return () => clearTimeout(timer);
        }
    }, [isOpen]);
    const handleCopy = (e) => {
        e.stopPropagation();
        if (typeof currentBranch === "string") {
            void copyToClipboard(currentBranch);
        }
    };
    // Display name: actual git branch if available, otherwise workspace name
    const displayName = typeof currentBranch === "string" ? currentBranch : workspaceName;
    const toggleRemote = (remote) => {
        setExpandedRemotes((prev) => {
            const next = new Set(prev);
            if (next.has(remote)) {
                next.delete(remote);
            }
            else {
                next.add(remote);
                // Fetch branches when expanding
                void fetchRemoteBranches(remote);
            }
            return next;
        });
    };
    // Filter branches by search
    const searchLower = search.toLowerCase();
    const filteredLocalBranches = localBranches.filter((b) => b.toLowerCase().includes(searchLower));
    // For remotes, filter branches within each remote
    const getFilteredRemoteBranches = (remote) => {
        const state = remoteStates[remote];
        if (!state?.branches)
            return [];
        return state.branches.filter((b) => b.toLowerCase().includes(searchLower));
    };
    // Check if any remote has matching branches (for showing remotes section)
    const hasMatchingRemoteBranches = remotes.some((remote) => {
        const state = remoteStates[remote];
        if (!state?.fetched)
            return true; // Show unfetched remotes
        return getFilteredRemoteBranches(remote).length > 0;
    });
    // Non-git repo: just show workspace name, no interactive features
    if (currentBranch === false) {
        return (_jsx("div", { className: cn("group flex items-center gap-0.5", className), children: _jsx("div", { className: "text-muted-light flex max-w-[180px] min-w-0 items-center gap-1 px-1 py-0.5 font-mono text-[11px]", children: _jsx("span", { className: "truncate", children: workspaceName }) }) }));
    }
    // Still loading git status - use same layout as loaded state to prevent shift
    if (currentBranch === null) {
        return (_jsx("div", { className: cn("group flex items-center gap-0.5", className), children: _jsxs("div", { className: "text-muted-light flex max-w-[180px] min-w-0 items-center gap-1 px-1 py-0.5 font-mono text-[11px]", children: [_jsx(Loader2, { className: "h-3 w-3 shrink-0 animate-spin opacity-70" }), _jsx("span", { className: "truncate", children: workspaceName })] }) }));
    }
    return (_jsxs("div", { className: cn("group flex items-center gap-0.5", className), children: [_jsxs(Popover, { open: isOpen, onOpenChange: setIsOpen, children: [_jsx(PopoverTrigger, { asChild: true, children: _jsxs("button", { disabled: isSwitching, className: cn("text-muted-light hover:bg-hover hover:text-foreground flex min-w-0 max-w-[180px] items-center gap-1 rounded-sm px-1 py-0.5 font-mono text-[11px] transition-colors", isRefreshing && "animate-pulse" // Show pulse during switch instead of replacing content
                            ), children: [_jsx(GitBranch, { className: "h-3 w-3 shrink-0 opacity-70" }), _jsx("span", { className: "truncate", children: displayName })] }) }), _jsxs(PopoverContent, { align: "start", className: "w-[220px] p-0", children: [_jsx("div", { className: "border-border border-b px-2 py-1.5", children: _jsx("input", { ref: inputRef, type: "text", value: search, onChange: (e) => setSearch(e.target.value), placeholder: "Search branches...", className: "text-foreground placeholder:text-muted w-full bg-transparent font-mono text-[11px] outline-none" }) }), _jsxs("div", { className: "max-h-[280px] overflow-y-auto p-1", children: [remotes.length > 0 && hasMatchingRemoteBranches && (_jsxs(_Fragment, { children: [remotes.map((remote) => {
                                                const state = remoteStates[remote];
                                                const isExpanded = expandedRemotes.has(remote);
                                                const isRemoteLoading = state?.isLoading ?? false;
                                                const remoteBranches = getFilteredRemoteBranches(remote);
                                                // Hide remote if fetched and no matching branches
                                                if (state?.fetched && remoteBranches.length === 0 && search) {
                                                    return null;
                                                }
                                                return (_jsxs("div", { children: [_jsxs("button", { onClick: () => toggleRemote(remote), className: "hover:bg-hover flex w-full items-center gap-1.5 rounded-sm px-2 py-1 font-mono text-[11px]", children: [_jsx(ChevronRight, { className: cn("text-muted h-3 w-3 shrink-0 transition-transform", isExpanded && "rotate-90") }), _jsx(Globe, { className: "text-muted h-3 w-3 shrink-0" }), _jsx("span", { children: remote })] }), isExpanded && (_jsx("div", { className: "ml-3", children: isRemoteLoading ? (_jsx("div", { className: "text-muted flex items-center justify-center py-2", children: _jsx(Loader2, { className: "h-3 w-3 animate-spin" }) })) : remoteBranches.length === 0 ? (_jsx("div", { className: "text-muted py-1.5 pl-2 text-[10px]", children: "No branches" })) : (_jsxs(_Fragment, { children: [remoteBranches.map((branch) => {
                                                                        const displayName = branch.replace(`${remote}/`, "");
                                                                        return (_jsxs("button", { onClick: () => void switchBranch(branch, true), className: "hover:bg-hover flex w-full items-center gap-1.5 rounded-sm px-2 py-1 font-mono text-[11px]", children: [_jsx(Check, { className: cn("h-3 w-3 shrink-0", displayName === currentBranch ? "opacity-100" : "opacity-0") }), _jsx("span", { className: "truncate", children: displayName })] }, branch));
                                                                    }), state?.truncated && !search && (_jsx("div", { className: "text-muted px-2 py-1 text-[10px] italic", children: "+more branches (use search)" }))] })) }))] }, remote));
                                            }), filteredLocalBranches.length > 0 && _jsx("div", { className: "bg-border my-1 h-px" })] })), isLoading && localBranches.length <= 1 ? (_jsx("div", { className: "text-muted flex items-center justify-center py-2", children: _jsx(Loader2, { className: "h-3 w-3 animate-spin" }) })) : filteredLocalBranches.length === 0 ? (_jsx("div", { className: "text-muted py-2 text-center text-[10px]", children: "No matching branches" })) : (_jsxs(_Fragment, { children: [filteredLocalBranches.map((branch) => (_jsxs("button", { onClick: () => void switchBranch(branch), className: "hover:bg-hover flex w-full items-center gap-1.5 rounded-sm px-2 py-1 font-mono text-[11px]", children: [_jsx(Check, { className: cn("h-3 w-3 shrink-0", branch === currentBranch ? "opacity-100" : "opacity-0") }), _jsx("span", { className: "truncate", children: branch })] }, branch))), localBranchesTruncated && !search && (_jsx("div", { className: "text-muted px-2 py-1 text-[10px] italic", children: "+more branches (use search)" }))] }))] })] })] }), _jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("button", { onClick: handleCopy, className: "text-muted hover:text-foreground flex h-3.5 w-3.5 shrink-0 items-center justify-center opacity-0 transition-opacity group-hover:opacity-100", "aria-label": "Copy branch name", children: copied ? _jsx(Check, { className: "h-2.5 w-2.5" }) : _jsx(Copy, { className: "h-2.5 w-2.5" }) }) }), _jsx(TooltipContent, { side: "bottom", children: copied ? "Copied!" : "Copy branch name" })] }), error && _jsx("span", { className: "text-danger-soft truncate text-[10px]", children: error })] }));
}
//# sourceMappingURL=BranchSelector.js.map