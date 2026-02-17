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
import { createBashTool } from "./bash";
import { createTaskAwaitTool } from "./task_await";
import { createTaskListTool } from "./task_list";
import { createTaskTerminateTool } from "./task_terminate";
import { TestTempDir, createTestToolConfig } from "./testHelpers";
const mockToolCallOptions = {
    toolCallId: "test-call-id",
    messages: [],
};
describe("bash + task_* (background bash tasks)", () => {
    it("bash(run_in_background=true) returns a taskId for background commands", async () => {
        const env_1 = { stack: [], error: void 0, hasError: false };
        try {
            const tempDir = __addDisposableResource(env_1, new TestTempDir("test-bash-background"), false);
            const spawn = mock(() => ({
                success: true,
                processId: "proc-1",
                outputDir: "ignored",
                pid: 123,
            }));
            const backgroundProcessManager = { spawn };
            const tool = createBashTool({
                ...createTestToolConfig(tempDir.path, { workspaceId: "ws-1" }),
                backgroundProcessManager,
            });
            const result = await Promise.resolve(tool.execute({
                script: "echo hi",
                timeout_secs: 10,
                run_in_background: true,
                display_name: "My Proc",
            }, mockToolCallOptions));
            expect(spawn).toHaveBeenCalled();
            expect(result).toEqual(expect.objectContaining({
                success: true,
                exitCode: 0,
                backgroundProcessId: "proc-1",
                taskId: "bash:proc-1",
            }));
        }
        catch (e_1) {
            env_1.error = e_1;
            env_1.hasError = true;
        }
        finally {
            __disposeResources(env_1);
        }
    });
    it("task_await returns incremental output for bash tasks", async () => {
        const env_2 = { stack: [], error: void 0, hasError: false };
        try {
            const tempDir = __addDisposableResource(env_2, new TestTempDir("test-task-await-bash"), false);
            const getProcess = mock(() => ({ id: "proc-1", workspaceId: "ws-1", displayName: "My Proc" }));
            const getOutput = mock(() => ({
                success: true,
                status: "running",
                output: "hello",
                elapsed_ms: 5,
            }));
            const backgroundProcessManager = {
                getProcess,
                getOutput,
            };
            const taskService = {
                listActiveDescendantAgentTaskIds: mock(() => []),
                isDescendantAgentTask: mock(() => Promise.resolve(false)),
                waitForAgentReport: mock(() => Promise.resolve({ reportMarkdown: "ignored" })),
            };
            const tool = createTaskAwaitTool({
                ...createTestToolConfig(tempDir.path, { workspaceId: "ws-1" }),
                backgroundProcessManager,
                taskService,
            });
            const result = await Promise.resolve(tool.execute({ task_ids: ["bash:proc-1"], timeout_secs: 0 }, mockToolCallOptions));
            expect(getProcess).toHaveBeenCalledWith("proc-1");
            expect(getOutput).toHaveBeenCalled();
            expect(result).toEqual({
                results: [
                    {
                        status: "running",
                        taskId: "bash:proc-1",
                        output: "hello",
                        elapsed_ms: 5,
                        note: undefined,
                    },
                ],
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
    it("task_list includes background bash tasks", async () => {
        const env_3 = { stack: [], error: void 0, hasError: false };
        try {
            const tempDir = __addDisposableResource(env_3, new TestTempDir("test-task-list-bash"), false);
            const startTime = Date.parse("2025-01-01T00:00:00.000Z");
            const list = mock(() => [
                {
                    id: "proc-1",
                    workspaceId: "ws-1",
                    status: "running",
                    displayName: "My Proc",
                    startTime,
                },
            ]);
            const backgroundProcessManager = { list };
            const taskService = {
                listDescendantAgentTasks: mock(() => []),
                isDescendantAgentTask: mock(() => Promise.resolve(false)),
            };
            const tool = createTaskListTool({
                ...createTestToolConfig(tempDir.path, { workspaceId: "ws-1" }),
                backgroundProcessManager,
                taskService,
            });
            const result = await Promise.resolve(tool.execute({}, mockToolCallOptions));
            expect(result).toEqual({
                tasks: [
                    {
                        taskId: "bash:proc-1",
                        status: "running",
                        parentWorkspaceId: "ws-1",
                        title: "My Proc",
                        createdAt: new Date(startTime).toISOString(),
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
    it("task_terminate can terminate bash tasks", async () => {
        const env_4 = { stack: [], error: void 0, hasError: false };
        try {
            const tempDir = __addDisposableResource(env_4, new TestTempDir("test-task-terminate-bash"), false);
            const getProcess = mock(() => ({ id: "proc-1", workspaceId: "ws-1" }));
            const terminate = mock(() => ({ success: true }));
            const backgroundProcessManager = {
                getProcess,
                terminate,
            };
            const taskService = {
                terminateDescendantAgentTask: mock(() => Promise.resolve({ success: false, error: "not used" })),
                isDescendantAgentTask: mock(() => Promise.resolve(false)),
            };
            const tool = createTaskTerminateTool({
                ...createTestToolConfig(tempDir.path, { workspaceId: "ws-1" }),
                backgroundProcessManager,
                taskService,
            });
            const result = await Promise.resolve(tool.execute({ task_ids: ["bash:proc-1"] }, mockToolCallOptions));
            expect(getProcess).toHaveBeenCalledWith("proc-1");
            expect(terminate).toHaveBeenCalledWith("proc-1");
            expect(result).toEqual({
                results: [
                    { status: "terminated", taskId: "bash:proc-1", terminatedTaskIds: ["bash:proc-1"] },
                ],
            });
        }
        catch (e_4) {
            env_4.error = e_4;
            env_4.hasError = true;
        }
        finally {
            __disposeResources(env_4);
        }
    });
});
//# sourceMappingURL=task.bash.test.js.map