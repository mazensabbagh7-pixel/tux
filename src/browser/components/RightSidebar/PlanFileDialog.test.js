import { jsx as _jsx } from "react/jsx-runtime";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { GlobalWindow } from "happy-dom";
import { cleanup, render, waitFor } from "@testing-library/react";
let mockApi = null;
void mock.module("@/browser/components/ui/dialog", () => ({
    Dialog: (props) => props.open ? _jsx("div", { children: props.children }) : null,
    DialogContent: (props) => (_jsx("div", { className: props.className, children: props.children })),
    DialogHeader: (props) => _jsx("div", { children: props.children }),
    DialogTitle: (props) => (_jsx("h2", { className: props.className, children: props.children })),
}));
void mock.module("@/browser/components/Messages/MarkdownCore", () => ({
    MarkdownCore: (props) => (_jsx("div", { "data-testid": "plan-markdown-core", children: props.content })),
}));
void mock.module("@/browser/components/Messages/MarkdownRenderer", () => ({
    PlanMarkdownContainer: (props) => (_jsx("div", { "data-testid": "plan-markdown-container", children: props.children })),
}));
void mock.module("@/browser/contexts/API", () => ({
    useAPI: () => ({
        api: mockApi,
        status: mockApi ? "connected" : "error",
        error: mockApi ? null : "API unavailable",
        authenticate: () => undefined,
        retry: () => undefined,
    }),
}));
import { PlanFileDialog } from "./PlanFileDialog";
describe("PlanFileDialog", () => {
    let originalWindow;
    let originalDocument;
    beforeEach(() => {
        originalWindow = globalThis.window;
        originalDocument = globalThis.document;
        globalThis.window = new GlobalWindow();
        globalThis.document = globalThis.window.document;
        mockApi = null;
    });
    afterEach(() => {
        cleanup();
        mock.restore();
        globalThis.window = originalWindow;
        globalThis.document = originalDocument;
    });
    test("fetches plan content only after the dialog opens", async () => {
        const getPlanContent = mock(() => Promise.resolve({
            success: true,
            data: {
                content: "# Plan title\n\n- item",
                path: "/tmp/plan.md",
            },
        }));
        mockApi = {
            workspace: {
                getPlanContent,
            },
        };
        const onOpenChange = () => undefined;
        const view = render(_jsx(PlanFileDialog, { open: false, onOpenChange: onOpenChange, workspaceId: "workspace-1" }));
        expect(getPlanContent).toHaveBeenCalledTimes(0);
        view.rerender(_jsx(PlanFileDialog, { open: true, onOpenChange: onOpenChange, workspaceId: "workspace-1" }));
        await waitFor(() => {
            expect(getPlanContent).toHaveBeenCalledTimes(1);
        });
        await waitFor(() => {
            expect(view.getByTestId("plan-markdown-core").textContent).toContain("# Plan title");
        });
        expect(view.getByText("/tmp/plan.md")).toBeTruthy();
    });
    test("shows API error responses in the dialog", async () => {
        const getPlanContent = mock(() => Promise.resolve({
            success: false,
            error: "Plan file not found",
        }));
        mockApi = {
            workspace: {
                getPlanContent,
            },
        };
        const view = render(_jsx(PlanFileDialog, { open: true, onOpenChange: () => undefined, workspaceId: "workspace-2" }));
        await waitFor(() => {
            expect(getPlanContent).toHaveBeenCalledTimes(1);
        });
        await waitFor(() => {
            expect(view.getByTestId("plan-file-dialog-error").textContent).toContain("Plan file not found");
        });
    });
    test("renders API-unavailable state when not connected", async () => {
        mockApi = null;
        const view = render(_jsx(PlanFileDialog, { open: true, onOpenChange: () => undefined, workspaceId: "workspace-3" }));
        await waitFor(() => {
            expect(view.getByTestId("plan-file-dialog-error").textContent).toContain("API unavailable");
        });
    });
});
//# sourceMappingURL=PlanFileDialog.test.js.map