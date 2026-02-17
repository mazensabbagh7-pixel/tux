import { jsx as _jsx } from "react/jsx-runtime";
import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { useWorkspaceStoreRaw } from "@/browser/stores/WorkspaceStore";
import { APIProvider } from "@/browser/contexts/API";
import { TooltipProvider } from "@/browser/components/ui/tooltip";
import { addEphemeralMessage } from "@/browser/stores/WorkspaceStore";
import * as muxMd from "@/common/lib/muxMd";
import { GlobalWindow } from "happy-dom";
import { cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
void mock.module("@/browser/components/ui/dialog", () => ({
    Dialog: (props) => props.open ? _jsx("div", { children: props.children }) : null,
    DialogContent: (props) => _jsx("div", { children: props.children }),
    DialogHeader: (props) => _jsx("div", { children: props.children }),
    DialogTitle: (props) => (_jsx("h2", { className: props.className, children: props.children })),
}));
import { ShareTranscriptDialog } from "./ShareTranscriptDialog";
const TEST_WORKSPACE_ID = "ws-1";
function getStore() {
    return useWorkspaceStoreRaw();
}
function createApiClient() {
    return {
        signing: {
            capabilities: () => Promise.resolve({ publicKey: null, githubUser: null, error: null }),
            clearIdentityCache: () => Promise.resolve({ success: true }),
            signMessage: () => Promise.resolve({ sig: "sig", publicKey: "public-key" }),
        },
        workspace: {
            getPlanContent: () => Promise.resolve({ success: false, error: "not-needed" }),
        },
    };
}
function renderDialog() {
    return render(_jsx(APIProvider, { client: createApiClient(), children: _jsx(TooltipProvider, { children: _jsx(ShareTranscriptDialog, { workspaceId: TEST_WORKSPACE_ID, workspaceName: "workspace-1", workspaceTitle: "Workspace 1", open: true, onOpenChange: () => undefined }) }) }));
}
describe("ShareTranscriptDialog", () => {
    let originalWindow;
    let originalDocument;
    let originalGetComputedStyle;
    beforeEach(() => {
        originalWindow = globalThis.window;
        originalDocument = globalThis.document;
        const dom = new GlobalWindow();
        globalThis.window = dom;
        globalThis.document = globalThis.window.document;
        originalGetComputedStyle = globalThis.getComputedStyle;
        globalThis.getComputedStyle = globalThis.window.getComputedStyle.bind(globalThis.window);
        spyOn(console, "error").mockImplementation(() => undefined);
        spyOn(muxMd, "uploadToMuxMd").mockResolvedValue({
            url: "https://mux.md/s/share-1",
            id: "share-1",
            key: "encryption-key",
            mutateKey: "mutate-1",
            expiresAt: Date.now() + 60000,
        });
        spyOn(muxMd, "deleteFromMuxMd").mockResolvedValue(undefined);
        getStore().addWorkspace({
            id: TEST_WORKSPACE_ID,
            name: "workspace-1",
            title: "Workspace 1",
            projectName: "project",
            projectPath: "/tmp/project",
            namedWorkspacePath: "/tmp/project/workspace-1",
            runtimeConfig: { type: "local" },
            createdAt: new Date().toISOString(),
        });
        addEphemeralMessage(TEST_WORKSPACE_ID, {
            id: "user-message-1",
            role: "user",
            parts: [{ type: "text", text: "hello" }],
        });
    });
    afterEach(() => {
        getStore().removeWorkspace(TEST_WORKSPACE_ID);
        cleanup();
        mock.restore();
        globalThis.getComputedStyle = originalGetComputedStyle;
        globalThis.window = originalWindow;
        globalThis.document = originalDocument;
    });
    test("deletes an existing shared transcript link and clears the URL", async () => {
        renderDialog();
        const body = within(document.body);
        fireEvent.click(body.getByRole("button", { name: "Generate link" }));
        await waitFor(() => expect(body.getByTestId("share-transcript-url")).toBeTruthy());
        fireEvent.click(body.getByTestId("delete-share-transcript-url"));
        await waitFor(() => expect(muxMd.deleteFromMuxMd).toHaveBeenCalledWith("share-1", "mutate-1"));
        await waitFor(() => expect(body.queryByTestId("share-transcript-url")).toBeNull());
    });
    test("keeps shared transcript URL and surfaces an error when delete fails", async () => {
        muxMd.deleteFromMuxMd.mockImplementationOnce(() => Promise.reject(new Error("Delete failed")));
        renderDialog();
        const body = within(document.body);
        fireEvent.click(body.getByRole("button", { name: "Generate link" }));
        await waitFor(() => expect(body.getByTestId("share-transcript-url")).toBeTruthy());
        fireEvent.click(body.getByTestId("delete-share-transcript-url"));
        await waitFor(() => expect(muxMd.deleteFromMuxMd).toHaveBeenCalledWith("share-1", "mutate-1"));
        await waitFor(() => expect(body.getByRole("alert").textContent).toContain("Delete failed"));
        expect(body.getByTestId("share-transcript-url")).toBeTruthy();
    });
});
//# sourceMappingURL=ShareTranscriptDialog.test.js.map