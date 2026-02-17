import { jsx as _jsx } from "react/jsx-runtime";
import { useCallback, createContext, useContext, useEffect, useMemo, useState, } from "react";
import { useAPI } from "@/browser/contexts/API";
import assert from "@/common/utils/assert";
import { DEFAULT_LAYOUT_PRESETS_CONFIG, normalizeLayoutPresetsConfig, } from "@/common/types/uiLayouts";
import { applyLayoutPresetToWorkspace, createPresetFromCurrentWorkspace, deleteSlotAndShiftFollowingSlots, getLayoutsConfigOrDefault, getPresetForSlot, updateSlotKeybindOverride, updateSlotPreset, } from "@/browser/utils/uiLayouts";
const UILayoutsContext = createContext(null);
export function useUILayouts() {
    const ctx = useContext(UILayoutsContext);
    if (!ctx) {
        throw new Error("useUILayouts must be used within UILayoutsProvider");
    }
    return ctx;
}
export function UILayoutsProvider(props) {
    const { api } = useAPI();
    const [layoutPresets, setLayoutPresets] = useState(DEFAULT_LAYOUT_PRESETS_CONFIG);
    const [loaded, setLoaded] = useState(false);
    const [loadFailed, setLoadFailed] = useState(false);
    const refresh = useCallback(async () => {
        if (!api) {
            setLayoutPresets(DEFAULT_LAYOUT_PRESETS_CONFIG);
            setLoaded(true);
            setLoadFailed(false);
            return;
        }
        try {
            const remote = await api.uiLayouts.getAll();
            setLayoutPresets(getLayoutsConfigOrDefault(remote));
            setLoaded(true);
            setLoadFailed(false);
        }
        catch {
            setLayoutPresets(DEFAULT_LAYOUT_PRESETS_CONFIG);
            setLoaded(true);
            setLoadFailed(true);
        }
    }, [api]);
    const getConfigForWrite = useCallback(async () => {
        if (!api) {
            return layoutPresets;
        }
        // Always fetch the latest config right before a write.
        //
        // This prevents stale in-memory state (captured by closures) from accidentally overwriting a
        // newer config when multiple writes happen in sequence (e.g., delete layout → clear hotkey).
        try {
            const remote = await api.uiLayouts.getAll();
            const normalized = getLayoutsConfigOrDefault(remote);
            setLayoutPresets(normalized);
            setLoaded(true);
            setLoadFailed(false);
            return normalized;
        }
        catch {
            // Best-effort fallback: don't block writes if the config fetch fails.
            return layoutPresets;
        }
    }, [api, layoutPresets]);
    const saveAll = useCallback(async (next) => {
        const normalized = normalizeLayoutPresetsConfig(next);
        if (!api) {
            throw new Error("ORPC client not initialized");
        }
        await api.uiLayouts.saveAll({ layoutPresets: normalized });
        setLayoutPresets(normalized);
    }, [api]);
    useEffect(() => {
        void refresh();
    }, [refresh]);
    const applySlotToWorkspace = useCallback(async (workspaceId, slot) => {
        const preset = getPresetForSlot(layoutPresets, slot);
        if (!preset) {
            return;
        }
        await applyLayoutPresetToWorkspace(api ?? null, workspaceId, preset);
    }, [api, layoutPresets]);
    const saveCurrentWorkspaceToSlot = useCallback(async (workspaceId, slot, name) => {
        assert(typeof workspaceId === "string" && workspaceId.length > 0, "workspaceId must be non-empty");
        const base = await getConfigForWrite();
        const existingPreset = getPresetForSlot(base, slot);
        const trimmedName = name?.trim();
        const resolvedName = trimmedName && trimmedName.length > 0
            ? trimmedName
            : (existingPreset?.name ?? `Slot ${slot}`);
        const preset = createPresetFromCurrentWorkspace(workspaceId, resolvedName, existingPreset?.id);
        await saveAll(updateSlotPreset(base, slot, preset));
        return preset;
    }, [getConfigForWrite, saveAll]);
    const renameSlot = useCallback(async (slot, newName) => {
        const trimmed = newName.trim();
        if (!trimmed) {
            return;
        }
        const base = await getConfigForWrite();
        const existingPreset = getPresetForSlot(base, slot);
        if (!existingPreset) {
            return;
        }
        await saveAll(updateSlotPreset(base, slot, { ...existingPreset, name: trimmed }));
    }, [getConfigForWrite, saveAll]);
    const deleteSlot = useCallback(async (slot) => {
        const base = await getConfigForWrite();
        await saveAll(deleteSlotAndShiftFollowingSlots(base, slot));
    }, [getConfigForWrite, saveAll]);
    const setSlotKeybindOverride = useCallback(async (slot, keybind) => {
        const base = await getConfigForWrite();
        await saveAll(updateSlotKeybindOverride(base, slot, keybind));
    }, [getConfigForWrite, saveAll]);
    const value = useMemo(() => ({
        layoutPresets,
        loaded,
        loadFailed,
        refresh,
        saveAll,
        applySlotToWorkspace,
        saveCurrentWorkspaceToSlot,
        renameSlot,
        deleteSlot,
        setSlotKeybindOverride,
    }), [
        layoutPresets,
        loaded,
        loadFailed,
        refresh,
        saveAll,
        applySlotToWorkspace,
        saveCurrentWorkspaceToSlot,
        renameSlot,
        deleteSlot,
        setSlotKeybindOverride,
    ]);
    return _jsx(UILayoutsContext.Provider, { value: value, children: props.children });
}
//# sourceMappingURL=UILayoutsContext.js.map