import { jsx as _jsx } from "react/jsx-runtime";
import "../../../tests/ui/dom";
import { replicateAsyncIterator } from "@orpc/shared";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
let currentClientMock = {};
void mock.module("@/browser/contexts/API", () => ({
    useAPI: () => ({
        api: currentClientMock,
        status: "connected",
        error: null,
    }),
    APIProvider: ({ children }) => children,
}));
import { ProjectAddForm } from "./ProjectCreateModal";
describe("ProjectAddForm", () => {
    beforeEach(() => {
        currentClientMock = {};
    });
    afterEach(() => {
        cleanup();
        currentClientMock = {};
    });
    test("aborts in-flight clone when unmounted", async () => {
        let receivedSignal = null;
        currentClientMock = {
            projects: {
                getDefaultProjectDir: () => Promise.resolve("/tmp"),
                clone: (_input, options) => {
                    receivedSignal = options?.signal ?? null;
                    async function* iterator() {
                        yield { type: "progress", line: "progress: starting\n" };
                        await new Promise((resolve) => {
                            if (!receivedSignal) {
                                resolve();
                                return;
                            }
                            if (receivedSignal.aborted) {
                                resolve();
                                return;
                            }
                            receivedSignal.addEventListener("abort", () => resolve(), { once: true });
                        });
                    }
                    return Promise.resolve(replicateAsyncIterator(iterator(), 1)[0]);
                },
            },
        };
        const onIsCreatingChange = mock(() => undefined);
        const { getByText, getByPlaceholderText, unmount } = render(_jsx(ProjectAddForm, { isOpen: true, onSuccess: () => undefined, onIsCreatingChange: onIsCreatingChange }));
        fireEvent.click(getByText("Clone repo"));
        const repoInput = getByPlaceholderText("owner/repo or https://github.com/...");
        const user = userEvent.setup({ document: repoInput.ownerDocument });
        await user.type(repoInput, "owner/repo");
        await waitFor(() => expect(repoInput.value).toBe("owner/repo"));
        fireEvent.click(getByText("Clone Project"));
        await waitFor(() => expect(receivedSignal).not.toBeNull());
        await waitFor(() => expect(onIsCreatingChange).toHaveBeenCalledWith(true));
        unmount();
        await waitFor(() => expect(receivedSignal?.aborted).toBe(true));
        await waitFor(() => expect(onIsCreatingChange).toHaveBeenCalledWith(false));
    });
});
//# sourceMappingURL=ProjectCreateModal.cloneAbort.test.js.map