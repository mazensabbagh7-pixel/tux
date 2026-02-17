import { jsx as _jsx } from "react/jsx-runtime";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { GlobalWindow } from "happy-dom";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { ThemeProvider } from "@/browser/contexts/ThemeContext";
import { TooltipProvider } from "@/browser/components/ui/tooltip";
import { SelectableDiffRenderer } from "./DiffRenderer";
describe("SelectableDiffRenderer drag selection", () => {
    let onReviewNote;
    beforeEach(() => {
        globalThis.window = new GlobalWindow();
        globalThis.document = globalThis.window.document;
        onReviewNote = mock(() => undefined);
    });
    afterEach(() => {
        cleanup();
        globalThis.window = undefined;
        globalThis.document = undefined;
    });
    test("dragging on the indicator column selects a line range", async () => {
        const content = "+const a = 1;\n+const b = 2;\n+const c = 3;";
        const { container, getByPlaceholderText } = render(_jsx(ThemeProvider, { forcedTheme: "dark", children: _jsx(TooltipProvider, { children: _jsx(SelectableDiffRenderer, { content: content, filePath: "src/test.ts", onReviewNote: onReviewNote, maxHeight: "none", enableHighlighting: false }) }) }));
        await waitFor(() => {
            const indicators = container.querySelectorAll('[data-diff-indicator="true"]');
            expect(indicators.length).toBe(3);
        });
        const indicators = Array.from(container.querySelectorAll('[data-diff-indicator="true"]'));
        fireEvent.mouseDown(indicators[0], { button: 0 });
        fireEvent.mouseEnter(indicators[2]);
        fireEvent.mouseUp(window);
        const textarea = (await waitFor(() => getByPlaceholderText(/Add a review note/i)));
        await waitFor(() => {
            const selectedLines = Array.from(container.querySelectorAll('.selectable-diff-line[data-selected="true"]'));
            expect(selectedLines.length).toBe(3);
            const allLines = Array.from(container.querySelectorAll(".selectable-diff-line"));
            expect(allLines.length).toBe(3);
            // Input should render *after* the last selected line (line 2).
            const inputWrapper = allLines[2]?.nextElementSibling;
            expect(inputWrapper).toBeTruthy();
            expect(inputWrapper?.querySelector("textarea")).toBe(textarea);
        });
    });
});
//# sourceMappingURL=SelectableDiffRenderer.dragSelect.test.js.map