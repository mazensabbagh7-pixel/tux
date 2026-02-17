import { describe, expect, it, mock, afterEach } from "bun:test";
import { EventEmitter } from "events";
import { PROVIDER_DISPLAY_NAMES } from "@/common/constants/providers";
import { Err, Ok } from "@/common/types/result";
import { AgentSession } from "./agentSession";
import { createTestHistoryService } from "./testHistoryService";
describe("AgentSession pre-stream errors", () => {
    let historyCleanup;
    afterEach(async () => {
        await historyCleanup?.();
    });
    it("emits stream-error when stream startup fails", async () => {
        const workspaceId = "ws-test";
        const config = {
            srcDir: "/tmp",
            getSessionDir: (_workspaceId) => "/tmp",
        };
        const { historyService, cleanup } = await createTestHistoryService();
        historyCleanup = cleanup;
        const aiEmitter = new EventEmitter();
        const streamMessage = mock((_history) => {
            return Promise.resolve(Err({
                type: "api_key_not_found",
                provider: "anthropic",
            }));
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
        const events = [];
        session.onChatEvent((event) => {
            events.push(event.message);
        });
        const result = await session.sendMessage("hello", {
            model: "anthropic:claude-3-5-sonnet-latest",
            agentId: "exec",
        });
        expect(result.success).toBe(false);
        expect(streamMessage.mock.calls).toHaveLength(1);
        const streamError = events.find((event) => event.type === "stream-error");
        expect(streamError).toBeDefined();
        expect(streamError?.errorType).toBe("authentication");
        expect(streamError?.error).toContain(PROVIDER_DISPLAY_NAMES.anthropic);
        expect(streamError?.messageId).toMatch(/^assistant-/);
    });
});
//# sourceMappingURL=agentSession.preStreamError.test.js.map