/**
 * MutexMap - Generic mutex utility for serializing operations per key
 *
 * Prevents race conditions when multiple concurrent operations need to
 * modify the same resource (file, data structure, etc.) identified by a key.
 *
 * Example usage:
 * ```typescript
 * const fileLocks = new MutexMap<string>();
 *
 * // Serialize writes to the same file
 * await fileLocks.withLock("file.txt", async () => {
 *   await fs.writeFile("file.txt", data);
 * });
 * ```
 */
export class MutexMap {
    constructor() {
        this.locks = new Map();
    }
    /**
     * Execute an operation with exclusive access per key
     * Operations for the same key are serialized (run one at a time)
     * Operations for different keys can run concurrently
     */
    async withLock(key, operation) {
        // Chain onto existing lock (or resolved promise if none)
        const previousLock = this.locks.get(key) ?? Promise.resolve();
        let releaseLock;
        const lockPromise = new Promise((resolve) => {
            releaseLock = resolve;
        });
        // ATOMIC: set our lock BEFORE awaiting previous
        // This prevents the TOCTOU race where multiple callers see the same
        // existing lock, all await it, then all proceed concurrently
        this.locks.set(key, lockPromise);
        try {
            await previousLock; // Wait for previous operation
            return await operation();
        }
        finally {
            releaseLock();
            if (this.locks.get(key) === lockPromise) {
                this.locks.delete(key);
            }
        }
    }
}
//# sourceMappingURL=mutexMap.js.map