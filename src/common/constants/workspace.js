/**
 * Default runtime configuration for worktree workspaces.
 * Uses git worktrees for workspace isolation.
 * Used when no runtime config is specified.
 */
export const DEFAULT_RUNTIME_CONFIG = {
    type: "worktree",
    srcBaseDir: "~/.mux/src",
};
//# sourceMappingURL=workspace.js.map