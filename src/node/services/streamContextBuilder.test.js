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
import { describe, expect, test } from "bun:test";
import { DEFAULT_RUNTIME_CONFIG } from "@/common/constants/workspace";
import { sliceMessagesFromLatestCompactionBoundary } from "@/common/utils/messages/compactionBoundary";
import { createMuxMessage } from "@/common/types/message";
import { DEFAULT_TASK_SETTINGS } from "@/common/types/tasks";
import { getPlanFilePath } from "@/common/utils/planStorage";
import { LocalRuntime } from "@/node/runtime/LocalRuntime";
import { DisposableTempDir } from "@/node/services/tempDir";
import { buildPlanInstructions } from "./streamContextBuilder";
class TestRuntime extends LocalRuntime {
    constructor(projectPath, muxHomePath) {
        super(projectPath);
        this.muxHomePath = muxHomePath;
    }
    getMuxHome() {
        return this.muxHomePath;
    }
}
describe("buildPlanInstructions", () => {
    test("uses request payload history for Start Here detection", async () => {
        const env_1 = { stack: [], error: void 0, hasError: false };
        try {
            const tempRoot = __addDisposableResource(env_1, new DisposableTempDir("stream-context-builder"), false);
            const projectPath = path.join(tempRoot.path, "project");
            const muxHome = path.join(tempRoot.path, "mux-home");
            await fs.mkdir(projectPath, { recursive: true });
            await fs.mkdir(muxHome, { recursive: true });
            const metadata = {
                id: "ws-1",
                name: "workspace-1",
                projectName: "project-1",
                projectPath,
                runtimeConfig: DEFAULT_RUNTIME_CONFIG,
            };
            const runtime = new TestRuntime(projectPath, muxHome);
            const planFilePath = getPlanFilePath(metadata.name, metadata.projectName, muxHome);
            await fs.mkdir(path.dirname(planFilePath), { recursive: true });
            await fs.writeFile(planFilePath, "# Plan\n\n- Keep implementing", "utf-8");
            const startHereSummary = createMuxMessage("start-here", "assistant", "# Start Here\n\n- Existing plan context\n\n*Plan file preserved at:* /tmp/plan.md", {
                compacted: "user",
                agentId: "plan",
            });
            const compactionBoundary = createMuxMessage("boundary", "assistant", "Compacted summary", {
                compacted: "user",
                compactionBoundary: true,
                compactionEpoch: 1,
            });
            const latestUserMessage = createMuxMessage("u1", "user", "continue implementation");
            const fullHistory = [startHereSummary, compactionBoundary, latestUserMessage];
            const requestPayloadMessages = sliceMessagesFromLatestCompactionBoundary(fullHistory);
            expect(requestPayloadMessages.map((message) => message.id)).toEqual(["boundary", "u1"]);
            const fromSlicedPayload = await buildPlanInstructions({
                runtime,
                metadata,
                workspaceId: metadata.id,
                workspacePath: projectPath,
                effectiveMode: "exec",
                effectiveAgentId: "exec",
                agentIsPlanLike: false,
                agentDiscoveryPath: projectPath,
                additionalSystemInstructions: undefined,
                shouldDisableTaskToolsForDepth: false,
                taskDepth: 0,
                taskSettings: DEFAULT_TASK_SETTINGS,
                requestPayloadMessages,
            });
            const fromFullHistory = await buildPlanInstructions({
                runtime,
                metadata,
                workspaceId: metadata.id,
                workspacePath: projectPath,
                effectiveMode: "exec",
                effectiveAgentId: "exec",
                agentIsPlanLike: false,
                agentDiscoveryPath: projectPath,
                additionalSystemInstructions: undefined,
                shouldDisableTaskToolsForDepth: false,
                taskDepth: 0,
                taskSettings: DEFAULT_TASK_SETTINGS,
                requestPayloadMessages: fullHistory,
            });
            expect(fromSlicedPayload.effectiveAdditionalInstructions).toContain(`A plan file exists at: ${fromSlicedPayload.planFilePath}`);
            expect(fromFullHistory.effectiveAdditionalInstructions).toBeUndefined();
        }
        catch (e_1) {
            env_1.error = e_1;
            env_1.hasError = true;
        }
        finally {
            __disposeResources(env_1);
        }
    });
});
//# sourceMappingURL=streamContextBuilder.test.js.map