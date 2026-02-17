import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState, useCallback, useRef } from "react";
import { useTheme, THEME_OPTIONS } from "@/browser/contexts/ThemeContext";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, } from "@/browser/components/ui/select";
import { Input } from "@/browser/components/ui/input";
import { Switch } from "@/browser/components/ui/switch";
import { usePersistedState } from "@/browser/hooks/usePersistedState";
import { useAPI } from "@/browser/contexts/API";
import { useFeatureFlags } from "@/browser/contexts/FeatureFlagsContext";
import { EDITOR_CONFIG_KEY, DEFAULT_EDITOR_CONFIG, TERMINAL_FONT_CONFIG_KEY, DEFAULT_TERMINAL_FONT_CONFIG, } from "@/common/constants/storage";
import { appendTerminalIconFallback, getPrimaryFontFamily, isFontFamilyAvailableInBrowser, isGenericFontFamily, } from "@/browser/terminal/terminalFontFamily";
// Guard against corrupted/old persisted settings (e.g. from a downgraded build).
const ALLOWED_EDITOR_TYPES = new Set([
    "vscode",
    "cursor",
    "zed",
    "custom",
]);
function normalizeEditorConfig(value) {
    if (!value || typeof value !== "object") {
        return DEFAULT_EDITOR_CONFIG;
    }
    const record = value;
    const editor = typeof record.editor === "string" && ALLOWED_EDITOR_TYPES.has(record.editor)
        ? record.editor
        : DEFAULT_EDITOR_CONFIG.editor;
    const customCommand = typeof record.customCommand === "string" && record.customCommand.trim()
        ? record.customCommand
        : undefined;
    return { editor, customCommand };
}
function getTerminalFontAvailabilityWarning(config) {
    if (typeof document === "undefined") {
        return undefined;
    }
    const primary = getPrimaryFontFamily(config.fontFamily);
    if (!primary) {
        return undefined;
    }
    const normalizedPrimary = primary.trim();
    if (!normalizedPrimary) {
        return undefined;
    }
    // Geist Mono is bundled via @font-face. Treat it as always available so we don't show a
    // false-negative warning before the webfont finishes loading.
    if (normalizedPrimary.toLowerCase() === "geist mono") {
        return undefined;
    }
    if (isGenericFontFamily(normalizedPrimary)) {
        return undefined;
    }
    const primaryAvailable = isFontFamilyAvailableInBrowser(normalizedPrimary, config.fontSize);
    if (!primaryAvailable) {
        if (normalizedPrimary.endsWith("Nerd Font") && !normalizedPrimary.endsWith("Nerd Font Mono")) {
            const monoCandidate = `${normalizedPrimary} Mono`;
            if (isFontFamilyAvailableInBrowser(monoCandidate, config.fontSize)) {
                return `Font "${normalizedPrimary}" not found. Try "${monoCandidate}".`;
            }
        }
        return `Font "${normalizedPrimary}" not found in this browser.`;
    }
    return undefined;
}
function normalizeTerminalFontConfig(value) {
    if (!value || typeof value !== "object") {
        return DEFAULT_TERMINAL_FONT_CONFIG;
    }
    const record = value;
    const fontFamily = typeof record.fontFamily === "string" && record.fontFamily.trim()
        ? record.fontFamily
        : DEFAULT_TERMINAL_FONT_CONFIG.fontFamily;
    const fontSizeNumber = Number(record.fontSize);
    const fontSize = Number.isFinite(fontSizeNumber) && fontSizeNumber > 0
        ? fontSizeNumber
        : DEFAULT_TERMINAL_FONT_CONFIG.fontSize;
    return { fontFamily, fontSize };
}
const EDITOR_OPTIONS = [
    { value: "vscode", label: "VS Code" },
    { value: "cursor", label: "Cursor" },
    { value: "zed", label: "Zed" },
    { value: "custom", label: "Custom" },
];
// Browser mode: window.api is not set (only exists in Electron via preload)
const isBrowserMode = typeof window !== "undefined" && !window.api;
export function GeneralSection() {
    const { theme, setTheme } = useTheme();
    const { api } = useAPI();
    const [rawTerminalFontConfig, setTerminalFontConfig] = usePersistedState(TERMINAL_FONT_CONFIG_KEY, DEFAULT_TERMINAL_FONT_CONFIG);
    const terminalFontConfig = normalizeTerminalFontConfig(rawTerminalFontConfig);
    const terminalFontWarning = getTerminalFontAvailabilityWarning(terminalFontConfig);
    const terminalFontPreviewFamily = appendTerminalIconFallback(terminalFontConfig.fontFamily);
    const terminalFontPreviewText = [
        String.fromCodePoint(0xf024b), // md-folder
        String.fromCodePoint(0xf0214), // md-file
        String.fromCodePoint(0xf02a2), // md-git
        String.fromCodePoint(0xea85), // cod-terminal
        String.fromCodePoint(0xe725), // dev-git_branch
        String.fromCodePoint(0xf135), // fa-rocket
    ].join(" ");
    const [rawEditorConfig, setEditorConfig] = usePersistedState(EDITOR_CONFIG_KEY, DEFAULT_EDITOR_CONFIG);
    const editorConfig = normalizeEditorConfig(rawEditorConfig);
    const [sshHost, setSshHost] = useState("");
    const [sshHostLoaded, setSshHostLoaded] = useState(false);
    const [defaultProjectDir, setDefaultProjectDir] = useState("");
    const [cloneDirLoaded, setCloneDirLoaded] = useState(false);
    // Track whether the initial load succeeded to prevent saving empty string
    // (which would clear the config) when the initial fetch failed.
    const [cloneDirLoadedOk, setCloneDirLoadedOk] = useState(false);
    // Backend config: default to ON so archiving is safest even before async load completes.
    const [stopCoderWorkspaceOnArchive, setStopCoderWorkspaceOnArchive] = useState(true);
    const stopCoderWorkspaceOnArchiveLoadNonceRef = useRef(0);
    // updateCoderPrefs writes config.json on the backend. Serialize (and coalesce) updates so rapid
    // toggles can't race and persist a stale value via out-of-order writes.
    const stopCoderWorkspaceOnArchiveUpdateChainRef = useRef(Promise.resolve());
    const stopCoderWorkspaceOnArchivePendingUpdateRef = useRef(undefined);
    useEffect(() => {
        if (!api) {
            return;
        }
        const nonce = ++stopCoderWorkspaceOnArchiveLoadNonceRef.current;
        void api.config
            .getConfig()
            .then((cfg) => {
            // If the user toggled the setting while this request was in flight, keep the UI selection.
            if (nonce !== stopCoderWorkspaceOnArchiveLoadNonceRef.current) {
                return;
            }
            setStopCoderWorkspaceOnArchive(cfg.stopCoderWorkspaceOnArchive);
        })
            .catch(() => {
            // Best-effort only. Keep the default (ON) if config fails to load.
        });
    }, [api]);
    const handleStopCoderWorkspaceOnArchiveChange = useCallback((checked) => {
        // Invalidate any in-flight initial load so it doesn't overwrite the user's selection.
        stopCoderWorkspaceOnArchiveLoadNonceRef.current++;
        setStopCoderWorkspaceOnArchive(checked);
        if (!api?.config?.updateCoderPrefs) {
            return;
        }
        stopCoderWorkspaceOnArchivePendingUpdateRef.current = checked;
        stopCoderWorkspaceOnArchiveUpdateChainRef.current =
            stopCoderWorkspaceOnArchiveUpdateChainRef.current
                .then(async () => {
                // Drain the pending ref so a toggle that happens while updateCoderPrefs is in-flight
                // doesn't get stranded without a subsequent write scheduled.
                for (;;) {
                    const pending = stopCoderWorkspaceOnArchivePendingUpdateRef.current;
                    if (pending === undefined) {
                        return;
                    }
                    // Clear before awaiting so rapid toggles coalesce into a new pending value.
                    stopCoderWorkspaceOnArchivePendingUpdateRef.current = undefined;
                    try {
                        await api.config.updateCoderPrefs({ stopCoderWorkspaceOnArchive: pending });
                    }
                    catch {
                        // Best-effort only. Swallow errors so the queue doesn't get stuck.
                    }
                }
            })
                .catch(() => {
                // Best-effort only.
            });
    }, [api]);
    const { statsTabState, setStatsTabEnabled } = useFeatureFlags();
    const handleStatsTabToggle = useCallback((enabled) => {
        setStatsTabEnabled(enabled).catch(() => {
            // ignore
        });
    }, [setStatsTabEnabled]);
    // Load SSH host from server on mount (browser mode only)
    useEffect(() => {
        if (isBrowserMode && api) {
            void api.server.getSshHost().then((host) => {
                setSshHost(host ?? "");
                setSshHostLoaded(true);
            });
        }
    }, [api]);
    useEffect(() => {
        if (!api) {
            return;
        }
        void api.projects
            .getDefaultProjectDir()
            .then((dir) => {
            setDefaultProjectDir(dir);
            setCloneDirLoaded(true);
            setCloneDirLoadedOk(true);
        })
            .catch(() => {
            // Best-effort only. Keep the input editable if load fails,
            // but don't mark as successfully loaded to prevent clearing config on blur.
            setCloneDirLoaded(true);
        });
    }, [api]);
    const handleEditorChange = (editor) => {
        setEditorConfig((prev) => ({ ...normalizeEditorConfig(prev), editor }));
    };
    const handleTerminalFontFamilyChange = (fontFamily) => {
        setTerminalFontConfig((prev) => ({ ...normalizeTerminalFontConfig(prev), fontFamily }));
    };
    const handleTerminalFontSizeChange = (rawValue) => {
        const parsed = Number(rawValue);
        if (!Number.isFinite(parsed) || parsed <= 0) {
            return;
        }
        setTerminalFontConfig((prev) => ({ ...normalizeTerminalFontConfig(prev), fontSize: parsed }));
    };
    const handleCustomCommandChange = (customCommand) => {
        setEditorConfig((prev) => ({ ...normalizeEditorConfig(prev), customCommand }));
    };
    const handleSshHostChange = useCallback((value) => {
        setSshHost(value);
        // Save to server (debounced effect would be better, but keeping it simple)
        void api?.server.setSshHost({ sshHost: value || null });
    }, [api]);
    const handleCloneDirBlur = useCallback(() => {
        // Only persist once the initial load has completed (success or failure).
        // After a failed load, allow saves only if the user has actively typed
        // a non-empty value, so we never silently clear a configured directory.
        if (!cloneDirLoaded || !api) {
            return;
        }
        const trimmedProjectDir = defaultProjectDir.trim();
        if (!cloneDirLoadedOk && !trimmedProjectDir) {
            return;
        }
        void api.projects
            .setDefaultProjectDir({ path: defaultProjectDir })
            .then(() => {
            // A successful save means subsequent clears are safe, even if the
            // initial getDefaultProjectDir() request failed earlier in this session.
            setCloneDirLoadedOk(true);
        })
            .catch(() => {
            // Best-effort save: keep current UI state on failure.
        });
    }, [api, cloneDirLoaded, cloneDirLoadedOk, defaultProjectDir]);
    return (_jsxs("div", { className: "space-y-6", children: [_jsxs("div", { children: [_jsx("h3", { className: "text-foreground mb-4 text-sm font-medium", children: "Appearance" }), _jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "flex items-center justify-between gap-4", children: [_jsxs("div", { className: "flex-1", children: [_jsx("div", { className: "text-foreground text-sm", children: "Theme" }), _jsx("div", { className: "text-muted text-xs", children: "Choose your preferred theme" })] }), _jsxs(Select, { value: theme, onValueChange: (value) => setTheme(value), children: [_jsx(SelectTrigger, { className: "border-border-medium bg-background-secondary hover:bg-hover h-9 w-auto cursor-pointer rounded-md border px-3 text-sm transition-colors", children: _jsx(SelectValue, {}) }), _jsx(SelectContent, { children: THEME_OPTIONS.map((option) => (_jsx(SelectItem, { value: option.value, children: option.label }, option.value))) })] })] }), _jsxs("div", { className: "flex items-center justify-between gap-4", children: [_jsxs("div", { className: "flex-1", children: [_jsx("div", { className: "text-foreground text-sm", children: "Terminal Font" }), terminalFontWarning ? (_jsx("div", { className: "text-warning text-xs", children: terminalFontWarning })) : null, _jsx("div", { className: "text-muted text-xs", children: "Set this to a monospace font you like." }), _jsxs("div", { className: "text-muted text-xs", children: ["Preview:", " ", _jsx("span", { className: "text-foreground", style: { fontFamily: terminalFontPreviewFamily }, children: terminalFontPreviewText })] })] }), _jsx("div", { className: "flex flex-col items-end gap-2", children: _jsx(Input, { value: terminalFontConfig.fontFamily, onChange: (e) => handleTerminalFontFamilyChange(e.target.value), placeholder: DEFAULT_TERMINAL_FONT_CONFIG.fontFamily, className: "border-border-medium bg-background-secondary h-9 w-80" }) })] }), _jsxs("div", { className: "flex items-center justify-between gap-4", children: [_jsxs("div", { className: "flex-1", children: [_jsx("div", { className: "text-foreground text-sm", children: "Terminal Font Size" }), _jsx("div", { className: "text-muted text-xs", children: "Font size for the integrated terminal" })] }), _jsx(Input, { type: "number", value: terminalFontConfig.fontSize, min: 6, onChange: (e) => handleTerminalFontSizeChange(e.target.value), className: "border-border-medium bg-background-secondary h-9 w-28" })] })] })] }), _jsxs("div", { children: [_jsx("h3", { className: "text-foreground mb-4 text-sm font-medium", children: "Workspace insights" }), _jsx("div", { className: "divide-border-light divide-y", children: _jsxs("div", { className: "flex items-center justify-between py-3", children: [_jsxs("div", { className: "flex-1 pr-4", children: [_jsx("div", { className: "text-foreground text-sm", children: "Stats tab" }), _jsx("div", { className: "text-muted mt-0.5 text-xs", children: "Show timing statistics in the right sidebar" })] }), _jsx(Switch, { checked: statsTabState?.enabled ?? true, onCheckedChange: handleStatsTabToggle, "aria-label": "Toggle Stats tab" })] }) })] }), _jsxs("div", { className: "flex items-center justify-between", children: [_jsxs("div", { children: [_jsx("div", { className: "text-foreground text-sm", children: "Editor" }), _jsx("div", { className: "text-muted text-xs", children: "Editor to open files in" })] }), _jsxs(Select, { value: editorConfig.editor, onValueChange: handleEditorChange, children: [_jsx(SelectTrigger, { className: "border-border-medium bg-background-secondary hover:bg-hover h-9 w-auto cursor-pointer rounded-md border px-3 text-sm transition-colors", children: _jsx(SelectValue, {}) }), _jsx(SelectContent, { children: EDITOR_OPTIONS.map((option) => (_jsx(SelectItem, { value: option.value, children: option.label }, option.value))) })] })] }), editorConfig.editor === "custom" && (_jsxs("div", { className: "space-y-2", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsxs("div", { children: [_jsx("div", { className: "text-foreground text-sm", children: "Custom Command" }), _jsx("div", { className: "text-muted text-xs", children: "Command to run (path will be appended)" })] }), _jsx(Input, { value: editorConfig.customCommand ?? "", onChange: (e) => handleCustomCommandChange(e.target.value), placeholder: "e.g., nvim", className: "border-border-medium bg-background-secondary h-9 w-40" })] }), isBrowserMode && (_jsx("div", { className: "text-warning text-xs", children: "Custom editors are not supported in browser mode. Use VS Code or Cursor instead." }))] })), _jsxs("div", { className: "flex items-center justify-between gap-4", children: [_jsxs("div", { className: "flex-1", children: [_jsx("div", { className: "text-foreground text-sm", children: "Stop Coder workspace when archiving" }), _jsx("div", { className: "text-muted text-xs", children: "When enabled, archiving a Mux workspace will stop its dedicated Coder workspace first." })] }), _jsx(Switch, { checked: stopCoderWorkspaceOnArchive, onCheckedChange: handleStopCoderWorkspaceOnArchiveChange, disabled: !api?.config?.updateCoderPrefs, "aria-label": "Toggle stopping the dedicated Coder workspace when archiving a Mux workspace" })] }), isBrowserMode && sshHostLoaded && (_jsxs("div", { className: "flex items-center justify-between", children: [_jsxs("div", { children: [_jsx("div", { className: "text-foreground text-sm", children: "SSH Host" }), _jsx("div", { className: "text-muted text-xs", children: "SSH hostname for 'Open in Editor' deep links" })] }), _jsx(Input, { value: sshHost, onChange: (e) => handleSshHostChange(e.target.value), placeholder: window.location.hostname, className: "border-border-medium bg-background-secondary h-9 w-40" })] })), _jsxs("div", { children: [_jsx("h3", { className: "text-foreground mb-4 text-sm font-medium", children: "Projects" }), _jsx("div", { className: "space-y-4", children: _jsxs("div", { className: "flex items-center justify-between gap-4", children: [_jsxs("div", { className: "flex-1", children: [_jsx("div", { className: "text-foreground text-sm", children: "Default project directory" }), _jsx("div", { className: "text-muted text-xs", children: "Parent folder for new projects and cloned repositories" })] }), _jsx(Input, { value: defaultProjectDir, onChange: (e) => setDefaultProjectDir(e.target.value), onBlur: handleCloneDirBlur, placeholder: "~/.mux/projects", disabled: !cloneDirLoaded, className: "border-border-medium bg-background-secondary h-9 w-80" })] }) })] })] }));
}
//# sourceMappingURL=GeneralSection.js.map