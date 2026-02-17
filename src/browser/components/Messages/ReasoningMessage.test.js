import { jsx as _jsx } from "react/jsx-runtime";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { GlobalWindow } from "happy-dom";
import { ReasoningMessage } from "./ReasoningMessage";
function createReasoningMessage(content) {
    return {
        type: "reasoning",
        id: "reasoning-1",
        historyId: "history-1",
        content,
        historySequence: 1,
        isStreaming: false,
        isPartial: false,
    };
}
describe("ReasoningMessage", () => {
    beforeEach(() => {
        globalThis.window = new GlobalWindow();
        globalThis.document = globalThis.window.document;
    });
    afterEach(() => {
        cleanup();
        globalThis.window = undefined;
        globalThis.document = undefined;
    });
    test("expands completed multi-line reasoning when header is clicked", () => {
        const message = createReasoningMessage("Summary line\nSecond line details");
        const { getByText, queryByText } = render(_jsx(ReasoningMessage, { message: message }));
        // Collapsed reasoning should not render full markdown until expanded.
        expect(queryByText(/Second line details/)).toBeNull();
        fireEvent.click(getByText("Summary line"));
        expect(getByText(/Second line details/)).toBeDefined();
    });
    test("renders leading markdown-bold summary text as bold", () => {
        const message = createReasoningMessage("**Collecting context**\nSecond line details");
        const { container } = render(_jsx(ReasoningMessage, { message: message }));
        const strongSummary = container.querySelector("strong");
        expect(strongSummary).not.toBeNull();
        expect(strongSummary?.textContent).toBe("Collecting context");
    });
});
//# sourceMappingURL=ReasoningMessage.test.js.map