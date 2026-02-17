import { jsx as _jsx } from "react/jsx-runtime";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { GlobalWindow } from "happy-dom";
import { StreamingBarrierView } from "./StreamingBarrierView";
describe("StreamingBarrierView", () => {
    beforeEach(() => {
        globalThis.window = new GlobalWindow();
        globalThis.document = globalThis.window.document;
    });
    afterEach(() => {
        cleanup();
        globalThis.window = undefined;
        globalThis.document = undefined;
    });
    test("renders stop button when onCancel is provided", () => {
        const onCancel = mock(() => undefined);
        const view = render(_jsx(StreamingBarrierView, { statusText: "streaming...", cancelText: "hit Esc to cancel", cancelShortcutText: "Esc", onCancel: onCancel }));
        const stopButton = view.getByRole("button", { name: "Stop streaming" });
        expect(stopButton.textContent).toContain("Stop");
        expect(stopButton.textContent).toContain("Esc");
        expect(stopButton.getAttribute("title")).toBe("Esc");
        fireEvent.click(stopButton);
        expect(onCancel).toHaveBeenCalledTimes(1);
    });
    test("does not render shortcut badge when cancelShortcutText is omitted", () => {
        const onCancel = mock(() => undefined);
        const view = render(_jsx(StreamingBarrierView, { statusText: "streaming...", cancelText: "hit Esc to cancel", onCancel: onCancel }));
        const stopButton = view.getByRole("button", { name: "Stop streaming" });
        expect(stopButton.textContent).toContain("Stop");
        expect(stopButton.textContent).not.toContain("Esc");
    });
    test("renders cancel hint as plain text when onCancel is omitted", () => {
        const view = render(_jsx(StreamingBarrierView, { statusText: "streaming...", cancelText: "hit Esc to cancel" }));
        expect(view.getByText("hit Esc to cancel")).toBeTruthy();
        expect(view.queryByRole("button", { name: "Stop streaming" })).toBeNull();
    });
});
//# sourceMappingURL=StreamingBarrierView.test.js.map