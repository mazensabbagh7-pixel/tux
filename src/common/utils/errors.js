/**
 * Extract a string message from an unknown error value
 * Handles Error objects and other thrown values consistently
 */
export function getErrorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
//# sourceMappingURL=errors.js.map