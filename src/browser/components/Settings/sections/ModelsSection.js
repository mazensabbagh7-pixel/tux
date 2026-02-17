import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useMemo, useState } from "react";
import { Loader2, Plus, ShieldCheck } from "lucide-react";
import { useProviderOptions } from "@/browser/hooks/useProviderOptions";
import { Button } from "@/browser/components/ui/button";
import { ProviderWithIcon } from "@/browser/components/ProviderIcon";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, } from "@/browser/components/ui/select";
import { useAPI } from "@/browser/contexts/API";
import { getSuggestedModels, useModelsFromSettings } from "@/browser/hooks/useModelsFromSettings";
import { migrateGatewayModel, useGateway } from "@/browser/hooks/useGatewayModels";
import { usePersistedState } from "@/browser/hooks/usePersistedState";
import { useProvidersConfig } from "@/browser/hooks/useProvidersConfig";
import { SearchableModelSelect } from "../components/SearchableModelSelect";
import { KNOWN_MODELS } from "@/common/constants/knownModels";
import { usePolicy } from "@/browser/contexts/PolicyContext";
import { supports1MContext } from "@/common/utils/ai/models";
import { getAllowedProvidersForUi, isModelAllowedByPolicy } from "@/browser/utils/policyUi";
import { LAST_CUSTOM_MODEL_PROVIDER_KEY, PREFERRED_COMPACTION_MODEL_KEY, } from "@/common/constants/storage";
import { ModelRow } from "./ModelRow";
// Providers to exclude from the custom models UI (handled specially or internal)
const HIDDEN_PROVIDERS = new Set(["mux-gateway"]);
// Shared header cell styles
const headerCellBase = "py-1.5 pr-2 text-xs font-medium text-muted";
// Table header component to avoid duplication
function ModelsTableHeader() {
    return (_jsx("thead", { children: _jsxs("tr", { className: "border-border-medium bg-background-secondary/50 border-b", children: [_jsx("th", { className: `${headerCellBase} pl-2 text-left md:pl-3`, children: "Provider" }), _jsx("th", { className: `${headerCellBase} text-left`, children: "Model" }), _jsx("th", { className: `${headerCellBase} w-16 text-right md:w-20`, children: "Context" }), _jsx("th", { className: `${headerCellBase} w-28 text-right md:w-32 md:pr-3`, children: "Actions" })] }) }));
}
export function ModelsSection() {
    const policyState = usePolicy();
    const effectivePolicy = policyState.status.state === "enforced" ? (policyState.policy ?? null) : null;
    const visibleProviders = useMemo(() => getAllowedProvidersForUi(effectivePolicy), [effectivePolicy]);
    const { api } = useAPI();
    const { config, loading, updateModelsOptimistically } = useProvidersConfig();
    const [lastProvider, setLastProvider] = usePersistedState(LAST_CUSTOM_MODEL_PROVIDER_KEY, "");
    const [newModelId, setNewModelId] = useState("");
    const [editing, setEditing] = useState(null);
    const [error, setError] = useState(null);
    const selectableProviders = visibleProviders.filter((provider) => !HIDDEN_PROVIDERS.has(provider));
    const { defaultModel, setDefaultModel, hiddenModels, hideModel, unhideModel } = useModelsFromSettings();
    const gateway = useGateway();
    const { has1MContext, toggle1MContext } = useProviderOptions();
    // Compaction model preference
    const [compactionModel, setCompactionModel] = usePersistedState(PREFERRED_COMPACTION_MODEL_KEY, "", { listener: true });
    const setCompactionModelAndPersist = useCallback((value) => {
        const canonical = migrateGatewayModel(value).trim();
        setCompactionModel(canonical);
        if (!api?.config?.updateModelPreferences) {
            return;
        }
        api.config.updateModelPreferences({ preferredCompactionModel: canonical }).catch(() => {
            // Best-effort only.
        });
    }, [api, setCompactionModel]);
    // All models (including hidden) for the settings dropdowns.
    // PolicyService enforces model access on the backend, but we also filter here so users can't
    // select models that will be denied at send time.
    const allModels = getSuggestedModels(config);
    const selectableModels = effectivePolicy
        ? allModels.filter((model) => isModelAllowedByPolicy(effectivePolicy, model))
        : allModels;
    // Check if a model already exists (for duplicate prevention)
    const modelExists = useCallback((provider, modelId, excludeOriginal) => {
        if (!config)
            return false;
        const currentModels = config[provider]?.models ?? [];
        return currentModels.some((m) => m === modelId && m !== excludeOriginal);
    }, [config]);
    const handleAddModel = useCallback(() => {
        if (!config || !lastProvider || !newModelId.trim())
            return;
        // mux-gateway is a routing layer, not a provider users should add models under.
        if (HIDDEN_PROVIDERS.has(lastProvider)) {
            setError("Mux Gateway models can't be added directly. Enable Gateway per-model instead.");
            return;
        }
        const trimmedModelId = newModelId.trim();
        // Check for duplicates
        if (modelExists(lastProvider, trimmedModelId)) {
            setError(`Model "${trimmedModelId}" already exists for this provider`);
            return;
        }
        if (!api)
            return;
        setError(null);
        // Optimistic update - returns new models array for API call
        const updatedModels = updateModelsOptimistically(lastProvider, (models) => [
            ...models,
            trimmedModelId,
        ]);
        setNewModelId("");
        // Save in background
        void api.providers.setModels({ provider: lastProvider, models: updatedModels });
    }, [api, lastProvider, newModelId, config, modelExists, updateModelsOptimistically]);
    const handleRemoveModel = useCallback((provider, modelId) => {
        if (!config || !api)
            return;
        // Optimistic update - returns new models array for API call
        const updatedModels = updateModelsOptimistically(provider, (models) => models.filter((m) => m !== modelId));
        // Save in background
        void api.providers.setModels({ provider, models: updatedModels });
    }, [api, config, updateModelsOptimistically]);
    const handleStartEdit = useCallback((provider, modelId) => {
        setEditing({ provider, originalModelId: modelId, newModelId: modelId });
        setError(null);
    }, []);
    const handleCancelEdit = useCallback(() => {
        setEditing(null);
        setError(null);
    }, []);
    const handleSaveEdit = useCallback(() => {
        if (!config || !editing || !api)
            return;
        const trimmedModelId = editing.newModelId.trim();
        if (!trimmedModelId) {
            setError("Model ID cannot be empty");
            return;
        }
        // Only validate duplicates if the model ID actually changed
        if (trimmedModelId !== editing.originalModelId) {
            if (modelExists(editing.provider, trimmedModelId)) {
                setError(`Model "${trimmedModelId}" already exists for this provider`);
                return;
            }
        }
        setError(null);
        // Optimistic update - returns new models array for API call
        const updatedModels = updateModelsOptimistically(editing.provider, (models) => models.map((m) => (m === editing.originalModelId ? trimmedModelId : m)));
        setEditing(null);
        // Save in background
        void api.providers.setModels({ provider: editing.provider, models: updatedModels });
    }, [api, editing, config, modelExists, updateModelsOptimistically]);
    // Show loading state while config is being fetched
    if (loading || !config) {
        return (_jsxs("div", { className: "flex items-center justify-center gap-2 py-12", children: [_jsx(Loader2, { className: "text-muted h-5 w-5 animate-spin" }), _jsx("span", { className: "text-muted text-sm", children: "Loading settings..." })] }));
    }
    // Get all custom models across providers (excluding hidden providers like mux-gateway)
    const getCustomModels = () => {
        const models = [];
        for (const [provider, providerConfig] of Object.entries(config)) {
            // Skip hidden providers (mux-gateway models are accessed via the cloud toggle, not listed separately)
            if (HIDDEN_PROVIDERS.has(provider))
                continue;
            if (providerConfig.models) {
                for (const modelId of providerConfig.models) {
                    models.push({ provider, modelId, fullId: `${provider}:${modelId}` });
                }
            }
        }
        return models;
    };
    // Get built-in models from KNOWN_MODELS.
    // Filter by policy so the settings table doesn't list models users can't ever select.
    const builtInModels = Object.values(KNOWN_MODELS)
        .map((model) => ({
        provider: model.provider,
        modelId: model.providerModelId,
        fullId: model.id,
        aliases: model.aliases,
    }))
        .filter((model) => isModelAllowedByPolicy(effectivePolicy, model.fullId));
    const customModels = getCustomModels();
    return (_jsxs("div", { className: "space-y-4", children: [policyState.status.state === "enforced" && (_jsxs("div", { className: "border-border-medium bg-background-secondary/50 text-muted flex items-center gap-2 rounded-md border px-3 py-2 text-xs", children: [_jsx(ShieldCheck, { className: "h-4 w-4", "aria-hidden": true }), _jsx("span", { children: "Your settings are controlled by a policy." })] })), _jsxs("div", { className: "border-border-medium overflow-hidden rounded-md border", children: [_jsx("div", { className: "border-border-medium bg-background-secondary/50 border-b px-2 py-1.5 md:px-3", children: _jsx("span", { className: "text-muted text-xs font-medium", children: "Model Defaults" }) }), _jsxs("div", { className: "divide-border-medium divide-y", children: [_jsxs("div", { className: "flex items-center gap-4 px-2 py-2 md:px-3", children: [_jsxs("div", { className: "w-28 shrink-0 md:w-32", children: [_jsx("div", { className: "text-muted text-xs", children: "Default Model" }), _jsx("div", { className: "text-muted-light text-[10px]", children: "New workspaces" })] }), _jsx("div", { className: "min-w-0 flex-1", children: _jsx(SearchableModelSelect, { value: defaultModel, onChange: setDefaultModel, models: selectableModels, placeholder: "Select model" }) })] }), _jsxs("div", { className: "flex items-center gap-4 px-2 py-2 md:px-3", children: [_jsxs("div", { className: "w-28 shrink-0 md:w-32", children: [_jsx("div", { className: "text-muted text-xs", children: "Compaction Model" }), _jsx("div", { className: "text-muted-light text-[10px]", children: "History summary" })] }), _jsx("div", { className: "min-w-0 flex-1", children: _jsx(SearchableModelSelect, { value: compactionModel, onChange: setCompactionModelAndPersist, models: selectableModels, emptyOption: { value: "", label: "Use workspace model" } }) })] })] })] }), _jsxs("div", { className: "space-y-3", children: [_jsx("div", { className: "text-muted text-xs font-medium tracking-wide uppercase", children: "Custom Models" }), _jsxs("div", { className: "border-border-medium overflow-hidden rounded-md border", children: [_jsxs("div", { className: "border-border-medium bg-background-secondary/50 flex flex-wrap items-center gap-1.5 border-b px-2 py-1.5 md:px-3", children: [_jsxs(Select, { value: lastProvider, onValueChange: setLastProvider, children: [_jsx(SelectTrigger, { className: "bg-background border-border-medium focus:border-accent h-7 w-auto shrink-0 rounded border px-2 text-xs", children: _jsx(SelectValue, { placeholder: "Provider" }) }), _jsx(SelectContent, { children: selectableProviders.map((provider) => (_jsx(SelectItem, { value: provider, children: _jsx(ProviderWithIcon, { provider: provider, displayName: true }) }, provider))) })] }), _jsx("input", { type: "text", value: newModelId, onChange: (e) => setNewModelId(e.target.value), placeholder: "model-id", className: "bg-background border-border-medium focus:border-accent min-w-0 flex-1 rounded border px-2 py-1 font-mono text-xs focus:outline-none", onKeyDown: (e) => {
                                            if (e.key === "Enter")
                                                void handleAddModel();
                                        } }), _jsxs(Button, { type: "button", size: "sm", onClick: handleAddModel, disabled: !lastProvider || !newModelId.trim(), className: "h-7 shrink-0 gap-1 px-2 text-xs", children: [_jsx(Plus, { className: "h-3.5 w-3.5" }), "Add"] })] }), error && !editing && (_jsx("div", { className: "text-error px-2 py-1.5 text-xs md:px-3", children: error }))] }), customModels.length > 0 && (_jsx("div", { className: "border-border-medium overflow-hidden rounded-md border", children: _jsxs("table", { className: "w-full", children: [_jsx(ModelsTableHeader, {}), _jsx("tbody", { children: customModels.map((model) => {
                                        const isModelEditing = editing?.provider === model.provider &&
                                            editing?.originalModelId === model.modelId;
                                        return (_jsx(ModelRow, { provider: model.provider, modelId: model.modelId, fullId: model.fullId, isCustom: true, isDefault: defaultModel === model.fullId, isEditing: isModelEditing, editValue: isModelEditing ? editing.newModelId : undefined, editError: isModelEditing ? error : undefined, saving: false, hasActiveEdit: editing !== null, isGatewayEnabled: gateway.modelUsesGateway(model.fullId), is1MContextEnabled: has1MContext(model.fullId), onSetDefault: () => setDefaultModel(model.fullId), onStartEdit: () => handleStartEdit(model.provider, model.modelId), onSaveEdit: handleSaveEdit, onCancelEdit: handleCancelEdit, onEditChange: (value) => setEditing((prev) => (prev ? { ...prev, newModelId: value } : null)), onRemove: () => handleRemoveModel(model.provider, model.modelId), isHiddenFromSelector: hiddenModels.includes(model.fullId), onToggleVisibility: () => hiddenModels.includes(model.fullId)
                                                ? unhideModel(model.fullId)
                                                : hideModel(model.fullId), onToggleGateway: gateway.canToggleModel(model.fullId)
                                                ? () => gateway.toggleModelGateway(model.fullId)
                                                : undefined, onToggle1MContext: supports1MContext(model.fullId)
                                                ? () => toggle1MContext(model.fullId)
                                                : undefined }, model.fullId));
                                    }) })] }) }))] }), _jsxs("div", { className: "space-y-3", children: [_jsx("div", { className: "text-muted text-xs font-medium tracking-wide uppercase", children: "Built-in Models" }), _jsx("div", { className: "border-border-medium overflow-hidden rounded-md border", children: _jsxs("table", { className: "w-full", children: [_jsx(ModelsTableHeader, {}), _jsx("tbody", { children: builtInModels.map((model) => (_jsx(ModelRow, { provider: model.provider, modelId: model.modelId, fullId: model.fullId, aliases: model.aliases, isCustom: false, isDefault: defaultModel === model.fullId, isEditing: false, isGatewayEnabled: gateway.modelUsesGateway(model.fullId), is1MContextEnabled: has1MContext(model.fullId), onSetDefault: () => setDefaultModel(model.fullId), isHiddenFromSelector: hiddenModels.includes(model.fullId), onToggleVisibility: () => hiddenModels.includes(model.fullId)
                                            ? unhideModel(model.fullId)
                                            : hideModel(model.fullId), onToggleGateway: gateway.canToggleModel(model.fullId)
                                            ? () => gateway.toggleModelGateway(model.fullId)
                                            : undefined, onToggle1MContext: supports1MContext(model.fullId)
                                            ? () => toggle1MContext(model.fullId)
                                            : undefined }, model.fullId))) })] }) })] }), _jsxs("div", { className: "space-y-2", children: [_jsx("div", { className: "text-muted text-xs font-medium tracking-wide uppercase", children: "Quick Shortcuts" }), _jsxs("div", { className: "border-border-medium bg-background-secondary/50 rounded-md border px-3 py-2.5 text-xs leading-relaxed", children: [_jsx("p", { className: "text-foreground mb-1.5 font-medium", children: "Use model aliases as slash commands for one-shot overrides:" }), _jsxs("div", { className: "text-muted space-y-0.5 font-mono", children: [_jsxs("div", { children: [_jsx("span", { className: "text-accent", children: "/sonnet" }), " explain this code", _jsx("span", { className: "text-muted/60 ml-2", children: "\u2014 send one message with Sonnet" })] }), _jsxs("div", { children: [_jsx("span", { className: "text-accent", children: "/opus+high" }), " deep review", _jsx("span", { className: "text-muted/60 ml-2", children: "\u2014 Opus with high thinking" })] }), _jsxs("div", { children: [_jsx("span", { className: "text-accent", children: "/haiku+0" }), " quick answer", _jsx("span", { className: "text-muted/60 ml-2", children: "\u2014 Haiku with thinking off" })] }), _jsxs("div", { children: [_jsx("span", { className: "text-accent", children: "/+2" }), " analyze this", _jsx("span", { className: "text-muted/60 ml-2", children: "\u2014 current model, thinking level 2" })] })] }), _jsx("p", { className: "text-muted mt-1.5", children: "Numeric levels are relative to each model (0=lowest allowed, 1=next, etc.). Named levels: off, low, med, high, max." })] })] })] }));
}
//# sourceMappingURL=ModelsSection.js.map