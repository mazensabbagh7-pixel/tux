import { Err } from "@/common/types/result";
import { closeServer } from "@/node/utils/oauthUtils";
import { log } from "@/node/services/log";
const DEFAULT_COMPLETED_FLOW_TTL_MS = 60000;
// ---------------------------------------------------------------------------
// Manager
// ---------------------------------------------------------------------------
export class OAuthFlowManager {
    constructor(completedFlowTtlMs = DEFAULT_COMPLETED_FLOW_TTL_MS) {
        this.completedFlowTtlMs = completedFlowTtlMs;
        this.flows = new Map();
        this.completed = new Map();
    }
    /** Register a new in-flight flow. */
    register(flowId, entry) {
        // If a flow ID is re-used before the completed-flow TTL expires, ensure the
        // old cleanup timer can't delete the new result.
        this.clearCompleted(flowId);
        const existing = this.flows.get(flowId);
        if (existing) {
            // Defensive: avoid silently overwriting an active flow entry.
            //
            // This can happen if a provider accidentally re-uses a flow ID, or if a
            // stale in-flight start attempt races a newer one. Best-effort cleanup to
            // avoid leaking timeouts, deferred promises, or loopback servers.
            log.debug(`[OAuthFlowManager] Duplicate register — replacing active flow (flowId=${flowId})`);
            if (existing.timeoutHandle !== null) {
                clearTimeout(existing.timeoutHandle);
            }
            try {
                existing.resultDeferred.resolve(Err("OAuth flow replaced"));
                if (existing.server) {
                    // Stop accepting new connections.
                    void closeServer(existing.server);
                }
            }
            catch (error) {
                log.debug("Failed to clean up replaced OAuth flow:", error);
            }
        }
        this.flows.set(flowId, entry);
    }
    clearCompleted(flowId) {
        const existing = this.completed.get(flowId);
        if (!existing)
            return;
        if (existing.cleanupTimeout !== null) {
            clearTimeout(existing.cleanupTimeout);
        }
        this.completed.delete(flowId);
    }
    /** Get a flow entry by ID, or undefined if not found. */
    get(flowId) {
        return this.flows.get(flowId);
    }
    /** Check whether a flow exists. */
    has(flowId) {
        return this.flows.has(flowId);
    }
    /**
     * Wait for a flow to complete with a caller-facing timeout race.
     *
     * Mirrors the `waitForDesktopFlow` pattern shared across all four services:
     * - Creates a local timeout promise for this wait call only.
     * - Races that local timeout against `flow.resultDeferred.promise`.
     * - Registration-time timeout remains on `flow.timeoutHandle` and is cleared in `finish`.
     * - On any error result (caller timeout or flow error), calls `finish` for shared cleanup.
     */
    async waitFor(flowId, timeoutMs) {
        const flow = this.flows.get(flowId);
        if (!flow) {
            const completed = this.completed.get(flowId);
            if (completed) {
                return completed.result;
            }
            return Err("OAuth flow not found");
        }
        let timeoutHandle = null;
        const timeoutPromise = new Promise((resolve) => {
            timeoutHandle = setTimeout(() => {
                resolve(Err("Timed out waiting for OAuth callback"));
            }, timeoutMs);
        });
        const result = await Promise.race([flow.resultDeferred.promise, timeoutPromise]);
        if (timeoutHandle !== null) {
            clearTimeout(timeoutHandle);
        }
        if (!result.success) {
            // Ensure listener is closed on timeout/errors.
            void this.finish(flowId, result);
        }
        return result;
    }
    /**
     * Cancel a flow — resolves the deferred with an error and cleans up.
     *
     * Mirrors the `cancelDesktopFlow` pattern.
     */
    async cancel(flowId) {
        const flow = this.flows.get(flowId);
        if (!flow)
            return;
        await this.finish(flowId, Err("OAuth flow cancelled"));
    }
    /**
     * Finish a flow: resolve the deferred, clear the timeout, close the server,
     * and remove the entry from the map.
     *
     * Idempotent — no-op if the flow was already removed. Mirrors the
     * `finishDesktopFlow` pattern.
     */
    async finish(flowId, result) {
        const flow = this.flows.get(flowId);
        if (!flow)
            return;
        // Remove from map first to make re-entrant calls no-ops.
        this.flows.delete(flowId);
        if (flow.timeoutHandle !== null) {
            clearTimeout(flow.timeoutHandle);
        }
        // Preserve the final result briefly so late waiters can still retrieve it.
        //
        // Old per-service DesktopFlow implementations kept completed flows around for
        // ~60s (cleanupTimeout) to avoid a race where the OAuth callback finishes
        // before the frontend begins `waitFor`-ing.
        this.clearCompleted(flowId);
        const cleanupTimeout = setTimeout(() => {
            this.completed.delete(flowId);
        }, this.completedFlowTtlMs);
        // Don't keep the node process alive just to delete old completed entries.
        if (typeof cleanupTimeout !== "number") {
            cleanupTimeout.unref?.();
        }
        this.completed.set(flowId, { result, cleanupTimeout });
        try {
            flow.resultDeferred.resolve(result);
            if (flow.server) {
                // Stop accepting new connections.
                await closeServer(flow.server);
            }
        }
        catch (error) {
            log.debug("Failed to close OAuth callback listener:", error);
        }
    }
    /**
     * Shut down all active flows — resolves each with an error.
     *
     * Mirrors the `dispose` pattern where services iterate all flows
     * and finish them with `Err("App shutting down")`.
     */
    async shutdownAll() {
        const flowIds = [...this.flows.keys()];
        await Promise.all(flowIds.map((id) => this.finish(id, Err("App shutting down"))));
    }
}
//# sourceMappingURL=oauthFlowManager.js.map