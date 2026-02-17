/**
 * Environment helpers for the browser/renderer runtime.
 */
export function isVscodeWebview() {
    return typeof globalThis.acquireVsCodeApi === "function";
}
//# sourceMappingURL=env.js.map