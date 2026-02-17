import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React from "react";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { GlobalWindow } from "happy-dom";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { ChatInputToast } from "./ChatInputToast";
describe("ChatInputToast", () => {
    beforeEach(() => {
        globalThis.window = new GlobalWindow();
        globalThis.document = globalThis.window.document;
    });
    afterEach(() => {
        cleanup();
        globalThis.window = undefined;
        globalThis.document = undefined;
    });
    test("resets leaving state when a new toast is shown", async () => {
        const toast1 = { id: "toast-1", type: "error", message: "first" };
        const toast2 = { id: "toast-2", type: "error", message: "second" };
        function Harness() {
            const [toast, setToast] = React.useState(toast1);
            return (_jsxs("div", { children: [_jsx(ChatInputToast, { toast: toast, onDismiss: () => undefined }), _jsx("button", { onClick: () => setToast(toast2), children: "Next toast" })] }));
        }
        const { getByLabelText, getByRole, getByText } = render(_jsx(Harness, {}));
        fireEvent.click(getByLabelText("Dismiss"));
        await waitFor(() => {
            expect(getByRole("alert").className).toContain("toastFadeOut");
        });
        fireEvent.click(getByText("Next toast"));
        await waitFor(() => {
            const className = getByRole("alert").className;
            expect(className).toContain("toastSlideIn");
            expect(className).not.toContain("toastFadeOut");
        });
    });
});
//# sourceMappingURL=ChatInputToast.test.js.map