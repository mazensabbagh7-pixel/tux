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
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { describe, it, expect } from "bun:test";
import { AgentSkillReadToolResultSchema } from "@/common/utils/tools/toolDefinitions";
import { MUX_HELP_CHAT_WORKSPACE_ID } from "@/common/constants/muxChat";
import { createAgentSkillReadTool } from "./agent_skill_read";
import { createTestToolConfig, TestTempDir } from "./testHelpers";
const mockToolCallOptions = {
    toolCallId: "test-call-id",
    messages: [],
};
async function writeProjectSkill(workspacePath, name) {
    const skillDir = path.join(workspacePath, ".mux", "skills", name);
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(path.join(skillDir, "SKILL.md"), `---\nname: ${name}\ndescription: test\n---\nBody\n`, "utf-8");
}
describe("agent_skill_read (Chat with Mux sandbox)", () => {
    it("allows reading built-in skills", async () => {
        const env_1 = { stack: [], error: void 0, hasError: false };
        try {
            const tempDir = __addDisposableResource(env_1, new TestTempDir("test-agent-skill-read-mux-chat"), false);
            const baseConfig = createTestToolConfig(tempDir.path, {
                workspaceId: MUX_HELP_CHAT_WORKSPACE_ID,
            });
            const tool = createAgentSkillReadTool(baseConfig);
            const raw = await Promise.resolve(tool.execute({ name: "mux-docs" }, mockToolCallOptions));
            const parsed = AgentSkillReadToolResultSchema.safeParse(raw);
            expect(parsed.success).toBe(true);
            if (!parsed.success) {
                throw new Error(parsed.error.message);
            }
            const result = parsed.data;
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.skill.scope).toBe("built-in");
                expect(result.skill.frontmatter.name).toBe("mux-docs");
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
    it("rejects project/global skills on disk", async () => {
        const env_2 = { stack: [], error: void 0, hasError: false };
        try {
            const tempDir = __addDisposableResource(env_2, new TestTempDir("test-agent-skill-read-mux-chat-reject"), false);
            await writeProjectSkill(tempDir.path, "foo");
            const baseConfig = createTestToolConfig(tempDir.path, {
                workspaceId: MUX_HELP_CHAT_WORKSPACE_ID,
            });
            const tool = createAgentSkillReadTool(baseConfig);
            const raw = await Promise.resolve(tool.execute({ name: "foo" }, mockToolCallOptions));
            const parsed = AgentSkillReadToolResultSchema.safeParse(raw);
            expect(parsed.success).toBe(true);
            if (!parsed.success) {
                throw new Error(parsed.error.message);
            }
            const result = parsed.data;
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error).toMatch(/only built-in skills/i);
            }
        }
        catch (e_2) {
            env_2.error = e_2;
            env_2.hasError = true;
        }
        finally {
            __disposeResources(env_2);
        }
    });
});
//# sourceMappingURL=agent_skill_read.test.js.map