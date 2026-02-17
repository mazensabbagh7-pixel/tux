import assert from "@/common/utils/assert";
/**
 * Shallow-clone a Tool preserving property descriptors (getters, etc.).
 *
 * This avoids invoking getters during cloning, which matters for some
 * dynamic tools. Used whenever we need a writable copy of a frozen tool
 * object (e.g., to override `execute` or `description`).
 */
export function cloneToolPreservingDescriptors(tool) {
    assert(tool && typeof tool === "object", "tool must be an object");
    const prototype = Object.getPrototypeOf(tool);
    assert(prototype === null || typeof prototype === "object", "tool prototype must be an object or null");
    const clone = Object.create(prototype);
    Object.defineProperties(clone, Object.getOwnPropertyDescriptors(tool));
    return clone;
}
//# sourceMappingURL=cloneToolPreservingDescriptors.js.map