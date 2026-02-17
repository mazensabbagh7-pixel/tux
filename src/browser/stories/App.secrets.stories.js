import { jsx as _jsx } from "react/jsx-runtime";
import { UI_THEME_KEY } from "@/common/constants/storage";
import { appMeta, AppWithMocks } from "./meta.js";
import { createWorkspace, groupWorkspacesByProject } from "./mockFactory";
import { selectWorkspace } from "./storyHelpers";
import { createMockORPCClient } from "@/browser/stories/mocks/orpc";
import { within, userEvent, waitFor } from "@storybook/test";
export default {
    ...appMeta,
    title: "App/Settings/Secrets",
};
function setupSecretsStory(options = {}) {
    const projectPathA = "/Users/test/my-app";
    const projectPathB = "/Users/test/other-app";
    const workspaces = [
        createWorkspace({
            id: "ws-secrets-a",
            name: "main",
            projectName: "my-app",
            projectPath: projectPathA,
        }),
        createWorkspace({
            id: "ws-secrets-b",
            name: "main",
            projectName: "other-app",
            projectPath: projectPathB,
        }),
    ];
    selectWorkspace(workspaces[0]);
    const projectSecrets = options.projectSecrets ??
        new Map([
            [projectPathA, [{ key: "PROJECT_TOKEN", value: "project-secret" }]],
            [projectPathB, [{ key: "OTHER_TOKEN", value: "other-secret" }]],
        ]);
    return createMockORPCClient({
        projects: groupWorkspacesByProject(workspaces),
        workspaces,
        globalSecrets: options.globalSecrets ?? [{ key: "GLOBAL_TOKEN", value: "global-secret" }],
        projectSecrets,
    });
}
async function openSettingsToSecrets(canvasElement) {
    const canvas = within(canvasElement);
    const settingsButton = await canvas.findByTestId("settings-button", {}, { timeout: 10000 });
    await userEvent.click(settingsButton);
    // Desktop + mobile settings nav are both present in the test DOM.
    const secretsButtons = await canvas.findAllByRole("button", { name: /^Secrets$/i });
    const secretsButton = secretsButtons[0];
    if (!secretsButton) {
        throw new Error("Secrets settings button not found");
    }
    await userEvent.click(secretsButton);
}
export const SecretsGlobal = {
    render: () => _jsx(AppWithMocks, { setup: () => setupSecretsStory({}) }),
    play: async ({ canvasElement }) => {
        await openSettingsToSecrets(canvasElement);
        const settingsCanvas = within(canvasElement);
        await settingsCanvas.findByText(/secrets are stored in/i);
        await settingsCanvas.findByDisplayValue("GLOBAL_TOKEN");
    },
};
export const SecretsGlobalPopulated = {
    render: () => (_jsx(AppWithMocks, { setup: () => setupSecretsStory({
            globalSecrets: [
                { key: "OPENAI_API_KEY", value: "sk-openai" },
                { key: "ANTHROPIC_API_KEY", value: "sk-anthropic" },
                { key: "GITHUB_TOKEN", value: "ghp_123" },
                { key: "SENTRY_AUTH_TOKEN", value: "sentry" },
            ],
        }) })),
    play: async ({ canvasElement }) => {
        await openSettingsToSecrets(canvasElement);
        const settingsCanvas = within(canvasElement);
        // Radix ToggleGroup (type="single") items render with role="radio".
        const globalScopeToggle = await settingsCanvas.findByRole("radio", { name: /^Global$/i });
        await userEvent.click(globalScopeToggle);
        await settingsCanvas.findByText(/secrets are stored in/i);
        await settingsCanvas.findByDisplayValue("OPENAI_API_KEY");
        await settingsCanvas.findByDisplayValue("ANTHROPIC_API_KEY");
        await settingsCanvas.findByDisplayValue("GITHUB_TOKEN");
        await settingsCanvas.findByDisplayValue("SENTRY_AUTH_TOKEN");
    },
};
export const SecretsProject = {
    render: () => _jsx(AppWithMocks, { setup: () => setupSecretsStory({}) }),
    play: async ({ canvasElement }) => {
        await openSettingsToSecrets(canvasElement);
        const settingsCanvas = within(canvasElement);
        // Radix ToggleGroup (type="single") items render with role="radio".
        const projectScopeToggle = await settingsCanvas.findByRole("radio", { name: /^Project$/i });
        await userEvent.click(projectScopeToggle);
        await settingsCanvas.findByText(/Select a project to configure/i);
        await settingsCanvas.findByDisplayValue("PROJECT_TOKEN");
    },
};
export const SecretsLightModeFilled = {
    render: () => (_jsx(AppWithMocks, { setup: () => {
            // Set theme before AppLoader mounts so Chromatic captures the correct (light) color scheme.
            if (typeof localStorage !== "undefined") {
                localStorage.setItem(UI_THEME_KEY, JSON.stringify("light"));
            }
            return setupSecretsStory({
                globalSecrets: [{ key: "OPENAI_API_KEY", value: "sk-openai-visible" }],
            });
        } })),
    parameters: {
        backgrounds: {
            default: "light",
        },
    },
    play: async ({ canvasElement }) => {
        await openSettingsToSecrets(canvasElement);
        const settingsCanvas = within(canvasElement);
        await settingsCanvas.findByDisplayValue("OPENAI_API_KEY");
        const showSecretButton = await settingsCanvas.findByRole("button", { name: /^Show secret$/i });
        await userEvent.click(showSecretButton);
        // Ensure the secret value is revealed so text color regressions (e.g. text-white) are visible.
        await waitFor(() => {
            const valueInput = settingsCanvas.getByDisplayValue("sk-openai-visible");
            if (!(valueInput instanceof HTMLInputElement)) {
                throw new Error("Expected secret value to be shown in an input");
            }
            if (valueInput.type !== "text") {
                throw new Error(`Expected secret value input type to be "text" after clicking "Show secret" (got "${valueInput.type}")`);
            }
        });
    },
};
//# sourceMappingURL=App.secrets.stories.js.map