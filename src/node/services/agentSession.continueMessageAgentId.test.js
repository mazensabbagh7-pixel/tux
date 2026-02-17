import { describe, expect, test, mock, afterEach } from "bun:test";
import { buildContinueMessage } from "@/common/types/message";
import { AgentSession } from "./agentSession";
import { createTestHistoryService } from "./testHistoryService";
describe("AgentSession continue-message agentId fallback", () => {
    let historyCleanup;
    afterEach(async () => {
        await historyCleanup?.();
    });
    test("legacy continueMessage.mode does not fall back to compact agent", async () => {
        // Track the follow-up message that gets dispatched
        let dispatchedMessage;
        let dispatchedOptions;
        const aiService = {
            on() {
                return this;
            },
            off() {
                return this;
            },
            isStreaming: () => false,
            stopStream: mock(() => Promise.resolve({ success: true, data: undefined })),
        };
        // Create a mock compaction summary with legacy mode field
        const baseContinueMessage = buildContinueMessage({
            text: "follow up",
            model: "openai:gpt-4o",
            agentId: "exec",
        });
        if (!baseContinueMessage) {
            throw new Error("Expected base continue message to be built");
        }
        // Simulate legacy format: no agentId, but has mode instead
        const legacyFollowUp = {
            text: baseContinueMessage.text,
            model: "openai:gpt-4o",
            agentId: undefined, // Legacy: missing agentId
            mode: "plan", // Legacy: mode field instead of agentId
        };
        // Mock history service to return a compaction summary with pending follow-up
        const mockSummaryMessage = {
            id: "summary-1",
            role: "assistant",
            parts: [{ type: "text", text: "Compaction summary" }],
            metadata: {
                muxMetadata: {
                    type: "compaction-summary",
                    pendingFollowUp: legacyFollowUp,
                },
            },
        };
        const { historyService, cleanup } = await createTestHistoryService();
        historyCleanup = cleanup;
        await historyService.appendToHistory("ws", mockSummaryMessage);
        const initStateManager = {
            on() {
                return this;
            },
            off() {
                return this;
            },
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
        const internals = session;
        // Intercept sendMessage to capture what dispatchPendingFollowUp sends
        internals.sendMessage = mock((message, options) => {
            dispatchedMessage = message;
            dispatchedOptions = options;
            return Promise.resolve({ success: true });
        });
        // Call dispatchPendingFollowUp directly (normally called after compaction completes)
        await internals.dispatchPendingFollowUp();
        // Verify the follow-up was dispatched with correct agentId derived from legacy mode
        expect(dispatchedMessage).toBe("follow up");
        expect(dispatchedOptions?.agentId).toBe("plan");
        session.dispose();
    });
});
//# sourceMappingURL=agentSession.continueMessageAgentId.test.js.map