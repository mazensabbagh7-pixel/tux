import { jsx as _jsx } from "react/jsx-runtime";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { GlobalWindow } from "happy-dom";
import { ExperimentsProvider, useExperimentValue } from "./ExperimentsContext";
import { EXPERIMENT_IDS } from "@/common/constants/experiments";
let currentClientMock = {};
void mock.module("@/browser/contexts/API", () => ({
    useAPI: () => ({
        api: currentClientMock,
        status: "connected",
        error: null,
    }),
    APIProvider: ({ children }) => children,
}));
describe("ExperimentsProvider", () => {
    beforeEach(() => {
        globalThis.window = new GlobalWindow();
        globalThis.document = globalThis.window.document;
        globalThis.window.localStorage.clear();
    });
    afterEach(() => {
        cleanup();
        globalThis.window = undefined;
        globalThis.document = undefined;
        currentClientMock = {};
    });
    test("polls getAll until remote variants are available", async () => {
        let callCount = 0;
        const getAllMock = mock(() => {
            callCount += 1;
            if (callCount === 1) {
                return Promise.resolve({
                    [EXPERIMENT_IDS.SYSTEM_1]: { value: null, source: "cache" },
                });
            }
            return Promise.resolve({
                [EXPERIMENT_IDS.SYSTEM_1]: { value: "test", source: "posthog" },
            });
        });
        currentClientMock = {
            experiments: {
                getAll: getAllMock,
                reload: mock(() => Promise.resolve()),
            },
        };
        function Observer() {
            const enabled = useExperimentValue(EXPERIMENT_IDS.SYSTEM_1);
            return _jsx("div", { "data-testid": "enabled", children: String(enabled) });
        }
        const { getByTestId } = render(_jsx(ExperimentsProvider, { children: _jsx(Observer, {}) }));
        expect(getByTestId("enabled").textContent).toBe("false");
        await waitFor(() => {
            expect(getByTestId("enabled").textContent).toBe("true");
        });
        expect(getAllMock.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
});
//# sourceMappingURL=ExperimentsContext.test.js.map