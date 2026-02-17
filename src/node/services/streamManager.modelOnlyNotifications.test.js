import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { StreamManager } from "./streamManager";
import { createTestHistoryService } from "./testHistoryService";
describe("StreamManager - model-only tool notifications", () => {
    let historyService;
    let historyCleanup;
    beforeEach(async () => {
        ({ historyService, cleanup: historyCleanup } = await createTestHistoryService());
    });
    afterEach(async () => {
        await historyCleanup();
    });
    test("strips __mux_notifications before emitting tool-call-end", async () => {
        const streamManager = new StreamManager(historyService);
        // Avoid tokenizer worker usage in unit tests.
        streamManager.tokenTracker = {
            // eslint-disable-next-line @typescript-eslint/require-await
            setModel: async () => undefined,
            // eslint-disable-next-line @typescript-eslint/require-await
            countTokens: async () => 0,
        };
        const events = [];
        streamManager.on("tool-call-end", (data) => {
            events.push({ toolName: data.toolName, result: data.result });
        });
        const mockStreamResult = {
            // eslint-disable-next-line @typescript-eslint/require-await
            fullStream: (async function* () {
                yield {
                    type: "tool-call",
                    toolCallId: "call-1",
                    toolName: "bash",
                    input: { script: "echo hi" },
                };
                yield {
                    type: "tool-result",
                    toolCallId: "call-1",
                    toolName: "bash",
                    output: {
                        ok: true,
                        __mux_notifications: ["<notification>hello</notification>"],
                    },
                };
            })(),
            totalUsage: Promise.resolve({ inputTokens: 0, outputTokens: 0, totalTokens: 0 }),
            usage: Promise.resolve({ inputTokens: 0, outputTokens: 0, totalTokens: 0 }),
            providerMetadata: Promise.resolve({}),
            steps: Promise.resolve([]),
        };
        const streamInfo = {
            state: 2, // STREAMING
            streamResult: mockStreamResult,
            abortController: new AbortController(),
            messageId: "test-message-1",
            token: "test-token",
            startTime: Date.now(),
            model: "noop:model",
            historySequence: 1,
            parts: [],
            lastPartialWriteTime: 0,
            partialWritePromise: undefined,
            partialWriteTimer: undefined,
            processingPromise: Promise.resolve(),
            softInterrupt: { pending: false },
            runtimeTempDir: "", // Skip cleanup rm -rf
            runtime: {},
            cumulativeUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
            cumulativeProviderMetadata: undefined,
            lastStepUsage: undefined,
            lastStepProviderMetadata: undefined,
        };
        const method = Reflect.get(streamManager, "processStreamWithCleanup");
        expect(typeof method).toBe("function");
        await method.call(streamManager, "test-workspace", streamInfo, 1);
        const toolEnd = events.find((e) => e.toolName === "bash");
        expect(toolEnd).toBeDefined();
        expect(toolEnd?.result && typeof toolEnd.result === "object").toBe(true);
        expect("__mux_notifications" in toolEnd.result).toBe(false);
    });
    test("persists orphan web_search tool-result when tool-call mapping is missing", async () => {
        const streamManager = new StreamManager(historyService);
        // Avoid tokenizer worker usage in unit tests.
        streamManager.tokenTracker = {
            // eslint-disable-next-line @typescript-eslint/require-await
            setModel: async () => undefined,
            // eslint-disable-next-line @typescript-eslint/require-await
            countTokens: async () => 0,
        };
        const events = [];
        streamManager.on("tool-call-end", (data) => {
            events.push({ toolName: data.toolName, result: data.result });
        });
        const mockStreamResult = {
            // eslint-disable-next-line @typescript-eslint/require-await
            fullStream: (async function* () {
                yield {
                    type: "tool-result",
                    toolCallId: "orphan-web-search-1",
                    toolName: "web_search",
                    output: {
                        type: "json",
                        value: [
                            {
                                title: "Example",
                                url: "https://example.com",
                                encryptedContent: "encrypted-payload",
                            },
                        ],
                    },
                };
            })(),
            totalUsage: Promise.resolve({ inputTokens: 0, outputTokens: 0, totalTokens: 0 }),
            usage: Promise.resolve({ inputTokens: 0, outputTokens: 0, totalTokens: 0 }),
            providerMetadata: Promise.resolve({}),
            steps: Promise.resolve([]),
        };
        const streamInfo = {
            state: 2, // STREAMING
            streamResult: mockStreamResult,
            abortController: new AbortController(),
            messageId: "test-message-orphan-web-search",
            token: "test-token",
            startTime: Date.now(),
            model: "noop:model",
            historySequence: 1,
            parts: [],
            lastPartialWriteTime: 0,
            partialWritePromise: undefined,
            partialWriteTimer: undefined,
            processingPromise: Promise.resolve(),
            softInterrupt: { pending: false },
            runtimeTempDir: "", // Skip cleanup rm -rf
            runtime: {},
            cumulativeUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
            cumulativeProviderMetadata: undefined,
            lastStepUsage: undefined,
            lastStepProviderMetadata: undefined,
        };
        const method = Reflect.get(streamManager, "processStreamWithCleanup");
        expect(typeof method).toBe("function");
        await method.call(streamManager, "test-workspace", streamInfo, 1);
        const webSearchPart = streamInfo.parts.find((part) => part.toolCallId === "orphan-web-search-1");
        expect(webSearchPart).toBeDefined();
        expect(webSearchPart?.state).toBe("output-available");
        expect(webSearchPart?.input).toBeNull();
        expect(webSearchPart?.output && typeof webSearchPart.output === "object").toBe(true);
        const outputRecord = webSearchPart?.output;
        expect(outputRecord?.type).toBe("json");
        expect(Array.isArray(outputRecord?.value)).toBe(true);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- test assertion on dynamic tool output shape
        const firstResult = Array.isArray(outputRecord?.value) ? outputRecord.value[0] : undefined;
        expect(firstResult && typeof firstResult === "object").toBe(true);
        if (!firstResult || typeof firstResult !== "object") {
            throw new Error("Expected first web_search result object");
        }
        expect("encryptedContent" in firstResult).toBe(false);
        const toolEnd = events.find((event) => event.toolName === "web_search");
        expect(toolEnd).toBeDefined();
    });
});
//# sourceMappingURL=streamManager.modelOnlyNotifications.test.js.map