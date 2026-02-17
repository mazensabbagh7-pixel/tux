import { describe, expect, test, mock, afterEach } from "bun:test";
import { AgentSession } from "./agentSession";
import { Ok } from "@/common/types/result";
import { createTestHistoryService } from "./testHistoryService";
describe("AgentSession.resumeStream", () => {
    let historyCleanup;
    afterEach(async () => {
        await historyCleanup?.();
    });
    test("returns an error when history is empty", async () => {
        const streamMessage = mock(() => Promise.resolve(Ok(undefined)));
        const aiService = {
            on: mock(() => aiService),
            off: mock(() => aiService),
            stopStream: mock(() => Promise.resolve(Ok(undefined))),
            isStreaming: mock(() => false),
            streamMessage,
        };
        const { historyService, cleanup } = await createTestHistoryService();
        historyCleanup = cleanup;
        const initStateManager = {
            on: mock(() => initStateManager),
            off: mock(() => initStateManager),
        };
        const backgroundProcessManager = {
            cleanup: mock(() => Promise.resolve()),
            setMessageQueued: mock(() => undefined),
        };
        const config = {
            srcDir: "/tmp",
            getSessionDir: mock(() => "/tmp"),
        };
        const session = new AgentSession({
            workspaceId: "ws",
            config,
            historyService,
            aiService,
            initStateManager,
            backgroundProcessManager,
        });
        const result = await session.resumeStream({
            model: "anthropic:claude-sonnet-4-5",
            agentId: "exec",
        });
        expect(result.success).toBe(false);
        if (result.success)
            return;
        expect(result.error.type).toBe("unknown");
        if (result.error.type !== "unknown") {
            throw new Error(`Expected unknown error, got ${result.error.type}`);
        }
        expect(result.error.raw).toContain("history is empty");
        expect(streamMessage).toHaveBeenCalledTimes(0);
    });
});
//# sourceMappingURL=agentSession.resumeStreamEmptyHistory.test.js.map