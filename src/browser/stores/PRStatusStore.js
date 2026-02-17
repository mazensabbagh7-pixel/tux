/**
 * Store for managing GitHub PR status information.
 *
 * Architecture:
 * - Lives outside React lifecycle (stable references)
 * - Detects workspace PR from current branch via `gh pr view`
 * - Caches status with TTL
 * - Refreshes on focus (like GitStatusStore)
 * - Notifies subscribers when status changes
 *
 * PR detection:
 * - Branch-based: Runs `gh pr view` without URL to detect PR for current branch
 */
import { createLRUCache } from "@/browser/utils/lruCache";
/**
 * Parse a GitHub PR URL to extract owner, repo, and number.
 * Returns null if the URL is not a valid GitHub PR URL.
 */
function parseGitHubPRUrl(url) {
    const match = /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/.exec(url);
    if (!match)
        return null;
    return { owner: match[1], repo: match[2], number: parseInt(match[3], 10) };
}
import { MapStore } from "./MapStore";
import { RefreshController } from "@/browser/utils/RefreshController";
import { useSyncExternalStore } from "react";
// Cache TTL: PR status is refreshed at most every 5 seconds
const STATUS_CACHE_TTL_MS = 5 * 1000;
// How long to wait before retrying after an error
const ERROR_RETRY_DELAY_MS = 5 * 1000;
// LRU cache for persisting PR status across app restarts
const prStatusLRU = createLRUCache({
    entryPrefix: "prStatus:",
    indexKey: "prStatusIndex",
    maxEntries: 50,
    // No TTL - we refresh on mount anyway, just want instant display
});
function summarizeStatusCheckRollup(raw) {
    if (!Array.isArray(raw)) {
        return { hasPendingChecks: false, hasFailedChecks: false };
    }
    let hasPendingChecks = false;
    let hasFailedChecks = false;
    for (const item of raw) {
        if (typeof item !== "object" || item === null) {
            continue;
        }
        const record = item;
        const status = record.status;
        const conclusion = record.conclusion;
        // Many check APIs represent "pending" as a non-COMPLETED status and/or a null conclusion.
        if (typeof status === "string" && status !== "COMPLETED") {
            hasPendingChecks = true;
        }
        if (conclusion == null) {
            hasPendingChecks = true;
            continue;
        }
        if (typeof conclusion === "string") {
            // GitHub-style conclusions (StatusState is different from CheckConclusionState, but this is close enough)
            const normalized = conclusion.toUpperCase();
            if (normalized === "FAILURE" ||
                normalized === "CANCELLED" ||
                normalized === "TIMED_OUT" ||
                normalized === "ACTION_REQUIRED" ||
                normalized === "STARTUP_FAILURE") {
                hasFailedChecks = true;
            }
        }
    }
    return { hasPendingChecks, hasFailedChecks };
}
/**
 * Store for GitHub PR status. Fetches status via gh CLI and caches results.
 */
export class PRStatusStore {
    constructor() {
        this.client = null;
        this.isActive = true;
        // Workspace-based PR detection (keyed by workspaceId)
        this.workspacePRSubscriptions = new MapStore();
        this.workspacePRCache = new Map();
        // Track active subscriptions per workspace so we only refresh workspaces that are actually visible.
        this.workspaceSubscriptionCounts = new Map();
        // Like GitStatusStore: batch immediate refreshes triggered by subscriptions.
        this.immediateUpdateQueued = false;
        // ─────────────────────────────────────────────────────────────────────────────
        // Workspace-based PR detection (primary mode)
        // ─────────────────────────────────────────────────────────────────────────────
        /**
         * Subscribe to workspace PR changes (branch-based detection).
         *
         * Like GitStatusStore: subscriptions drive refresh. Components should not need to
         * manually "monitor" workspaces.
         */
        this.subscribeWorkspace = (workspaceId, listener) => {
            const unsubscribe = this.workspacePRSubscriptions.subscribeKey(workspaceId, listener);
            // Track active subscriptions so focus refresh only runs for visible workspaces.
            const current = this.workspaceSubscriptionCounts.get(workspaceId) ?? 0;
            this.workspaceSubscriptionCounts.set(workspaceId, current + 1);
            // Bind focus/visibility listeners once we have any subscribers.
            this.refreshController.bindListeners();
            // Kick an immediate refresh so the UI doesn't wait for the next focus event.
            // Use a microtask to batch multiple subscribe calls in the same render.
            if (!this.immediateUpdateQueued && this.isActive && this.client) {
                this.immediateUpdateQueued = true;
                queueMicrotask(() => {
                    this.immediateUpdateQueued = false;
                    this.refreshController.requestImmediate();
                });
            }
            return () => {
                unsubscribe();
                const next = (this.workspaceSubscriptionCounts.get(workspaceId) ?? 1) - 1;
                if (next <= 0) {
                    this.workspaceSubscriptionCounts.delete(workspaceId);
                }
                else {
                    this.workspaceSubscriptionCounts.set(workspaceId, next);
                }
            };
        };
        this.refreshController = new RefreshController({
            onRefresh: () => this.refreshAll(),
            debounceMs: 5000,
            refreshOnFocus: true,
            focusDebounceMs: 1000,
        });
    }
    setClient(client) {
        this.client = client;
        if (!client) {
            return;
        }
        // If hooks subscribed before the client was ready, ensure we refresh once it is.
        if (this.workspaceSubscriptionCounts.size > 0) {
            this.refreshController.requestImmediate();
        }
    }
    /**
     * Get workspace PR detection result.
     * Checks in-memory cache first, then falls back to localStorage for persistence
     * across app restarts.
     */
    getWorkspacePR(workspaceId) {
        const memCached = this.workspacePRCache.get(workspaceId);
        if (memCached)
            return memCached;
        // Check localStorage for persisted status (app restart scenario)
        const persisted = prStatusLRU.get(workspaceId);
        if (persisted) {
            // Hydrate memory cache from localStorage, mark as loading to trigger refresh
            // but show the cached value immediately (optimistic UI)
            const entry = {
                prLink: persisted.prLink,
                status: persisted.status,
                loading: true,
                fetchedAt: 0,
            };
            this.workspacePRCache.set(workspaceId, entry);
            return entry;
        }
        return undefined;
    }
    /**
     * Detect PR for workspace's current branch via `gh pr view`.
     */
    async detectWorkspacePR(workspaceId) {
        if (!this.client || !this.isActive)
            return;
        // Mark as loading
        const existing = this.workspacePRCache.get(workspaceId);
        this.workspacePRCache.set(workspaceId, {
            prLink: existing?.prLink ?? null,
            status: existing?.status,
            loading: true,
            fetchedAt: Date.now(),
        });
        this.workspacePRSubscriptions.bump(workspaceId);
        try {
            // Run gh pr view without URL - detects PR for current branch
            const result = await this.client.workspace.executeBash({
                workspaceId,
                script: `gh pr view --json number,url,state,mergeable,mergeStateStatus,title,isDraft,headRefName,baseRefName,statusCheckRollup 2>/dev/null || echo '{"no_pr":true}'`,
                options: { timeout_secs: 15 },
            });
            if (!this.isActive)
                return;
            if (!result.success || !result.data.success) {
                this.workspacePRCache.set(workspaceId, {
                    prLink: null,
                    error: "Failed to run gh CLI",
                    loading: false,
                    fetchedAt: Date.now(),
                });
                this.workspacePRSubscriptions.bump(workspaceId);
                return;
            }
            const output = result.data.output;
            if (output) {
                const parsed = JSON.parse(output);
                if ("no_pr" in parsed) {
                    // No PR for this branch
                    this.workspacePRCache.set(workspaceId, {
                        prLink: null,
                        loading: false,
                        fetchedAt: Date.now(),
                    });
                }
                else {
                    // Parse PR link from URL
                    const prUrl = parsed.url;
                    const prLinkBase = parseGitHubPRUrl(prUrl);
                    if (!prLinkBase) {
                        this.workspacePRCache.set(workspaceId, {
                            prLink: null,
                            error: "Invalid PR URL from gh CLI",
                            loading: false,
                            fetchedAt: Date.now(),
                        });
                    }
                    else {
                        const { hasPendingChecks, hasFailedChecks } = summarizeStatusCheckRollup(parsed.statusCheckRollup);
                        const status = {
                            state: parsed.state ?? "OPEN",
                            mergeable: parsed.mergeable ?? "UNKNOWN",
                            mergeStateStatus: parsed.mergeStateStatus ?? "UNKNOWN",
                            title: parsed.title ?? "",
                            isDraft: parsed.isDraft ?? false,
                            headRefName: parsed.headRefName ?? "",
                            baseRefName: parsed.baseRefName ?? "",
                            hasPendingChecks,
                            hasFailedChecks,
                            fetchedAt: Date.now(),
                        };
                        const prLink = {
                            type: "github-pr",
                            url: prUrl,
                            ...prLinkBase,
                            detectedAt: Date.now(),
                            occurrenceCount: 1,
                        };
                        this.workspacePRCache.set(workspaceId, {
                            prLink,
                            status,
                            loading: false,
                            fetchedAt: Date.now(),
                        });
                        // Persist to localStorage for instant display on app restart
                        prStatusLRU.set(workspaceId, { prLink, status });
                    }
                }
            }
            else {
                this.workspacePRCache.set(workspaceId, {
                    prLink: null,
                    error: "Empty response from gh CLI",
                    loading: false,
                    fetchedAt: Date.now(),
                });
            }
            this.workspacePRSubscriptions.bump(workspaceId);
        }
        catch (err) {
            if (!this.isActive)
                return;
            this.workspacePRCache.set(workspaceId, {
                prLink: null,
                error: err instanceof Error ? err.message : "Unknown error",
                loading: false,
                fetchedAt: Date.now(),
            });
            this.workspacePRSubscriptions.bump(workspaceId);
        }
    }
    shouldFetchWorkspace(entry, now) {
        if (!entry)
            return true;
        // Allow refresh if entry was hydrated from localStorage (fetchedAt === 0)
        // but is marked loading - this means we have stale cached data and need fresh data.
        if (entry.loading && entry.fetchedAt !== 0)
            return false;
        if (entry.error) {
            return now - entry.fetchedAt > ERROR_RETRY_DELAY_MS;
        }
        return now - entry.fetchedAt > STATUS_CACHE_TTL_MS;
    }
    /**
     * Refresh PR status for all subscribed workspaces.
     * Called via RefreshController (focus + debounced refresh).
     */
    async refreshAll() {
        if (!this.client || !this.isActive)
            return;
        const workspaceIds = Array.from(this.workspaceSubscriptionCounts.keys());
        if (workspaceIds.length === 0) {
            return;
        }
        const now = Date.now();
        const refreshes = [];
        for (const workspaceId of workspaceIds) {
            const cached = this.workspacePRCache.get(workspaceId);
            if (this.shouldFetchWorkspace(cached, now)) {
                refreshes.push(this.detectWorkspacePR(workspaceId));
            }
        }
        await Promise.all(refreshes);
    }
    /**
     * Dispose the store.
     */
    dispose() {
        this.isActive = false;
        this.refreshController.dispose();
    }
}
// Singleton instance
let storeInstance = null;
export function getPRStatusStoreInstance() {
    storeInstance ?? (storeInstance = new PRStatusStore());
    return storeInstance;
}
export function setPRStatusStoreInstance(store) {
    storeInstance = store;
}
// ─────────────────────────────────────────────────────────────────────────────
// React hooks
// ─────────────────────────────────────────────────────────────────────────────
// Cache for useWorkspacePR hook to return stable references
const workspacePRHookCache = new Map();
/**
 * Hook to get PR for a workspace (branch-based detection).
 * Returns the detected PR with status, or null if no PR for this branch.
 */
export function useWorkspacePR(workspaceId) {
    const store = getPRStatusStoreInstance();
    return useSyncExternalStore((listener) => store.subscribeWorkspace(workspaceId, listener), () => {
        const cached = store.getWorkspacePR(workspaceId);
        const existing = workspacePRHookCache.get(workspaceId);
        // No data yet
        if (!cached) {
            if (existing === null)
                return existing;
            workspacePRHookCache.set(workspaceId, null);
            return null;
        }
        // No PR for this branch
        if (!cached.prLink) {
            if (existing === null)
                return existing;
            workspacePRHookCache.set(workspaceId, null);
            return null;
        }
        // Return same reference if nothing meaningful changed
        if (existing?.url === cached.prLink.url &&
            existing.status === cached.status &&
            existing.loading === cached.loading &&
            existing.error === cached.error) {
            return existing;
        }
        // Build new object and cache it
        const newResult = {
            ...cached.prLink,
            status: cached.status,
            loading: cached.loading,
            error: cached.error,
        };
        workspacePRHookCache.set(workspaceId, newResult);
        return newResult;
    });
}
//# sourceMappingURL=PRStatusStore.js.map