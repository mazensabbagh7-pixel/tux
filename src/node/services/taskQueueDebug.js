export function taskQueueDebug(message, details) {
    if (process.env.MUX_DEBUG_TASK_QUEUE !== "1")
        return;
    console.log(`[task-queue] ${message}`, details ?? {});
}
//# sourceMappingURL=taskQueueDebug.js.map