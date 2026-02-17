import { describe, expect, test } from "bun:test";
import { applyWorkspaceChatEventToAggregator, } from "./applyWorkspaceChatEventToAggregator";
class StubAggregator {
    constructor() {
        this.calls = [];
    }
    handleStreamStart(data) {
        this.calls.push(`handleStreamStart:${data.messageId}`);
    }
    handleStreamDelta(data) {
        this.calls.push(`handleStreamDelta:${data.messageId}`);
    }
    handleStreamEnd(data) {
        this.calls.push(`handleStreamEnd:${data.messageId}`);
    }
    handleStreamAbort(data) {
        this.calls.push(`handleStreamAbort:${data.messageId}`);
    }
    handleStreamError(data) {
        this.calls.push(`handleStreamError:${data.messageId}`);
    }
    handleToolCallStart(data) {
        this.calls.push(`handleToolCallStart:${data.toolCallId}`);
    }
    handleToolCallDelta(data) {
        this.calls.push(`handleToolCallDelta:${data.toolCallId}`);
    }
    handleToolCallEnd(data) {
        this.calls.push(`handleToolCallEnd:${data.toolCallId}`);
    }
    handleReasoningDelta(data) {
        this.calls.push(`handleReasoningDelta:${data.messageId}`);
    }
    handleReasoningEnd(data) {
        this.calls.push(`handleReasoningEnd:${data.messageId}`);
    }
    handleUsageDelta(data) {
        this.calls.push(`handleUsageDelta:${data.messageId}`);
    }
    handleDeleteMessage(data) {
        this.calls.push(`handleDeleteMessage:${data.historySequences.join(",")}`);
    }
    handleMessage(data) {
        this.calls.push(`handleMessage:${data.type}`);
    }
    handleRuntimeStatus(data) {
        this.calls.push(`handleRuntimeStatus:${data.phase}:${data.runtimeType}`);
    }
    clearTokenState(messageId) {
        this.calls.push(`clearTokenState:${messageId}`);
    }
}
describe("applyWorkspaceChatEventToAggregator", () => {
    test("stream-start routes to handleStreamStart", () => {
        const aggregator = new StubAggregator();
        const event = {
            type: "stream-start",
            workspaceId: "ws-1",
            messageId: "msg-1",
            historySequence: 1,
            model: "test-model",
            startTime: 0,
        };
        const hint = applyWorkspaceChatEventToAggregator(aggregator, event);
        expect(hint).toBe("immediate");
        expect(aggregator.calls).toEqual(["handleStreamStart:msg-1"]);
    });
    test("stream-delta routes to handleStreamDelta and is throttled", () => {
        const aggregator = new StubAggregator();
        const event = {
            type: "stream-delta",
            workspaceId: "ws-1",
            messageId: "msg-1",
            delta: "hi",
            tokens: 1,
            timestamp: 1,
        };
        const hint = applyWorkspaceChatEventToAggregator(aggregator, event);
        expect(hint).toBe("throttled");
        expect(aggregator.calls).toEqual(["handleStreamDelta:msg-1"]);
    });
    test("stream-end routes to handleStreamEnd and clears token state", () => {
        const aggregator = new StubAggregator();
        const event = {
            type: "stream-end",
            workspaceId: "ws-1",
            messageId: "msg-1",
            metadata: { model: "test-model" },
            parts: [],
        };
        const hint = applyWorkspaceChatEventToAggregator(aggregator, event);
        expect(hint).toBe("immediate");
        expect(aggregator.calls).toEqual(["handleStreamEnd:msg-1", "clearTokenState:msg-1"]);
    });
    test("runtime-status routes to handleRuntimeStatus", () => {
        const aggregator = new StubAggregator();
        const event = {
            type: "runtime-status",
            workspaceId: "ws-1",
            phase: "starting",
            runtimeType: "ssh",
            detail: "Starting Coder workspace...",
        };
        const hint = applyWorkspaceChatEventToAggregator(aggregator, event);
        expect(hint).toBe("immediate");
        expect(aggregator.calls).toEqual(["handleRuntimeStatus:starting:ssh"]);
    });
    test("stream-abort clears token state before calling handleStreamAbort", () => {
        const aggregator = new StubAggregator();
        const event = {
            type: "stream-abort",
            workspaceId: "ws-1",
            messageId: "msg-1",
            metadata: {},
        };
        const hint = applyWorkspaceChatEventToAggregator(aggregator, event);
        expect(hint).toBe("immediate");
        expect(aggregator.calls).toEqual(["clearTokenState:msg-1", "handleStreamAbort:msg-1"]);
    });
    test("tool-call-delta routes to handleToolCallDelta and is throttled", () => {
        const aggregator = new StubAggregator();
        const event = {
            type: "tool-call-delta",
            workspaceId: "ws-1",
            messageId: "msg-1",
            toolCallId: "tool-1",
            toolName: "bash",
            delta: { chunk: "..." },
            tokens: 1,
            timestamp: 1,
        };
        const hint = applyWorkspaceChatEventToAggregator(aggregator, event);
        expect(hint).toBe("throttled");
        expect(aggregator.calls).toEqual(["handleToolCallDelta:tool-1"]);
    });
    test("message routes to handleMessage", () => {
        const aggregator = new StubAggregator();
        const event = {
            type: "message",
            id: "msg-1",
            role: "user",
            parts: [{ type: "text", text: "hi" }],
            metadata: { historySequence: 1, timestamp: 0 },
        };
        const hint = applyWorkspaceChatEventToAggregator(aggregator, event);
        expect(hint).toBe("immediate");
        expect(aggregator.calls).toEqual(["handleMessage:message"]);
    });
    test("queued-message-changed is ignored", () => {
        const aggregator = new StubAggregator();
        const event = {
            type: "queued-message-changed",
            workspaceId: "ws-1",
            queuedMessages: ["a"],
            displayText: "queued",
        };
        const hint = applyWorkspaceChatEventToAggregator(aggregator, event);
        expect(hint).toBe("ignored");
        expect(aggregator.calls).toEqual([]);
    });
    test("unsupported event types are ignored (forward-compatible)", () => {
        const aggregator = new StubAggregator();
        const event = {
            type: "error",
            workspaceId: "ws-1",
            messageId: "msg-1",
            error: "boom",
            errorType: "unknown",
        };
        const hint = applyWorkspaceChatEventToAggregator(aggregator, event);
        expect(hint).toBe("ignored");
        expect(aggregator.calls).toEqual([]);
    });
    test("throws when aggregator is missing", () => {
        const event = {
            type: "caught-up",
        };
        expect(() => applyWorkspaceChatEventToAggregator(null, event)).toThrow();
    });
});
//# sourceMappingURL=applyWorkspaceChatEventToAggregator.test.js.map