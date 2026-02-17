import { jsx as _jsx } from "react/jsx-runtime";
import "../../../tests/ui/dom";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { useTheme } from "../contexts/ThemeContext";
import { installDom } from "../../../tests/ui/dom";
let cleanupDom = null;
let apiStatus = "auth_required";
let apiError = "Authentication required";
void mock.module("@/browser/contexts/API", () => ({
    APIProvider: (props) => props.children,
    useAPI: () => {
        if (apiStatus === "auth_required") {
            return {
                api: null,
                status: "auth_required",
                error: apiError,
                authenticate: () => undefined,
                retry: () => undefined,
            };
        }
        if (apiStatus === "error") {
            return {
                api: null,
                status: "error",
                error: apiError ?? "Connection error",
                authenticate: () => undefined,
                retry: () => undefined,
            };
        }
        return {
            api: null,
            status: "connecting",
            error: null,
            authenticate: () => undefined,
            retry: () => undefined,
        };
    },
}));
void mock.module("./LoadingScreen", () => ({
    LoadingScreen: () => {
        const { theme } = useTheme();
        return _jsx("div", { "data-testid": "LoadingScreenMock", children: theme });
    },
}));
void mock.module("./StartupConnectionError", () => ({
    StartupConnectionError: (props) => (_jsx("div", { "data-testid": "StartupConnectionErrorMock", children: props.error })),
}));
void mock.module("@/browser/components/AuthTokenModal", () => ({
    // Note: Module mocks leak between bun test files.
    // Export all commonly-used symbols to avoid cross-test import errors.
    AuthTokenModal: (props) => (_jsx("div", { "data-testid": "AuthTokenModalMock", children: props.error ?? "no-error" })),
    getStoredAuthToken: () => null,
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    setStoredAuthToken: () => { },
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    clearStoredAuthToken: () => { },
}));
import { AppLoader } from "./AppLoader";
describe("AppLoader", () => {
    beforeEach(() => {
        cleanupDom = installDom();
    });
    afterEach(() => {
        cleanup();
        cleanupDom?.();
        cleanupDom = null;
    });
    test("renders AuthTokenModal when API status is auth_required (before workspaces load)", () => {
        apiStatus = "auth_required";
        apiError = "Authentication required";
        const { getByTestId, queryByText } = render(_jsx(AppLoader, {}));
        expect(queryByText("Loading workspaces...")).toBeNull();
        expect(getByTestId("AuthTokenModalMock").textContent).toContain("Authentication required");
    });
    test("renders StartupConnectionError when API status is error (before workspaces load)", () => {
        apiStatus = "error";
        apiError = "Connection error";
        const { getByTestId, queryByTestId } = render(_jsx(AppLoader, {}));
        expect(queryByTestId("LoadingScreenMock")).toBeNull();
        expect(queryByTestId("AuthTokenModalMock")).toBeNull();
        expect(getByTestId("StartupConnectionErrorMock").textContent).toContain("Connection error");
    });
    test("wraps LoadingScreen in ThemeProvider", () => {
        apiStatus = "connecting";
        apiError = null;
        const { getByTestId } = render(_jsx(AppLoader, {}));
        // If ThemeProvider is missing, useTheme() will throw.
        expect(getByTestId("LoadingScreenMock").textContent).toBeTruthy();
    });
});
//# sourceMappingURL=AppLoader.auth.test.js.map