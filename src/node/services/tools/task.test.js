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
import { createTaskTool } from "./task";
import { TestTempDir, createTestToolConfig } from "./testHelpers";
import { Ok, Err } from "@/common/types/result";
// Mock ToolCallOptions for testing
const mockToolCallOptions = {
    toolCallId: "test-call-id",
    messages: [],
};
function expectQueuedOrRunningTaskToolResult(result, expected) {
    expect(result).toBeTruthy();
    expect(typeof result).toBe("object");
    expect(result).not.toBeNull();
    const obj = result;
    expect(obj.status).toBe(expected.status);
    expect(obj.taskId).toBe(expected.taskId);
    const note = obj.note;
    expect(typeof note).toBe("string");
    if (typeof note === "string") {
        expect(note).toContain("task_await");
    }
}
describe("task tool", () => {
    it("should return immediately when run_in_background is true", async () => {
        const env_1 = { stack: [], error: void 0, hasError: false };
        try {
            const tempDir = __addDisposableResource(env_1, new TestTempDir("test-task-tool"), false);
            const baseConfig = createTestToolConfig(tempDir.path, { workspaceId: "parent-workspace" });
            const create = mock(() => Ok({ taskId: "child-task", kind: "agent", status: "queued" }));
            const waitForAgentReport = mock(() => Promise.resolve({ reportMarkdown: "ignored" }));
            const taskService = { create, waitForAgentReport };
            const tool = createTaskTool({
                ...baseConfig,
                muxEnv: { MUX_MODEL_STRING: "openai:gpt-4o-mini", MUX_THINKING_LEVEL: "high" },
                taskService,
            });
            const result = await Promise.resolve(tool.execute({ subagent_type: "explore", prompt: "do it", title: "Child task", run_in_background: true }, mockToolCallOptions));
            expect(create).toHaveBeenCalled();
            expect(waitForAgentReport).not.toHaveBeenCalled();
            expectQueuedOrRunningTaskToolResult(result, { status: "queued", taskId: "child-task" });
        }
        catch (e_1) {
            env_1.error = e_1;
            env_1.hasError = true;
        }
        finally {
            __disposeResources(env_1);
        }
    });
    it("should allow sub-agent workspaces to spawn nested tasks", async () => {
        const env_2 = { stack: [], error: void 0, hasError: false };
        try {
            const tempDir = __addDisposableResource(env_2, new TestTempDir("test-task-tool"), false);
            const baseConfig = createTestToolConfig(tempDir.path, { workspaceId: "child-workspace" });
            const create = mock(() => Ok({ taskId: "grandchild-task", kind: "agent", status: "queued" }));
            const waitForAgentReport = mock(() => Promise.resolve({ reportMarkdown: "ignored" }));
            const taskService = { create, waitForAgentReport };
            const tool = createTaskTool({
                ...baseConfig,
                enableAgentReport: true,
                taskService,
            });
            const result = await Promise.resolve(tool.execute({
                subagent_type: "explore",
                prompt: "do it",
                title: "Grandchild task",
                run_in_background: true,
            }, mockToolCallOptions));
            expect(create).toHaveBeenCalledWith(expect.objectContaining({
                parentWorkspaceId: "child-workspace",
                kind: "agent",
                agentId: "explore",
                agentType: "explore",
            }));
            expectQueuedOrRunningTaskToolResult(result, { status: "queued", taskId: "grandchild-task" });
        }
        catch (e_2) {
            env_2.error = e_2;
            env_2.hasError = true;
        }
        finally {
            __disposeResources(env_2);
        }
    });
    it("should block and return report when run_in_background is false", async () => {
        const env_3 = { stack: [], error: void 0, hasError: false };
        try {
            const tempDir = __addDisposableResource(env_3, new TestTempDir("test-task-tool"), false);
            const baseConfig = createTestToolConfig(tempDir.path, { workspaceId: "parent-workspace" });
            const events = [];
            let didEmitTaskCreated = false;
            const create = mock(() => Ok({ taskId: "child-task", kind: "agent", status: "running" }));
            const waitForAgentReport = mock(() => {
                // The main thing we care about: emit the UI-only taskId before we block waiting for the report.
                expect(didEmitTaskCreated).toBe(true);
                return Promise.resolve({
                    reportMarkdown: "Hello from child",
                    title: "Result",
                });
            });
            const taskService = { create, waitForAgentReport };
            const tool = createTaskTool({
                ...baseConfig,
                emitChatEvent: (event) => {
                    if (event.type === "task-created") {
                        didEmitTaskCreated = true;
                        events.push(event);
                    }
                },
                taskService,
            });
            const result = await Promise.resolve(tool.execute({
                subagent_type: "explore",
                prompt: "do it",
                title: "Child task",
                run_in_background: false,
            }, mockToolCallOptions));
            expect(create).toHaveBeenCalled();
            expect(waitForAgentReport).toHaveBeenCalledWith("child-task", expect.any(Object));
            expect(events).toHaveLength(1);
            const taskCreated = events[0];
            if (!taskCreated) {
                throw new Error("Expected a task-created event");
            }
            expect(taskCreated.type).toBe("task-created");
            const parentWorkspaceId = baseConfig.workspaceId;
            if (!parentWorkspaceId) {
                throw new Error("Expected baseConfig.workspaceId to be set");
            }
            expect(taskCreated.workspaceId).toBe(parentWorkspaceId);
            expect(taskCreated.toolCallId).toBe(mockToolCallOptions.toolCallId);
            expect(taskCreated.taskId).toBe("child-task");
            expect(typeof taskCreated.timestamp).toBe("number");
            expect(result).toEqual({
                status: "completed",
                taskId: "child-task",
                reportMarkdown: "Hello from child",
                title: "Result",
                agentId: "explore",
                agentType: "explore",
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
    it("should return taskId (with note) if foreground wait times out", async () => {
        const env_4 = { stack: [], error: void 0, hasError: false };
        try {
            const tempDir = __addDisposableResource(env_4, new TestTempDir("test-task-tool"), false);
            const baseConfig = createTestToolConfig(tempDir.path, { workspaceId: "parent-workspace" });
            const create = mock(() => Ok({ taskId: "child-task", kind: "agent", status: "queued" }));
            const waitForAgentReport = mock(() => Promise.reject(new Error("Timed out waiting for agent_report")));
            const getAgentTaskStatus = mock(() => "running");
            const taskService = {
                create,
                waitForAgentReport,
                getAgentTaskStatus,
            };
            const tool = createTaskTool({
                ...baseConfig,
                taskService,
            });
            const result = await Promise.resolve(tool.execute({
                subagent_type: "explore",
                prompt: "do it",
                title: "Child task",
                run_in_background: false,
            }, mockToolCallOptions));
            expect(create).toHaveBeenCalled();
            expect(waitForAgentReport).toHaveBeenCalledWith("child-task", expect.any(Object));
            expect(getAgentTaskStatus).toHaveBeenCalledWith("child-task");
            expectQueuedOrRunningTaskToolResult(result, { status: "running", taskId: "child-task" });
        }
        catch (e_4) {
            env_4.error = e_4;
            env_4.hasError = true;
        }
        finally {
            __disposeResources(env_4);
        }
    });
    it("should throw when TaskService.create fails (e.g., depth limit)", async () => {
        const env_5 = { stack: [], error: void 0, hasError: false };
        try {
            const tempDir = __addDisposableResource(env_5, new TestTempDir("test-task-tool"), false);
            const baseConfig = createTestToolConfig(tempDir.path, { workspaceId: "parent-workspace" });
            const create = mock(() => Err("maxTaskNestingDepth exceeded"));
            const waitForAgentReport = mock(() => Promise.resolve({ reportMarkdown: "ignored" }));
            const taskService = { create, waitForAgentReport };
            const tool = createTaskTool({
                ...baseConfig,
                taskService,
            });
            let caught = null;
            try {
                await Promise.resolve(tool.execute({ subagent_type: "explore", prompt: "do it", title: "Child task" }, mockToolCallOptions));
            }
            catch (error) {
                caught = error;
            }
            expect(caught).toBeInstanceOf(Error);
            if (caught instanceof Error) {
                expect(caught.message).toMatch(/maxTaskNestingDepth/i);
            }
        }
        catch (e_5) {
            env_5.error = e_5;
            env_5.hasError = true;
        }
        finally {
            __disposeResources(env_5);
        }
    });
    it('should reject spawning "exec" tasks while in plan agent', async () => {
        const env_6 = { stack: [], error: void 0, hasError: false };
        try {
            const tempDir = __addDisposableResource(env_6, new TestTempDir("test-task-tool"), false);
            const baseConfig = createTestToolConfig(tempDir.path, { workspaceId: "parent-workspace" });
            const create = mock(() => Ok({ taskId: "child-task", kind: "agent", status: "running" }));
            const waitForAgentReport = mock(() => Promise.resolve({
                reportMarkdown: "Hello from child",
                title: "Result",
            }));
            const taskService = { create, waitForAgentReport };
            const tool = createTaskTool({
                ...baseConfig,
                planFileOnly: true,
                taskService,
            });
            let caught = null;
            try {
                await Promise.resolve(tool.execute({ subagent_type: "exec", prompt: "do it", title: "Child task" }, mockToolCallOptions));
            }
            catch (error) {
                caught = error;
            }
            expect(caught).toBeInstanceOf(Error);
            if (caught instanceof Error) {
                expect(caught.message).toMatch(/plan agent/i);
            }
            expect(create).not.toHaveBeenCalled();
            expect(waitForAgentReport).not.toHaveBeenCalled();
        }
        catch (e_6) {
            env_6.error = e_6;
            env_6.hasError = true;
        }
        finally {
            __disposeResources(env_6);
        }
    });
});
//# sourceMappingURL=task.test.js.map