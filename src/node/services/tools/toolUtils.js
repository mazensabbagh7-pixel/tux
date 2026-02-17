import assert from "node:assert/strict";
export function requireWorkspaceId(config, toolName) {
    assert(config.workspaceId, `${toolName} requires workspaceId`);
    return config.workspaceId;
}
export function requireTaskService(config, toolName) {
    assert(config.taskService, `${toolName} requires taskService`);
    return config.taskService;
}
export function parseToolResult(schema, value, toolName) {
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
        throw new Error(`${toolName} tool result validation failed: ${parsed.error.message}`);
    }
    return parsed.data;
}
export function dedupeStrings(values) {
    return Array.from(new Set(values));
}
//# sourceMappingURL=toolUtils.js.map