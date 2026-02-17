import { Ok, Err } from "@/common/types/result";
import { log } from "@/node/services/log";
function sanitizeErrorMessage(error) {
    const raw = error instanceof Error ? error.message : String(error);
    // Keep single-line, capped error messages to avoid leaking stack traces or long CLI output.
    const singleLine = raw.split("\n")[0]?.trim() ?? "";
    return singleLine.slice(0, 200) || "Unknown error";
}
/**
 * Backend registry for workspace lifecycle hooks.
 *
 * Hooks run in-process (sequentially).
 * - beforeArchive hooks may block the operation if they return Err.
 * - afterUnarchive hooks are best-effort and never block unarchive.
 */
export class WorkspaceLifecycleHooks {
    constructor() {
        this.beforeArchiveHooks = [];
        this.afterUnarchiveHooks = [];
    }
    registerBeforeArchive(hook) {
        this.beforeArchiveHooks.push(hook);
    }
    registerAfterUnarchive(hook) {
        this.afterUnarchiveHooks.push(hook);
    }
    async runBeforeArchive(args) {
        for (const hook of this.beforeArchiveHooks) {
            try {
                const result = await hook(args);
                if (!result.success) {
                    return Err(sanitizeErrorMessage(result.error));
                }
            }
            catch (error) {
                return Err(`beforeArchive hook threw: ${sanitizeErrorMessage(error)}`);
            }
        }
        return Ok(undefined);
    }
    async runAfterUnarchive(args) {
        for (const hook of this.afterUnarchiveHooks) {
            try {
                const result = await hook(args);
                if (!result.success) {
                    log.debug("afterUnarchive hook failed", {
                        workspaceId: args.workspaceId,
                        error: sanitizeErrorMessage(result.error),
                    });
                }
            }
            catch (error) {
                log.debug("afterUnarchive hook threw", {
                    workspaceId: args.workspaceId,
                    error: sanitizeErrorMessage(error),
                });
            }
        }
    }
}
//# sourceMappingURL=workspaceLifecycleHooks.js.map