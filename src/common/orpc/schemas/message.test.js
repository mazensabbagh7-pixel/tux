import { describe, expect, test } from "bun:test";
import { MuxMessageSchema } from "./message";
function createMessage() {
    return {
        id: "msg-1",
        role: "assistant",
        parts: [{ type: "text", text: "Hello" }],
    };
}
describe("MuxMessageSchema compactionEpoch parsing", () => {
    test("preserves valid positive integer compactionEpoch", () => {
        const parsed = MuxMessageSchema.parse({
            ...createMessage(),
            metadata: {
                compactionEpoch: 7,
            },
        });
        expect(parsed.metadata?.compactionEpoch).toBe(7);
    });
    test("tolerates malformed compactionEpoch values by treating them as absent", () => {
        const malformedCompactionEpochValues = [
            0,
            -1,
            1.5,
            Number.NaN,
            Number.POSITIVE_INFINITY,
            "7",
            null,
            true,
            {},
            [],
        ];
        for (const malformedCompactionEpoch of malformedCompactionEpochValues) {
            const parsed = MuxMessageSchema.parse({
                ...createMessage(),
                metadata: {
                    compactionEpoch: malformedCompactionEpoch,
                },
            });
            expect(parsed.metadata?.compactionEpoch).toBeUndefined();
        }
    });
});
//# sourceMappingURL=message.test.js.map