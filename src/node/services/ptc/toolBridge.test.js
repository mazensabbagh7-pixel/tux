/**
 * Tests for ToolBridge
 */
import { describe, it, expect, mock } from "bun:test";
import { ToolBridge } from "./toolBridge";
import { z } from "zod";
// Helper to create a mock runtime for testing
function createMockRuntime(overrides = {}) {
    const defaultResult = {
        success: true,
        result: undefined,
        toolCalls: [],
        consoleOutput: [],
        duration_ms: 0,
    };
    return {
        eval: mock(() => Promise.resolve(defaultResult)),
        registerFunction: mock((_name, _fn) => undefined),
        registerObject: mock((_name, _obj) => undefined),
        setLimits: mock((_limits) => undefined),
        onEvent: mock((_handler) => undefined),
        abort: mock(() => undefined),
        getAbortSignal: mock(() => undefined),
        dispose: mock(() => undefined),
        [Symbol.dispose]: mock(() => undefined),
        ...overrides,
    };
}
// Create a mock tool for testing - executeFn can be sync, will be wrapped
function createMockTool(name, schema, executeFn) {
    const tool = {
        description: `Mock ${name} tool`,
        inputSchema: schema,
        ...(executeFn ? { execute: (args) => Promise.resolve(executeFn(args)) } : {}),
    };
    return tool;
}
describe("ToolBridge", () => {
    describe("constructor", () => {
        it("filters out excluded tools", () => {
            const tools = {
                file_read: createMockTool("file_read", z.object({}), () => ({})),
                code_execution: createMockTool("code_execution", z.object({}), () => ({})),
                ask_user_question: createMockTool("ask_user_question", z.object({}), () => ({})),
                propose_plan: createMockTool("propose_plan", z.object({}), () => ({})),
                todo_write: createMockTool("todo_write", z.object({}), () => ({})),
                todo_read: createMockTool("todo_read", z.object({}), () => ({})),
                status_set: createMockTool("status_set", z.object({}), () => ({})),
            };
            const bridge = new ToolBridge(tools);
            const names = bridge.getBridgeableToolNames();
            expect(names).toEqual(["file_read"]);
            expect(names).not.toContain("code_execution");
            expect(names).not.toContain("ask_user_question");
            expect(names).not.toContain("propose_plan");
            expect(names).not.toContain("todo_write");
            expect(names).not.toContain("todo_read");
            expect(names).not.toContain("status_set");
        });
        it("filters out tools without execute function", () => {
            const tools = {
                file_read: createMockTool("file_read", z.object({}), () => ({})),
                web_search: createMockTool("web_search", z.object({})), // No execute
            };
            const bridge = new ToolBridge(tools);
            const names = bridge.getBridgeableToolNames();
            expect(names).toEqual(["file_read"]);
            expect(names).not.toContain("web_search");
        });
    });
    describe("getBridgeableToolNames", () => {
        it("returns list of bridgeable tool names", () => {
            const tools = {
                file_read: createMockTool("file_read", z.object({}), () => ({})),
                bash: createMockTool("bash", z.object({}), () => ({})),
                web_fetch: createMockTool("web_fetch", z.object({}), () => ({})),
            };
            const bridge = new ToolBridge(tools);
            const names = bridge.getBridgeableToolNames();
            expect(names).toHaveLength(3);
            expect(names).toContain("file_read");
            expect(names).toContain("bash");
            expect(names).toContain("web_fetch");
        });
    });
    describe("register", () => {
        it("registers tools under mux namespace", () => {
            const mockRegisterObject = mock((_name, _obj) => undefined);
            const mockRuntime = createMockRuntime({ registerObject: mockRegisterObject });
            const tools = {
                file_read: createMockTool("file_read", z.object({}), () => ({})),
            };
            const bridge = new ToolBridge(tools);
            bridge.register(mockRuntime);
            expect(mockRegisterObject).toHaveBeenCalledTimes(1);
            const call = mockRegisterObject.mock.calls[0];
            const [name, obj] = call;
            expect(name).toBe("mux");
            expect(typeof obj).toBe("object");
            expect(typeof obj.file_read).toBe("function");
        });
        it("validates arguments before executing tool", async () => {
            const mockExecute = mock(() => ({ result: "ok" }));
            const tools = {
                file_read: createMockTool("file_read", z.object({ filePath: z.string() }), mockExecute),
            };
            const bridge = new ToolBridge(tools);
            // Create a simple mock runtime that captures registered functions
            let registeredMux = {};
            const mockRegisterObject = mock((name, obj) => {
                if (name === "mux")
                    registeredMux = obj;
                return undefined;
            });
            const mockRuntime = createMockRuntime({ registerObject: mockRegisterObject });
            bridge.register(mockRuntime);
            // Call with invalid args - should throw
            // Type assertion needed because Record indexing returns T | undefined for ESLint
            const fileRead = registeredMux.file_read;
            try {
                await fileRead({ wrongField: "test" });
                expect.unreachable("Should have thrown");
            }
            catch (e) {
                expect(String(e)).toContain("Invalid arguments for file_read");
            }
            // Call with valid args - should succeed
            await fileRead({ filePath: "test.txt" });
            expect(mockExecute).toHaveBeenCalledTimes(1);
        });
        it("serializes non-JSON values", async () => {
            // Tool that returns a non-plain object (with circular reference)
            const circularObj = { a: 1 };
            circularObj.self = circularObj;
            const mockExecute = mock(() => circularObj);
            const tools = {
                circular: createMockTool("circular", z.object({}), mockExecute),
            };
            const bridge = new ToolBridge(tools);
            let registeredMux = {};
            const mockRegisterObject = mock((name, obj) => {
                if (name === "mux")
                    registeredMux = obj;
                return undefined;
            });
            const mockRuntime = createMockRuntime({ registerObject: mockRegisterObject });
            bridge.register(mockRuntime);
            const result = await registeredMux.circular({});
            expect(result).toEqual({ error: "Result not JSON-serializable" });
        });
        it("uses runtime abort signal for tool cancellation", async () => {
            const mockExecute = mock((_args) => ({ result: "ok" }));
            const tools = {
                file_read: createMockTool("file_read", z.object({ filePath: z.string() }), mockExecute),
            };
            const bridge = new ToolBridge(tools);
            let registeredMux = {};
            const mockRegisterObject = mock((name, obj) => {
                if (name === "mux")
                    registeredMux = obj;
                return undefined;
            });
            // Provide an abort signal via getAbortSignal
            const abortController = new AbortController();
            const mockRuntime = createMockRuntime({
                registerObject: mockRegisterObject,
                getAbortSignal: () => abortController.signal,
            });
            bridge.register(mockRuntime);
            await registeredMux.file_read({ filePath: "test.txt" });
            expect(mockExecute).toHaveBeenCalledTimes(1);
        });
        it("throws if runtime abort signal is already aborted", async () => {
            const mockExecute = mock(() => ({ result: "ok" }));
            const tools = {
                file_read: createMockTool("file_read", z.object({ filePath: z.string() }), mockExecute),
            };
            const bridge = new ToolBridge(tools);
            let registeredMux = {};
            const mockRegisterObject = mock((name, obj) => {
                if (name === "mux")
                    registeredMux = obj;
                return undefined;
            });
            // Pre-abort the signal
            const abortController = new AbortController();
            abortController.abort();
            const mockRuntime = createMockRuntime({
                registerObject: mockRegisterObject,
                getAbortSignal: () => abortController.signal,
            });
            bridge.register(mockRuntime);
            // Type assertion needed because Record indexing returns T | undefined for ESLint
            const fileRead = registeredMux.file_read;
            try {
                await fileRead({ filePath: "test.txt" });
                expect.unreachable("Should have thrown");
            }
            catch (e) {
                expect(String(e)).toContain("Execution aborted");
            }
            expect(mockExecute).not.toHaveBeenCalled();
        });
    });
});
//# sourceMappingURL=toolBridge.test.js.map