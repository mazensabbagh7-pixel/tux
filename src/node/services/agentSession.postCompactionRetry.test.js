import { describe, expect, test, mock, afterEach, spyOn } from "bun:test";
import { EventEmitter } from "events";
import * as fsPromises from "fs/promises";
import * as os from "os";
import * as path from "path";
import { AgentSession } from "./agentSession";
import { createTestHistoryService } from "./testHistoryService";
function createPersistedPostCompactionState(options) {
    const payload = {
        version: 1,
        createdAt: Date.now(),
        diffs: options.diffs,
    };
    return fsPromises.writeFile(options.filePath, JSON.stringify(payload));
}
describe("AgentSession post-compaction context retry", () => {
    let historyCleanup;
    afterEach(async () => {
        await historyCleanup?.();
    });
    test("retries once without post-compaction injection on context_exceeded", async () => {
        const workspaceId = "ws";
        const sessionDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), "mux-agentSession-"));
        const postCompactionPath = path.join(sessionDir, "post-compaction.json");
        await createPersistedPostCompactionState({
            filePath: postCompactionPath,
            diffs: [
                {
                    path: "/tmp/foo.ts",
                    diff: "@@ -1 +1 @@\n-foo\n+bar\n",
                    truncated: false,
                },
            ],
        });
        const history = [
            {
                id: "compaction-summary",
                role: "assistant",
                parts: [{ type: "text", text: "Summary" }],
                metadata: { timestamp: 1000, compacted: "user" },
            },
            {
                id: "user-1",
                role: "user",
                parts: [{ type: "text", text: "Continue" }],
                metadata: { timestamp: 1100 },
            },
        ];
        const { historyService, cleanup } = await createTestHistoryService();
        historyCleanup = cleanup;
        for (const msg of history) {
            await historyService.appendToHistory(workspaceId, msg);
        }
        spyOn(historyService, "deleteMessage");
        const aiEmitter = new EventEmitter();
        let resolveSecondCall;
        const secondCall = new Promise((resolve) => {
            resolveSecondCall = resolve;
        });
        let callCount = 0;
        const streamMessage = mock((..._args) => {
            callCount += 1;
            if (callCount === 1) {
                // Simulate a provider context limit error before any deltas.
                aiEmitter.emit("error", {
                    workspaceId,
                    messageId: "assistant-ctx-exceeded",
                    error: "Context length exceeded",
                    errorType: "context_exceeded",
                });
                return Promise.resolve({ success: true, data: undefined });
            }
            resolveSecondCall?.();
            return Promise.resolve({ success: true, data: undefined });
        });
        const aiService = {
            on(eventName, listener) {
                aiEmitter.on(String(eventName), listener);
                return this;
            },
            off(eventName, listener) {
                aiEmitter.off(String(eventName), listener);
                return this;
            },
            streamMessage,
            getWorkspaceMetadata: mock(() => Promise.resolve({ success: false, error: "nope" })),
            stopStream: mock(() => Promise.resolve({ success: true, data: undefined })),
        };
        const initStateManager = {
            on() {
                return this;
            },
            off() {
                return this;
            },
        };
        const backgroundProcessManager = {
            setMessageQueued: mock(() => undefined),
            cleanup: mock(() => Promise.resolve()),
        };
        const config = {
            srcDir: "/tmp",
            getSessionDir: mock(() => sessionDir),
        };
        const session = new AgentSession({
            workspaceId,
            config,
            historyService,
            aiService,
            initStateManager,
            backgroundProcessManager,
        });
        const options = {
            model: "openai:gpt-4o",
            agentId: "exec",
        };
        // Call streamWithHistory directly (private) to avoid needing a full user send pipeline.
        await session.streamWithHistory(options.model, options);
        // Wait for the retry call to happen.
        await Promise.race([
            secondCall,
            new Promise((_, reject) => setTimeout(() => reject(new Error("retry timeout")), 1000)),
        ]);
        expect(streamMessage).toHaveBeenCalledTimes(2);
        // With the options bag, arg[0] is the StreamMessageOptions object.
        const firstOpts = streamMessage.mock.calls[0][0];
        expect(Array.isArray(firstOpts.postCompactionAttachments)).toBe(true);
        const secondOpts = streamMessage.mock.calls[1][0];
        expect(secondOpts.postCompactionAttachments).toBeNull();
        expect(historyService.deleteMessage.mock.calls[0][1]).toBe("assistant-ctx-exceeded");
        // Pending post-compaction state should be discarded.
        let exists = true;
        try {
            await fsPromises.stat(postCompactionPath);
        }
        catch {
            exists = false;
        }
        expect(exists).toBe(false);
        session.dispose();
    });
});
describe("AgentSession execSubagentHardRestart", () => {
    let historyCleanup;
    afterEach(async () => {
        await historyCleanup?.();
    });
    test("hard-restarts exec-like subagent history on context_exceeded and retries once", async () => {
        const workspaceId = "ws-hard";
        const sessionDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), "mux-agentSession-"));
        const history = [
            {
                id: "snapshot-1",
                role: "user",
                parts: [{ type: "text", text: "<snapshot>" }],
                metadata: {
                    timestamp: 1000,
                    synthetic: true,
                    fileAtMentionSnapshot: ["@foo"],
                },
            },
            {
                id: "user-1",
                role: "user",
                parts: [{ type: "text", text: "Do the thing" }],
                metadata: {
                    timestamp: 1100,
                },
            },
        ];
        const { historyService, cleanup } = await createTestHistoryService();
        historyCleanup = cleanup;
        for (const msg of history) {
            await historyService.appendToHistory(workspaceId, msg);
        }
        spyOn(historyService, "clearHistory");
        spyOn(historyService, "appendToHistory");
        const aiEmitter = new EventEmitter();
        let resolveSecondCall;
        const secondCall = new Promise((resolve) => {
            resolveSecondCall = resolve;
        });
        let callCount = 0;
        const streamMessage = mock((..._args) => {
            callCount += 1;
            if (callCount === 1) {
                aiEmitter.emit("error", {
                    workspaceId,
                    messageId: "assistant-ctx-exceeded-1",
                    error: "Context length exceeded",
                    errorType: "context_exceeded",
                });
                return Promise.resolve({ success: true, data: undefined });
            }
            if (callCount === 2) {
                // Second context_exceeded should NOT trigger an additional hard restart.
                aiEmitter.emit("error", {
                    workspaceId,
                    messageId: "assistant-ctx-exceeded-2",
                    error: "Context length exceeded",
                    errorType: "context_exceeded",
                });
                resolveSecondCall?.();
                return Promise.resolve({ success: true, data: undefined });
            }
            throw new Error("unexpected third streamMessage call");
        });
        const parentWorkspaceId = "parent";
        const childWorkspaceMetadata = {
            id: workspaceId,
            name: "child",
            projectName: "proj",
            projectPath: "/tmp/proj",
            namedWorkspacePath: "/tmp/proj/child",
            runtimeConfig: { type: "local" },
            parentWorkspaceId,
            agentId: "exec",
        };
        const parentWorkspaceMetadata = {
            ...childWorkspaceMetadata,
            id: parentWorkspaceId,
            name: "parent",
            parentWorkspaceId: undefined,
        };
        const getWorkspaceMetadata = mock((id) => {
            if (id === workspaceId) {
                return Promise.resolve({
                    success: true,
                    data: childWorkspaceMetadata,
                });
            }
            if (id === parentWorkspaceId) {
                return Promise.resolve({
                    success: true,
                    data: parentWorkspaceMetadata,
                });
            }
            return Promise.resolve({ success: false, error: "unknown" });
        });
        const aiService = {
            on(eventName, listener) {
                aiEmitter.on(String(eventName), listener);
                return this;
            },
            off(eventName, listener) {
                aiEmitter.off(String(eventName), listener);
                return this;
            },
            streamMessage,
            getWorkspaceMetadata,
            stopStream: mock(() => Promise.resolve({ success: true, data: undefined })),
        };
        const initStateManager = {
            on() {
                return this;
            },
            off() {
                return this;
            },
        };
        const backgroundProcessManager = {
            setMessageQueued: mock(() => undefined),
            cleanup: mock(() => Promise.resolve()),
        };
        const config = {
            srcDir: "/tmp",
            getSessionDir: mock(() => sessionDir),
        };
        const session = new AgentSession({
            workspaceId,
            config,
            historyService,
            aiService,
            initStateManager,
            backgroundProcessManager,
        });
        const options = {
            model: "openai:gpt-4o",
            agentId: "exec",
            experiments: {
                execSubagentHardRestart: true,
            },
        };
        await session.streamWithHistory(options.model, options);
        await Promise.race([
            secondCall,
            new Promise((_, reject) => setTimeout(() => reject(new Error("retry timeout")), 1000)),
        ]);
        expect(streamMessage).toHaveBeenCalledTimes(2);
        expect(historyService.clearHistory.mock.calls).toHaveLength(1);
        // Continuation notice + seed prompt (and snapshots) should be appended after clear.
        expect(historyService.appendToHistory.mock.calls).toHaveLength(3);
        const appendedNotice = historyService.appendToHistory.mock
            .calls[0][1];
        expect(appendedNotice?.metadata?.synthetic).toBe(true);
        expect(appendedNotice?.metadata?.uiVisible).toBe(true);
        const noticeText = appendedNotice?.parts.find((p) => p.type === "text");
        expect(noticeText?.text).toContain("restarted");
        expect(historyService.appendToHistory.mock.calls[1][1]
            .id).toBe("snapshot-1");
        expect(historyService.appendToHistory.mock.calls[2][1]
            .id).toBe("user-1");
        // Retry should include the continuation notice in additionalSystemInstructions.
        const retryOpts = streamMessage.mock.calls[1][0];
        expect(String(retryOpts.additionalSystemInstructions)).toContain("restarted");
        session.dispose();
    });
    test("resolves exec-like predicate from parent workspace when child agents are missing", async () => {
        const workspaceId = "ws-hard-custom-agent";
        const sessionDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), "mux-agentSession-"));
        const history = [
            {
                id: "user-1",
                role: "user",
                parts: [{ type: "text", text: "Do the thing" }],
                metadata: {
                    timestamp: 1100,
                },
            },
        ];
        const { historyService, cleanup } = await createTestHistoryService();
        historyCleanup = cleanup;
        for (const msg of history) {
            await historyService.appendToHistory(workspaceId, msg);
        }
        spyOn(historyService, "clearHistory");
        spyOn(historyService, "appendToHistory");
        const aiEmitter = new EventEmitter();
        let resolveSecondCall;
        const secondCall = new Promise((resolve) => {
            resolveSecondCall = resolve;
        });
        let callCount = 0;
        const streamMessage = mock((..._args) => {
            callCount += 1;
            if (callCount === 1) {
                // Simulate a provider context limit error before any deltas.
                aiEmitter.emit("error", {
                    workspaceId,
                    messageId: "assistant-ctx-exceeded-1",
                    error: "Context length exceeded",
                    errorType: "context_exceeded",
                });
                return Promise.resolve({ success: true, data: undefined });
            }
            resolveSecondCall?.();
            return Promise.resolve({ success: true, data: undefined });
        });
        const customAgentId = "custom_hard_restart_agent";
        const srcBaseDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), "mux-agentSession-worktrees-"));
        const projectPath = await fsPromises.mkdtemp(path.join(os.tmpdir(), "mux-agentSession-proj-"));
        // Create a custom agent definition ONLY in the parent workspace path.
        // This simulates untracked .mux/agents that are present in the parent worktree but absent
        // from the child task worktree.
        const parentWorkspaceName = "parent";
        const parentAgentsDir = path.join(srcBaseDir, path.basename(projectPath), parentWorkspaceName, ".mux", "agents");
        await fsPromises.mkdir(parentAgentsDir, { recursive: true });
        await fsPromises.writeFile(path.join(parentAgentsDir, `${customAgentId}.md`), [
            "---",
            "name: Custom Hard Restart Agent",
            "description: Test agent inheriting exec",
            "base: exec",
            "---",
            "",
            "Body",
            "",
        ].join("\n"));
        const parentWorkspaceId = "parent-custom";
        const childWorkspaceMetadata = {
            id: workspaceId,
            name: "child",
            projectName: "proj",
            projectPath,
            runtimeConfig: { type: "worktree", srcBaseDir },
            parentWorkspaceId,
            agentId: customAgentId,
        };
        const parentWorkspaceMetadata = {
            ...childWorkspaceMetadata,
            id: parentWorkspaceId,
            name: parentWorkspaceName,
            parentWorkspaceId: undefined,
            agentId: "exec",
        };
        const getWorkspaceMetadata = mock((id) => {
            if (id === workspaceId) {
                return Promise.resolve({
                    success: true,
                    data: childWorkspaceMetadata,
                });
            }
            if (id === parentWorkspaceId) {
                return Promise.resolve({
                    success: true,
                    data: parentWorkspaceMetadata,
                });
            }
            return Promise.resolve({ success: false, error: "unknown" });
        });
        const aiService = {
            on(eventName, listener) {
                aiEmitter.on(String(eventName), listener);
                return this;
            },
            off(eventName, listener) {
                aiEmitter.off(String(eventName), listener);
                return this;
            },
            streamMessage,
            getWorkspaceMetadata,
            stopStream: mock(() => Promise.resolve({ success: true, data: undefined })),
        };
        const initStateManager = {
            on() {
                return this;
            },
            off() {
                return this;
            },
        };
        const backgroundProcessManager = {
            setMessageQueued: mock(() => undefined),
            cleanup: mock(() => Promise.resolve()),
        };
        const config = {
            srcDir: "/tmp",
            getSessionDir: mock(() => sessionDir),
        };
        const session = new AgentSession({
            workspaceId,
            config,
            historyService,
            aiService,
            initStateManager,
            backgroundProcessManager,
        });
        const options = {
            model: "openai:gpt-4o",
            agentId: customAgentId,
            experiments: {
                execSubagentHardRestart: true,
            },
        };
        await session.streamWithHistory(options.model, options);
        await Promise.race([
            secondCall,
            new Promise((_, reject) => setTimeout(() => reject(new Error("retry timeout")), 1000)),
        ]);
        expect(streamMessage).toHaveBeenCalledTimes(2);
        expect(historyService.clearHistory.mock.calls).toHaveLength(1);
        session.dispose();
    });
    test("does not hard-restart when workspace is not a subagent", async () => {
        const workspaceId = "ws-hard-no-parent";
        const sessionDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), "mux-agentSession-"));
        const history = [
            {
                id: "user-1",
                role: "user",
                parts: [{ type: "text", text: "Do the thing" }],
                metadata: { timestamp: 1100 },
            },
        ];
        const { historyService, cleanup } = await createTestHistoryService();
        historyCleanup = cleanup;
        for (const msg of history) {
            await historyService.appendToHistory(workspaceId, msg);
        }
        spyOn(historyService, "clearHistory");
        const aiEmitter = new EventEmitter();
        const streamMessage = mock((..._args) => {
            aiEmitter.emit("error", {
                workspaceId,
                messageId: "assistant-ctx-exceeded",
                error: "Context length exceeded",
                errorType: "context_exceeded",
            });
            return Promise.resolve({ success: true, data: undefined });
        });
        const workspaceMetadata = {
            id: workspaceId,
            name: "child",
            projectName: "proj",
            projectPath: "/tmp/proj",
            namedWorkspacePath: "/tmp/proj/child",
            runtimeConfig: { type: "local" },
            agentId: "exec",
        };
        const aiService = {
            on(eventName, listener) {
                aiEmitter.on(String(eventName), listener);
                return this;
            },
            off(eventName, listener) {
                aiEmitter.off(String(eventName), listener);
                return this;
            },
            streamMessage,
            getWorkspaceMetadata: mock(() => Promise.resolve({ success: true, data: workspaceMetadata })),
            stopStream: mock(() => Promise.resolve({ success: true, data: undefined })),
        };
        const initStateManager = {
            on() {
                return this;
            },
            off() {
                return this;
            },
        };
        const backgroundProcessManager = {
            setMessageQueued: mock(() => undefined),
            cleanup: mock(() => Promise.resolve()),
        };
        const config = {
            srcDir: "/tmp",
            getSessionDir: mock(() => sessionDir),
        };
        const session = new AgentSession({
            workspaceId,
            config,
            historyService,
            aiService,
            initStateManager,
            backgroundProcessManager,
        });
        const options = {
            model: "openai:gpt-4o",
            agentId: "exec",
            experiments: {
                execSubagentHardRestart: true,
            },
        };
        await session.streamWithHistory(options.model, options);
        await new Promise((resolve) => setTimeout(resolve, 25));
        expect(streamMessage).toHaveBeenCalledTimes(1);
        expect(historyService.clearHistory.mock.calls).toHaveLength(0);
        session.dispose();
    });
});
//# sourceMappingURL=agentSession.postCompactionRetry.test.js.map