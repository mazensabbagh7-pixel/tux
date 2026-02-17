/**
 * Type definitions for dynamic tool parts
 */
export function isDynamicToolPart(part) {
    return (typeof part === "object" && part !== null && "type" in part && part.type === "dynamic-tool");
}
//# sourceMappingURL=toolParts.js.map