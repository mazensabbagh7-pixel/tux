import { describe, expect, test, mock, afterEach } from "bun:test";
import { AgentSession } from "./agentSession";
import { createTestHistoryService } from "./testHistoryService";
// NOTE: These tests focus on the event wiring (tool-call-end -> callback).
// The actual post-compaction state computation is covered elsewhere.
describe("AgentSession post-compaction refresh trigger", () => {
    let historyCleanup;
    afterEach(async () => {
        await historyCleanup?.();
    });
    test("triggers callback on file_edit_* tool-call-end", async () => {
        const handlers = new Map();
        const aiService = {
            on(eventName, listener) {
                handlers.set(String(eventName), listener);
                return this;
            },
            off(_eventName, _listener) {
                return this;
            },
            stopStream: mock(() => Promise.resolve({ success: true, data: undefined })),
        };
        const { historyService, cleanup } = await createTestHistoryService();
        historyCleanup = cleanup;
        const initStateManager = {
            on(_eventName, _listener) {
                return this;
            },
            off(_eventName, _listener) {
                return this;
            },
        };
        const backgroundProcessManager = {
            setMessageQueued: mock(() => undefined),
            cleanup: mock(() => Promise.resolve()),
        };
        const config = {
            srcDir: "/tmp",
            getSessionDir: mock(() => "/tmp"),
        };
        const onPostCompactionStateChange = mock(() => undefined);
        const session = new AgentSession({
            workspaceId: "ws",
            config,
            historyService,
            aiService,
            initStateManager,
            backgroundProcessManager,
            onPostCompactionStateChange,
        });
        const toolEnd = handlers.get("tool-call-end");
        expect(toolEnd).toBeDefined();
        toolEnd({
            type: "tool-call-end",
            workspaceId: "ws",
            messageId: "m1",
            toolCallId: "t1b",
            toolName: "file_edit_replace_lines",
            result: {},
            timestamp: Date.now(),
        });
        toolEnd({
            type: "tool-call-end",
            workspaceId: "ws",
            messageId: "m1",
            toolCallId: "t1",
            toolName: "file_edit_insert",
            result: {},
            timestamp: Date.now(),
        });
        toolEnd({
            type: "tool-call-end",
            workspaceId: "ws",
            messageId: "m1",
            toolCallId: "t2",
            toolName: "bash",
            result: {},
            timestamp: Date.now(),
        });
        expect(onPostCompactionStateChange).toHaveBeenCalledTimes(2);
        session.dispose();
    });
});
//# sourceMappingURL=agentSession.postCompactionRefresh.test.js.map