/**
 * Telemetry utility functions
 */
/**
 * Round a number to the nearest power of 2 for privacy-preserving metrics
 * E.g., 350 -> 512, 1200 -> 2048
 *
 * This allows numerical analysis while preventing exact values from leaking information
 */
export function roundToBase2(value) {
    if (value <= 0)
        return 0;
    // Find the next power of 2
    return Math.pow(2, Math.ceil(Math.log2(value)));
}
/**
 * Get frontend platform information for telemetry.
 * Uses browser APIs (navigator) which are safe to send and widely shared.
 */
export function getFrontendPlatformInfo() {
    // Safe defaults for non-browser environments (SSR, tests)
    if (typeof navigator === "undefined") {
        return {
            userAgent: "unknown",
            platform: "unknown",
        };
    }
    return {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
    };
}
/**
 * Convert RuntimeConfig to telemetry-friendly runtime type.
 * Handles legacy "local with srcBaseDir" as worktree.
 */
export function getRuntimeTypeForTelemetry(runtimeConfig) {
    if (!runtimeConfig) {
        // Default is worktree mode
        return "worktree";
    }
    switch (runtimeConfig.type) {
        case "ssh":
            return "ssh";
        case "docker":
            return "docker";
        case "devcontainer":
            return "devcontainer";
        case "worktree":
            return "worktree";
        case "local":
            // Check if it has srcBaseDir (legacy worktree)
            if ("srcBaseDir" in runtimeConfig && runtimeConfig.srcBaseDir) {
                return "worktree"; // Legacy worktree config
            }
            return "local"; // True project-dir local
    }
}
//# sourceMappingURL=utils.js.map