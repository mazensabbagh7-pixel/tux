/**
 * Storage key helpers for persisted settings.
 */
export const STORAGE_KEYS = {
    /** Per-project default diff base for code review. Pass projectPath. */
    reviewDefaultBase: (projectPath) => `review-default-base:${projectPath}`,
    /** Per-workspace diff base override. Pass workspaceId. */
    reviewDiffBase: (workspaceId) => `review-diff-base:${workspaceId}`,
};
Object.freeze(STORAGE_KEYS);
/**
 * Global default values for all workspace settings.
 *
 * These defaults are IMMUTABLE and serve as the fallback when:
 * - A new workspace is created
 * - A workspace has no stored override in localStorage
 * - Settings are reset to defaults
 *
 * Per-workspace overrides persist in localStorage using keys like:
 * - `agentId:{workspaceId}`
 * - `model:{workspaceId}`
 * - `thinkingLevel:{workspaceId}`
 * - `input:{workspaceId}`
 * - `{workspaceId}-autoRetry`
 *
 * The global defaults themselves CANNOT be changed by users.
 * Only per-workspace overrides are mutable.
 *
 * IMPORTANT: All values are marked `as const` to ensure immutability at the type level.
 * Do not modify these values at runtime - they serve as the single source of truth.
 */
import { THINKING_LEVEL_OFF } from "@/common/types/thinking";
import { DEFAULT_MODEL } from "@/common/constants/knownModels";
/**
 * Hard-coded default values for workspace settings.
 * Type assertions ensure proper typing while maintaining immutability.
 */
export const WORKSPACE_DEFAULTS = {
    /** Default agent id for new workspaces (built-in exec agent). */
    agentId: "exec",
    /** Default thinking/reasoning level for new workspaces */
    thinkingLevel: THINKING_LEVEL_OFF,
    /**
     * Default AI model for new workspaces.
     * Uses the centralized default from knownModels.ts.
     */
    model: DEFAULT_MODEL,
    /** Default auto-retry preference for new workspaces */
    autoRetry: true,
    /** Default input text for new workspaces (empty) */
    input: "",
    /** Default diff base for code review (compare against origin/main) */
    reviewBase: "origin/main",
};
// Freeze the object at runtime to prevent accidental mutation
Object.freeze(WORKSPACE_DEFAULTS);
//# sourceMappingURL=workspaceDefaults.js.map