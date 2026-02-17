// Browser-safe assertion helper for renderer and worker bundles.
// Throws immediately when invariants are violated so bugs surface early.
export class AssertionError extends Error {
    constructor(message) {
        super(message ?? "Assertion failed");
        this.name = "AssertionError";
    }
}
export function assert(condition, message) {
    if (!condition) {
        throw new AssertionError(message);
    }
}
export default assert;
//# sourceMappingURL=assert.js.map