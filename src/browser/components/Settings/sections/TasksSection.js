import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useAPI } from "@/browser/contexts/API";
import { useWorkspaceContext } from "@/browser/contexts/WorkspaceContext";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/browser/components/ui/tooltip";
import { Input } from "@/browser/components/ui/input";
import { Switch } from "@/browser/components/ui/switch";
import { Button } from "@/browser/components/ui/button";
import { ModelSelector } from "@/browser/components/ModelSelector";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, } from "@/browser/components/ui/select";
import { copyToClipboard } from "@/browser/utils/clipboard";
import { getDefaultModel, useModelsFromSettings } from "@/browser/hooks/useModelsFromSettings";
import { updatePersistedState, usePersistedState } from "@/browser/hooks/usePersistedState";
import { AGENT_AI_DEFAULTS_KEY, getModelKey } from "@/common/constants/storage";
import { CUSTOM_EVENTS, createCustomEvent } from "@/common/constants/events";
import { normalizeAgentAiDefaults, } from "@/common/types/agentAiDefaults";
import { DEFAULT_TASK_SETTINGS, TASK_SETTINGS_LIMITS, normalizeTaskSettings, } from "@/common/types/tasks";
import { getThinkingOptionLabel } from "@/common/types/thinking";
import { enforceThinkingPolicy, getThinkingPolicyForModel } from "@/common/utils/thinking/policy";
const INHERIT = "__inherit__";
const FALLBACK_AGENTS = [
    {
        id: "plan",
        scope: "built-in",
        name: "Plan",
        description: "Create a plan before coding",
        uiSelectable: true,
        subagentRunnable: false,
        base: "plan",
    },
    {
        id: "exec",
        scope: "built-in",
        name: "Exec",
        description: "Implement changes in the repository",
        uiSelectable: true,
        subagentRunnable: true,
    },
    {
        // Keep Ask visible when workspace agent discovery is unavailable.
        id: "ask",
        scope: "built-in",
        name: "Ask",
        description: "Delegate questions to Explore sub-agents and synthesize an answer.",
        uiSelectable: true,
        subagentRunnable: false,
        base: "exec",
    },
    {
        id: "compact",
        scope: "built-in",
        name: "Compact",
        description: "History compaction (internal)",
        uiSelectable: false,
        subagentRunnable: false,
    },
    {
        id: "explore",
        scope: "built-in",
        name: "Explore",
        description: "Read-only repository exploration",
        uiSelectable: false,
        subagentRunnable: true,
        base: "exec",
    },
];
function getAgentDefinitionPath(agent) {
    switch (agent.scope) {
        case "project":
            return `.mux/agents/${agent.id}.md`;
        case "global":
            return `~/.mux/agents/${agent.id}.md`;
        default:
            return null;
    }
}
function updateAgentDefaultEntry(previous, agentId, update) {
    const normalizedId = agentId.trim().toLowerCase();
    const next = { ...previous };
    const existing = next[normalizedId] ?? {};
    const updated = { ...existing };
    update(updated);
    if (updated.modelString && updated.thinkingLevel) {
        updated.thinkingLevel = enforceThinkingPolicy(updated.modelString, updated.thinkingLevel);
    }
    if (!updated.modelString && !updated.thinkingLevel && updated.enabled === undefined) {
        delete next[normalizedId];
    }
    else {
        next[normalizedId] = updated;
    }
    return next;
}
function renderPolicySummary(agent) {
    const isCompact = agent.id === "compact";
    const baseDescription = (() => {
        if (isCompact) {
            return {
                title: "Base: compact",
                note: "Internal no-tools mode.",
            };
        }
        if (agent.base) {
            return {
                title: `Base: ${agent.base}`,
                note: "Inherits prompt/tools from base.",
            };
        }
        return {
            title: "Base: (none)",
            note: "No base agent configured.",
        };
    })();
    const pieces = [
        _jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("span", { className: "cursor-help underline decoration-dotted underline-offset-2", children: baseDescription.title.toLowerCase() }) }), _jsxs(TooltipContent, { align: "start", className: "max-w-80 whitespace-normal", children: [_jsx("div", { className: "font-medium", children: baseDescription.title }), _jsx("div", { className: "text-muted mt-2 text-xs", children: baseDescription.note })] })] }, "base-policy"),
    ];
    const toolAdd = agent.tools?.add ?? [];
    const toolRemove = agent.tools?.remove ?? [];
    const toolRuleCount = toolAdd.length + toolRemove.length;
    if (toolRuleCount > 0 || agent.base) {
        pieces.push(_jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("span", { className: "cursor-help underline decoration-dotted underline-offset-2", children: toolRuleCount > 0 ? `tools: ${toolRuleCount}` : "tools: inherited" }) }), _jsxs(TooltipContent, { align: "start", className: "max-w-80 whitespace-normal", children: [_jsx("div", { className: "font-medium", children: "Tools" }), toolRuleCount > 0 ? (_jsxs("ul", { className: "mt-1 space-y-0.5", children: [toolAdd.map((pattern) => (_jsxs("li", { children: [_jsx("span", { className: "text-green-500", children: "+" }), " ", _jsx("code", { children: pattern })] }, `add:${pattern}`))), toolRemove.map((pattern) => (_jsxs("li", { children: [_jsx("span", { className: "text-red-500", children: "\u2212" }), " ", _jsx("code", { children: pattern })] }, `remove:${pattern}`)))] })) : (_jsx("div", { className: "text-muted mt-1 text-xs", children: "Inherited from base." }))] })] }, "tools"));
    }
    return (_jsx(_Fragment, { children: pieces.map((piece, idx) => (_jsxs(React.Fragment, { children: [idx > 0 ? " • " : null, piece] }, idx))) }));
}
function areTaskSettingsEqual(a, b) {
    return (a.maxParallelAgentTasks === b.maxParallelAgentTasks &&
        a.maxTaskNestingDepth === b.maxTaskNestingDepth &&
        a.proposePlanImplementReplacesChatHistory === b.proposePlanImplementReplacesChatHistory &&
        a.bashOutputCompactionMinLines === b.bashOutputCompactionMinLines &&
        a.bashOutputCompactionMinTotalBytes === b.bashOutputCompactionMinTotalBytes &&
        a.bashOutputCompactionMaxKeptLines === b.bashOutputCompactionMaxKeptLines &&
        a.bashOutputCompactionTimeoutMs === b.bashOutputCompactionTimeoutMs &&
        a.bashOutputCompactionHeuristicFallback === b.bashOutputCompactionHeuristicFallback);
}
function areAgentAiDefaultsEqual(a, b) {
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) {
        return false;
    }
    aKeys.sort();
    bKeys.sort();
    for (let i = 0; i < aKeys.length; i += 1) {
        const key = aKeys[i];
        if (key !== bKeys[i]) {
            return false;
        }
        const aEntry = a[key];
        const bEntry = b[key];
        if ((aEntry?.modelString ?? undefined) !== (bEntry?.modelString ?? undefined)) {
            return false;
        }
        if ((aEntry?.thinkingLevel ?? undefined) !== (bEntry?.thinkingLevel ?? undefined)) {
            return false;
        }
        if ((aEntry?.enabled ?? undefined) !== (bEntry?.enabled ?? undefined)) {
            return false;
        }
    }
    return true;
}
export function TasksSection() {
    const { api } = useAPI();
    const { selectedWorkspace } = useWorkspaceContext();
    const selectedWorkspaceRef = useRef(selectedWorkspace);
    useEffect(() => {
        selectedWorkspaceRef.current = selectedWorkspace;
    }, [selectedWorkspace]);
    const [taskSettings, setTaskSettings] = useState(DEFAULT_TASK_SETTINGS);
    const [agentAiDefaults, setAgentAiDefaults] = useState({});
    const [agents, setAgents] = useState([]);
    const [enabledAgentIds, setEnabledAgentIds] = useState([]);
    const [agentsLoaded, setAgentsLoaded] = useState(false);
    const [agentsLoadFailed, setAgentsLoadFailed] = useState(false);
    const [loaded, setLoaded] = useState(false);
    const [loadFailed, setLoadFailed] = useState(false);
    const [saveError, setSaveError] = useState(null);
    const saveTimerRef = useRef(null);
    const savingRef = useRef(false);
    const pendingSaveRef = useRef(null);
    const { models, hiddenModelsForSelector } = useModelsFromSettings();
    // Resolve the workspace's active model so that when a sub-agent's model is
    // "Inherit", we show thinking levels for the workspace model (falling back to
    // the global default). This mirrors the resolution chain in System1Section.
    const selectedWorkspaceId = selectedWorkspace?.workspaceId ?? null;
    const defaultModel = getDefaultModel();
    const workspaceModelStorageKey = selectedWorkspaceId
        ? getModelKey(selectedWorkspaceId)
        : "__tasks_workspace_model_fallback__";
    const [workspaceModelRaw] = usePersistedState(workspaceModelStorageKey, defaultModel, {
        listener: true,
    });
    const inheritedEffectiveModel = (typeof workspaceModelRaw === "string" ? workspaceModelRaw.trim() : "") || defaultModel;
    const lastSyncedTaskSettingsRef = useRef(null);
    const lastSyncedAgentAiDefaultsRef = useRef(null);
    useEffect(() => {
        if (!api)
            return;
        setLoaded(false);
        setLoadFailed(false);
        setSaveError(null);
        void api.config
            .getConfig()
            .then((cfg) => {
            const normalizedTaskSettings = normalizeTaskSettings(cfg.taskSettings);
            setTaskSettings(normalizedTaskSettings);
            const normalizedAgentDefaults = normalizeAgentAiDefaults(cfg.agentAiDefaults);
            setAgentAiDefaults(normalizedAgentDefaults);
            updatePersistedState(AGENT_AI_DEFAULTS_KEY, normalizedAgentDefaults);
            setLoadFailed(false);
            lastSyncedTaskSettingsRef.current = normalizedTaskSettings;
            lastSyncedAgentAiDefaultsRef.current = normalizedAgentDefaults;
            setLoaded(true);
        })
            .catch((error) => {
            setSaveError(error instanceof Error ? error.message : String(error));
            setLoadFailed(true);
            setLoaded(true);
        });
    }, [api]);
    useEffect(() => {
        if (!api)
            return;
        const projectPath = selectedWorkspace?.projectPath;
        const workspaceId = selectedWorkspace?.workspaceId;
        if (!projectPath) {
            setAgents([]);
            setEnabledAgentIds(FALLBACK_AGENTS.map((agent) => agent.id));
            setAgentsLoaded(true);
            setAgentsLoadFailed(false);
            return;
        }
        let cancelled = false;
        setAgentsLoaded(false);
        setAgentsLoadFailed(false);
        void Promise.all([
            api.agents.list({ projectPath, workspaceId }),
            api.agents.list({ projectPath, workspaceId, includeDisabled: true }),
        ])
            .then(([enabled, all]) => {
            if (cancelled)
                return;
            setAgents(all);
            setEnabledAgentIds(enabled.map((agent) => agent.id));
            setAgentsLoadFailed(false);
            setAgentsLoaded(true);
        })
            .catch(() => {
            if (cancelled)
                return;
            setAgents([]);
            setEnabledAgentIds(FALLBACK_AGENTS.map((agent) => agent.id));
            setAgentsLoadFailed(true);
            setAgentsLoaded(true);
        });
        return () => {
            cancelled = true;
        };
    }, [api, selectedWorkspace?.projectPath, selectedWorkspace?.workspaceId]);
    useEffect(() => {
        if (!api)
            return;
        if (!loaded)
            return;
        if (loadFailed)
            return;
        pendingSaveRef.current = { taskSettings, agentAiDefaults };
        const lastTaskSettings = lastSyncedTaskSettingsRef.current;
        const lastAgentDefaults = lastSyncedAgentAiDefaultsRef.current;
        if (lastTaskSettings &&
            lastAgentDefaults &&
            areTaskSettingsEqual(lastTaskSettings, taskSettings) &&
            areAgentAiDefaultsEqual(lastAgentDefaults, agentAiDefaults)) {
            pendingSaveRef.current = null;
            if (saveTimerRef.current) {
                clearTimeout(saveTimerRef.current);
                saveTimerRef.current = null;
            }
            return;
        }
        // Keep agent defaults cache up-to-date for any syncers/non-react readers.
        updatePersistedState(AGENT_AI_DEFAULTS_KEY, agentAiDefaults);
        if (saveTimerRef.current) {
            clearTimeout(saveTimerRef.current);
            saveTimerRef.current = null;
        }
        saveTimerRef.current = setTimeout(() => {
            const flush = () => {
                if (savingRef.current)
                    return;
                if (!api)
                    return;
                const payload = pendingSaveRef.current;
                if (!payload)
                    return;
                pendingSaveRef.current = null;
                savingRef.current = true;
                void api.config
                    .saveConfig({
                    taskSettings: payload.taskSettings,
                    agentAiDefaults: payload.agentAiDefaults,
                })
                    .then(() => {
                    const previousAgentDefaults = lastSyncedAgentAiDefaultsRef.current;
                    const agentDefaultsChanged = !previousAgentDefaults ||
                        !areAgentAiDefaultsEqual(previousAgentDefaults, payload.agentAiDefaults);
                    lastSyncedTaskSettingsRef.current = payload.taskSettings;
                    lastSyncedAgentAiDefaultsRef.current = payload.agentAiDefaults;
                    setSaveError(null);
                    if (agentDefaultsChanged) {
                        window.dispatchEvent(createCustomEvent(CUSTOM_EVENTS.AGENTS_REFRESH_REQUESTED));
                        const projectPath = selectedWorkspaceRef.current?.projectPath;
                        const workspaceId = selectedWorkspaceRef.current?.workspaceId;
                        if (!projectPath) {
                            return;
                        }
                        // Refresh in the background so enablement inheritance stays accurate after saving
                        // defaults, but keep the existing list rendered to avoid a "Loading agents…" flash
                        // while the user tweaks values.
                        setAgentsLoadFailed(false);
                        void Promise.all([
                            api.agents.list({ projectPath, workspaceId }),
                            api.agents.list({ projectPath, workspaceId, includeDisabled: true }),
                        ])
                            .then(([enabled, all]) => {
                            setAgents(all);
                            setEnabledAgentIds(enabled.map((agent) => agent.id));
                            setAgentsLoadFailed(false);
                            setAgentsLoaded(true);
                        })
                            .catch(() => {
                            setAgents([]);
                            setEnabledAgentIds(FALLBACK_AGENTS.map((agent) => agent.id));
                            setAgentsLoadFailed(true);
                            setAgentsLoaded(true);
                        });
                    }
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
    }, [api, agentAiDefaults, loaded, loadFailed, taskSettings]);
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
                taskSettings: payload.taskSettings,
                agentAiDefaults: payload.agentAiDefaults,
            })
                .catch(() => undefined)
                .finally(() => {
                savingRef.current = false;
            });
        };
    }, [api, loaded, loadFailed]);
    const setMaxParallelAgentTasks = (rawValue) => {
        const parsed = Number(rawValue);
        setTaskSettings((prev) => normalizeTaskSettings({ ...prev, maxParallelAgentTasks: parsed }));
    };
    const setMaxTaskNestingDepth = (rawValue) => {
        const parsed = Number(rawValue);
        setTaskSettings((prev) => normalizeTaskSettings({ ...prev, maxTaskNestingDepth: parsed }));
    };
    const setProposePlanImplementReplacesChatHistory = (value) => {
        setTaskSettings((prev) => normalizeTaskSettings({ ...prev, proposePlanImplementReplacesChatHistory: value }));
    };
    const setAgentModel = (agentId, value) => {
        setAgentAiDefaults((prev) => updateAgentDefaultEntry(prev, agentId, (updated) => {
            if (value === INHERIT) {
                delete updated.modelString;
            }
            else {
                updated.modelString = value;
            }
        }));
    };
    const setAgentThinking = (agentId, value) => {
        setAgentAiDefaults((prev) => updateAgentDefaultEntry(prev, agentId, (updated) => {
            if (value === INHERIT) {
                delete updated.thinkingLevel;
                return;
            }
            updated.thinkingLevel = value;
        }));
    };
    const setAgentEnabled = (agentId, value) => {
        setAgentAiDefaults((prev) => updateAgentDefaultEntry(prev, agentId, (updated) => {
            updated.enabled = value;
        }));
    };
    const resetAgentEnabled = (agentId) => {
        setAgentAiDefaults((prev) => updateAgentDefaultEntry(prev, agentId, (updated) => {
            delete updated.enabled;
        }));
    };
    const listedAgents = agents.length > 0 ? agents : FALLBACK_AGENTS;
    const enabledAgentIdSet = new Set(enabledAgentIds);
    const uiAgents = useMemo(() => [...listedAgents]
        .filter((agent) => agent.uiSelectable)
        .sort((a, b) => a.name.localeCompare(b.name)), [listedAgents]);
    const subagents = useMemo(() => [...listedAgents]
        // Keep the sections mutually exclusive: UI agents belong under "UI agents" even if they
        // can also run as sub-agents.
        .filter((agent) => agent.subagentRunnable && !agent.uiSelectable)
        .sort((a, b) => a.name.localeCompare(b.name)), [listedAgents]);
    const internalAgents = useMemo(() => [...listedAgents]
        .filter((agent) => !agent.uiSelectable && !agent.subagentRunnable)
        .sort((a, b) => a.name.localeCompare(b.name)), [listedAgents]);
    const unknownAgentIds = useMemo(() => {
        const known = new Set(listedAgents.map((agent) => agent.id));
        return Object.keys(agentAiDefaults)
            .filter((id) => !known.has(id))
            .sort((a, b) => a.localeCompare(b));
    }, [agentAiDefaults, listedAgents]);
    const renderAgentDefaults = (agent) => {
        const entry = agentAiDefaults[agent.id];
        const modelValue = entry?.modelString ?? INHERIT;
        const thinkingValue = entry?.thinkingLevel ?? INHERIT;
        const enabledOverride = entry?.enabled;
        const enablementLocked = agent.id === "exec" || agent.id === "plan" || agent.id === "compact" || agent.id === "mux";
        const enabledValue = enablementLocked
            ? true
            : typeof enabledOverride === "boolean"
                ? enabledOverride
                : enabledAgentIdSet.has(agent.id);
        const enablementTitle = enablementLocked
            ? "Core agent. Can't be disabled."
            : enabledOverride === undefined
                ? enabledValue
                    ? "Enabled by agent definition."
                    : "Disabled by agent definition."
                : enabledOverride
                    ? "Enabled (local override)."
                    : "Disabled (local override).";
        const enablementHint = !enablementLocked && enabledOverride === undefined && !enabledValue
            ? "Disabled by default"
            : null;
        // When model is "Inherit", resolve the effective model so the dropdown
        // shows the correct thinking levels (e.g. "max" for Opus 4.6, not "xhigh").
        const effectiveModel = modelValue !== INHERIT ? modelValue : inheritedEffectiveModel;
        const allowedThinkingLevels = getThinkingPolicyForModel(effectiveModel);
        const agentDefinitionPath = getAgentDefinitionPath(agent);
        const scopeNode = agentDefinitionPath ? (_jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("button", { type: "button", className: "hover:text-foreground cursor-copy bg-transparent p-0 underline decoration-dotted underline-offset-2", onClick: (e) => {
                            e.stopPropagation();
                            void copyToClipboard(agentDefinitionPath);
                        }, children: agent.scope }) }), _jsxs(TooltipContent, { align: "start", className: "max-w-80 whitespace-normal", children: [_jsx("div", { className: "font-medium", children: "Agent file" }), _jsx("div", { className: "mt-1", children: _jsx("code", { children: agentDefinitionPath }) }), _jsx("div", { className: "text-muted mt-2 text-xs", children: "Click to copy" })] })] })) : (_jsx("span", { children: agent.scope }));
        return (_jsxs("div", { className: "border-border-medium bg-background-secondary rounded-md border p-3", children: [_jsxs("div", { className: "flex items-start justify-between gap-3", children: [_jsxs("div", { className: "min-w-0 flex-1", children: [_jsx("div", { className: "text-foreground text-sm font-medium", children: agent.name }), _jsxs("div", { className: "text-muted text-xs", children: [agent.id, " \u2022 ", scopeNode, " \u2022 ", renderPolicySummary(agent), agent.uiSelectable && agent.subagentRunnable ? (_jsxs(_Fragment, { children: [" ", "\u2022", " ", _jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("span", { className: "cursor-help underline decoration-dotted underline-offset-2", children: "sub-agent" }) }), _jsx(TooltipContent, { align: "start", className: "max-w-80 whitespace-normal", children: "Can be invoked as a sub-agent." })] })] })) : null] }), agent.description ? (_jsx("div", { className: "text-muted mt-1 text-xs", children: agent.description })) : null] }), _jsxs("div", { className: "flex shrink-0 items-center gap-3", children: [enablementHint ? _jsx("div", { className: "text-muted text-xs", children: enablementHint }) : null, _jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("div", { className: "text-muted text-xs", children: "Enabled" }), _jsx(Switch, { checked: enabledValue, disabled: enablementLocked, onCheckedChange: (checked) => setAgentEnabled(agent.id, checked), "aria-label": `Toggle ${agent.id} enabled` })] }) }), _jsx(TooltipContent, { children: enablementTitle })] }), enabledOverride !== undefined ? (_jsx(Button, { type: "button", variant: "ghost", size: "sm", className: "px-2", onClick: () => resetAgentEnabled(agent.id), children: "Reset" })) : null] })] }), _jsxs("div", { className: "mt-3 grid grid-cols-1 gap-3 md:grid-cols-2", children: [_jsxs("div", { className: "space-y-1", children: [_jsx("div", { className: "text-muted text-xs", children: "Model" }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx(ModelSelector, { value: modelValue === INHERIT ? "" : modelValue, emptyLabel: "Inherit", onChange: (value) => setAgentModel(agent.id, value), models: models, hiddenModels: hiddenModelsForSelector, variant: "box", className: "bg-modal-bg" }), modelValue !== INHERIT ? (_jsx(Button, { type: "button", variant: "ghost", size: "sm", className: "h-9 px-2", onClick: () => setAgentModel(agent.id, INHERIT), children: "Reset" })) : null] })] }), _jsxs("div", { className: "space-y-1", children: [_jsx("div", { className: "text-muted text-xs", children: "Reasoning" }), _jsxs(Select, { value: thinkingValue, onValueChange: (value) => setAgentThinking(agent.id, value), children: [_jsx(SelectTrigger, { className: "border-border-medium bg-modal-bg h-9", children: _jsx(SelectValue, {}) }), _jsxs(SelectContent, { children: [_jsx(SelectItem, { value: INHERIT, children: "Inherit" }), allowedThinkingLevels.map((level) => (_jsx(SelectItem, { value: level, children: getThinkingOptionLabel(level, effectiveModel) }, level)))] })] })] })] })] }, agent.id));
    };
    const renderUnknownAgentDefaults = (agentId) => {
        const entry = agentAiDefaults[agentId];
        const modelValue = entry?.modelString ?? INHERIT;
        const thinkingValue = entry?.thinkingLevel ?? INHERIT;
        const effectiveModel = modelValue !== INHERIT ? modelValue : inheritedEffectiveModel;
        const allowedThinkingLevels = getThinkingPolicyForModel(effectiveModel);
        return (_jsxs("div", { className: "border-border-medium bg-background-secondary rounded-md border p-3", children: [_jsx("div", { className: "text-foreground text-sm font-medium", children: agentId }), _jsx("div", { className: "text-muted text-xs", children: "Not discovered in the current workspace" }), _jsxs("div", { className: "mt-3 grid grid-cols-1 gap-3 md:grid-cols-2", children: [_jsxs("div", { className: "space-y-1", children: [_jsx("div", { className: "text-muted text-xs", children: "Model" }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx(ModelSelector, { value: modelValue === INHERIT ? "" : modelValue, emptyLabel: "Inherit", onChange: (value) => setAgentModel(agentId, value), models: models, hiddenModels: hiddenModelsForSelector, variant: "box", className: "bg-modal-bg" }), modelValue !== INHERIT ? (_jsx(Button, { type: "button", variant: "ghost", size: "sm", className: "h-9 px-2", onClick: () => setAgentModel(agentId, INHERIT), children: "Reset" })) : null] })] }), _jsxs("div", { className: "space-y-1", children: [_jsx("div", { className: "text-muted text-xs", children: "Reasoning" }), _jsxs(Select, { value: thinkingValue, onValueChange: (value) => setAgentThinking(agentId, value), children: [_jsx(SelectTrigger, { className: "border-border-medium bg-modal-bg h-9", children: _jsx(SelectValue, {}) }), _jsxs(SelectContent, { children: [_jsx(SelectItem, { value: INHERIT, children: "Inherit" }), allowedThinkingLevels.map((level) => (_jsx(SelectItem, { value: level, children: getThinkingOptionLabel(level, effectiveModel) }, level)))] })] })] })] })] }, agentId));
    };
    return (_jsxs("div", { className: "space-y-6", children: [_jsxs("div", { children: [_jsx("h3", { className: "text-foreground mb-4 text-sm font-medium", children: "Task Settings" }), _jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "flex items-center justify-between gap-4", children: [_jsxs("div", { className: "flex-1", children: [_jsx("div", { className: "text-foreground text-sm", children: "Max Parallel Agent Tasks" }), _jsxs("div", { className: "text-muted text-xs", children: ["Default ", TASK_SETTINGS_LIMITS.maxParallelAgentTasks.default, ", range", " ", TASK_SETTINGS_LIMITS.maxParallelAgentTasks.min, "\u2013", TASK_SETTINGS_LIMITS.maxParallelAgentTasks.max] })] }), _jsx(Input, { type: "number", value: taskSettings.maxParallelAgentTasks, min: TASK_SETTINGS_LIMITS.maxParallelAgentTasks.min, max: TASK_SETTINGS_LIMITS.maxParallelAgentTasks.max, onChange: (e) => setMaxParallelAgentTasks(e.target.value), className: "border-border-medium bg-background-secondary h-9 w-28" })] }), _jsxs("div", { className: "flex items-center justify-between gap-4", children: [_jsxs("div", { className: "flex-1", children: [_jsx("div", { className: "text-foreground text-sm", children: "Max Task Nesting Depth" }), _jsxs("div", { className: "text-muted text-xs", children: ["Default ", TASK_SETTINGS_LIMITS.maxTaskNestingDepth.default, ", range", " ", TASK_SETTINGS_LIMITS.maxTaskNestingDepth.min, "\u2013", TASK_SETTINGS_LIMITS.maxTaskNestingDepth.max] })] }), _jsx(Input, { type: "number", value: taskSettings.maxTaskNestingDepth, min: TASK_SETTINGS_LIMITS.maxTaskNestingDepth.min, max: TASK_SETTINGS_LIMITS.maxTaskNestingDepth.max, onChange: (e) => setMaxTaskNestingDepth(e.target.value), className: "border-border-medium bg-background-secondary h-9 w-28" })] }), _jsxs("div", { className: "flex items-center justify-between gap-4", children: [_jsxs("div", { className: "flex-1", children: [_jsx("div", { className: "text-foreground text-sm", children: "Plan: Implement replaces conversation with plan" }), _jsx("div", { className: "text-muted text-xs", children: "When enabled, clicking Implement on a plan proposal clears previous messages and shows the plan before switching to Exec." })] }), _jsx(Switch, { checked: taskSettings.proposePlanImplementReplacesChatHistory ?? false, onCheckedChange: setProposePlanImplementReplacesChatHistory, "aria-label": "Toggle plan Implement replaces conversation with plan" })] })] }), saveError ? _jsx("div", { className: "text-danger-light mt-4 text-xs", children: saveError }) : null] }), _jsxs("div", { children: [_jsx("h3", { className: "text-foreground mb-1 text-sm font-medium", children: "Agent Defaults" }), _jsx("div", { className: "text-muted text-xs", children: "Defaults apply globally. Changing model/reasoning in a workspace creates a workspace override." }), agentsLoadFailed ? (_jsx("div", { className: "text-danger-light mt-3 text-xs", children: "Failed to load agent definitions for this workspace." })) : null, !agentsLoaded ? _jsx("div", { className: "text-muted mt-3 text-xs", children: "Loading agents\u2026" }) : null] }), uiAgents.length > 0 ? (_jsxs("div", { children: [_jsx("h4", { className: "text-foreground mb-3 text-sm font-medium", children: "UI agents" }), _jsx("div", { className: "space-y-4", children: uiAgents.map(renderAgentDefaults) })] })) : null, subagents.length > 0 ? (_jsxs("div", { children: [_jsx("h4", { className: "text-foreground mb-3 text-sm font-medium", children: "Sub-agents" }), _jsx("div", { className: "space-y-4", children: subagents.map(renderAgentDefaults) })] })) : null, internalAgents.length > 0 ? (_jsxs("div", { children: [_jsx("h4", { className: "text-foreground mb-3 text-sm font-medium", children: "Internal" }), _jsx("div", { className: "space-y-4", children: internalAgents.map(renderAgentDefaults) })] })) : null, unknownAgentIds.length > 0 ? (_jsxs("div", { children: [_jsx("h4", { className: "text-foreground mb-3 text-sm font-medium", children: "Unknown agents" }), _jsx("div", { className: "space-y-4", children: unknownAgentIds.map(renderUnknownAgentDefaults) })] })) : null] }));
}
//# sourceMappingURL=TasksSection.js.map