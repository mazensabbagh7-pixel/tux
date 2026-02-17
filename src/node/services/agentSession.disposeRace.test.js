import { describe, expect, test, mock } from "bun:test";
import { AgentSession } from "./agentSession";
import { Ok } from "@/common/types/result";
function createDeferred() {
    let resolve;
    const promise = new Promise((res) => {
        resolve = res;
    });
    return { promise, resolve };
}
describe("AgentSession disposal race conditions", () => {
    test("does not crash if disposed while auto-sending a queued message", async () => {
        const aiHandlers = new Map();
        const streamMessage = mock(() => Promise.resolve(Ok(undefined)));
        const aiService = {
            on(eventName, listener) {
                aiHandlers.set(String(eventName), listener);
                return this;
            },
            off(_eventName, _listener) {
                return this;
            },
            stopStream: mock(() => Promise.resolve(Ok(undefined))),
            isStreaming: mock(() => false),
            streamMessage,
        };
        // Justified mock: deferred promise is essential for testing the dispose-during-write race.
        // A real HistoryService completes appendToHistory synchronously (sub-ms), so we can't
        // reproduce the race window without controlling when the promise resolves.
        const appendDeferred = createDeferred();
        const historyService = {
            appendToHistory: mock(() => appendDeferred.promise),
        };
        const initStateManager = {
            on(_eventName, _listener) {
                return this;
            },
            off(_eventName, _listener) {
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
        // Capture the fire-and-forget sendMessage() promise that sendQueuedMessages() creates.
        const originalSendMessage = session.sendMessage.bind(session);
        let inFlight;
        session.sendMessage = (...args) => {
            const promise = originalSendMessage(...args);
            inFlight = promise;
            return promise;
        };
        session.queueMessage("Queued message", {
            model: "anthropic:claude-sonnet-4-5",
            agentId: "exec",
        });
        session.sendQueuedMessages();
        expect(inFlight).toBeDefined();
        // Dispose while sendMessage() is awaiting appendToHistory.
        session.dispose();
        appendDeferred.resolve(Ok(undefined));
        const result = await inFlight;
        expect(result.success).toBe(true);
        // We should not attempt to stream once disposal has begun.
        expect(streamMessage).toHaveBeenCalledTimes(0);
        // Sanity: invoking a forwarded handler after dispose should be a no-op.
        const streamStart = aiHandlers.get("stream-start");
        expect(() => streamStart?.({
            type: "stream-start",
            workspaceId: "ws",
            messageId: "m1",
            model: "anthropic:claude-sonnet-4-5",
            historySequence: 1,
            startTime: Date.now(),
        })).not.toThrow();
    });
});
//# sourceMappingURL=agentSession.disposeRace.test.js.map