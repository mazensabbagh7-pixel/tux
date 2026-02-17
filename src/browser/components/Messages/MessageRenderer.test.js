import { jsx as _jsx } from "react/jsx-runtime";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { GlobalWindow } from "happy-dom";
import { MessageRenderer } from "./MessageRenderer";
describe("MessageRenderer compaction boundary rows", () => {
    beforeEach(() => {
        globalThis.window = new GlobalWindow();
        globalThis.document = globalThis.window.document;
    });
    afterEach(() => {
        cleanup();
        globalThis.window = undefined;
        globalThis.document = undefined;
    });
    test("renders start compaction boundary rows", () => {
        const message = {
            type: "compaction-boundary",
            id: "boundary-start",
            historySequence: 10,
            position: "start",
            compactionEpoch: 4,
        };
        const { getByTestId, getByText } = render(_jsx(MessageRenderer, { message: message }));
        const boundary = getByTestId("compaction-boundary");
        expect(boundary).toBeDefined();
        expect(boundary.getAttribute("role")).toBe("separator");
        expect(boundary.getAttribute("aria-orientation")).toBe("horizontal");
        expect(boundary.getAttribute("aria-label")).toBe("Compaction boundary #4");
        expect(getByText("Compaction boundary #4")).toBeDefined();
    });
    test("renders compaction boundary label for legacy end rows", () => {
        const message = {
            type: "compaction-boundary",
            id: "boundary-end",
            historySequence: 10,
            position: "end",
            compactionEpoch: 4,
        };
        const { getByTestId, getByText } = render(_jsx(MessageRenderer, { message: message }));
        const boundary = getByTestId("compaction-boundary");
        expect(boundary.getAttribute("aria-label")).toBe("Compaction boundary #4");
        expect(getByText("Compaction boundary #4")).toBeDefined();
    });
});
//# sourceMappingURL=MessageRenderer.test.js.map