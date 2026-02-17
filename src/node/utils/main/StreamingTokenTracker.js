/**
 * StreamingTokenTracker - Synchronous token counting for streaming deltas
 *
 * Simplified tracker that provides immediate token counts for each delta.
 * TPS calculation moved to frontend for better replay support and flexibility.
 */
import { getTokenizerForModel } from "./tokenizer";
/**
 * StreamingTokenTracker provides synchronous token counting
 */
export class StreamingTokenTracker {
    constructor() {
        this.tokenizer = null;
    }
    /**
     * Initialize tokenizer for the current model
     * Should be called when model changes or on first stream
     */
    async setModel(model) {
        this.tokenizer ?? (this.tokenizer = await getTokenizerForModel(model));
    }
    /**
     * Count tokens in a text string synchronously
     * Performance: <1ms per delta with LRU caching
     */
    async countTokens(text) {
        if (!this.tokenizer || !text)
            return 0;
        return this.tokenizer.countTokens(text);
    }
}
//# sourceMappingURL=StreamingTokenTracker.js.map