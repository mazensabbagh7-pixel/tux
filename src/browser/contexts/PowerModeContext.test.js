import { jsx as _jsx } from "react/jsx-runtime";
import React from "react";
import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { GlobalWindow } from "happy-dom";
import { POWER_MODE_ENABLED_KEY } from "@/common/constants/storage";
import { PowerModeEngine } from "@/browser/utils/powerMode/PowerModeEngine";
void mock.module("@/browser/components/PowerMode/PowerModeOverlay", () => ({
    // Overlay rendering is unrelated to caret alignment; keep tests focused on context behavior.
    PowerModeOverlay: () => null,
}));
import { PowerModeProvider, usePowerMode } from "./PowerModeContext";
function TestHarness(props) {
    const powerMode = usePowerMode();
    const textareaRef = React.useRef(null);
    React.useEffect(() => {
        if (!textareaRef.current) {
            return;
        }
        props.onReady({
            powerMode,
            textarea: textareaRef.current,
        });
    }, [powerMode, props]);
    return _jsx("textarea", { ref: textareaRef, defaultValue: "hello world" });
}
function createComputedStyle(values) {
    return {
        getPropertyValue: (prop) => values[prop] ?? "",
        lineHeight: values["line-height"] ?? "",
        fontSize: values["font-size"] ?? "",
    };
}
async function renderHarness() {
    let handle = null;
    render(_jsx(PowerModeProvider, { children: _jsx(TestHarness, { onReady: (next) => (handle = next) }) }));
    await waitFor(() => {
        expect(handle).toBeTruthy();
    });
    if (!handle) {
        throw new Error("Expected PowerMode test harness to initialize");
    }
    return handle;
}
describe("PowerModeContext", () => {
    let originalWindow;
    let originalDocument;
    let originalGetComputedStyle;
    beforeEach(() => {
        originalWindow = globalThis.window;
        originalDocument = globalThis.document;
        originalGetComputedStyle = globalThis.getComputedStyle;
        const dom = new GlobalWindow();
        // happy-dom types don't perfectly match native DOM types; use `unknown` bridge casts.
        globalThis.window = dom;
        globalThis.document = dom.document;
        globalThis.getComputedStyle = dom.getComputedStyle.bind(dom);
        const domGlobals = globalThis;
        domGlobals.StorageEvent = dom.StorageEvent;
        domGlobals.CustomEvent = dom.CustomEvent;
        window.localStorage.setItem(POWER_MODE_ENABLED_KEY, JSON.stringify(true));
    });
    afterEach(() => {
        cleanup();
        mock.restore();
        globalThis.getComputedStyle = originalGetComputedStyle;
        globalThis.window = originalWindow;
        globalThis.document = originalDocument;
    });
    test("mirror style sync uses longhand properties", async () => {
        const burstSpy = spyOn(PowerModeEngine.prototype, "burst").mockImplementation(() => undefined);
        const longhandOnlyStyles = createComputedStyle({
            // Regression guard: these shorthands can be empty in some browsers.
            padding: "",
            border: "",
            font: "",
            // Longhand values used by mirror style sync.
            "font-family": "Fira Code",
            "font-size": "16px",
            "font-weight": "500",
            "font-style": "normal",
            "line-height": "24px",
            "letter-spacing": "0px",
            "text-transform": "none",
            "text-align": "left",
            direction: "ltr",
            "white-space": "pre-wrap",
            "word-break": "break-word",
            "overflow-wrap": "break-word",
            "tab-size": "4",
            "padding-top": "7px",
            "padding-right": "9px",
            "padding-bottom": "11px",
            "padding-left": "13px",
            "border-top-style": "solid",
            "border-right-style": "solid",
            "border-bottom-style": "solid",
            "border-left-style": "solid",
            "border-top-width": "1px",
            "border-right-width": "1px",
            "border-bottom-width": "1px",
            "border-left-width": "1px",
        });
        const nativeGetComputedStyle = window.getComputedStyle.bind(window);
        spyOn(window, "getComputedStyle").mockImplementation(((element) => {
            if (element.tagName === "TEXTAREA") {
                return longhandOnlyStyles;
            }
            return nativeGetComputedStyle(element);
        }));
        const { powerMode, textarea } = await renderHarness();
        textarea.value = "abc";
        textarea.selectionStart = 1;
        textarea.selectionEnd = 1;
        act(() => {
            powerMode.burstFromTextarea(textarea, 1, "insert");
        });
        const mirror = document.querySelector('div[aria-hidden="true"]');
        expect(mirror).toBeTruthy();
        if (!mirror) {
            throw new Error("Expected mirror div to be created");
        }
        expect(mirror.style.getPropertyValue("padding-left")).toBe("13px");
        expect(mirror.style.getPropertyValue("padding-top")).toBe("7px");
        expect(mirror.style.getPropertyValue("border-top-style")).toBe("solid");
        expect(mirror.style.getPropertyValue("border-top-width")).toBe("1px");
        expect(mirror.style.getPropertyValue("font-family")).toContain("Fira Code");
        expect(burstSpy).toHaveBeenCalledTimes(1);
    });
    test("burstFromTextarea accepts explicit caretIndex", async () => {
        const burstSpy = spyOn(PowerModeEngine.prototype, "burst").mockImplementation(() => undefined);
        const { powerMode, textarea } = await renderHarness();
        textarea.value = "abcdef";
        act(() => {
            powerMode.burstFromTextarea(textarea, 1, "insert", 5);
        });
        expect(burstSpy).toHaveBeenCalledTimes(1);
        const firstCall = burstSpy.mock.calls[0];
        expect(firstCall).toBeTruthy();
        if (!firstCall) {
            throw new Error("Expected burst call");
        }
        expect(firstCall[2]).toBe(1);
        expect(firstCall[3]).toEqual({ kind: "insert" });
    });
    test("burstFromTextarea falls back to selectionStart when caretIndex is omitted", async () => {
        const burstSpy = spyOn(PowerModeEngine.prototype, "burst").mockImplementation(() => undefined);
        const { powerMode, textarea } = await renderHarness();
        textarea.value = "abcdef";
        textarea.selectionStart = 3;
        textarea.selectionEnd = 3;
        act(() => {
            powerMode.burstFromTextarea(textarea, 1, "insert");
        });
        expect(burstSpy).toHaveBeenCalledTimes(1);
    });
});
//# sourceMappingURL=PowerModeContext.test.js.map