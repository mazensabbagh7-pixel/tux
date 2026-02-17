import assert from "@/common/utils/assert";
import { renderTodoItemsAsMarkdownList } from "@/common/utils/todoList";
import { readTodosForSessionDir } from "@/node/services/todos/todoStorage";
const FIRST_REMINDER_TOOL_CALL_COUNT = 5;
const REMINDER_TOOL_CALL_INTERVAL = 10;
function isReminderDue(toolCallsSinceLastTodoWrite) {
    if (toolCallsSinceLastTodoWrite === FIRST_REMINDER_TOOL_CALL_COUNT) {
        return true;
    }
    if (toolCallsSinceLastTodoWrite > FIRST_REMINDER_TOOL_CALL_COUNT) {
        return ((toolCallsSinceLastTodoWrite - FIRST_REMINDER_TOOL_CALL_COUNT) %
            REMINDER_TOOL_CALL_INTERVAL ===
            0);
    }
    return false;
}
export class TodoListReminderSource {
    constructor(args) {
        this.toolCallsSinceLastTodoWrite = 0;
        assert(typeof args.workspaceSessionDir === "string", "workspaceSessionDir must be a string");
        this.workspaceSessionDir = args.workspaceSessionDir;
    }
    async poll(ctx) {
        assert(typeof ctx.toolName === "string", "toolName must be a string");
        if (ctx.toolName === "todo_write") {
            if (ctx.toolSucceeded) {
                this.toolCallsSinceLastTodoWrite = 0;
            }
            return [];
        }
        this.toolCallsSinceLastTodoWrite += 1;
        if (!isReminderDue(this.toolCallsSinceLastTodoWrite)) {
            return [];
        }
        const todos = await readTodosForSessionDir(this.workspaceSessionDir);
        if (todos.length === 0) {
            return [];
        }
        if (todos.every((t) => t.status === "completed")) {
            return [];
        }
        const renderedTodos = renderTodoItemsAsMarkdownList(todos);
        const content = `<notification>\nIt's been ${this.toolCallsSinceLastTodoWrite} tool calls since you last updated the TODO list. If your progress changed, update it now using todo_write.\n\nCurrent TODO List:\n${renderedTodos || "- (empty)"}\n</notification>`;
        return [
            {
                source: "todo_list_reminder",
                content,
            },
        ];
    }
}
//# sourceMappingURL=TodoListReminderSource.js.map