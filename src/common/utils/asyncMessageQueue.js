/**
 * Creates a queue-based async message stream.
 *
 * Messages pushed to the queue are yielded in batches (all queued messages
 * at once without async boundaries). This prevents premature React renders
 * when loading many messages quickly (e.g., history replay).
 *
 * Usage:
 * ```ts
 * const { push, iterate, end } = createAsyncMessageQueue<MyMessage>();
 *
 * // Push messages from any source
 * eventEmitter.on('message', push);
 *
 * // Consume as async generator
 * for await (const msg of iterate()) {
 *   handleMessage(msg);
 * }
 *
 * // Clean up
 * end();
 * ```
 */
export function createAsyncMessageQueue() {
    const queue = [];
    let resolveNext = null;
    let ended = false;
    const push = (msg) => {
        if (ended)
            return;
        queue.push(msg);
        // Signal that new messages are available
        if (resolveNext) {
            const resolve = resolveNext;
            resolveNext = null;
            resolve();
        }
    };
    async function* iterate() {
        while (!ended) {
            // Yield all queued messages synchronously (no async boundaries)
            // This ensures all messages from a batch are processed in the same
            // event loop tick, preventing premature renders
            while (queue.length > 0) {
                yield queue.shift();
            }
            // Wait for more messages
            await new Promise((resolve) => {
                resolveNext = resolve;
            });
        }
        // Yield any remaining messages after end() is called
        while (queue.length > 0) {
            yield queue.shift();
        }
    }
    const end = () => {
        ended = true;
        // Wake up the iterator so it can exit
        if (resolveNext) {
            resolveNext();
        }
    };
    return { push, iterate, end };
}
//# sourceMappingURL=asyncMessageQueue.js.map