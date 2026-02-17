import { jsx as _jsx } from "react/jsx-runtime";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { GlobalWindow } from "happy-dom";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { StatsTab } from "./StatsTab";
describe("StatsTab clear", () => {
    let originalWindow;
    let originalDocument;
    let originalWarn;
    let warnCalls;
    beforeEach(() => {
        originalWindow = globalThis.window;
        originalDocument = globalThis.document;
        globalThis.window = new GlobalWindow();
        globalThis.document = globalThis.window.document;
        // Ensure persisted state starts clean for each test.
        globalThis.window.localStorage.clear();
        warnCalls = [];
        originalWarn = console.warn;
        console.warn = (...args) => {
            warnCalls.push(args);
        };
    });
    afterEach(() => {
        cleanup();
        console.warn = originalWarn;
        globalThis.window = originalWindow;
        globalThis.document = originalDocument;
    });
    test("renders inline error when workspace.stats.clear rejects", async () => {
        const workspaceId = "workspace-1";
        const snapshot = {
            workspaceId,
            generatedAt: Date.now(),
            session: {
                totalDurationMs: 1000,
                totalToolExecutionMs: 0,
                totalStreamingMs: 900,
                totalTtftMs: 100,
                ttftCount: 1,
                responseCount: 1,
                totalOutputTokens: 10,
                totalReasoningTokens: 0,
                byModel: {
                    "openai:gpt-4o": {
                        model: "openai:gpt-4o",
                        mode: "exec",
                        agentId: undefined,
                        totalDurationMs: 1000,
                        totalToolExecutionMs: 0,
                        totalStreamingMs: 900,
                        totalTtftMs: 100,
                        ttftCount: 1,
                        responseCount: 1,
                        totalOutputTokens: 10,
                        totalReasoningTokens: 0,
                    },
                },
            },
        };
        let rejectClear = null;
        const clearPromise = new Promise((_, reject) => {
            rejectClear = reject;
        });
        const view = render(_jsx(StatsTab, { workspaceId: workspaceId, _snapshot: snapshot, _clearStats: () => clearPromise }));
        const clearButton = view.getByRole("button", { name: "Clear stats" });
        fireEvent.click(clearButton);
        await waitFor(() => {
            expect(clearButton.disabled).toBe(true);
        });
        expect(rejectClear).toBeTruthy();
        rejectClear(new Error("nope"));
        await waitFor(() => {
            expect(view.getByTestId("clear-stats-error")).toBeTruthy();
        });
        expect(view.getByTestId("clear-stats-error").textContent).toContain("Failed to clear stats");
        expect(warnCalls.length).toBeGreaterThan(0);
    });
});
//# sourceMappingURL=StatsTab.clear.test.js.map