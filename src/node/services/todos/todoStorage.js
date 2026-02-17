import * as fs from "fs/promises";
import * as path from "path";
const TODO_FILE_NAME = "todos.json";
/**
 * Get path to todos.json file in the workspace's session directory.
 */
export function getTodoFilePath(workspaceSessionDir) {
    return path.join(workspaceSessionDir, TODO_FILE_NAME);
}
export function coerceTodoItems(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    const result = [];
    for (const item of value) {
        if (!item || typeof item !== "object")
            continue;
        const content = item.content;
        const status = item.status;
        if (typeof content !== "string")
            continue;
        if (status !== "pending" && status !== "in_progress" && status !== "completed")
            continue;
        result.push({ content, status });
    }
    return result;
}
/**
 * Read todos from the workspace session directory.
 */
export async function readTodosForSessionDir(workspaceSessionDir) {
    const todoFile = getTodoFilePath(workspaceSessionDir);
    try {
        const content = await fs.readFile(todoFile, "utf-8");
        const parsed = JSON.parse(content);
        return coerceTodoItems(parsed);
    }
    catch (error) {
        // File doesn't exist yet or is invalid
        if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
            return [];
        }
        return [];
    }
}
//# sourceMappingURL=todoStorage.js.map