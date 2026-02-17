/**
 * Integration tests for slash commands in workspace creation mode.
 */
import "../dom";
import { waitFor } from "@testing-library/react";
import { shouldRunIntegrationTests } from "../../testUtils";
import { cleanupSharedRepo, createSharedRepo, getSharedEnv, getSharedRepoPath, } from "../../ipc/sendMessageTestHelpers";
import { renderApp } from "../renderReviewPanel";
import { addProjectViaUI, cleanupView, openProjectCreationView, setupTestDom, waitForLatestDraftId, } from "../helpers";
import { ChatHarness } from "../harness";
import { readPersistedState } from "@/browser/hooks/usePersistedState";
import { getDraftScopeId, getModelKey, getProjectScopeId } from "@/common/constants/storage";
import { MODEL_ABBREVIATIONS } from "@/common/constants/knownModels";
const describeIntegration = shouldRunIntegrationTests() ? describe : describe.skip;
async function setupCreationView() {
    const env = getSharedEnv();
    const projectPath = getSharedRepoPath();
    const cleanupDom = setupTestDom();
    const view = renderApp({ apiClient: env.orpc });
    const normalizedProjectPath = await addProjectViaUI(view, projectPath);
    await openProjectCreationView(view, normalizedProjectPath);
    const draftId = await waitForLatestDraftId(normalizedProjectPath);
    const chat = new ChatHarness(view.container, getDraftScopeId(normalizedProjectPath, draftId));
    return {
        env,
        projectPath: normalizedProjectPath,
        view,
        cleanupDom,
        chat,
    };
}
describeIntegration("Creation slash commands", () => {
    beforeAll(async () => {
        await createSharedRepo();
    });
    afterAll(async () => {
        await cleanupSharedRepo();
    });
    test("/model updates project-scoped model in creation mode", async () => {
        const { projectPath, view, cleanupDom, chat } = await setupCreationView();
        try {
            const alias = "sonnet";
            const expectedModel = MODEL_ABBREVIATIONS[alias];
            if (!expectedModel) {
                throw new Error(`Missing model abbreviation for ${alias}`);
            }
            await chat.send(`/model ${alias}`);
            await waitFor(() => {
                expect(view.container.textContent ?? "").toContain(`Model changed to ${expectedModel}`);
            }, { timeout: 5000 });
            const modelKey = getModelKey(getProjectScopeId(projectPath));
            await waitFor(() => {
                expect(readPersistedState(modelKey, "")).toBe(expectedModel);
            }, { timeout: 5000 });
            await chat.expectInputValue("");
        }
        finally {
            await cleanupView(view, cleanupDom);
        }
    }, 30000);
    test("workspace-only commands show a toast and keep input", async () => {
        const { view, cleanupDom, chat } = await setupCreationView();
        try {
            const command = "/compact";
            await chat.send(command);
            await waitFor(() => {
                expect(view.container.textContent ?? "").toContain("Command not available during workspace creation");
            }, { timeout: 5000 });
            await chat.expectInputValue(command);
        }
        finally {
            await cleanupView(view, cleanupDom);
        }
    }, 30000);
});
//# sourceMappingURL=creationSlashCommands.test.js.map