import { describe, expect, test } from "bun:test";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { LocalRuntime } from "@/node/runtime/LocalRuntime";
import { setTodosForSessionDir } from "@/node/services/tools/todo";
import { MODEL_ONLY_TOOL_NOTIFICATIONS_FIELD } from "./internalToolResultFields";
import { getToolsForModel } from "./tools";
function getExecute(tool) {
    if (!tool || typeof tool !== "object" || !("execute" in tool)) {
        throw new Error("Tool is missing execute()");
    }
    const execute = tool.execute;
    if (typeof execute !== "function") {
        throw new Error("Tool execute() is not a function");
    }
    return execute;
}
function asRecord(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("Expected a plain object tool result");
    }
    return value;
}
describe("getToolsForModel - model-only notifications", () => {
    test("injects __mux_notifications into tool results after 5 tool calls", async () => {
        const workspaceSessionDir = await fs.mkdtemp(path.join(os.tmpdir(), "mux-ws-"));
        try {
            await setTodosForSessionDir("ws-1", workspaceSessionDir, [
                { content: "Completed", status: "completed" },
                { content: "In progress", status: "in_progress" },
                { content: "Pending", status: "pending" },
            ]);
            const runtime = new LocalRuntime(process.cwd());
            const initStateManager = {
                waitForInit: () => Promise.resolve(),
            };
            const tools = await getToolsForModel("noop:model", {
                cwd: process.cwd(),
                runtime,
                runtimeTempDir: "/tmp",
                workspaceSessionDir,
            }, "ws-1", initStateManager);
            const todoReadExecute = getExecute(tools.todo_read);
            for (let i = 0; i < 4; i += 1) {
                const result = asRecord(await todoReadExecute());
                expect(MODEL_ONLY_TOOL_NOTIFICATIONS_FIELD in result).toBe(false);
            }
            const fifth = asRecord(await todoReadExecute());
            expect(Array.isArray(fifth[MODEL_ONLY_TOOL_NOTIFICATIONS_FIELD])).toBe(true);
            expect(String(fifth[MODEL_ONLY_TOOL_NOTIFICATIONS_FIELD][0])).toContain("Current TODO List");
        }
        finally {
            await fs.rm(workspaceSessionDir, { recursive: true, force: true });
        }
    });
    test("does not re-wrap cached MCP tools across getToolsForModel() calls", async () => {
        const workspaceSessionDir = await fs.mkdtemp(path.join(os.tmpdir(), "mux-ws-"));
        try {
            await setTodosForSessionDir("ws-1", workspaceSessionDir, [
                { content: "In progress", status: "in_progress" },
            ]);
            const runtime = new LocalRuntime(process.cwd());
            const initStateManager = {
                waitForInit: () => Promise.resolve(),
            };
            const cachedMcpTool = {
                // eslint-disable-next-line @typescript-eslint/require-await
                execute: async () => ({ ok: true }),
            };
            const tools1 = await getToolsForModel("noop:model", {
                cwd: process.cwd(),
                runtime,
                runtimeTempDir: "/tmp",
                workspaceSessionDir,
            }, "ws-1", initStateManager, undefined, { mcp_dummy: cachedMcpTool });
            const execute1 = getExecute(tools1.mcp_dummy);
            for (let i = 0; i < 4; i += 1) {
                const result = asRecord(await execute1());
                expect(MODEL_ONLY_TOOL_NOTIFICATIONS_FIELD in result).toBe(false);
            }
            const tools2 = await getToolsForModel("noop:model", {
                cwd: process.cwd(),
                runtime,
                runtimeTempDir: "/tmp",
                workspaceSessionDir,
            }, "ws-1", initStateManager, undefined, { mcp_dummy: cachedMcpTool });
            const execute2 = getExecute(tools2.mcp_dummy);
            for (let i = 0; i < 4; i += 1) {
                const result = asRecord(await execute2());
                expect(MODEL_ONLY_TOOL_NOTIFICATIONS_FIELD in result).toBe(false);
            }
            const fifth = asRecord(await execute2());
            expect(Array.isArray(fifth[MODEL_ONLY_TOOL_NOTIFICATIONS_FIELD])).toBe(true);
        }
        finally {
            await fs.rm(workspaceSessionDir, { recursive: true, force: true });
        }
    });
    test("does not enable notification injection when workspaceSessionDir is missing", async () => {
        const runtime = new LocalRuntime(process.cwd());
        const initStateManager = {
            waitForInit: () => Promise.resolve(),
        };
        const dummyTool = {
            // eslint-disable-next-line @typescript-eslint/require-await
            execute: async () => ({ ok: true }),
        };
        const tools = await getToolsForModel("noop:model", {
            cwd: process.cwd(),
            runtime,
            runtimeTempDir: "/tmp",
        }, "ws-1", initStateManager, undefined, { dummy: dummyTool });
        const dummyExecute = getExecute(tools.dummy);
        for (let i = 0; i < 5; i += 1) {
            const result = asRecord(await dummyExecute());
            expect(MODEL_ONLY_TOOL_NOTIFICATIONS_FIELD in result).toBe(false);
        }
    });
    test("only attaches notifications to plain-object tool results", async () => {
        const workspaceSessionDir = await fs.mkdtemp(path.join(os.tmpdir(), "mux-ws-"));
        try {
            await setTodosForSessionDir("ws-1", workspaceSessionDir, [
                { content: "In progress", status: "in_progress" },
            ]);
            const runtime = new LocalRuntime(process.cwd());
            const initStateManager = {
                waitForInit: () => Promise.resolve(),
            };
            const stringTool = {
                // eslint-disable-next-line @typescript-eslint/require-await
                execute: async () => "ok",
            };
            const tools = await getToolsForModel("noop:model", {
                cwd: process.cwd(),
                runtime,
                runtimeTempDir: "/tmp",
                workspaceSessionDir,
            }, "ws-1", initStateManager, undefined, { string_tool: stringTool });
            const stringExecute = getExecute(tools.string_tool);
            const todoReadExecute = getExecute(tools.todo_read);
            for (let i = 0; i < 4; i += 1) {
                const result = await stringExecute();
                expect(result).toBe("ok");
            }
            const fifth = asRecord(await todoReadExecute());
            expect(Array.isArray(fifth[MODEL_ONLY_TOOL_NOTIFICATIONS_FIELD])).toBe(true);
        }
        finally {
            await fs.rm(workspaceSessionDir, { recursive: true, force: true });
        }
    });
});
//# sourceMappingURL=tools.modelOnlyNotifications.test.js.map