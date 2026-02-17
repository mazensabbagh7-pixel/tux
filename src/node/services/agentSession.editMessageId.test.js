import { describe, expect, it, mock, afterEach, spyOn } from "bun:test";
import { EventEmitter } from "events";
import { createMuxMessage } from "@/common/types/message";
import { Ok } from "@/common/types/result";
import { AgentSession } from "./agentSession";
import { createTestHistoryService } from "./testHistoryService";
describe("AgentSession.sendMessage (editMessageId)", () => {
    let historyCleanup;
    afterEach(async () => {
        await historyCleanup?.();
    });
    it("treats missing edit target as no-op (allows recovery after compaction)", async () => {
        const workspaceId = "ws-test";
        const config = {
            srcDir: "/tmp",
            getSessionDir: (_workspaceId) => "/tmp",
        };
        const { historyService, cleanup } = await createTestHistoryService();
        historyCleanup = cleanup;
        const truncateAfterMessage = spyOn(historyService, "truncateAfterMessage");
        const appendToHistory = spyOn(historyService, "appendToHistory");
        const aiEmitter = new EventEmitter();
        const streamMessage = mock((_messages) => {
            return Promise.resolve(Ok(undefined));
        });
        const aiService = Object.assign(aiEmitter, {
            isStreaming: mock((_workspaceId) => false),
            stopStream: mock((_workspaceId) => Promise.resolve(Ok(undefined))),
            streamMessage: streamMessage,
        });
        const initStateManager = new EventEmitter();
        const backgroundProcessManager = {
            cleanup: mock((_workspaceId) => Promise.resolve()),
            setMessageQueued: mock((_workspaceId, _queued) => {
                void _queued;
            }),
        };
        const session = new AgentSession({
            workspaceId,
            config,
            historyService,
            aiService,
            initStateManager,
            backgroundProcessManager,
        });
        const result = await session.sendMessage("hello", {
            model: "anthropic:claude-3-5-sonnet-latest",
            agentId: "exec",
            editMessageId: "missing-user-message-id",
        });
        expect(result.success).toBe(true);
        expect(truncateAfterMessage.mock.calls).toHaveLength(1);
        expect(appendToHistory.mock.calls).toHaveLength(1);
        expect(streamMessage.mock.calls).toHaveLength(1);
    });
    it("clears image parts when editing with explicit empty fileParts", async () => {
        const workspaceId = "ws-test";
        const config = {
            srcDir: "/tmp",
            getSessionDir: (_workspaceId) => "/tmp",
        };
        const originalMessageId = "user-message-with-image";
        const originalImageUrl = "data:image/png;base64,AAAA";
        const { historyService, cleanup } = await createTestHistoryService();
        historyCleanup = cleanup;
        // Seed original message before setting up spies
        await historyService.appendToHistory(workspaceId, createMuxMessage(originalMessageId, "user", "original", { historySequence: 0 }, [
            { type: "file", mediaType: "image/png", url: originalImageUrl },
        ]));
        const truncateAfterMessage = spyOn(historyService, "truncateAfterMessage");
        const appendToHistory = spyOn(historyService, "appendToHistory");
        const aiEmitter = new EventEmitter();
        const streamMessage = mock((_messages) => {
            return Promise.resolve(Ok(undefined));
        });
        const aiService = Object.assign(aiEmitter, {
            isStreaming: mock((_workspaceId) => false),
            stopStream: mock((_workspaceId) => Promise.resolve(Ok(undefined))),
            streamMessage: streamMessage,
        });
        const initStateManager = new EventEmitter();
        const backgroundProcessManager = {
            cleanup: mock((_workspaceId) => Promise.resolve()),
            setMessageQueued: mock((_workspaceId, _queued) => {
                void _queued;
            }),
        };
        const session = new AgentSession({
            workspaceId,
            config,
            historyService,
            aiService,
            initStateManager,
            backgroundProcessManager,
        });
        const result = await session.sendMessage("edited", {
            model: "anthropic:claude-3-5-sonnet-latest",
            agentId: "exec",
            editMessageId: originalMessageId,
            fileParts: [],
        });
        expect(result.success).toBe(true);
        expect(truncateAfterMessage.mock.calls).toHaveLength(1);
        expect(appendToHistory.mock.calls).toHaveLength(1);
        const appendedMessage = appendToHistory.mock.calls[0][1];
        const appendedFileParts = appendedMessage.parts.filter((part) => part.type === "file");
        expect(appendedFileParts).toHaveLength(0);
    });
    it("preserves image parts when editing and fileParts are omitted", async () => {
        const workspaceId = "ws-test";
        const config = {
            srcDir: "/tmp",
            getSessionDir: (_workspaceId) => "/tmp",
        };
        const originalMessageId = "user-message-with-image";
        const originalImageUrl = "data:image/png;base64,AAAA";
        const { historyService, cleanup } = await createTestHistoryService();
        historyCleanup = cleanup;
        // Seed original message before setting up spies
        await historyService.appendToHistory(workspaceId, createMuxMessage(originalMessageId, "user", "original", { historySequence: 0 }, [
            { type: "file", mediaType: "image/png", url: originalImageUrl },
        ]));
        const truncateAfterMessage = spyOn(historyService, "truncateAfterMessage");
        const appendToHistory = spyOn(historyService, "appendToHistory");
        const getHistoryFromLatestBoundary = spyOn(historyService, "getHistoryFromLatestBoundary");
        const aiEmitter = new EventEmitter();
        const streamMessage = mock((_messages) => {
            return Promise.resolve(Ok(undefined));
        });
        const aiService = Object.assign(aiEmitter, {
            isStreaming: mock((_workspaceId) => false),
            stopStream: mock((_workspaceId) => Promise.resolve(Ok(undefined))),
            streamMessage: streamMessage,
        });
        const initStateManager = new EventEmitter();
        const backgroundProcessManager = {
            cleanup: mock((_workspaceId) => Promise.resolve()),
            setMessageQueued: mock((_workspaceId, _queued) => {
                void _queued;
            }),
        };
        const session = new AgentSession({
            workspaceId,
            config,
            historyService,
            aiService,
            initStateManager,
            backgroundProcessManager,
        });
        const result = await session.sendMessage("edited", {
            model: "anthropic:claude-3-5-sonnet-latest",
            agentId: "exec",
            editMessageId: originalMessageId,
        });
        expect(result.success).toBe(true);
        expect(getHistoryFromLatestBoundary.mock.calls.length).toBeGreaterThan(0);
        expect(truncateAfterMessage.mock.calls).toHaveLength(1);
        expect(appendToHistory.mock.calls).toHaveLength(1);
        const appendedMessage = appendToHistory.mock.calls[0][1];
        const appendedFileParts = appendedMessage.parts.filter((part) => part.type === "file");
        expect(appendedFileParts).toHaveLength(1);
        expect(appendedFileParts[0].url).toBe(originalImageUrl);
        expect(appendedFileParts[0].mediaType).toBe("image/png");
    });
});
//# sourceMappingURL=agentSession.editMessageId.test.js.map