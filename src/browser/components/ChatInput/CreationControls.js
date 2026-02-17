import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect } from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { RUNTIME_MODE, CODER_RUNTIME_PLACEHOLDER, } from "@/common/types/runtime";
import { resolveDevcontainerSelection, DEFAULT_DEVCONTAINER_CONFIG_PATH, } from "@/browser/utils/devcontainerSelection";
import { Select } from "../Select";
import { Select as RadixSelect, SelectContent, SelectItem, SelectTrigger, SelectValue, } from "../ui/select";
import { Loader2, Wand2, X } from "lucide-react";
import { PlatformPaths } from "@/common/utils/paths";
import { useProjectContext } from "@/browser/contexts/ProjectContext";
import { useWorkspaceContext } from "@/browser/contexts/WorkspaceContext";
import { cn } from "@/common/lib/utils";
import { Tooltip, TooltipTrigger, TooltipContent } from "../ui/tooltip";
import { Skeleton } from "../ui/skeleton";
import { DocsLink } from "../DocsLink";
import { RUNTIME_CHOICE_UI, } from "@/browser/utils/runtimeUi";
import { resolveSectionColor } from "@/common/constants/ui";
import { CoderAvailabilityMessage, CoderWorkspaceForm, resolveCoderAvailability, } from "./CoderControls";
/**
 * Shared styling for inline form controls in the creation UI.
 * Used by both Select and text inputs to ensure visual consistency.
 * Fixed width ensures Select (with chevron) and text inputs render identically.
 */
const INLINE_CONTROL_CLASSES = "h-7 w-[140px] rounded border border-border-medium bg-separator px-2 text-xs text-foreground focus:border-accent focus:outline-none disabled:cursor-not-allowed disabled:opacity-50";
/** Shared runtime config text input - used for SSH host, Docker image, etc. */
function RuntimeConfigInput(props) {
    return (_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("label", { htmlFor: props.id, className: "text-muted-foreground text-xs", children: props.label }), _jsx("input", { id: props.id, "aria-label": props.ariaLabel, type: "text", value: props.value, onChange: (e) => props.onChange(e.target.value), placeholder: props.placeholder, disabled: props.disabled, className: cn(INLINE_CONTROL_CLASSES, props.hasError && "border-red-500") })] }));
}
/** Credential sharing checkbox - used by Docker and Devcontainer runtimes */
function CredentialSharingCheckbox(props) {
    return (_jsxs("label", { className: "flex items-center gap-1.5 text-xs", children: [_jsx("input", { type: "checkbox", checked: props.checked, onChange: (e) => props.onChange(e.target.checked), disabled: props.disabled, className: "accent-accent" }), _jsx("span", { className: "text-muted", children: "Share credentials (SSH, Git)" }), _jsx(DocsLink, { path: props.docsPath })] }));
}
const RUNTIME_CHOICE_ORDER = [
    RUNTIME_MODE.LOCAL,
    RUNTIME_MODE.WORKTREE,
    RUNTIME_MODE.SSH,
    "coder",
    RUNTIME_MODE.DOCKER,
    RUNTIME_MODE.DEVCONTAINER,
];
const RUNTIME_CHOICE_OPTIONS = RUNTIME_CHOICE_ORDER.map((mode) => {
    const ui = RUNTIME_CHOICE_UI[mode];
    return {
        value: mode,
        label: ui.label,
        description: ui.description,
        docsPath: ui.docsPath,
        Icon: ui.Icon,
        activeClass: ui.button.activeClass,
        idleClass: ui.button.idleClass,
    };
});
const resolveRuntimeButtonState = (value, availabilityMap, defaultMode, coderAvailability, allowedModeSet, allowSshHost, allowSshCoder) => {
    const isPolicyAllowed = () => {
        if (!allowedModeSet) {
            return true;
        }
        if (value === "coder") {
            return allowSshCoder;
        }
        if (value === RUNTIME_MODE.SSH) {
            // Host SSH is separate from Coder; block it when policy forbids host SSH.
            return allowSshHost;
        }
        return allowedModeSet.has(value);
    };
    const isPolicyDisabled = !isPolicyAllowed();
    // Coder availability: keep the button disabled with a reason until the CLI is ready.
    if (value === "coder" && coderAvailability.state !== "available") {
        return {
            isModeDisabled: true,
            isPolicyDisabled,
            disabledReason: isPolicyDisabled ? "Disabled by policy" : coderAvailability.reason,
            isDefault: defaultMode === value,
        };
    }
    // Coder is SSH under the hood; all other RuntimeChoice values are RuntimeMode identity.
    const availabilityKey = value === "coder" ? RUNTIME_MODE.SSH : value;
    const availability = availabilityMap?.[availabilityKey];
    // Disable only if availability is explicitly known and unavailable.
    // When availability is undefined (loading or fetch failed), allow selection
    // as fallback - the config picker will validate before creation.
    const isModeDisabled = availability !== undefined && !availability.available;
    const disabledReason = isPolicyDisabled
        ? "Disabled by policy"
        : availability && !availability.available
            ? availability.reason
            : undefined;
    return {
        isModeDisabled,
        isPolicyDisabled,
        disabledReason,
        isDefault: defaultMode === value,
    };
};
function SectionSelectItem(props) {
    const color = resolveSectionColor(props.section.color);
    return (_jsxs(SelectPrimitive.Item, { value: props.section.id, className: "hover:bg-hover focus:bg-hover flex cursor-default items-center gap-2.5 rounded-sm px-3 py-1.5 text-sm font-medium outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50", children: [_jsx("span", { className: "size-2.5 shrink-0 rounded-full", style: { backgroundColor: color } }), _jsx(SelectPrimitive.ItemText, { children: props.section.name })] }));
}
function SectionPicker(props) {
    const { sections, selectedSectionId, onSectionChange, disabled } = props;
    // Radix Select treats `""` as an "unselected" value; normalize any accidental
    // empty-string IDs back to null so the UI stays consistent.
    const normalizedSelectedSectionId = selectedSectionId && selectedSectionId.trim().length > 0 ? selectedSectionId : null;
    const selectedSection = normalizedSelectedSectionId
        ? sections.find((s) => s.id === normalizedSelectedSectionId)
        : null;
    const sectionColor = resolveSectionColor(selectedSection?.color);
    return (_jsxs("div", { className: "relative inline-flex items-center", "data-testid": "section-selector", "data-selected-section": normalizedSelectedSectionId ?? "", children: [_jsxs(RadixSelect, { value: normalizedSelectedSectionId ?? "", onValueChange: (value) => onSectionChange(value.trim() ? value : null), disabled: disabled, children: [_jsxs(SelectTrigger, { className: cn("inline-flex h-auto w-auto items-center gap-2.5 rounded-md border bg-transparent py-1.5 pl-3 text-sm font-medium shadow-none transition-colors focus:ring-0", normalizedSelectedSectionId ? "pr-8" : "pr-3", selectedSection ? "text-foreground" : "text-muted"), style: {
                            borderColor: selectedSection ? sectionColor : "var(--color-border-medium)",
                            borderLeftWidth: selectedSection ? "3px" : "1px",
                            backgroundColor: selectedSection ? `${sectionColor}08` : "transparent",
                        }, children: [_jsx("div", { className: "size-2.5 shrink-0 rounded-full transition-colors", style: {
                                    backgroundColor: selectedSection ? sectionColor : "var(--color-muted)",
                                    opacity: selectedSection ? 1 : 0.4,
                                } }), _jsx("span", { className: "text-muted-foreground shrink-0 text-xs", children: "Section" }), _jsx(SelectValue, { placeholder: "Select..." })] }), _jsx(SelectContent, { className: "border-border-medium", children: sections.map((section) => (_jsx(SectionSelectItem, { section: section }, section.id))) })] }), normalizedSelectedSectionId && (_jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("button", { type: "button", "aria-label": "Clear section selection", disabled: disabled, onClick: (e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                onSectionChange(null);
                            }, className: cn("text-muted hover:text-error absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex size-5 items-center justify-center rounded-sm transition-colors", "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent", "disabled:pointer-events-none disabled:opacity-50"), children: _jsx(X, { className: "h-3 w-3" }) }) }), _jsx(TooltipContent, { children: "Clear section" })] }))] }));
}
function RuntimeButtonGroup(props) {
    const state = props.runtimeAvailabilityState;
    const availabilityMap = state?.status === "loaded" ? state.data : null;
    const coderInfo = props.coderInfo ?? null;
    const coderAvailability = resolveCoderAvailability(coderInfo);
    const allowSshHost = props.allowSshHost ?? true;
    const allowSshCoder = props.allowSshCoder ?? true;
    const allowedModeSet = props.allowedRuntimeModes ? new Set(props.allowedRuntimeModes) : null;
    const isSshModeAllowed = !allowedModeSet || allowedModeSet.has(RUNTIME_MODE.SSH);
    const isDevcontainerMissing = availabilityMap?.devcontainer?.available === false &&
        availabilityMap.devcontainer.reason === "No devcontainer.json found";
    // Hide devcontainer while loading OR when confirmed missing.
    // Only show when availability is loaded and devcontainer is available.
    // This prevents layout flash for projects without devcontainer.json (the common case).
    const hideDevcontainer = state?.status === "loading" || isDevcontainerMissing;
    // Keep Devcontainer visible when policy requires it so the selector doesn't go empty.
    const isDevcontainerOnlyPolicy = allowedModeSet?.size === 1 && allowedModeSet.has(RUNTIME_MODE.DEVCONTAINER);
    const shouldForceShowDevcontainer = props.value === RUNTIME_MODE.DEVCONTAINER ||
        (isDevcontainerOnlyPolicy && isDevcontainerMissing);
    // Match devcontainer UX: only surface Coder once availability is confirmed (no flash),
    // but keep it visible when policy requires it or when already selected to avoid an empty selector.
    const shouldForceShowCoder = props.value === "coder" || (allowSshCoder && !allowSshHost && isSshModeAllowed);
    const shouldShowCoder = coderAvailability.shouldShowRuntimeButton || shouldForceShowCoder;
    const runtimeVisibilityOverrides = {
        [RUNTIME_MODE.DEVCONTAINER]: !hideDevcontainer || shouldForceShowDevcontainer,
        coder: shouldShowCoder,
    };
    // Policy filtering keeps forbidden runtimes out of the selector so users don't
    // get stuck with defaults that can never be created.
    const runtimeOptions = RUNTIME_CHOICE_OPTIONS.filter((option) => {
        if (runtimeVisibilityOverrides[option.value] === false) {
            return false;
        }
        const { isPolicyDisabled } = resolveRuntimeButtonState(option.value, availabilityMap, props.defaultMode, coderAvailability, allowedModeSet, allowSshHost, allowSshCoder);
        if (isPolicyDisabled && props.value !== option.value) {
            return false;
        }
        return true;
    });
    return (_jsx("div", { className: "flex flex-wrap gap-1 ", role: "group", "aria-label": "Runtime type", children: runtimeOptions.map((option) => {
            const isActive = props.value === option.value;
            const { isModeDisabled, isPolicyDisabled, disabledReason, isDefault } = resolveRuntimeButtonState(option.value, availabilityMap, props.defaultMode, coderAvailability, allowedModeSet, allowSshHost, allowSshCoder);
            const isDisabled = Boolean(props.disabled) || isModeDisabled || isPolicyDisabled;
            const showDisabledReason = isModeDisabled || isPolicyDisabled;
            const Icon = option.Icon;
            const handleSetDefault = () => {
                props.onSetDefault(option.value);
            };
            return (_jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsxs("button", { type: "button", onClick: () => props.onChange(option.value), disabled: isDisabled, "aria-pressed": isActive, className: cn("inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-all duration-150", "cursor-pointer", isActive ? option.activeClass : option.idleClass, isDisabled && "cursor-not-allowed opacity-50"), children: [_jsx(Icon, { size: 12 }), option.label] }) }), _jsxs(TooltipContent, { align: "center", side: "bottom", className: "pointer-events-auto whitespace-normal", children: [_jsxs("div", { className: "flex items-baseline justify-between gap-3", children: [_jsx("span", { children: option.description }), _jsx(DocsLink, { path: option.docsPath })] }), showDisabledReason ? (_jsx("p", { className: "mt-1 text-yellow-500", children: disabledReason ?? "Unavailable" })) : (_jsxs("label", { className: "mt-1.5 flex cursor-pointer items-center gap-1.5 text-xs", children: [_jsx("input", { type: "checkbox", checked: isDefault, onChange: handleSetDefault, className: "accent-accent h-3 w-3" }), _jsx("span", { className: "text-muted", children: "Default for project" })] }))] })] }, option.value));
        }) }));
}
/**
 * Prominent controls shown above the input during workspace creation.
 * Displays project name as header, workspace name with magic wand, and runtime/branch selectors.
 */
export function CreationControls(props) {
    const { projects } = useProjectContext();
    const { beginWorkspaceCreation } = useWorkspaceContext();
    const { nameState, runtimeAvailabilityState } = props;
    // Extract mode from discriminated union for convenience
    const runtimeMode = props.selectedRuntime.mode;
    const { selectedRuntime, onSelectedRuntimeChange } = props;
    // Coder is surfaced as a separate runtime option while keeping SSH as the config mode.
    const isCoderSelected = selectedRuntime.mode === RUNTIME_MODE.SSH && selectedRuntime.coder != null;
    const runtimeChoice = isCoderSelected ? "coder" : runtimeMode;
    const coderUsername = props.coderProps?.coderInfo?.state === "available"
        ? props.coderProps.coderInfo.username
        : undefined;
    const coderDeploymentUrl = props.coderProps?.coderInfo?.state === "available" ? props.coderProps.coderInfo.url : undefined;
    // Local runtime doesn't need a trunk branch selector (uses project dir as-is)
    const availabilityMap = runtimeAvailabilityState.status === "loaded" ? runtimeAvailabilityState.data : null;
    const showTrunkBranchSelector = props.branches.length > 0 && runtimeMode !== RUNTIME_MODE.LOCAL;
    // Show loading skeleton while branches are loading to avoid layout flash
    const showBranchLoadingPlaceholder = !props.branchesLoaded && runtimeMode !== RUNTIME_MODE.LOCAL;
    // Centralized devcontainer selection logic
    const devcontainerSelection = resolveDevcontainerSelection({
        selectedRuntime,
        availabilityState: runtimeAvailabilityState,
    });
    const isDevcontainerMissing = availabilityMap?.devcontainer?.available === false &&
        availabilityMap.devcontainer.reason === "No devcontainer.json found";
    // Check if git is required (worktree unavailable due to git or no branches)
    const isNonGitRepo = (availabilityMap?.worktree?.available === false &&
        availabilityMap.worktree.reason === "Requires git repository") ||
        (props.branchesLoaded && props.branches.length === 0);
    // Keep selected runtime aligned with availability constraints
    useEffect(() => {
        if (isNonGitRepo) {
            if (selectedRuntime.mode !== RUNTIME_MODE.LOCAL) {
                onSelectedRuntimeChange({ mode: "local" });
            }
            return;
        }
        if (isDevcontainerMissing && selectedRuntime.mode === RUNTIME_MODE.DEVCONTAINER) {
            onSelectedRuntimeChange({ mode: "worktree" });
        }
    }, [isDevcontainerMissing, isNonGitRepo, selectedRuntime.mode, onSelectedRuntimeChange]);
    const handleNameChange = useCallback((e) => {
        nameState.setName(e.target.value);
    }, [nameState]);
    // Clicking into the input disables auto-generation so user can edit
    const handleInputFocus = useCallback(() => {
        if (nameState.autoGenerate) {
            nameState.setAutoGenerate(false);
        }
    }, [nameState]);
    // Toggle auto-generation via wand button
    const handleWandClick = useCallback(() => {
        nameState.setAutoGenerate(!nameState.autoGenerate);
    }, [nameState]);
    return (_jsxs("div", { className: "mb-3 flex flex-col gap-4", children: [_jsxs("div", { className: "flex items-center gap-y-2", "data-component": "WorkspaceNameGroup", children: [projects.size > 1 ? (_jsxs(RadixSelect, { value: props.projectPath, onValueChange: (path) => beginWorkspaceCreation(path), children: [_jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx(SelectTrigger, { "aria-label": "Select project", "data-testid": "project-selector", className: "text-foreground hover:bg-toggle-bg/70 h-7 w-auto max-w-[280px] shrink-0 border-transparent bg-transparent px-0 text-lg font-semibold shadow-none", children: _jsx(SelectValue, { placeholder: props.projectName }) }) }), _jsx(TooltipContent, { align: "start", children: props.projectPath })] }), _jsx(SelectContent, { children: Array.from(projects.keys()).map((path) => (_jsx(SelectItem, { value: path, children: PlatformPaths.basename(path) }, path))) })] })) : (_jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("h2", { className: "text-foreground shrink-0 text-lg font-semibold", children: props.projectName }) }), _jsx(TooltipContent, { align: "start", children: props.projectPath })] })), _jsx("span", { className: "text-muted-foreground mx-2 text-lg", children: "/" }), _jsxs("div", { className: "flex items-center gap-1", children: [_jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("input", { id: "workspace-name", type: "text", value: nameState.name, onChange: handleNameChange, onFocus: handleInputFocus, placeholder: nameState.isGenerating ? "Generating..." : "workspace-name", disabled: props.disabled, className: cn(`border-border-medium focus:border-accent h-7 rounded-md
                   border border-transparent bg-transparent text-lg font-semibold 
                   field-sizing-content focus:border focus:bg-bg-dark focus:outline-none 
                   disabled:opacity-50 max-w-[50vw] sm:max-w-[40vw] lg:max-w-[30vw]`, nameState.autoGenerate ? "text-muted" : "text-foreground", nameState.error && "border-red-500") }) }), _jsx(TooltipContent, { align: "start", className: "max-w-64", children: "A stable identifier used for git branches, worktree folders, and session directories." })] }), nameState.isGenerating ? (_jsx(Loader2, { className: "text-accent h-3.5 w-3.5 shrink-0 animate-spin" })) : (_jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("button", { type: "button", onClick: handleWandClick, disabled: props.disabled, className: "flex shrink-0 items-center disabled:opacity-50", "aria-label": nameState.autoGenerate ? "Disable auto-naming" : "Enable auto-naming", children: _jsx(Wand2, { className: cn("h-3.5 w-3.5 transition-colors", nameState.autoGenerate
                                                    ? "text-accent"
                                                    : "text-muted-foreground opacity-50 hover:opacity-75") }) }) }), _jsx(TooltipContent, { align: "center", children: nameState.autoGenerate ? "Auto-naming enabled" : "Click to enable auto-naming" })] }))] }), nameState.error && _jsx("span", { className: "text-xs text-red-500", children: nameState.error }), props.sections && props.sections.length > 0 && props.onSectionChange && (_jsxs(_Fragment, { children: [_jsx("div", { className: "flex-1" }), _jsx(SectionPicker, { sections: props.sections, selectedSectionId: props.selectedSectionId ?? null, onSectionChange: props.onSectionChange, disabled: props.disabled })] }))] }), _jsxs("div", { className: "flex flex-col gap-1.5", "data-component": "RuntimeTypeGroup", children: [_jsx("label", { className: "text-muted-foreground text-xs font-medium", children: "Workspace Type" }), _jsxs("div", { className: "flex flex-col gap-2", children: [_jsx(RuntimeButtonGroup, { value: runtimeChoice, onChange: (mode) => {
                                    if (mode === "coder") {
                                        if (!props.coderProps) {
                                            return;
                                        }
                                        // Switch to SSH mode with the last known Coder config so prior selections restore.
                                        onSelectedRuntimeChange({
                                            mode: "ssh",
                                            host: CODER_RUNTIME_PLACEHOLDER,
                                            coder: props.coderConfigFallback,
                                        });
                                        return;
                                    }
                                    // Convert mode to ParsedRuntime with appropriate defaults
                                    switch (mode) {
                                        case RUNTIME_MODE.SSH: {
                                            const sshHost = selectedRuntime.mode === "ssh" &&
                                                selectedRuntime.host !== CODER_RUNTIME_PLACEHOLDER
                                                ? selectedRuntime.host
                                                : props.sshHostFallback;
                                            onSelectedRuntimeChange({
                                                mode: "ssh",
                                                host: sshHost,
                                            });
                                            break;
                                        }
                                        case RUNTIME_MODE.DOCKER:
                                            onSelectedRuntimeChange({
                                                mode: "docker",
                                                image: selectedRuntime.mode === "docker" ? selectedRuntime.image : "",
                                            });
                                            break;
                                        case RUNTIME_MODE.DEVCONTAINER: {
                                            // Use resolver to get initial config path (prefers first available config)
                                            const initialSelection = resolveDevcontainerSelection({
                                                selectedRuntime: { mode: "devcontainer", configPath: "" },
                                                availabilityState: runtimeAvailabilityState,
                                            });
                                            onSelectedRuntimeChange({
                                                mode: "devcontainer",
                                                configPath: selectedRuntime.mode === "devcontainer"
                                                    ? selectedRuntime.configPath
                                                    : initialSelection.configPath,
                                                shareCredentials: selectedRuntime.mode === "devcontainer"
                                                    ? selectedRuntime.shareCredentials
                                                    : false,
                                            });
                                            break;
                                        }
                                        case RUNTIME_MODE.LOCAL:
                                            onSelectedRuntimeChange({ mode: "local" });
                                            break;
                                        case RUNTIME_MODE.WORKTREE:
                                        default:
                                            onSelectedRuntimeChange({ mode: "worktree" });
                                            break;
                                    }
                                }, defaultMode: props.defaultRuntimeMode, onSetDefault: props.onSetDefaultRuntime, disabled: props.disabled, runtimeAvailabilityState: runtimeAvailabilityState, coderInfo: props.coderInfo ?? props.coderProps?.coderInfo ?? null, allowedRuntimeModes: props.allowedRuntimeModes, allowSshHost: props.allowSshHost, allowSshCoder: props.allowSshCoder }), showTrunkBranchSelector && (_jsxs("div", { className: "flex items-center gap-2", "data-component": "TrunkBranchGroup", "data-tutorial": "trunk-branch", children: [_jsx("label", { htmlFor: "trunk-branch", className: "text-muted-foreground text-xs", children: "from" }), _jsx(Select, { id: "trunk-branch", value: props.trunkBranch, options: props.branches, onChange: props.onTrunkBranchChange, disabled: props.disabled, className: INLINE_CONTROL_CLASSES })] })), showBranchLoadingPlaceholder && (_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: "text-muted-foreground text-xs", children: "from" }), _jsx("div", { className: "border-border-medium bg-separator/50 h-7 w-[140px] animate-pulse rounded border" })] })), selectedRuntime.mode === "ssh" &&
                                !isCoderSelected &&
                                (props.allowSshHost ?? true) &&
                                !props.coderProps?.enabled &&
                                // Also hide when Coder is still checking but has saved config (will enable after check)
                                !(props.coderProps?.coderInfo === null && props.coderProps?.coderConfig) && (_jsx(RuntimeConfigInput, { label: "host", value: selectedRuntime.host, onChange: (value) => onSelectedRuntimeChange({ mode: "ssh", host: value }), placeholder: "user@host", disabled: props.disabled, hasError: props.runtimeFieldError === "ssh" })), selectedRuntime.mode === "docker" && (_jsx(RuntimeConfigInput, { label: "image", value: selectedRuntime.image, onChange: (value) => onSelectedRuntimeChange({
                                    mode: "docker",
                                    image: value,
                                    shareCredentials: selectedRuntime.shareCredentials,
                                }), placeholder: "node:20", disabled: props.disabled, hasError: props.runtimeFieldError === "docker", id: "docker-image", ariaLabel: "Docker image" }))] }), props.runtimePolicyError && (
                    // Explain why send is blocked when policy forbids the selected runtime.
                    _jsx("p", { className: "text-xs text-red-500", children: props.runtimePolicyError })), selectedRuntime.mode === "devcontainer" && devcontainerSelection.uiMode !== "hidden" && (_jsxs("div", { className: "border-border-medium flex w-fit flex-col gap-1.5 rounded-md border p-2", children: [_jsxs("div", { className: "flex flex-col gap-1", children: [_jsx("label", { className: "text-muted-foreground text-xs", children: "Config" }), devcontainerSelection.uiMode === "loading" ? (
                                    // Skeleton placeholder while loading - matches dropdown dimensions
                                    _jsx(Skeleton, { className: "h-6 w-[280px] rounded-md" })) : devcontainerSelection.uiMode === "dropdown" ? (_jsxs(RadixSelect, { value: devcontainerSelection.configPath, onValueChange: (value) => onSelectedRuntimeChange({
                                            mode: "devcontainer",
                                            configPath: value,
                                            shareCredentials: selectedRuntime.shareCredentials,
                                        }), disabled: props.disabled, children: [_jsx(SelectTrigger, { className: "h-6 w-[280px] text-xs", "aria-label": "Dev container config", children: _jsx(SelectValue, { placeholder: "Select config" }) }), _jsx(SelectContent, { children: devcontainerSelection.configs.map((config) => (_jsx(SelectItem, { value: config.path, children: config.label }, config.path))) })] })) : (_jsx("input", { type: "text", value: devcontainerSelection.configPath, onChange: (e) => onSelectedRuntimeChange({
                                            mode: "devcontainer",
                                            configPath: e.target.value,
                                            shareCredentials: selectedRuntime.shareCredentials,
                                        }), placeholder: DEFAULT_DEVCONTAINER_CONFIG_PATH, disabled: props.disabled, className: cn("bg-bg-dark text-foreground border-border-medium focus:border-accent h-7 w-[280px] rounded-md border px-2 text-xs focus:outline-none disabled:opacity-50"), "aria-label": "Dev container config path" }))] }), devcontainerSelection.helperText && (_jsx("p", { className: "text-muted-foreground text-xs", children: devcontainerSelection.helperText })), _jsx(CredentialSharingCheckbox, { checked: selectedRuntime.shareCredentials ?? false, onChange: (checked) => onSelectedRuntimeChange({
                                    mode: "devcontainer",
                                    configPath: devcontainerSelection.configPath,
                                    shareCredentials: checked,
                                }), disabled: props.disabled, docsPath: "/runtime/docker#credential-sharing" })] })), selectedRuntime.mode === "docker" && (_jsx(CredentialSharingCheckbox, { checked: selectedRuntime.shareCredentials ?? false, onChange: (checked) => onSelectedRuntimeChange({
                            mode: "docker",
                            image: selectedRuntime.image,
                            shareCredentials: checked,
                        }), disabled: props.disabled, docsPath: "/runtime/docker#credential-sharing" })), isCoderSelected && props.coderProps && (_jsxs("div", { className: "flex flex-col gap-1.5", "data-testid": "coder-controls", children: [_jsx(CoderAvailabilityMessage, { coderInfo: props.coderProps.coderInfo }), props.coderProps.enabled && (_jsx(_Fragment, { children: _jsx(CoderWorkspaceForm, { coderConfig: props.coderProps.coderConfig, username: coderUsername, deploymentUrl: coderDeploymentUrl, onCoderConfigChange: props.coderProps.onCoderConfigChange, templates: props.coderProps.templates, templatesError: props.coderProps.templatesError, presets: props.coderProps.presets, presetsError: props.coderProps.presetsError, existingWorkspaces: props.coderProps.existingWorkspaces, workspacesError: props.coderProps.workspacesError, loadingTemplates: props.coderProps.loadingTemplates, loadingPresets: props.coderProps.loadingPresets, loadingWorkspaces: props.coderProps.loadingWorkspaces, disabled: props.disabled, hasError: props.runtimeFieldError === "ssh" }) }))] }))] })] }));
}
//# sourceMappingURL=CreationControls.js.map