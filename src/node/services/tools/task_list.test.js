var __addDisposableResource = (this && this.__addDisposableResource) || function (env, value, async) {
    if (value !== null && value !== void 0) {
        if (typeof value !== "object" && typeof value !== "function") throw new TypeError("Object expected.");
        var dispose, inner;
        if (async) {
            if (!Symbol.asyncDispose) throw new TypeError("Symbol.asyncDispose is not defined.");
            dispose = value[Symbol.asyncDispose];
        }
        if (dispose === void 0) {
            if (!Symbol.dispose) throw new TypeError("Symbol.dispose is not defined.");
            dispose = value[Symbol.dispose];
            if (async) inner = dispose;
        }
        if (typeof dispose !== "function") throw new TypeError("Object not disposable.");
        if (inner) dispose = function() { try { inner.call(this); } catch (e) { return Promise.reject(e); } };
        env.stack.push({ value: value, dispose: dispose, async: async });
    }
    else if (async) {
        env.stack.push({ async: true });
    }
    return value;
};
var __disposeResources = (this && this.__disposeResources) || (function (SuppressedError) {
    return function (env) {
        function fail(e) {
            env.error = env.hasError ? new SuppressedError(e, env.error, "An error was suppressed during disposal.") : e;
            env.hasError = true;
        }
        var r, s = 0;
        function next() {
            while (r = env.stack.pop()) {
                try {
                    if (!r.async && s === 1) return s = 0, env.stack.push(r), Promise.resolve().then(next);
                    if (r.dispose) {
                        var result = r.dispose.call(r.value);
                        if (r.async) return s |= 2, Promise.resolve(result).then(next, function(e) { fail(e); return next(); });
                    }
                    else s |= 1;
                }
                catch (e) {
                    fail(e);
                }
            }
            if (s === 1) return env.hasError ? Promise.reject(env.error) : Promise.resolve();
            if (env.hasError) throw env.error;
        }
        return next();
    };
})(typeof SuppressedError === "function" ? SuppressedError : function (error, suppressed, message) {
    var e = new Error(message);
    return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
});
import { describe, it, expect, mock } from "bun:test";
import { createTaskListTool } from "./task_list";
import { TestTempDir, createTestToolConfig } from "./testHelpers";
const mockToolCallOptions = {
    toolCallId: "test-call-id",
    messages: [],
};
describe("task_list tool", () => {
    it("uses default statuses when none are provided", async () => {
        const env_1 = { stack: [], error: void 0, hasError: false };
        try {
            const tempDir = __addDisposableResource(env_1, new TestTempDir("test-task-list-default-statuses"), false);
            const baseConfig = createTestToolConfig(tempDir.path, { workspaceId: "root-workspace" });
            const listDescendantAgentTasks = mock(() => []);
            const taskService = { listDescendantAgentTasks };
            const tool = createTaskListTool({ ...baseConfig, taskService });
            const result = await Promise.resolve(tool.execute({}, mockToolCallOptions));
            expect(result).toEqual({ tasks: [] });
            expect(listDescendantAgentTasks).toHaveBeenCalledWith("root-workspace", {
                statuses: ["queued", "running", "awaiting_report"],
            });
        }
        catch (e_1) {
            env_1.error = e_1;
            env_1.hasError = true;
        }
        finally {
            __disposeResources(env_1);
        }
    });
    it("passes through provided statuses", async () => {
        const env_2 = { stack: [], error: void 0, hasError: false };
        try {
            const tempDir = __addDisposableResource(env_2, new TestTempDir("test-task-list-statuses"), false);
            const baseConfig = createTestToolConfig(tempDir.path, { workspaceId: "root-workspace" });
            const listDescendantAgentTasks = mock(() => []);
            const taskService = { listDescendantAgentTasks };
            const tool = createTaskListTool({ ...baseConfig, taskService });
            const result = await Promise.resolve(tool.execute({ statuses: ["running"] }, mockToolCallOptions));
            expect(result).toEqual({ tasks: [] });
            expect(listDescendantAgentTasks).toHaveBeenCalledWith("root-workspace", {
                statuses: ["running"],
            });
        }
        catch (e_2) {
            env_2.error = e_2;
            env_2.hasError = true;
        }
        finally {
            __disposeResources(env_2);
        }
    });
    it("returns tasks with metadata", async () => {
        const env_3 = { stack: [], error: void 0, hasError: false };
        try {
            const tempDir = __addDisposableResource(env_3, new TestTempDir("test-task-list-ok"), false);
            const baseConfig = createTestToolConfig(tempDir.path, { workspaceId: "root-workspace" });
            const listDescendantAgentTasks = mock(() => [
                {
                    taskId: "task-1",
                    status: "running",
                    parentWorkspaceId: "root-workspace",
                    agentType: "exec",
                    workspaceName: "agent_exec_task-1",
                    title: "t",
                    createdAt: "2025-01-01T00:00:00.000Z",
                    modelString: "anthropic:claude-haiku-4-5",
                    thinkingLevel: "low",
                    depth: 1,
                },
            ]);
            const taskService = { listDescendantAgentTasks };
            const tool = createTaskListTool({ ...baseConfig, taskService });
            const result = await Promise.resolve(tool.execute({}, mockToolCallOptions));
            expect(result).toEqual({
                tasks: [
                    {
                        taskId: "task-1",
                        status: "running",
                        parentWorkspaceId: "root-workspace",
                        agentType: "exec",
                        workspaceName: "agent_exec_task-1",
                        title: "t",
                        createdAt: "2025-01-01T00:00:00.000Z",
                        modelString: "anthropic:claude-haiku-4-5",
                        thinkingLevel: "low",
                        depth: 1,
                    },
                ],
            });
        }
        catch (e_3) {
            env_3.error = e_3;
            env_3.hasError = true;
        }
        finally {
            __disposeResources(env_3);
        }
    });
});
//# sourceMappingURL=task_list.test.js.map