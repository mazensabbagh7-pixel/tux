import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { cn } from "@/common/lib/utils";
import { Loader2 } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "../ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
const CODER_CHECKING_LABEL = "Checking…";
/** Check if a template name exists in multiple organizations (for disambiguation in UI) */
function hasTemplateDuplicateName(template, allTemplates) {
    return allTemplates.some((t) => t.name === template.name && t.organizationName !== template.organizationName);
}
function getCoderOutdatedReason(coderInfo) {
    const cliLabel = coderInfo.binaryPath ?? "Coder CLI";
    return `${cliLabel} ${coderInfo.version} is below minimum v${coderInfo.minVersion}.`;
}
function getCoderUnavailableReason(coderInfo) {
    if (coderInfo.reason === "missing") {
        return "Coder CLI not found. Install to enable.";
    }
    if (coderInfo.reason.kind === "not-logged-in") {
        return coderInfo.reason.message || "CLI not logged in. Run `coder login <url>` first.";
    }
    return `Coder CLI error: ${coderInfo.reason.message}`;
}
export function resolveCoderAvailability(coderInfo) {
    if (coderInfo === null) {
        return { state: "loading", reason: CODER_CHECKING_LABEL, shouldShowRuntimeButton: false };
    }
    if (coderInfo.state === "outdated") {
        return {
            state: "outdated",
            reason: getCoderOutdatedReason(coderInfo),
            shouldShowRuntimeButton: true,
        };
    }
    if (coderInfo.state === "unavailable") {
        const shouldShowRuntimeButton = coderInfo.reason !== "missing" && coderInfo.reason.kind === "not-logged-in";
        return {
            state: "unavailable",
            reason: getCoderUnavailableReason(coderInfo),
            shouldShowRuntimeButton,
        };
    }
    // Only show the runtime button once the CLI is confirmed available (matches devcontainer UX).
    return { state: "available", shouldShowRuntimeButton: true };
}
// Standalone availability messaging used by the Coder runtime UI.
export function CoderAvailabilityMessage(props) {
    const availability = resolveCoderAvailability(props.coderInfo);
    if (availability.state === "loading") {
        return (_jsxs("span", { className: "text-muted flex items-center gap-1 text-xs", children: [_jsx(Loader2, { className: "h-3 w-3 animate-spin" }), CODER_CHECKING_LABEL] }));
    }
    if (availability.state === "outdated") {
        return _jsx("p", { className: "text-xs text-yellow-500", children: availability.reason });
    }
    if (availability.state === "unavailable" && availability.shouldShowRuntimeButton) {
        return _jsx("p", { className: "text-xs text-yellow-500", children: availability.reason });
    }
    return null;
}
export function CoderWorkspaceForm(props) {
    const { coderConfig, onCoderConfigChange, templates, templatesError, presets, presetsError, existingWorkspaces, workspacesError, loadingTemplates, loadingPresets, loadingWorkspaces, disabled, hasError, username, deploymentUrl, } = props;
    const mode = coderConfig?.existingWorkspace ? "existing" : "new";
    const formHasError = Boolean((hasError ?? false) ||
        (mode === "existing" && Boolean(workspacesError)) ||
        (mode === "new" && Boolean(templatesError ?? presetsError)));
    const templateErrorId = templatesError ? "coder-template-error" : undefined;
    const presetErrorId = presetsError ? "coder-preset-error" : undefined;
    const workspaceErrorId = workspacesError ? "coder-workspace-error" : undefined;
    const handleModeChange = (newMode) => {
        if (newMode === "existing") {
            // Switch to existing workspace mode (workspaceName starts empty, user selects)
            onCoderConfigChange({
                workspaceName: undefined,
                existingWorkspace: true,
            });
        }
        else {
            // Switch to new workspace mode (workspaceName omitted; backend derives from branch)
            const firstTemplate = templates[0];
            onCoderConfigChange({
                existingWorkspace: false,
                template: firstTemplate?.name,
                templateOrg: firstTemplate?.organizationName,
            });
        }
    };
    const handleTemplateChange = (value) => {
        if (!coderConfig)
            return;
        // Value is "org/name" when duplicates exist, otherwise just "name"
        const [orgOrName, maybeName] = value.split("/");
        const templateName = maybeName ?? orgOrName;
        // Always resolve the org from the templates list so --org is passed to CLI
        // even when the user belongs to multiple orgs but template names don't collide
        const matchedTemplate = templates.find((t) => t.name === templateName && (maybeName ? t.organizationName === orgOrName : true));
        const templateOrg = maybeName ? orgOrName : matchedTemplate?.organizationName;
        onCoderConfigChange({
            ...coderConfig,
            template: templateName,
            templateOrg,
            preset: undefined, // Reset preset when template changes
        });
        // Presets will be loaded by parent via effect
    };
    const handlePresetChange = (presetName) => {
        if (!coderConfig)
            return;
        onCoderConfigChange({
            ...coderConfig,
            preset: presetName || undefined,
        });
    };
    const handleExistingWorkspaceChange = (workspaceName) => {
        onCoderConfigChange({
            workspaceName,
            existingWorkspace: true,
        });
    };
    // Preset value: hook handles auto-selection, but keep a UI fallback to avoid a brief
    // "Select preset" flash while async preset loading + config update races.
    const defaultPresetName = presets.find((p) => p.isDefault)?.name;
    const effectivePreset = presets.length === 0
        ? undefined
        : presets.length === 1
            ? presets[0]?.name
            : (coderConfig?.preset ?? defaultPresetName ?? presets[0]?.name);
    const templatePlaceholder = templatesError
        ? "Error loading templates"
        : templates.length === 0
            ? "No templates"
            : "Select template...";
    const templateSelectDisabled = disabled || templates.length === 0 || Boolean(templatesError);
    const presetPlaceholder = presetsError
        ? "Error loading presets"
        : presets.length === 0
            ? "No presets"
            : "Select preset...";
    const presetSelectDisabled = disabled || presets.length === 0 || Boolean(presetsError);
    const workspacePlaceholder = workspacesError
        ? "Error loading workspaces"
        : existingWorkspaces.length === 0
            ? "No workspaces found"
            : "Select workspace...";
    const workspaceSelectDisabled = disabled || existingWorkspaces.length === 0 || Boolean(workspacesError);
    const headerBorderClass = formHasError
        ? "border-b border-red-500"
        : "border-b border-border-medium";
    // Only show login context when we can name the user and the deployment they're on.
    const showLoginInfo = Boolean(username && deploymentUrl);
    return (_jsxs("div", { className: cn("flex w-[22rem] flex-col rounded-md border", formHasError ? "border-red-500" : "border-border-medium"), "data-testid": "coder-controls-inner", children: [showLoginInfo && (_jsxs("div", { className: cn("text-muted-foreground px-2 py-1.5 text-xs", headerBorderClass), children: ["Logged in as ", _jsx("span", { className: "text-foreground font-medium", children: username }), " on", " ", _jsx("span", { className: "text-foreground font-medium", children: deploymentUrl })] })), _jsxs("div", { className: "flex", children: [_jsxs("div", { className: "border-border-medium flex flex-col gap-1 border-r p-2 pr-3", role: "group", "aria-label": "Coder workspace mode", "data-testid": "coder-mode-toggle", children: [_jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("button", { type: "button", onClick: () => handleModeChange("new"), disabled: disabled, className: cn("rounded-md border px-2 py-1 text-xs transition-colors", mode === "new"
                                                ? "border-accent bg-accent/20 text-foreground"
                                                : "border-transparent bg-transparent text-muted hover:border-border-medium"), "aria-pressed": mode === "new", children: "New" }) }), _jsx(TooltipContent, { children: "Create a new Coder workspace from a template" })] }), _jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("button", { type: "button", onClick: () => handleModeChange("existing"), disabled: disabled, className: cn("rounded-md border px-2 py-1 text-xs transition-colors", mode === "existing"
                                                ? "border-accent bg-accent/20 text-foreground"
                                                : "border-transparent bg-transparent text-muted hover:border-border-medium"), "aria-pressed": mode === "existing", children: "Existing" }) }), _jsx(TooltipContent, { children: "Connect to an existing Coder workspace" })] })] }), mode === "new" && (_jsxs("div", { className: "flex flex-col gap-1 p-2 pl-3", children: [_jsxs("div", { className: "flex h-7 items-center gap-2", children: [_jsx("label", { className: "text-muted-foreground w-16 text-xs", children: "Template" }), loadingTemplates ? (_jsx(Loader2, { className: "text-muted h-4 w-4 animate-spin" })) : (_jsxs(Select, { value: (() => {
                                            const templateName = coderConfig?.template;
                                            if (!templateName) {
                                                return "";
                                            }
                                            const matchingTemplates = templates.filter((t) => t.name === templateName);
                                            const firstMatch = matchingTemplates[0];
                                            const hasDuplicate = firstMatch && hasTemplateDuplicateName(firstMatch, templates);
                                            if (!hasDuplicate) {
                                                return templateName;
                                            }
                                            const org = coderConfig?.templateOrg ?? firstMatch?.organizationName ?? undefined;
                                            return org ? `${org}/${templateName}` : templateName;
                                        })(), onValueChange: handleTemplateChange, disabled: templateSelectDisabled, children: [_jsx(SelectTrigger, { className: "h-7 w-[180px] text-xs", "data-testid": "coder-template-select", "aria-invalid": Boolean(templatesError) || undefined, "aria-describedby": templateErrorId, children: _jsx(SelectValue, { placeholder: templatePlaceholder }) }), _jsx(SelectContent, { children: templates.map((t) => {
                                                    // Show org name only if there are duplicate template names
                                                    const hasDuplicate = hasTemplateDuplicateName(t, templates);
                                                    // Use org/name as value when duplicates exist for disambiguation
                                                    const itemValue = hasDuplicate ? `${t.organizationName}/${t.name}` : t.name;
                                                    return (_jsxs(SelectItem, { value: itemValue, children: [t.displayName || t.name, hasDuplicate && (_jsxs("span", { className: "text-muted ml-1", children: ["(", t.organizationName, ")"] }))] }, `${t.organizationName}/${t.name}`));
                                                }) })] }))] }), templatesError && (_jsx("p", { id: templateErrorId, role: "alert", className: "text-xs break-all text-red-500", children: templatesError })), _jsxs("div", { className: "flex h-7 items-center gap-2", children: [_jsx("label", { className: "text-muted-foreground w-16 text-xs", children: "Preset" }), loadingPresets ? (_jsx(Loader2, { className: "text-muted h-4 w-4 animate-spin" })) : (_jsxs(Select, { value: effectivePreset ?? "", onValueChange: handlePresetChange, disabled: presetSelectDisabled, children: [_jsx(SelectTrigger, { className: "h-7 w-[180px] text-xs", "data-testid": "coder-preset-select", "aria-invalid": Boolean(presetsError) || undefined, "aria-describedby": presetErrorId, children: _jsx(SelectValue, { placeholder: presetPlaceholder }) }), _jsx(SelectContent, { children: presets.map((p) => (_jsx(SelectItem, { value: p.name, children: p.name }, p.id))) })] }))] }), presetsError && (_jsx("p", { id: presetErrorId, role: "alert", className: "text-xs break-all text-red-500", children: presetsError }))] })), mode === "existing" && (_jsxs("div", { className: "flex w-[17rem] flex-col gap-1 p-2 pl-3", children: [_jsxs("div", { className: "flex min-h-[3.75rem] items-center gap-2", children: [_jsx("label", { className: "text-muted-foreground w-16 text-xs", children: "Workspace" }), loadingWorkspaces ? (_jsx(Loader2, { className: "text-muted h-4 w-4 animate-spin" })) : (_jsxs(Select, { value: coderConfig?.workspaceName ?? "", onValueChange: handleExistingWorkspaceChange, disabled: workspaceSelectDisabled, children: [_jsx(SelectTrigger, { className: "h-7 w-[180px] text-xs", "data-testid": "coder-workspace-select", "aria-invalid": Boolean(workspacesError) || undefined, "aria-describedby": workspaceErrorId, children: _jsx(SelectValue, { placeholder: workspacePlaceholder }) }), _jsx(SelectContent, { children: existingWorkspaces
                                                    .filter((w) => w.status !== "deleted" && w.status !== "deleting")
                                                    .map((w) => (_jsxs(SelectItem, { value: w.name, children: [w.name, _jsxs("span", { className: "text-muted ml-1", children: ["(", w.templateDisplayName, " \u2022 ", w.status, ")"] })] }, w.name))) })] }))] }), workspacesError && (_jsx("p", { id: workspaceErrorId, role: "alert", className: "text-xs break-all text-red-500", children: workspacesError }))] }))] })] }));
}
//# sourceMappingURL=CoderControls.js.map