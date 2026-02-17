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
import { describe, it, expect } from "bun:test";
import * as fs from "fs/promises";
import * as path from "path";
import { MUX_HELP_CHAT_WORKSPACE_ID, MUX_HELP_CHAT_WORKSPACE_NAME, MUX_HELP_CHAT_WORKSPACE_TITLE, } from "@/common/constants/muxChat";
import { FILE_EDIT_DIFF_OMITTED_MESSAGE } from "@/common/types/tools";
import { createMuxGlobalAgentsReadTool } from "./mux_global_agents_read";
import { createMuxGlobalAgentsWriteTool } from "./mux_global_agents_write";
import { TestTempDir, createTestToolConfig } from "./testHelpers";
const mockToolCallOptions = {
    toolCallId: "test-call-id",
    messages: [],
};
describe("mux_global_agents_* tools", () => {
    it("reads ~/.mux/AGENTS.md (returns empty string if missing)", async () => {
        const env_1 = { stack: [], error: void 0, hasError: false };
        try {
            const muxHome = __addDisposableResource(env_1, new TestTempDir("mux-global-agents"), false);
            const workspaceSessionDir = path.join(muxHome.path, "sessions", MUX_HELP_CHAT_WORKSPACE_ID);
            await fs.mkdir(workspaceSessionDir, { recursive: true });
            const config = createTestToolConfig(muxHome.path, {
                workspaceId: MUX_HELP_CHAT_WORKSPACE_ID,
                sessionsDir: workspaceSessionDir,
            });
            const tool = createMuxGlobalAgentsReadTool(config);
            // Missing file -> empty
            const missing = (await tool.execute({}, mockToolCallOptions));
            expect(missing.success).toBe(true);
            if (missing.success) {
                expect(missing.content).toBe("");
            }
            // Present file -> contents
            const agentsPath = path.join(muxHome.path, "AGENTS.md");
            await fs.writeFile(agentsPath, `# ${MUX_HELP_CHAT_WORKSPACE_TITLE}\n${MUX_HELP_CHAT_WORKSPACE_NAME}\n`, "utf-8");
            const result = (await tool.execute({}, mockToolCallOptions));
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.content).toContain(MUX_HELP_CHAT_WORKSPACE_TITLE);
                expect(result.content).toContain(MUX_HELP_CHAT_WORKSPACE_NAME);
            }
        }
        catch (e_1) {
            env_1.error = e_1;
            env_1.hasError = true;
        }
        finally {
            __disposeResources(env_1);
        }
    });
    it("refuses to write without explicit confirmation", async () => {
        const env_2 = { stack: [], error: void 0, hasError: false };
        try {
            const muxHome = __addDisposableResource(env_2, new TestTempDir("mux-global-agents"), false);
            const workspaceSessionDir = path.join(muxHome.path, "sessions", MUX_HELP_CHAT_WORKSPACE_ID);
            await fs.mkdir(workspaceSessionDir, { recursive: true });
            const config = createTestToolConfig(muxHome.path, {
                workspaceId: MUX_HELP_CHAT_WORKSPACE_ID,
                sessionsDir: workspaceSessionDir,
            });
            const tool = createMuxGlobalAgentsWriteTool(config);
            const agentsPath = path.join(muxHome.path, "AGENTS.md");
            const result = (await tool.execute({ newContent: "test", confirm: false }, mockToolCallOptions));
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error).toContain("confirm");
            }
            let readError;
            try {
                await fs.readFile(agentsPath, "utf-8");
            }
            catch (error) {
                readError = error;
            }
            expect(readError).toMatchObject({ code: "ENOENT" });
        }
        catch (e_2) {
            env_2.error = e_2;
            env_2.hasError = true;
        }
        finally {
            __disposeResources(env_2);
        }
    });
    it("writes ~/.mux/AGENTS.md and returns a diff", async () => {
        const env_3 = { stack: [], error: void 0, hasError: false };
        try {
            const muxHome = __addDisposableResource(env_3, new TestTempDir("mux-global-agents"), false);
            const workspaceSessionDir = path.join(muxHome.path, "sessions", MUX_HELP_CHAT_WORKSPACE_ID);
            await fs.mkdir(workspaceSessionDir, { recursive: true });
            const config = createTestToolConfig(muxHome.path, {
                workspaceId: MUX_HELP_CHAT_WORKSPACE_ID,
                sessionsDir: workspaceSessionDir,
            });
            const tool = createMuxGlobalAgentsWriteTool(config);
            const newContent = "# Global agents\n\nHello\n";
            const result = (await tool.execute({ newContent, confirm: true }, mockToolCallOptions));
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.diff).toBe(FILE_EDIT_DIFF_OMITTED_MESSAGE);
                expect(result.ui_only?.file_edit?.diff).toContain("AGENTS.md");
            }
            const written = await fs.readFile(path.join(muxHome.path, "AGENTS.md"), "utf-8");
            expect(written).toBe(newContent);
        }
        catch (e_3) {
            env_3.error = e_3;
            env_3.hasError = true;
        }
        finally {
            __disposeResources(env_3);
        }
    });
    it("rejects symlink targets", async () => {
        const env_4 = { stack: [], error: void 0, hasError: false };
        try {
            const muxHome = __addDisposableResource(env_4, new TestTempDir("mux-global-agents"), false);
            const workspaceSessionDir = path.join(muxHome.path, "sessions", MUX_HELP_CHAT_WORKSPACE_ID);
            await fs.mkdir(workspaceSessionDir, { recursive: true });
            const config = createTestToolConfig(muxHome.path, {
                workspaceId: MUX_HELP_CHAT_WORKSPACE_ID,
                sessionsDir: workspaceSessionDir,
            });
            const readTool = createMuxGlobalAgentsReadTool(config);
            const writeTool = createMuxGlobalAgentsWriteTool(config);
            const agentsPath = path.join(muxHome.path, "AGENTS.md");
            const targetPath = path.join(muxHome.path, "target.txt");
            await fs.writeFile(targetPath, "secret", "utf-8");
            await fs.symlink(targetPath, agentsPath);
            const readResult = (await readTool.execute({}, mockToolCallOptions));
            expect(readResult.success).toBe(false);
            if (!readResult.success) {
                expect(readResult.error).toContain("symlink");
            }
            const writeResult = (await writeTool.execute({ newContent: "nope", confirm: true }, mockToolCallOptions));
            expect(writeResult.success).toBe(false);
            if (!writeResult.success) {
                expect(writeResult.error).toContain("symlink");
            }
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
//# sourceMappingURL=mux_global_agents.test.js.map