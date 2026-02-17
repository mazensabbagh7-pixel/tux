import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { cn } from "@/common/lib/utils";
import { RUNTIME_MODE } from "@/common/types/runtime";
import { Tooltip, TooltipTrigger, TooltipContent } from "./ui/tooltip";
import { RUNTIME_UI } from "@/browser/utils/runtimeUi";
function RuntimeIconButton(props) {
    const info = RUNTIME_UI[props.mode];
    const stateStyle = props.isSelected ? info.iconButton.activeClass : info.iconButton.idleClass;
    const Icon = info.Icon;
    return (_jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("button", { type: "button", onClick: props.onClick, disabled: props.disabled, className: cn("inline-flex items-center justify-center rounded border p-1 transition-colors", "focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500", stateStyle, props.disabled && "cursor-not-allowed opacity-50"), "aria-label": `${info.label} runtime`, "aria-pressed": props.isSelected, children: _jsx(Icon, {}) }) }), _jsxs(TooltipContent, { align: "center", side: "bottom", className: "pointer-events-auto max-w-80 whitespace-normal", children: [_jsx("strong", { children: info.label }), _jsx("p", { className: "text-muted mt-0.5 text-xs", children: info.description }), props.unavailableReason ? (_jsx("p", { className: "mt-1 text-xs text-yellow-500", children: props.unavailableReason })) : (_jsxs("label", { className: "mt-1.5 flex cursor-pointer items-center gap-1.5 text-xs", children: [_jsx("input", { type: "checkbox", checked: props.isDefault, onChange: () => props.onSetDefault(), className: "accent-accent h-3 w-3" }), _jsx("span", { className: "text-muted", children: "Default for project" })] }))] })] }));
}
/**
 * Runtime selector using icons with tooltips.
 * Shows Local, Worktree, and SSH options as clickable icons.
 * Selected runtime uses "active" styling (brighter colors).
 * Each tooltip has a "Default for project" checkbox to persist the preference.
 */
export function RuntimeIconSelector(props) {
    const modes = [
        RUNTIME_MODE.LOCAL,
        RUNTIME_MODE.WORKTREE,
        RUNTIME_MODE.SSH,
        RUNTIME_MODE.DOCKER,
        RUNTIME_MODE.DEVCONTAINER,
    ];
    const disabledModes = props.disabledModes ?? [];
    return (_jsx("div", { className: cn("inline-flex items-center gap-1", props.className), "data-component": "RuntimeIconSelector", "data-tutorial": "runtime-selector", children: modes.map((mode) => {
            const isModeDisabled = disabledModes.includes(mode);
            return (_jsx(RuntimeIconButton, { mode: mode, isSelected: props.value === mode, isDefault: props.defaultMode === mode, onClick: () => props.onChange(mode), onSetDefault: () => props.onSetDefault(mode), disabled: Boolean(props.disabled) || isModeDisabled, unavailableReason: isModeDisabled ? "Requires git repository" : undefined }, mode));
        }) }));
}
//# sourceMappingURL=RuntimeIconSelector.js.map