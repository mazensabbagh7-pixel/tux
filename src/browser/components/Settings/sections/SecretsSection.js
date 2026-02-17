import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React, { useCallback, useEffect, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { useAPI } from "@/browser/contexts/API";
import { useProjectContext } from "@/browser/contexts/ProjectContext";
import { Button } from "@/browser/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/browser/components/ui/toggle-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, } from "@/browser/components/ui/select";
// Visibility toggle icon component
const ToggleVisibilityIcon = (props) => {
    if (props.visible) {
        // Eye-off icon (with slash) - password is visible
        return (_jsxs("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("path", { d: "M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" }), _jsx("line", { x1: "1", y1: "1", x2: "23", y2: "23" })] }));
    }
    // Eye icon - password is hidden
    return (_jsxs("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("path", { d: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" }), _jsx("circle", { cx: "12", cy: "12", r: "3" })] }));
};
function isSecretReferenceValue(value) {
    return (typeof value === "object" &&
        value !== null &&
        "secret" in value &&
        typeof value.secret === "string");
}
function secretValuesEqual(a, b) {
    if (typeof a === "string" && typeof b === "string") {
        return a === b;
    }
    if (isSecretReferenceValue(a) && isSecretReferenceValue(b)) {
        return a.secret === b.secret;
    }
    return false;
}
function secretValueIsNonEmpty(value) {
    if (typeof value === "string") {
        return value.trim() !== "";
    }
    if (isSecretReferenceValue(value)) {
        return value.secret.trim() !== "";
    }
    return false;
}
function secretsEqual(a, b) {
    if (a.length !== b.length)
        return false;
    for (let i = 0; i < a.length; i++) {
        const left = a[i];
        const right = b[i];
        if (!left || !right)
            return false;
        if (left.key !== right.key)
            return false;
        if (!secretValuesEqual(left.value, right.value))
            return false;
    }
    return true;
}
export const SecretsSection = () => {
    const { api } = useAPI();
    const { projects } = useProjectContext();
    const projectList = Array.from(projects.keys());
    const [scope, setScope] = useState("global");
    const [selectedProject, setSelectedProject] = useState("");
    const [loadedSecrets, setLoadedSecrets] = useState([]);
    const [secrets, setSecrets] = useState([]);
    const [visibleSecrets, setVisibleSecrets] = useState(() => new Set());
    const [globalSecretKeys, setGlobalSecretKeys] = useState([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const scopeLabel = scope === "global" ? "Global" : "Project";
    // Default to the first project when switching into Project scope.
    useEffect(() => {
        if (scope !== "project") {
            return;
        }
        if (selectedProject && projectList.includes(selectedProject)) {
            return;
        }
        setSelectedProject(projectList[0] ?? "");
    }, [projectList, scope, selectedProject]);
    const currentProjectPath = scope === "project" ? selectedProject : undefined;
    const isDirty = !secretsEqual(secrets, loadedSecrets);
    const sortedGlobalSecretKeys = globalSecretKeys
        .slice()
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
    const loadSecrets = useCallback(async () => {
        if (!api) {
            setLoadedSecrets([]);
            setSecrets([]);
            setVisibleSecrets(new Set());
            setError(null);
            return;
        }
        if (scope === "project" && !currentProjectPath) {
            setLoadedSecrets([]);
            setSecrets([]);
            setVisibleSecrets(new Set());
            setError(null);
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const nextSecrets = await api.secrets.get(scope === "project" ? { projectPath: currentProjectPath } : {});
            setLoadedSecrets(nextSecrets);
            setSecrets(nextSecrets);
            setVisibleSecrets(new Set());
        }
        catch (err) {
            const message = err instanceof Error ? err.message : "Failed to load secrets";
            setLoadedSecrets([]);
            setSecrets([]);
            setVisibleSecrets(new Set());
            setError(message);
        }
        finally {
            setLoading(false);
        }
    }, [api, currentProjectPath, scope]);
    useEffect(() => {
        void loadSecrets();
    }, [loadSecrets]);
    // Load global secret keys (used for {secret:"KEY"} project secret values).
    useEffect(() => {
        if (!api) {
            setGlobalSecretKeys([]);
            return;
        }
        let cancelled = false;
        (async () => {
            try {
                const secrets = await api.secrets.get({});
                if (cancelled)
                    return;
                setGlobalSecretKeys(secrets.map((s) => s.key));
            }
            catch (err) {
                if (cancelled)
                    return;
                console.error("Failed to load global secrets:", err);
                setGlobalSecretKeys([]);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [api]);
    const addSecret = useCallback(() => {
        setSecrets((prev) => [...prev, { key: "", value: "" }]);
    }, []);
    const removeSecret = useCallback((index) => {
        setSecrets((prev) => prev.filter((_, i) => i !== index));
        // Keep visibility state aligned with the remaining rows.
        //
        // Visibility is tracked by array index; deleting a row shifts later indices.
        // If we don't shift the visibility set too, we can end up revealing a different secret.
        setVisibleSecrets((prev) => {
            const next = new Set();
            for (const visibleIndex of prev) {
                if (visibleIndex === index) {
                    continue;
                }
                next.add(visibleIndex > index ? visibleIndex - 1 : visibleIndex);
            }
            return next;
        });
    }, []);
    const updateSecretKey = useCallback((index, value) => {
        setSecrets((prev) => {
            const next = [...prev];
            const existing = next[index] ?? { key: "", value: "" };
            // Auto-capitalize key field for env variable convention.
            next[index] = { ...existing, key: value.toUpperCase() };
            return next;
        });
    }, []);
    const updateSecretValue = useCallback((index, value) => {
        setSecrets((prev) => {
            const next = [...prev];
            const existing = next[index] ?? { key: "", value: "" };
            next[index] = { ...existing, value };
            return next;
        });
    }, []);
    const updateSecretValueKind = useCallback((index, kind) => {
        setSecrets((prev) => {
            const next = [...prev];
            const existing = next[index] ?? { key: "", value: "" };
            if (kind === "literal") {
                next[index] = {
                    ...existing,
                    value: typeof existing.value === "string" ? existing.value : "",
                };
                return next;
            }
            if (isSecretReferenceValue(existing.value)) {
                return next;
            }
            const defaultKey = globalSecretKeys[0] ?? "";
            next[index] = {
                ...existing,
                value: { secret: defaultKey },
            };
            return next;
        });
    }, [globalSecretKeys]);
    const toggleVisibility = useCallback((index) => {
        setVisibleSecrets((prev) => {
            const next = new Set(prev);
            if (next.has(index)) {
                next.delete(index);
            }
            else {
                next.add(index);
            }
            return next;
        });
    }, []);
    const handleReset = useCallback(() => {
        setSecrets(loadedSecrets);
        setVisibleSecrets(new Set());
        setError(null);
    }, [loadedSecrets]);
    const handleSave = useCallback(async () => {
        if (!api)
            return;
        if (scope === "project" && !currentProjectPath) {
            setError("Select a project to save project secrets.");
            return;
        }
        setSaving(true);
        setError(null);
        try {
            // Filter out empty rows.
            const validSecrets = secrets.filter((s) => s.key.trim() !== "" && secretValueIsNonEmpty(s.value));
            const result = await api.secrets.update(scope === "project"
                ? { projectPath: currentProjectPath, secrets: validSecrets }
                : { secrets: validSecrets });
            if (!result.success) {
                setError(result.error ?? "Failed to save secrets");
                return;
            }
            setLoadedSecrets(validSecrets);
            setSecrets(validSecrets);
            if (scope === "global") {
                setGlobalSecretKeys(validSecrets.map((s) => s.key));
            }
            setVisibleSecrets(new Set());
        }
        catch (err) {
            setError(err instanceof Error ? err.message : "Failed to save secrets");
        }
        finally {
            setSaving(false);
        }
    }, [api, currentProjectPath, scope, secrets]);
    return (_jsxs("div", { className: "space-y-6", children: [_jsxs("div", { className: "flex items-start justify-between gap-4", children: [_jsxs("div", { children: [_jsxs("p", { className: "text-muted text-xs", children: ["Secrets are stored in ", _jsx("code", { className: "text-accent", children: "~/.mux/secrets.json" }), " (kept out of source control)."] }), _jsxs("p", { className: "text-muted mt-1 text-xs", children: ["Scope: ", _jsx("span", { className: "text-foreground", children: scopeLabel })] }), _jsx("p", { className: "text-muted mt-1 text-xs", children: "Global secrets are shared storage only; they are not injected by default." }), _jsx("p", { className: "text-muted mt-1 text-xs", children: "Project secrets control injection. Use Type: Global to reference a global value." })] }), _jsxs(ToggleGroup, { type: "single", value: scope, onValueChange: (value) => {
                            if (value !== "global" && value !== "project") {
                                return;
                            }
                            setScope(value);
                        }, size: "sm", className: "h-9", disabled: saving, children: [_jsx(ToggleGroupItem, { value: "global", size: "sm", className: "h-7 px-3 text-[13px]", children: "Global" }), _jsx(ToggleGroupItem, { value: "project", size: "sm", className: "h-7 px-3 text-[13px]", children: "Project" })] })] }), scope === "project" && (_jsxs("div", { className: "flex items-center justify-between", children: [_jsxs("div", { children: [_jsx("div", { className: "text-foreground text-sm", children: "Project" }), _jsx("div", { className: "text-muted text-xs", children: "Select a project to configure" })] }), _jsxs(Select, { value: selectedProject, onValueChange: setSelectedProject, children: [_jsx(SelectTrigger, { className: "border-border-medium bg-background-secondary hover:bg-hover h-9 w-auto min-w-[160px] cursor-pointer rounded-md border px-3 text-sm transition-colors", "aria-label": "Project", children: _jsx(SelectValue, { placeholder: "Select project" }) }), _jsx(SelectContent, { children: projectList.map((path) => (_jsx(SelectItem, { value: path, children: path.split(/[\\/]/).pop() ?? path }, path))) })] })] })), error && (_jsx("div", { className: "bg-destructive/10 text-destructive flex items-center gap-2 rounded-md px-3 py-2 text-sm", children: error })), loading ? (_jsxs("div", { className: "text-muted flex items-center gap-2 py-4 text-sm", children: [_jsx(Loader2, { className: "h-4 w-4 animate-spin" }), "Loading secrets\u2026"] })) : scope === "project" && !currentProjectPath ? (_jsx("div", { className: "text-muted py-2 text-sm", children: "No projects configured. Add a project first to manage project secrets." })) : secrets.length === 0 ? (_jsx("div", { className: "text-muted border-border-medium rounded-md border border-dashed px-3 py-3 text-center text-xs", children: "No secrets configured" })) : (_jsxs("div", { className: `[&>label]:text-muted grid ${scope === "project"
                    ? "grid-cols-[1fr_auto_1fr_auto_auto]"
                    : "grid-cols-[1fr_1fr_auto_auto]"} items-end gap-1 [&>label]:mb-0.5 [&>label]:text-[11px]`, children: [_jsx("label", { children: "Key" }), scope === "project" && _jsx("label", { children: "Type" }), _jsx("label", { children: "Value" }), _jsx("div", {}), _jsx("div", {}), secrets.map((secret, index) => {
                        const isReference = scope === "project" && isSecretReferenceValue(secret.value);
                        const kind = isReference ? "global" : "literal";
                        const referencedKey = isSecretReferenceValue(secret.value) ? secret.value.secret : "";
                        const availableKeys = referencedKey && !sortedGlobalSecretKeys.includes(referencedKey)
                            ? [referencedKey, ...sortedGlobalSecretKeys]
                            : sortedGlobalSecretKeys;
                        return (_jsxs(React.Fragment, { children: [_jsx("input", { type: "text", value: secret.key, onChange: (e) => updateSecretKey(index, e.target.value), placeholder: "SECRET_NAME", "aria-label": "Secret key", disabled: saving, spellCheck: false, className: "bg-modal-bg border-border-medium focus:border-accent placeholder:text-dim text-foreground w-full rounded border px-2.5 py-1.5 font-mono text-[13px] focus:outline-none disabled:opacity-50" }), scope === "project" && (_jsxs(ToggleGroup, { type: "single", value: kind, onValueChange: (value) => {
                                        if (value !== "literal" && value !== "global") {
                                            return;
                                        }
                                        updateSecretValueKind(index, value);
                                    }, size: "sm", className: "h-[34px]", disabled: saving, children: [_jsx(ToggleGroupItem, { value: "literal", size: "sm", className: "h-[26px] px-3 text-[13px]", children: "Value" }), _jsx(ToggleGroupItem, { value: "global", size: "sm", className: "h-[26px] px-3 text-[13px]", disabled: availableKeys.length === 0, children: "Global" })] })), isReference ? (_jsxs(Select, { value: referencedKey || undefined, onValueChange: (value) => updateSecretValue(index, { secret: value }), disabled: saving, children: [_jsx(SelectTrigger, { className: "border-border-medium bg-modal-bg hover:bg-hover h-[34px] w-full px-2.5 font-mono text-[13px]", "aria-label": "Global secret key", children: _jsx(SelectValue, { placeholder: "Select global secret" }) }), _jsx(SelectContent, { children: availableKeys.map((key) => (_jsx(SelectItem, { value: key, children: key }, key))) })] })) : (_jsx("input", { type: visibleSecrets.has(index) ? "text" : "password", value: typeof secret.value === "string"
                                        ? secret.value
                                        : isSecretReferenceValue(secret.value)
                                            ? secret.value.secret
                                            : "", onChange: (e) => updateSecretValue(index, e.target.value), placeholder: "secret value", "aria-label": "Secret value", disabled: saving, spellCheck: false, className: "bg-modal-bg border-border-medium focus:border-accent placeholder:text-dim text-foreground w-full rounded border px-2.5 py-1.5 font-mono text-[13px] focus:outline-none disabled:opacity-50" })), isReference ? (_jsx("div", {})) : (_jsx("button", { type: "button", onClick: () => toggleVisibility(index), disabled: saving, className: "text-muted hover:text-foreground flex cursor-pointer items-center justify-center self-center rounded-sm border-none bg-transparent px-1 py-0.5 text-base transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50", "aria-label": visibleSecrets.has(index) ? "Hide secret" : "Show secret", children: _jsx(ToggleVisibilityIcon, { visible: visibleSecrets.has(index) }) })), _jsx("button", { type: "button", onClick: () => removeSecret(index), disabled: saving, className: "text-danger-light border-danger-light hover:bg-danger-light/10 cursor-pointer rounded border bg-transparent px-2.5 py-1.5 text-[13px] transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50", "aria-label": "Remove secret", children: _jsx(Trash2, { className: "h-4 w-4" }) })] }, index));
                    })] })), _jsx("button", { onClick: addSecret, disabled: saving || (scope === "project" && !currentProjectPath), className: "text-muted border-border-medium hover:bg-hover hover:border-border-darker hover:text-foreground w-full cursor-pointer rounded border border-dashed bg-transparent px-3 py-2 text-[13px] transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50", children: "+ Add Secret" }), _jsxs("div", { className: "flex items-center justify-end gap-2", children: [_jsx(Button, { variant: "secondary", type: "button", onClick: handleReset, disabled: !isDirty || saving || loading, children: "Reset" }), _jsx(Button, { type: "button", onClick: () => void handleSave(), disabled: !isDirty || saving || loading, children: saving ? "Saving..." : "Save" })] })] }));
};
//# sourceMappingURL=SecretsSection.js.map