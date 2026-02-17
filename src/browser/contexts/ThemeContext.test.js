import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { GlobalWindow } from "happy-dom";
// Setup basic DOM environment for testing-library
const dom = new GlobalWindow();
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access */
global.window = dom.window;
global.document = dom.window.document;
global.location = new URL("https://example.com/");
// Polyfill console since happy-dom might interfere or we just want standard console
global.console = console;
/* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access */
import { afterEach, describe, expect, mock, test, beforeEach } from "bun:test";
import { render, cleanup } from "@testing-library/react";
import { ThemeProvider, useTheme } from "./ThemeContext";
import { UI_THEME_KEY } from "@/common/constants/storage";
// Helper to access internals
const TestComponent = () => {
    const { theme, toggleTheme } = useTheme();
    return (_jsxs("div", { children: [_jsx("span", { "data-testid": "theme-value", children: theme }), _jsx("button", { onClick: toggleTheme, "data-testid": "toggle-btn", children: "Toggle" })] }));
};
describe("ThemeContext", () => {
    // Mock matchMedia
    const mockMatchMedia = mock(() => ({
        matches: false,
        media: "",
        onchange: null,
        addListener: () => {
            // no-op
        },
        removeListener: () => {
            // no-op
        },
        addEventListener: () => {
            // no-op
        },
        removeEventListener: () => {
            // no-op
        },
        dispatchEvent: () => true,
    }));
    beforeEach(() => {
        // Ensure window exists (Bun test with happy-dom should provide it)
        if (typeof window !== "undefined") {
            window.matchMedia = mockMatchMedia;
            window.localStorage.clear();
        }
    });
    afterEach(() => {
        cleanup();
        if (typeof window !== "undefined") {
            window.localStorage.clear();
        }
    });
    test("uses persisted state by default", () => {
        const { getByTestId } = render(_jsx(ThemeProvider, { children: _jsx(TestComponent, {}) }));
        // If matchMedia matches is false (default mock), resolveSystemTheme returns 'dark' (since it checks prefers-color-scheme: light)
        // resolveSystemTheme logic: window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"
        expect(getByTestId("theme-value").textContent).toBe("dark");
    });
    test("respects forcedTheme prop", () => {
        const { getByTestId, rerender } = render(_jsx(ThemeProvider, { forcedTheme: "light", children: _jsx(TestComponent, {}) }));
        expect(getByTestId("theme-value").textContent).toBe("light");
        rerender(_jsx(ThemeProvider, { forcedTheme: "dark", children: _jsx(TestComponent, {}) }));
        expect(getByTestId("theme-value").textContent).toBe("dark");
    });
    test("forcedTheme overrides persisted state", () => {
        window.localStorage.setItem(UI_THEME_KEY, JSON.stringify("light"));
        const { getByTestId } = render(_jsx(ThemeProvider, { forcedTheme: "dark", children: _jsx(TestComponent, {}) }));
        expect(getByTestId("theme-value").textContent).toBe("dark");
        // Check that localStorage is still light (since forcedTheme doesn't write to storage by itself)
        expect(JSON.parse(window.localStorage.getItem(UI_THEME_KEY))).toBe("light");
    });
});
//# sourceMappingURL=ThemeContext.test.js.map