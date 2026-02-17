import { jsx as _jsx } from "react/jsx-runtime";
import { appMeta, AppWithMocks } from "./meta.js";
import { createWorkspace, groupWorkspacesByProject } from "./mockFactory";
import { selectWorkspace } from "./storyHelpers";
import { createMockORPCClient } from "@/browser/stories/mocks/orpc";
import { within, userEvent } from "@storybook/test";
import { getExperimentKey, EXPERIMENT_IDS } from "@/common/constants/experiments";
export default {
    ...appMeta,
    title: "App/Settings/Governor",
};
/** Setup basic workspace for Governor stories */
function setupGovernorStory(options = {}) {
    const workspaces = [createWorkspace({ id: "ws-1", name: "main", projectName: "my-app" })];
    selectWorkspace(workspaces[0]);
    // Enable the Governor experiment so the section appears in Settings
    const experimentKey = getExperimentKey(EXPERIMENT_IDS.MUX_GOVERNOR);
    window.localStorage.setItem(experimentKey, JSON.stringify(true));
    const { muxGovernorUrl = null, muxGovernorEnrolled = false, policySource = "none", policyState = "disabled", policy = null, } = options;
    const policyResponse = {
        source: policySource,
        status: { state: policyState },
        policy,
    };
    return createMockORPCClient({
        projects: groupWorkspacesByProject(workspaces),
        workspaces,
        muxGovernorUrl,
        muxGovernorEnrolled,
        policyResponse,
    });
}
/** Open settings page and navigate to Governor section. */
async function openSettingsToGovernor(canvasElement) {
    const canvas = within(canvasElement);
    // Wait for app to fully load.
    const settingsButton = await canvas.findByTestId("settings-button", {}, { timeout: 10000 });
    await userEvent.click(settingsButton);
    // Navigate to Governor section (desktop + mobile nav are both in DOM during tests).
    const governorButtons = await canvas.findAllByRole("button", { name: /governor/i });
    const governorButton = governorButtons[0];
    if (!governorButton) {
        throw new Error("Governor settings button not found");
    }
    await userEvent.click(governorButton);
}
// ═══════════════════════════════════════════════════════════════════════════════
// STORIES
// ═══════════════════════════════════════════════════════════════════════════════
/** Governor section - not enrolled (default state) */
export const NotEnrolled = {
    render: () => _jsx(AppWithMocks, { setup: () => setupGovernorStory() }),
    play: async ({ canvasElement }) => {
        await openSettingsToGovernor(canvasElement);
    },
};
/** Governor section - enrolled with active policy from Governor */
export const EnrolledWithPolicy = {
    render: () => (_jsx(AppWithMocks, { setup: () => setupGovernorStory({
            muxGovernorUrl: "https://governor.example.com",
            muxGovernorEnrolled: true,
            policySource: "governor",
            policyState: "enforced",
            policy: {
                policyFormatVersion: "0.1",
                serverVersion: "1.0.0",
                providerAccess: [
                    { id: "anthropic", allowedModels: ["claude-sonnet-4-20250514"] },
                    {
                        id: "openai",
                        forcedBaseUrl: "https://api.internal.example.com/v1",
                        allowedModels: null,
                    },
                ],
                mcp: { allowUserDefined: { stdio: false, remote: true } },
                runtimes: ["local", "worktree", "ssh"],
            },
        }) })),
    play: async ({ canvasElement }) => {
        await openSettingsToGovernor(canvasElement);
    },
};
/** Governor section - enrolled but policy disabled (no policy enforced) */
export const EnrolledPolicyDisabled = {
    render: () => (_jsx(AppWithMocks, { setup: () => setupGovernorStory({
            muxGovernorUrl: "https://governor.example.com",
            muxGovernorEnrolled: true,
            policySource: "governor",
            policyState: "disabled",
            policy: null,
        }) })),
    play: async ({ canvasElement }) => {
        await openSettingsToGovernor(canvasElement);
    },
};
/** Governor section - enrolled with policy from environment variable (takes precedence) */
export const EnrolledEnvOverride = {
    render: () => (_jsx(AppWithMocks, { setup: () => setupGovernorStory({
            muxGovernorUrl: "https://governor.example.com",
            muxGovernorEnrolled: true,
            policySource: "env",
            policyState: "enforced",
            policy: {
                policyFormatVersion: "0.1",
                providerAccess: [{ id: "anthropic", allowedModels: null }],
                mcp: { allowUserDefined: { stdio: true, remote: true } },
                runtimes: null,
            },
        }) })),
    play: async ({ canvasElement }) => {
        await openSettingsToGovernor(canvasElement);
    },
};
//# sourceMappingURL=App.governor.stories.js.map