import { jsx as _jsx } from "react/jsx-runtime";
import { render, waitFor } from "@testing-library/react";
import { AppLoader } from "@/browser/components/AppLoader";
/**
 * Render the full App via AppLoader for true integration testing.
 * This exercises the real component tree, providers, and state management.
 *
 * @deprecated Use renderApp instead - the name better reflects what this does
 */
export function renderReviewPanel(props) {
    return renderApp(props);
}
/**
 * Render the full App via AppLoader for true integration testing.
 * This exercises the real component tree, providers, and state management.
 */
export function renderApp(props) {
    const result = render(_jsx(AppLoader, { client: props.apiClient }));
    return {
        ...result,
        async waitForReady() {
            // Wait for loading screen to disappear
            await waitFor(() => {
                const loading = result.container.querySelector('[data-testid="loading-screen"]');
                if (loading) {
                    throw new Error("Still loading");
                }
                // Also check for "Loading..." text
                if (result.container.textContent?.includes("Loading...")) {
                    throw new Error("Still loading");
                }
            }, { timeout: 10000 });
        },
        async selectWorkspace(workspaceId) {
            await waitFor(() => {
                // Find workspace in sidebar by data attribute or text
                const workspaceElement = result.container.querySelector(`[data-workspace-id="${workspaceId}"]`);
                if (!workspaceElement) {
                    throw new Error(`Workspace ${workspaceId} not found in sidebar`);
                }
                workspaceElement.click();
            }, { timeout: 5000 });
        },
        async selectTab(tab) {
            await waitFor(() => {
                // Find tab button by role and name
                const tabButton = result.container.querySelector(`[role="tab"][aria-controls*="${tab}"]`);
                if (!tabButton) {
                    throw new Error(`Tab "${tab}" not found`);
                }
                tabButton.click();
            }, { timeout: 5000 });
        },
    };
}
//# sourceMappingURL=renderReviewPanel.js.map