/**
 * Platform-agnostic chat event processor for streaming message accumulation.
 *
 * This module handles the core logic of accumulating streaming events into coherent
 * MuxMessage objects. It's shared between desktop and mobile implementations.
 *
 * Responsibilities:
 * - Accumulate streaming deltas (text, reasoning, tool calls) by messageId
 * - Handle init lifecycle events (init-start, init-output, init-end)
 * - Merge adjacent parts of the same type
 * - Maintain message ordering and metadata
 *
 * NOT responsible for:
 * - UI state management (todos, agent status, recency)
 * - DisplayedMessage transformation (platform-specific)
 * - React/DOM interactions
 */
import { isStreamStart, isStreamDelta, isStreamEnd, isStreamAbort, isStreamError, isToolCallStart, isToolCallEnd, isReasoningDelta, isReasoningEnd, isMuxMessage, isInitStart, isInitOutput, isInitEnd, } from "@/common/orpc/types";
function createMuxMessage(id, role, content, metadata) {
    const parts = content ? [{ type: "text", text: content }] : [];
    return {
        id,
        role,
        parts,
        metadata,
    };
}
export function createChatEventProcessor() {
    const messages = new Map();
    let initState = null;
    const handleEvent = (event) => {
        // Handle init lifecycle events
        if (isInitStart(event)) {
            initState = {
                hookPath: event.hookPath,
                status: "running",
                lines: [],
                exitCode: null,
                timestamp: event.timestamp,
                durationMs: null,
            };
            return;
        }
        if (isInitOutput(event)) {
            if (!initState) {
                console.error("Received init-output without prior init-start", event);
                return;
            }
            if (typeof event.line !== "string") {
                console.error("Init-output line was not a string", { line: event.line, event });
                return;
            }
            initState.lines.push({ line: event.line.trimEnd(), isError: event.isError === true });
            return;
        }
        if (isInitEnd(event)) {
            if (!initState) {
                console.error("Received init-end without prior init-start", event);
                return;
            }
            initState.status = event.exitCode === 0 ? "success" : "error";
            initState.exitCode = event.exitCode;
            const durationMs = event.timestamp - initState.timestamp;
            if (!Number.isFinite(durationMs) || durationMs < 0) {
                console.error("Init hook duration was invalid", {
                    start: initState.timestamp,
                    end: event.timestamp,
                    durationMs,
                });
                initState.durationMs = null;
            }
            else {
                initState.durationMs = durationMs;
            }
            return;
        }
        // Handle stream start
        if (isStreamStart(event)) {
            const start = event;
            const message = createMuxMessage(start.messageId, start.role ?? "assistant", "", {
                historySequence: start.metadata?.historySequence ?? start.historySequence,
                timestamp: start.metadata?.timestamp ?? start.timestamp,
                model: start.metadata?.model ?? start.model,
                routedThroughGateway: start.metadata?.routedThroughGateway ?? start.routedThroughGateway,
                muxMetadata: start.metadata?.muxMetadata,
                partial: true,
            });
            messages.set(start.messageId, message);
            return;
        }
        // Handle deltas
        if (isStreamDelta(event)) {
            const message = messages.get(event.messageId);
            if (!message) {
                console.error("Received stream-delta for unknown message", event.messageId);
                return;
            }
            const lastPart = message.parts.at(-1);
            if (lastPart?.type === "text") {
                lastPart.text += event.delta;
            }
            else {
                message.parts.push({
                    type: "text",
                    text: event.delta,
                    timestamp: event.timestamp,
                });
            }
            message.metadata = {
                ...message.metadata,
                partial: true,
            };
            return;
        }
        if (isStreamEnd(event)) {
            const message = messages.get(event.messageId);
            if (!message) {
                console.error("Received stream-end for unknown message", event.messageId);
                return;
            }
            const metadata = event.metadata;
            message.metadata = {
                ...message.metadata,
                partial: false,
                timestamp: metadata.timestamp ?? message.metadata?.timestamp,
                model: metadata.model ?? message.metadata?.model ?? event.metadata.model,
                routedThroughGateway: metadata.routedThroughGateway ??
                    message.metadata?.routedThroughGateway ??
                    event.metadata.routedThroughGateway,
                usage: metadata.usage ?? message.metadata?.usage,
                providerMetadata: metadata.providerMetadata ?? message.metadata?.providerMetadata,
                systemMessageTokens: metadata.systemMessageTokens ?? message.metadata?.systemMessageTokens,
                muxMetadata: metadata.muxMetadata ?? message.metadata?.muxMetadata,
                historySequence: metadata.historySequence ??
                    message.metadata?.historySequence ??
                    event.metadata.historySequence,
                toolPolicy: message.metadata?.toolPolicy,
                mode: message.metadata?.mode,
            };
            return;
        }
        if (isStreamAbort(event)) {
            const message = messages.get(event.messageId);
            if (!message) {
                console.error("Received stream-abort for unknown message", event.messageId);
                return;
            }
            message.metadata = {
                ...message.metadata,
                partial: true,
                synthetic: false,
            };
            return;
        }
        if (isStreamError(event)) {
            const message = messages.get(event.messageId);
            if (message) {
                message.metadata = {
                    ...message.metadata,
                    error: event.error,
                    errorType: event.errorType,
                };
            }
            return;
        }
        if (isMuxMessage(event)) {
            messages.set(event.id, event);
            return;
        }
        if (isReasoningDelta(event)) {
            const message = messages.get(event.messageId);
            if (!message) {
                console.error("Received reasoning-delta for unknown message", event.messageId);
                return;
            }
            const lastPart = message.parts.at(-1);
            if (lastPart?.type === "reasoning") {
                // Signature updates come with empty delta - just update the signature
                if (event.signature && !event.delta) {
                    lastPart.signature = event.signature;
                    lastPart.providerOptions = { anthropic: { signature: event.signature } };
                }
                else {
                    lastPart.text += event.delta;
                    // Also capture signature if present with text
                    if (event.signature) {
                        lastPart.signature = event.signature;
                        lastPart.providerOptions = { anthropic: { signature: event.signature } };
                    }
                }
            }
            else {
                message.parts.push({
                    type: "reasoning",
                    text: event.delta,
                    timestamp: event.timestamp,
                    signature: event.signature,
                    providerOptions: event.signature
                        ? { anthropic: { signature: event.signature } }
                        : undefined,
                });
            }
            return;
        }
        if (isReasoningEnd(event)) {
            return;
        }
        if (isToolCallStart(event)) {
            const message = messages.get(event.messageId);
            if (!message) {
                console.error("Received tool-call-start for unknown message", event.messageId);
                return;
            }
            const existingToolPart = message.parts.find((part) => part.type === "dynamic-tool" && part.toolCallId === event.toolCallId);
            if (existingToolPart) {
                console.warn(`Tool call ${event.toolCallId} already exists, skipping duplicate`);
                return;
            }
            const toolPart = {
                type: "dynamic-tool",
                toolCallId: event.toolCallId,
                toolName: event.toolName,
                state: "input-available",
                input: event.args,
                timestamp: event.timestamp,
            };
            message.parts.push(toolPart);
            return;
        }
        if (isToolCallEnd(event)) {
            const message = messages.get(event.messageId);
            if (!message) {
                console.error("Received tool-call-end for unknown message", event.messageId);
                return;
            }
            const toolPart = message.parts.find((part) => part.type === "dynamic-tool" && part.toolCallId === event.toolCallId);
            if (toolPart) {
                toolPart.state = "output-available";
                toolPart.output = event.result;
            }
            else {
                console.error("Received tool-call-end for unknown tool call", event.toolCallId);
            }
            return;
        }
    };
    const getMessages = () => {
        return Array.from(messages.values()).sort((a, b) => {
            const seqA = a.metadata?.historySequence ?? 0;
            const seqB = b.metadata?.historySequence ?? 0;
            return seqA - seqB;
        });
    };
    const getMessageById = (id) => {
        return messages.get(id);
    };
    const getInitState = () => {
        return initState;
    };
    const reset = () => {
        messages.clear();
        initState = null;
    };
    const deleteByHistorySequence = (sequences) => {
        const sequencesToDelete = new Set(sequences);
        const messagesToRemove = [];
        for (const [messageId, message] of messages.entries()) {
            const historySeq = message.metadata?.historySequence;
            if (historySeq !== undefined && sequencesToDelete.has(historySeq)) {
                messagesToRemove.push(messageId);
            }
        }
        for (const messageId of messagesToRemove) {
            messages.delete(messageId);
        }
    };
    return {
        handleEvent,
        getMessages,
        getMessageById,
        getInitState,
        reset,
        deleteByHistorySequence,
    };
}
//# sourceMappingURL=ChatEventProcessor.js.map