// Type guards for common chat message variants
export function isCaughtUpMessage(msg) {
    return msg.type === "caught-up";
}
export function isStreamError(msg) {
    return msg.type === "stream-error";
}
export function isDeleteMessage(msg) {
    return msg.type === "delete";
}
export function isStreamStart(msg) {
    return msg.type === "stream-start";
}
export function isStreamDelta(msg) {
    return msg.type === "stream-delta";
}
export function isStreamEnd(msg) {
    return msg.type === "stream-end";
}
export function isStreamAbort(msg) {
    return msg.type === "stream-abort";
}
export function isToolCallStart(msg) {
    return msg.type === "tool-call-start";
}
export function isToolCallDelta(msg) {
    return msg.type === "tool-call-delta";
}
export function isBashOutputEvent(msg) {
    return msg.type === "bash-output";
}
export function isTaskCreatedEvent(msg) {
    return msg.type === "task-created";
}
export function isToolCallEnd(msg) {
    return msg.type === "tool-call-end";
}
export function isReasoningDelta(msg) {
    return msg.type === "reasoning-delta";
}
export function isReasoningEnd(msg) {
    return msg.type === "reasoning-end";
}
export function isUsageDelta(msg) {
    return msg.type === "usage-delta";
}
export function isMuxMessage(msg) {
    return msg.type === "message";
}
export function isInitStart(msg) {
    return msg.type === "init-start";
}
export function isInitOutput(msg) {
    return msg.type === "init-output";
}
export function isInitEnd(msg) {
    return msg.type === "init-end";
}
export function isQueuedMessageChanged(msg) {
    return msg.type === "queued-message-changed";
}
export function isRestoreToInput(msg) {
    return msg.type === "restore-to-input";
}
export function isRuntimeStatus(msg) {
    return msg.type === "runtime-status";
}
//# sourceMappingURL=types.js.map