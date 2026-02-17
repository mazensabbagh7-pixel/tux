import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Switch } from "@/browser/components/ui/switch";
import { Input } from "@/browser/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, } from "@/browser/components/ui/select";
import { useAPI } from "@/browser/contexts/API";
import { useOptionalWorkspaceContext } from "@/browser/contexts/WorkspaceContext";
import { getDefaultModel, getSuggestedModels } from "@/browser/hooks/useModelsFromSettings";
import { useProvidersConfig } from "@/browser/hooks/useProvidersConfig";
import { usePersistedState } from "@/browser/hooks/usePersistedState";
import { getModelKey, PREFERRED_SYSTEM_1_MODEL_KEY, PREFERRED_SYSTEM_1_THINKING_LEVEL_KEY, } from "@/common/constants/storage";
import { DEFAULT_TASK_SETTINGS, SYSTEM1_BASH_OUTPUT_COMPACTION_LIMITS, normalizeTaskSettings, } from "@/common/types/tasks";
import { enforceThinkingPolicy, getThinkingPolicyForModel } from "@/common/utils/thinking/policy";
import { THINKING_LEVELS, coerceThinkingLevel, getThinkingOptionLabel, } from "@/common/types/thinking";
import { SearchableModelSelect } from "../components/SearchableModelSelect";
export function System1Section() {
    const { api } = useAPI();
    const { config: providersConfig, loading: providersLoading } = useProvidersConfig();
    const [taskSettings, setTaskSettings] = useState(DEFAULT_TASK_SETTINGS);
    const [loaded, setLoaded] = useState(false);
    const [loadFailed, setLoadFailed] = useState(false);
    const [saveError, setSaveError] = useState(null);
    const saveTimerRef = useRef(null);
    const savingRef = useRef(false);
    const lastSyncedRef = useRef(null);
    const pendingSaveRef = useRef(null);
    const [system1ModelRaw, setSystem1ModelRaw] = usePersistedState(PREFERRED_SYSTEM_1_MODEL_KEY, "", {
        listener: true,
    });
    const system1Model = typeof system1ModelRaw === "string" ? system1ModelRaw : "";
    const setSystem1Model = (value) => {
        setSystem1ModelRaw(value);
    };
    const [system1ThinkingLevelRaw, setSystem1ThinkingLevelRaw] = usePersistedState(PREFERRED_SYSTEM_1_THINKING_LEVEL_KEY, "off", { listener: true });
    const system1ThinkingLevel = coerceThinkingLevel(system1ThinkingLevelRaw) ?? "off";
    const workspaceContext = useOptionalWorkspaceContext();
    const selectedWorkspaceId = workspaceContext?.selectedWorkspace?.workspaceId ?? null;
    const defaultModel = getDefaultModel();
    const workspaceModelStorageKey = selectedWorkspaceId
        ? getModelKey(selectedWorkspaceId)
        : "__system1_workspace_model_fallback__";
    const [workspaceModelRaw] = usePersistedState(workspaceModelStorageKey, defaultModel, {
        listener: true,
    });
    const system1ModelTrimmed = system1Model.trim();
    const workspaceModelTrimmed = typeof workspaceModelRaw === "string" ? workspaceModelRaw.trim() : "";
    const effectiveSystem1ModelStringForThinking = system1ModelTrimmed || workspaceModelTrimmed || defaultModel;
    const policyThinkingLevels = getThinkingPolicyForModel(effectiveSystem1ModelStringForThinking);
    const allowedThinkingLevels = policyThinkingLevels.length > 0 ? policyThinkingLevels : THINKING_LEVELS;
    const effectiveSystem1ThinkingLevel = enforceThinkingPolicy(effectiveSystem1ModelStringForThinking, system1ThinkingLevel);
    const setSystem1ThinkingLevel = (value) => {
        setSystem1ThinkingLevelRaw(coerceThinkingLevel(value) ?? "off");
    };
    useEffect(() => {
        if (!api) {
            return;
        }
        setLoaded(false);
        setLoadFailed(false);
        setSaveError(null);
        void api.config
            .getConfig()
            .then((cfg) => {
            const normalized = normalizeTaskSettings(cfg.taskSettings);
            setTaskSettings(normalized);
            lastSyncedRef.current = normalized;
            setLoadFailed(false);
            setLoaded(true);
        })
            .catch((error) => {
            setSaveError(error instanceof Error ? error.message : String(error));
            setLoadFailed(true);
            setLoaded(true);
        });
    }, [api]);
    useEffect(() => {
        if (!api) {
            return;
        }
        if (!loaded) {
            return;
        }
        if (loadFailed) {
            return;
        }
        // Debounce settings writes so typing doesn't thrash the disk.
        const lastSynced = lastSyncedRef.current;
        if (lastSynced && areTaskSettingsEqual(lastSynced, taskSettings)) {
            pendingSaveRef.current = null;
            if (saveTimerRef.current) {
                clearTimeout(saveTimerRef.current);
                saveTimerRef.current = null;
            }
            return;
        }
        pendingSaveRef.current = taskSettings;
        if (saveTimerRef.current) {
            clearTimeout(saveTimerRef.current);
            saveTimerRef.current = null;
        }
        saveTimerRef.current = setTimeout(() => {
            const flush = () => {
                if (savingRef.current) {
                    return;
                }
                const payload = pendingSaveRef.current;
                if (!payload) {
                    return;
                }
                pendingSaveRef.current = null;
                savingRef.current = true;
                void api.config
                    .saveConfig({
                    taskSettings: payload,
                })
                    .then(() => {
                    lastSyncedRef.current = payload;
                    setSaveError(null);
                })
                    .catch((error) => {
                    setSaveError(error instanceof Error ? error.message : String(error));
                })
                    .finally(() => {
                    savingRef.current = false;
                    flush();
                });
            };
            flush();
        }, 400);
        return () => {
            if (saveTimerRef.current) {
                clearTimeout(saveTimerRef.current);
                saveTimerRef.current = null;
            }
        };
    }, [api, loaded, loadFailed, taskSettings]);
    // Flush any pending debounced save on unmount so changes aren't lost.
    useEffect(() => {
        if (!api)
            return;
        if (!loaded)
            return;
        if (loadFailed)
            return;
        return () => {
            if (saveTimerRef.current) {
                clearTimeout(saveTimerRef.current);
                saveTimerRef.current = null;
            }
            if (savingRef.current)
                return;
            const payload = pendingSaveRef.current;
            if (!payload)
                return;
            pendingSaveRef.current = null;
            savingRef.current = true;
            void api.config
                .saveConfig({
                taskSettings: payload,
            })
                .catch(() => undefined)
                .finally(() => {
                savingRef.current = false;
            });
        };
    }, [api, loaded, loadFailed]);
    const setBashOutputCompactionMinLines = (rawValue) => {
        const parsed = Number(rawValue);
        setTaskSettings((prev) => normalizeTaskSettings({
            ...prev,
            bashOutputCompactionMinLines: parsed,
        }));
    };
    const setBashOutputCompactionMinTotalKb = (rawValue) => {
        const parsedKb = Math.floor(Number(rawValue));
        const bytes = parsedKb * 1024;
        setTaskSettings((prev) => normalizeTaskSettings({
            ...prev,
            bashOutputCompactionMinTotalBytes: bytes,
        }));
    };
    const setBashOutputCompactionMaxKeptLines = (rawValue) => {
        const parsed = Number(rawValue);
        setTaskSettings((prev) => normalizeTaskSettings({
            ...prev,
            bashOutputCompactionMaxKeptLines: parsed,
        }));
    };
    const setBashOutputCompactionHeuristicFallback = (value) => {
        setTaskSettings((prev) => normalizeTaskSettings({
            ...prev,
            bashOutputCompactionHeuristicFallback: value,
        }));
    };
    const setBashOutputCompactionTimeoutSeconds = (rawValue) => {
        const parsedSeconds = Math.floor(Number(rawValue));
        const ms = parsedSeconds * 1000;
        setTaskSettings((prev) => normalizeTaskSettings({
            ...prev,
            bashOutputCompactionTimeoutMs: ms,
        }));
    };
    if (!loaded || providersLoading || !providersConfig) {
        return (_jsxs("div", { className: "flex items-center justify-center gap-2 py-12", children: [_jsx(Loader2, { className: "text-muted h-5 w-5 animate-spin" }), _jsx("span", { className: "text-muted text-sm", children: "Loading settings..." })] }));
    }
    const allModels = getSuggestedModels(providersConfig);
    const bashOutputCompactionMinLines = taskSettings.bashOutputCompactionMinLines ??
        SYSTEM1_BASH_OUTPUT_COMPACTION_LIMITS.bashOutputCompactionMinLines.default;
    const bashOutputCompactionMinTotalBytes = taskSettings.bashOutputCompactionMinTotalBytes ??
        SYSTEM1_BASH_OUTPUT_COMPACTION_LIMITS.bashOutputCompactionMinTotalBytes.default;
    const bashOutputCompactionMaxKeptLines = taskSettings.bashOutputCompactionMaxKeptLines ??
        SYSTEM1_BASH_OUTPUT_COMPACTION_LIMITS.bashOutputCompactionMaxKeptLines.default;
    const bashOutputCompactionHeuristicFallback = taskSettings.bashOutputCompactionHeuristicFallback ??
        DEFAULT_TASK_SETTINGS.bashOutputCompactionHeuristicFallback ??
        true;
    const bashOutputCompactionTimeoutMs = taskSettings.bashOutputCompactionTimeoutMs ??
        SYSTEM1_BASH_OUTPUT_COMPACTION_LIMITS.bashOutputCompactionTimeoutMs.default;
    const bashOutputCompactionMinTotalKb = Math.floor(bashOutputCompactionMinTotalBytes / 1024);
    const bashOutputCompactionTimeoutSeconds = Math.floor(bashOutputCompactionTimeoutMs / 1000);
    return (_jsxs("div", { className: "space-y-6", children: [_jsxs("div", { className: "border-border-medium overflow-hidden rounded-md border", children: [_jsx("div", { className: "border-border-medium bg-background-secondary/50 border-b px-2 py-1.5 md:px-3", children: _jsx("span", { className: "text-muted text-xs font-medium", children: "System 1 Defaults" }) }), _jsxs("div", { className: "divide-border-medium divide-y", children: [_jsxs("div", { className: "flex items-center gap-4 px-2 py-2 md:px-3", children: [_jsxs("div", { className: "w-32 shrink-0", children: [_jsx("div", { className: "text-muted text-xs", children: "System 1 Model" }), _jsx("div", { className: "text-muted-light text-[10px]", children: "Context optimization" })] }), _jsx("div", { className: "min-w-0 flex-1", children: _jsx(SearchableModelSelect, { value: system1Model, onChange: setSystem1Model, models: allModels, emptyOption: { value: "", label: "Use workspace model" } }) })] }), _jsxs("div", { className: "flex items-center gap-4 px-2 py-2 md:px-3", children: [_jsxs("div", { className: "w-32 shrink-0", children: [_jsx("div", { className: "text-muted text-xs", children: "System 1 Reasoning" }), _jsx("div", { className: "text-muted-light text-[10px]", children: "Log filtering" })] }), _jsx("div", { className: "min-w-0 flex-1", children: _jsxs(Select, { value: effectiveSystem1ThinkingLevel, onValueChange: setSystem1ThinkingLevel, disabled: allowedThinkingLevels.length <= 1, children: [_jsx(SelectTrigger, { className: "border-border-medium bg-modal-bg h-9 w-full", children: _jsx(SelectValue, {}) }), _jsx(SelectContent, { children: allowedThinkingLevels.map((level) => (_jsx(SelectItem, { value: level, children: getThinkingOptionLabel(level, effectiveSystem1ModelStringForThinking) }, level))) })] }) })] })] })] }), _jsxs("div", { children: [_jsx("h3", { className: "text-foreground mb-4 text-sm font-medium", children: "Bash Output Compaction" }), _jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "flex items-center justify-between gap-4", children: [_jsxs("div", { className: "flex-1", children: [_jsx("div", { className: "text-foreground text-sm", children: "Heuristic Fallback" }), _jsx("div", { className: "text-muted text-xs", children: "If System 1 returns invalid keep_ranges, fall back to deterministic filtering instead of showing full output." })] }), _jsx(Switch, { checked: bashOutputCompactionHeuristicFallback, onCheckedChange: setBashOutputCompactionHeuristicFallback, "aria-label": "Toggle heuristic fallback for bash output compaction" })] }), _jsxs("div", { className: "flex items-center justify-between gap-4", children: [_jsxs("div", { className: "flex-1", children: [_jsx("div", { className: "text-foreground text-sm", children: "Min Lines" }), _jsxs("div", { className: "text-muted text-xs", children: ["Filter when output has more than this many lines. Range", " ", SYSTEM1_BASH_OUTPUT_COMPACTION_LIMITS.bashOutputCompactionMinLines.min, "\u2013", SYSTEM1_BASH_OUTPUT_COMPACTION_LIMITS.bashOutputCompactionMinLines.max, "."] })] }), _jsx(Input, { type: "number", value: bashOutputCompactionMinLines, min: SYSTEM1_BASH_OUTPUT_COMPACTION_LIMITS.bashOutputCompactionMinLines.min, max: SYSTEM1_BASH_OUTPUT_COMPACTION_LIMITS.bashOutputCompactionMinLines.max, onChange: (e) => setBashOutputCompactionMinLines(e.target.value), className: "border-border-medium bg-background-secondary h-9 w-28" })] }), _jsxs("div", { className: "flex items-center justify-between gap-4", children: [_jsxs("div", { className: "flex-1", children: [_jsx("div", { className: "text-foreground text-sm", children: "Min Total (KB)" }), _jsxs("div", { className: "text-muted text-xs", children: ["Filter when output exceeds this many kilobytes. Range", " ", SYSTEM1_BASH_OUTPUT_COMPACTION_LIMITS.bashOutputCompactionMinTotalBytes.min / 1024, "\u2013", SYSTEM1_BASH_OUTPUT_COMPACTION_LIMITS.bashOutputCompactionMinTotalBytes.max / 1024, "."] })] }), _jsx(Input, { type: "number", value: bashOutputCompactionMinTotalKb, min: SYSTEM1_BASH_OUTPUT_COMPACTION_LIMITS.bashOutputCompactionMinTotalBytes.min / 1024, max: SYSTEM1_BASH_OUTPUT_COMPACTION_LIMITS.bashOutputCompactionMinTotalBytes.max / 1024, step: 1, onChange: (e) => setBashOutputCompactionMinTotalKb(e.target.value), className: "border-border-medium bg-background-secondary h-9 w-28" })] }), _jsxs("div", { className: "flex items-center justify-between gap-4", children: [_jsxs("div", { className: "flex-1", children: [_jsx("div", { className: "text-foreground text-sm", children: "Max Kept Lines" }), _jsxs("div", { className: "text-muted text-xs", children: ["Keep at most this many lines. Range", " ", SYSTEM1_BASH_OUTPUT_COMPACTION_LIMITS.bashOutputCompactionMaxKeptLines.min, "\u2013", SYSTEM1_BASH_OUTPUT_COMPACTION_LIMITS.bashOutputCompactionMaxKeptLines.max, "."] })] }), _jsx(Input, { type: "number", value: bashOutputCompactionMaxKeptLines, min: SYSTEM1_BASH_OUTPUT_COMPACTION_LIMITS.bashOutputCompactionMaxKeptLines.min, max: SYSTEM1_BASH_OUTPUT_COMPACTION_LIMITS.bashOutputCompactionMaxKeptLines.max, onChange: (e) => setBashOutputCompactionMaxKeptLines(e.target.value), className: "border-border-medium bg-background-secondary h-9 w-28" })] }), _jsxs("div", { className: "flex items-center justify-between gap-4", children: [_jsxs("div", { className: "flex-1", children: [_jsx("div", { className: "text-foreground text-sm", children: "Timeout (seconds)" }), _jsxs("div", { className: "text-muted text-xs", children: ["Abort filtering if it takes longer than this many seconds. Range", " ", SYSTEM1_BASH_OUTPUT_COMPACTION_LIMITS.bashOutputCompactionTimeoutMs.min / 1000, "\u2013", SYSTEM1_BASH_OUTPUT_COMPACTION_LIMITS.bashOutputCompactionTimeoutMs.max / 1000, "."] })] }), _jsx(Input, { type: "number", value: bashOutputCompactionTimeoutSeconds, min: SYSTEM1_BASH_OUTPUT_COMPACTION_LIMITS.bashOutputCompactionTimeoutMs.min / 1000, max: SYSTEM1_BASH_OUTPUT_COMPACTION_LIMITS.bashOutputCompactionTimeoutMs.max / 1000, step: 1, onChange: (e) => setBashOutputCompactionTimeoutSeconds(e.target.value), className: "border-border-medium bg-background-secondary h-9 w-28" })] })] }), saveError ? _jsx("div", { className: "text-danger-light mt-4 text-xs", children: saveError }) : null] })] }));
}
function areTaskSettingsEqual(a, b) {
    return (a.maxParallelAgentTasks === b.maxParallelAgentTasks &&
        a.maxTaskNestingDepth === b.maxTaskNestingDepth &&
        a.bashOutputCompactionMinLines === b.bashOutputCompactionMinLines &&
        a.bashOutputCompactionMinTotalBytes === b.bashOutputCompactionMinTotalBytes &&
        a.bashOutputCompactionMaxKeptLines === b.bashOutputCompactionMaxKeptLines &&
        a.bashOutputCompactionTimeoutMs === b.bashOutputCompactionTimeoutMs &&
        a.bashOutputCompactionHeuristicFallback === b.bashOutputCompactionHeuristicFallback);
}
//# sourceMappingURL=System1Section.js.map