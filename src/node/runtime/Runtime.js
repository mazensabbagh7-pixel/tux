/**
 * Shared error message for missing repositories during runtime readiness checks.
 */
export const WORKSPACE_REPO_MISSING_ERROR = "Workspace setup incomplete: repository not found.";
/**
 * Error thrown by runtime implementations
 */
export class RuntimeError extends Error {
    constructor(message, type, cause) {
        super(message);
        this.type = type;
        this.cause = cause;
        this.name = "RuntimeError";
    }
}
//# sourceMappingURL=Runtime.js.map