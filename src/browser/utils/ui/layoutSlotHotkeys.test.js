import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { GlobalWindow } from "happy-dom";
import { handleLayoutSlotHotkeys } from "./layoutSlotHotkeys";
function createEvent(overrides = {}) {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    return {
        key: "1",
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        metaKey: false,
        preventDefault: () => undefined,
        ...overrides,
    };
}
function createPreset() {
    return {
        id: "preset-1",
        name: "Slot 1",
        leftSidebarCollapsed: false,
        rightSidebar: {
            collapsed: false,
            width: { mode: "px", value: 400 },
            layout: {
                version: 1,
                nextId: 1,
                focusedTabsetId: "tabset-1",
                root: {
                    type: "tabset",
                    id: "tabset-1",
                    tabs: ["costs"],
                    activeTab: "costs",
                },
            },
        },
    };
}
function createLayoutPresetsWithSlot1() {
    return {
        version: 2,
        slots: [{ slot: 1, preset: createPreset() }],
    };
}
describe("handleLayoutSlotHotkeys", () => {
    beforeEach(() => {
        const happyWindow = new GlobalWindow();
        globalThis.window = happyWindow;
        globalThis.document = happyWindow.document;
        globalThis.HTMLElement = happyWindow.HTMLElement;
    });
    afterEach(() => {
        globalThis.window = undefined;
        globalThis.document = undefined;
        globalThis.HTMLElement = undefined;
    });
    test("handles slot hotkey even when focus is in a textarea", () => {
        const applySlotToWorkspace = mock((_workspaceId, _slot) => Promise.resolve());
        const preventDefault = mock(() => undefined);
        const textarea = document.createElement("textarea");
        const handled = handleLayoutSlotHotkeys(createEvent({ key: "1", ctrlKey: true, altKey: true, target: textarea, preventDefault }), {
            isCommandPaletteOpen: false,
            isSettingsOpen: false,
            selectedWorkspaceId: "ws",
            layoutPresets: createLayoutPresetsWithSlot1(),
            applySlotToWorkspace,
        });
        expect(handled).toBe(true);
        expect(preventDefault.mock.calls.length).toBe(1);
        expect(applySlotToWorkspace.mock.calls).toEqual([["ws", 1]]);
    });
    test("does not handle slot hotkey when a terminal is focused", () => {
        const applySlotToWorkspace = mock((_workspaceId, _slot) => Promise.resolve());
        const terminalContainer = document.createElement("div");
        terminalContainer.setAttribute("data-terminal-container", "true");
        const textarea = document.createElement("textarea");
        terminalContainer.appendChild(textarea);
        const handled = handleLayoutSlotHotkeys(createEvent({ key: "1", ctrlKey: true, altKey: true, target: textarea }), {
            isCommandPaletteOpen: false,
            isSettingsOpen: false,
            selectedWorkspaceId: "ws",
            layoutPresets: createLayoutPresetsWithSlot1(),
            applySlotToWorkspace,
        });
        expect(handled).toBe(false);
        expect(applySlotToWorkspace.mock.calls.length).toBe(0);
    });
    test("does not handle slot hotkey when AltGr is active", () => {
        const applySlotToWorkspace = mock((_workspaceId, _slot) => Promise.resolve());
        const textarea = document.createElement("textarea");
        const handled = handleLayoutSlotHotkeys(createEvent({
            key: "1",
            ctrlKey: true,
            altKey: true,
            target: textarea,
            getModifierState: (key) => key === "AltGraph",
        }), {
            isCommandPaletteOpen: false,
            isSettingsOpen: false,
            selectedWorkspaceId: "ws",
            layoutPresets: createLayoutPresetsWithSlot1(),
            applySlotToWorkspace,
        });
        expect(handled).toBe(false);
        expect(applySlotToWorkspace.mock.calls.length).toBe(0);
    });
});
//# sourceMappingURL=layoutSlotHotkeys.test.js.map