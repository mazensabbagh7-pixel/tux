import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/browser/components/ui/button";
import assert from "@/common/utils/assert";
import { KebabMenu } from "@/browser/components/KebabMenu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/browser/components/ui/tooltip";
import { useWorkspaceContext } from "@/browser/contexts/WorkspaceContext";
import { useUILayouts } from "@/browser/contexts/UILayoutsContext";
import { getEffectiveSlotKeybind } from "@/browser/utils/uiLayouts";
import { stopKeyboardPropagation } from "@/browser/utils/events";
import { formatKeybind, isMac, KEYBINDS, matchesKeybind } from "@/browser/utils/ui/keybinds";
function isModifierOnlyKey(key) {
    return key === "Shift" || key === "Control" || key === "Alt" || key === "Meta";
}
function normalizeCapturedKeybind(e) {
    if (!e.key || isModifierOnlyKey(e.key)) {
        return null;
    }
    // On macOS, we represent Cmd as ctrl=true so bindings remain cross-platform.
    const onMac = isMac();
    const ctrl = e.ctrlKey ? true : onMac ? e.metaKey : false;
    const meta = !onMac ? e.metaKey : false;
    return {
        key: e.key,
        ctrl: ctrl ? true : undefined,
        alt: e.altKey ? true : undefined,
        shift: e.shiftKey ? true : undefined,
        meta: meta ? true : undefined,
    };
}
function keybindConflicts(a, b) {
    if (a.key.toLowerCase() !== b.key.toLowerCase()) {
        return false;
    }
    for (const ctrlKey of [false, true]) {
        for (const altKey of [false, true]) {
            for (const shiftKey of [false, true]) {
                for (const metaKey of [false, true]) {
                    const ev = new KeyboardEvent("keydown", {
                        key: a.key,
                        ctrlKey,
                        altKey,
                        shiftKey,
                        metaKey,
                    });
                    if (matchesKeybind(ev, a) && matchesKeybind(ev, b)) {
                        return true;
                    }
                }
            }
        }
    }
    return false;
}
function validateSlotKeybindOverride(params) {
    const hasModifier = [
        params.keybind.ctrl,
        params.keybind.alt,
        params.keybind.shift,
        params.keybind.meta,
    ].some((v) => v === true);
    if (!hasModifier) {
        return "Keybind must include at least one modifier key.";
    }
    for (const core of Object.values(KEYBINDS)) {
        if (keybindConflicts(params.keybind, core)) {
            return `Conflicts with an existing mux shortcut (${formatKeybind(core)}).`;
        }
    }
    for (const entry of params.existing) {
        if (entry.slot === params.slot) {
            continue;
        }
        if (keybindConflicts(params.keybind, entry.keybind)) {
            return `Conflicts with Slot ${entry.slot} (${formatKeybind(entry.keybind)}).`;
        }
    }
    return null;
}
export function LayoutsSection() {
    const { layoutPresets, loaded, loadFailed, applySlotToWorkspace, saveCurrentWorkspaceToSlot, renameSlot, deleteSlot, setSlotKeybindOverride, } = useUILayouts();
    const { selectedWorkspace } = useWorkspaceContext();
    const [actionError, setActionError] = useState(null);
    const [editingName, setEditingName] = useState(null);
    const [nameError, setNameError] = useState(null);
    const [capturingSlot, setCapturingSlot] = useState(null);
    const [captureError, setCaptureError] = useState(null);
    const workspaceId = selectedWorkspace?.workspaceId ?? null;
    const selectedWorkspaceLabel = selectedWorkspace
        ? `${selectedWorkspace.projectName}/${selectedWorkspace.namedWorkspacePath.split("/").pop() ?? selectedWorkspace.namedWorkspacePath}`
        : null;
    const existingKeybinds = useMemo(() => {
        const existing = [];
        // Built-in defaults for Slots 1–9 are treated as "reserved" regardless of whether a preset
        // is assigned (so users don't accidentally create conflicts for later).
        for (const slot of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
            const keybind = getEffectiveSlotKeybind(layoutPresets, slot);
            assert(keybind, `Slot ${slot} must have a default keybind`);
            existing.push({ slot, keybind });
        }
        // Additional slots only participate in conflict detection if they have a custom override.
        for (const slotConfig of layoutPresets.slots) {
            if (slotConfig.slot <= 9) {
                continue;
            }
            if (!slotConfig.keybindOverride) {
                continue;
            }
            existing.push({ slot: slotConfig.slot, keybind: slotConfig.keybindOverride });
        }
        return existing;
    }, [layoutPresets]);
    const visibleSlots = useMemo(() => {
        return layoutPresets.slots
            .filter((slot) => slot.preset !== undefined)
            .sort((a, b) => a.slot - b.slot);
    }, [layoutPresets]);
    const nextSlotNumber = useMemo(() => {
        const used = new Set();
        for (const slot of layoutPresets.slots) {
            if (slot.preset) {
                used.add(slot.slot);
            }
        }
        let candidate = 1;
        while (used.has(candidate)) {
            candidate += 1;
        }
        return candidate;
    }, [layoutPresets]);
    const submitRename = async (slot, nextName) => {
        const trimmed = nextName.trim();
        if (!trimmed) {
            setNameError("Name cannot be empty.");
            return;
        }
        try {
            await renameSlot(slot, trimmed);
            setEditingName(null);
            setNameError(null);
        }
        catch {
            setNameError("Failed to rename.");
        }
    };
    const handleAddLayout = async () => {
        setActionError(null);
        if (!workspaceId) {
            setActionError("Select a workspace to capture its layout.");
            return;
        }
        try {
            const preset = await saveCurrentWorkspaceToSlot(workspaceId, nextSlotNumber, `Layout ${nextSlotNumber}`);
            setEditingName({ slot: nextSlotNumber, value: preset.name, original: preset.name });
            setNameError(null);
        }
        catch {
            setActionError("Failed to add layout.");
        }
    };
    const handleCaptureKeyDown = (slot, e) => {
        if (e.key === "Escape") {
            e.preventDefault();
            stopKeyboardPropagation(e);
            setCapturingSlot(null);
            setCaptureError(null);
            return;
        }
        const captured = normalizeCapturedKeybind(e.nativeEvent);
        if (!captured) {
            return;
        }
        e.preventDefault();
        stopKeyboardPropagation(e);
        const error = validateSlotKeybindOverride({
            slot,
            keybind: captured,
            existing: existingKeybinds,
        });
        if (error) {
            setCaptureError(error);
            return;
        }
        void setSlotKeybindOverride(slot, captured).catch(() => {
            setCaptureError("Failed to save keybind override.");
        });
        setCapturingSlot(null);
        setCaptureError(null);
    };
    return (_jsxs("div", { className: "space-y-6", children: [_jsxs("div", { children: [_jsx("h3", { className: "text-foreground text-sm font-medium", children: "Layout Slots" }), _jsx("div", { className: "text-muted mt-1 text-xs", children: "Layouts are saved globally and can be applied to any workspace." }), _jsx("div", { className: "text-muted mt-1 text-xs", children: "Slots 1\u20139 have default Ctrl/Cmd+Alt+1..9 hotkeys. Additional layouts can be added and assigned custom hotkeys." }), selectedWorkspaceLabel ? null : (_jsx("div", { className: "text-muted mt-1 text-xs", children: "Select a workspace to capture or apply layouts." }))] }), !loaded ? _jsx("div", { className: "text-muted text-sm", children: "Loading\u2026" }) : null, loadFailed ? (_jsx("div", { className: "text-muted text-sm", children: "Failed to load layouts from config. Using defaults." })) : null, actionError ? _jsx("div", { className: "text-sm text-red-500", children: actionError }) : null, visibleSlots.length > 0 ? (_jsx("div", { className: "space-y-2", children: visibleSlots.map((slotConfig) => {
                    const slot = slotConfig.slot;
                    const preset = slotConfig.preset;
                    const effectiveKeybind = getEffectiveSlotKeybind(layoutPresets, slot);
                    const isEditingName = editingName?.slot === slot;
                    const isCapturing = capturingSlot === slot;
                    const menuItems = [
                        {
                            label: "Apply",
                            disabled: !workspaceId,
                            tooltip: workspaceId ? undefined : "Select a workspace to apply layouts.",
                            onClick: () => {
                                setActionError(null);
                                if (!workspaceId)
                                    return;
                                void applySlotToWorkspace(workspaceId, slot).catch(() => {
                                    setActionError("Failed to apply layout.");
                                });
                            },
                        },
                        {
                            label: "Update from current workspace",
                            disabled: !workspaceId,
                            tooltip: workspaceId ? undefined : "Select a workspace to capture its layout.",
                            onClick: () => {
                                setActionError(null);
                                if (!workspaceId) {
                                    setActionError("Select a workspace to capture its layout.");
                                    return;
                                }
                                void saveCurrentWorkspaceToSlot(workspaceId, slot).catch(() => {
                                    setActionError("Failed to update layout.");
                                });
                            },
                        },
                        {
                            label: "Delete layout",
                            onClick: () => {
                                const ok = confirm(`Delete layout "${preset.name}"?`);
                                if (!ok)
                                    return;
                                setActionError(null);
                                setEditingName(null);
                                setCapturingSlot(null);
                                setCaptureError(null);
                                void deleteSlot(slot).catch(() => {
                                    setActionError("Failed to delete layout.");
                                });
                            },
                        },
                    ];
                    return (_jsxs("div", { className: "border-border-medium bg-background-secondary flex flex-col gap-1 rounded border px-3 py-2", children: [_jsxs("div", { className: "flex items-center justify-between gap-3", children: [_jsxs("div", { className: "flex min-w-0 items-center gap-3", children: [_jsxs("div", { className: "text-muted shrink-0 text-xs", children: ["Slot ", slot] }), _jsx("div", { className: "min-w-0 flex-1", children: isEditingName ? (_jsx("input", { className: "bg-input-bg text-input-text border-input-border focus:border-input-border-focus w-full min-w-0 rounded-sm border px-1 text-sm outline-none", value: editingName.value, onChange: (e) => setEditingName({ ...editingName, value: e.target.value }), onKeyDown: (e) => {
                                                        stopKeyboardPropagation(e);
                                                        if (e.key === "Enter") {
                                                            e.preventDefault();
                                                            void submitRename(slot, editingName.value);
                                                        }
                                                        else if (e.key === "Escape") {
                                                            e.preventDefault();
                                                            setEditingName(null);
                                                            setNameError(null);
                                                        }
                                                    }, onBlur: () => void submitRename(slot, editingName.value), autoFocus: true, "aria-label": `Rename layout Slot ${slot}` })) : (_jsxs(Tooltip, { disableHoverableContent: true, children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("span", { className: "text-foreground block truncate text-sm font-medium", onDoubleClick: (e) => {
                                                                    e.stopPropagation();
                                                                    setActionError(null);
                                                                    setCapturingSlot(null);
                                                                    setCaptureError(null);
                                                                    setEditingName({
                                                                        slot,
                                                                        value: preset.name,
                                                                        original: preset.name,
                                                                    });
                                                                    setNameError(null);
                                                                }, title: "Double-click to rename", children: preset.name }) }), _jsx(TooltipContent, { align: "start", children: "Double-click to rename" })] })) })] }), _jsxs("div", { className: "flex shrink-0 items-center gap-2", children: [isCapturing ? (_jsxs("div", { className: "flex items-center gap-1", children: [_jsxs("div", { className: "relative", children: [_jsx("kbd", { className: "bg-background-secondary text-foreground border-border-medium rounded border px-2 py-0.5 font-mono text-xs", children: "Press keys\u2026" }), _jsx("input", { className: "absolute inset-0 h-full w-full opacity-0", autoFocus: true, onKeyDown: (e) => handleCaptureKeyDown(slot, e), "aria-label": `Set hotkey for Slot ${slot}` })] }), slotConfig.keybindOverride ? (_jsxs(Tooltip, { disableHoverableContent: true, children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx(Button, { variant: "secondary", size: "icon", className: "h-6 w-6 [&_svg]:size-3", onClick: (e) => {
                                                                        e.preventDefault();
                                                                        e.stopPropagation();
                                                                        setActionError(null);
                                                                        void setSlotKeybindOverride(slot, undefined)
                                                                            .then(() => {
                                                                            setCapturingSlot(null);
                                                                            setCaptureError(null);
                                                                        })
                                                                            .catch(() => {
                                                                            setCaptureError("Failed to reset hotkey.");
                                                                        });
                                                                    }, "aria-label": slot <= 9
                                                                        ? `Reset hotkey for Slot ${slot}`
                                                                        : `Clear hotkey for Slot ${slot}`, children: _jsx(X, {}) }) }), _jsx(TooltipContent, { align: "end", children: slot <= 9 ? "Reset to default" : "Clear hotkey" })] })) : null] })) : (_jsxs(Tooltip, { disableHoverableContent: true, children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("kbd", { className: "bg-background-secondary text-foreground border-border-medium cursor-pointer rounded border px-2 py-0.5 font-mono text-xs", onDoubleClick: (e) => {
                                                                e.preventDefault();
                                                                e.stopPropagation();
                                                                setActionError(null);
                                                                setEditingName(null);
                                                                setNameError(null);
                                                                setCapturingSlot(slot);
                                                                setCaptureError(null);
                                                            }, children: effectiveKeybind ? formatKeybind(effectiveKeybind) : "No hotkey" }) }), _jsx(TooltipContent, { align: "end", children: "Double-click to change hotkey" })] })), _jsx(KebabMenu, { items: menuItems })] })] }), isCapturing ? (_jsxs("div", { className: "text-muted text-xs", children: ["Press a key combo (Esc to cancel)", captureError ? _jsx("div", { className: "mt-1 text-red-500", children: captureError }) : null] })) : null, isEditingName && nameError ? (_jsx("div", { className: "text-xs text-red-500", children: nameError })) : null] }, slot));
                }) })) : null, _jsxs(Button, { variant: "secondary", size: "lg", className: "w-full", disabled: !workspaceId, onClick: () => void handleAddLayout(), children: [_jsx(Plus, {}), "Add layout"] })] }));
}
//# sourceMappingURL=LayoutsSection.js.map