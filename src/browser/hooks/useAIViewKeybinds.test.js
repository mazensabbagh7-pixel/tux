import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { cleanup, renderHook } from "@testing-library/react";
import { GlobalWindow } from "happy-dom";
import { useAIViewKeybinds } from "./useAIViewKeybinds";
let currentClientMock = {};
void mock.module("@/browser/contexts/API", () => ({
    useAPI: () => ({
        api: currentClientMock,
        status: "connected",
        error: null,
    }),
    APIProvider: ({ children }) => children,
}));
describe("useAIViewKeybinds", () => {
    beforeEach(() => {
        const domWindow = new GlobalWindow();
        globalThis.window = domWindow;
        globalThis.document = domWindow.document;
        // happy-dom doesn't define HTMLElement on globalThis by default.
        // Our keybind helpers use `target instanceof HTMLElement`, so polyfill it for tests.
        globalThis.HTMLElement = domWindow.HTMLElement;
    });
    afterEach(() => {
        cleanup();
        globalThis.window = undefined;
        globalThis.document = undefined;
        globalThis.HTMLElement = undefined;
        currentClientMock = {};
    });
    test("Escape interrupts an active stream in normal mode", () => {
        const interruptStream = mock(() => Promise.resolve({ success: true, data: undefined }));
        currentClientMock = {
            workspace: {
                interruptStream,
            },
        };
        const chatInputAPI = { current: null };
        renderHook(() => useAIViewKeybinds({
            workspaceId: "ws",
            canInterrupt: true,
            showRetryBarrier: false,
            chatInputAPI,
            jumpToBottom: () => undefined,
            handleOpenTerminal: () => undefined,
            handleOpenInEditor: () => undefined,
            aggregator: undefined,
            setEditingMessage: () => undefined,
            vimEnabled: false,
        }));
        document.body.dispatchEvent(new window.KeyboardEvent("keydown", {
            key: "Escape",
            bubbles: true,
            cancelable: true,
        }));
        expect(interruptStream.mock.calls.length).toBe(1);
    });
    test("Escape does not interrupt when the event target is an <input>", () => {
        const interruptStream = mock(() => Promise.resolve({ success: true, data: undefined }));
        currentClientMock = {
            workspace: {
                interruptStream,
            },
        };
        const chatInputAPI = { current: null };
        renderHook(() => useAIViewKeybinds({
            workspaceId: "ws",
            canInterrupt: true,
            showRetryBarrier: false,
            chatInputAPI,
            jumpToBottom: () => undefined,
            handleOpenTerminal: () => undefined,
            handleOpenInEditor: () => undefined,
            aggregator: undefined,
            setEditingMessage: () => undefined,
            vimEnabled: false,
        }));
        const input = document.createElement("input");
        document.body.appendChild(input);
        input.focus();
        input.dispatchEvent(new window.KeyboardEvent("keydown", {
            key: "Escape",
            bubbles: true,
            cancelable: true,
        }));
        expect(interruptStream.mock.calls.length).toBe(0);
    });
    test("Escape interrupts when an editable element opts in", () => {
        const interruptStream = mock(() => Promise.resolve({ success: true, data: undefined }));
        currentClientMock = {
            workspace: {
                interruptStream,
            },
        };
        const chatInputAPI = { current: null };
        renderHook(() => useAIViewKeybinds({
            workspaceId: "ws",
            canInterrupt: true,
            showRetryBarrier: false,
            chatInputAPI,
            jumpToBottom: () => undefined,
            handleOpenTerminal: () => undefined,
            handleOpenInEditor: () => undefined,
            aggregator: undefined,
            setEditingMessage: () => undefined,
            vimEnabled: false,
        }));
        const input = document.createElement("input");
        input.setAttribute("data-escape-interrupts-stream", "true");
        document.body.appendChild(input);
        input.focus();
        input.dispatchEvent(new window.KeyboardEvent("keydown", {
            key: "Escape",
            bubbles: true,
            cancelable: true,
        }));
        expect(interruptStream.mock.calls.length).toBe(1);
    });
    test("Ctrl+C interrupts in vim mode even when an <input> is focused", () => {
        const interruptStream = mock(() => Promise.resolve({ success: true, data: undefined }));
        currentClientMock = {
            workspace: {
                interruptStream,
            },
        };
        const chatInputAPI = { current: null };
        renderHook(() => useAIViewKeybinds({
            workspaceId: "ws",
            canInterrupt: true,
            showRetryBarrier: false,
            chatInputAPI,
            jumpToBottom: () => undefined,
            handleOpenTerminal: () => undefined,
            handleOpenInEditor: () => undefined,
            aggregator: undefined,
            setEditingMessage: () => undefined,
            vimEnabled: true,
        }));
        const input = document.createElement("input");
        document.body.appendChild(input);
        input.focus();
        input.dispatchEvent(new window.KeyboardEvent("keydown", {
            key: "c",
            ctrlKey: true,
            bubbles: true,
            cancelable: true,
        }));
        expect(interruptStream.mock.calls.length).toBe(1);
    });
    test("Escape does not interrupt when a modal stops propagation (e.g., Settings)", () => {
        const interruptStream = mock(() => Promise.resolve({ success: true, data: undefined }));
        currentClientMock = {
            workspace: {
                interruptStream,
            },
        };
        const chatInputAPI = { current: null };
        renderHook(() => useAIViewKeybinds({
            workspaceId: "ws",
            canInterrupt: true,
            showRetryBarrier: false,
            chatInputAPI,
            jumpToBottom: () => undefined,
            handleOpenTerminal: () => undefined,
            handleOpenInEditor: () => undefined,
            aggregator: undefined,
            setEditingMessage: () => undefined,
            vimEnabled: false,
        }));
        const stopEscape = (e) => {
            if (e.key === "Escape") {
                e.stopPropagation();
            }
        };
        document.addEventListener("keydown", stopEscape, { capture: true });
        document.body.dispatchEvent(new window.KeyboardEvent("keydown", {
            key: "Escape",
            bubbles: true,
            cancelable: true,
        }));
        document.removeEventListener("keydown", stopEscape, { capture: true });
        expect(interruptStream.mock.calls.length).toBe(0);
    });
});
//# sourceMappingURL=useAIViewKeybinds.test.js.map