import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { AlertTriangle, Check, EyeOff, XCircle } from "lucide-react";
import { cn } from "@/common/lib/utils";
import { SkillIcon } from "@/browser/components/icons/SkillIcon";
import { HoverClickPopover } from "@/browser/components/ui/hover-click-popover";
/** Scope display order and labels */
const SCOPE_CONFIG = [
    { scope: "project", label: "Project" },
    { scope: "global", label: "Global" },
    { scope: "built-in", label: "Built-in" },
];
const SkillsPopoverContent = (props) => {
    const loadedSkillNames = new Set(props.loadedSkills.map((skill) => skill.name));
    const skillsByScope = new Map();
    for (const skill of props.availableSkills) {
        const existing = skillsByScope.get(skill.scope) ?? [];
        existing.push(skill);
        skillsByScope.set(skill.scope, existing);
    }
    const invalidSkillsByScope = new Map();
    for (const issue of props.invalidSkills) {
        const existing = invalidSkillsByScope.get(issue.scope) ?? [];
        existing.push(issue);
        invalidSkillsByScope.set(issue.scope, existing);
    }
    return (_jsxs("div", { className: "flex flex-col gap-3", children: [SCOPE_CONFIG.map(({ scope, label }) => {
                const skills = skillsByScope.get(scope);
                if (!skills || skills.length === 0)
                    return null;
                return (_jsxs("div", { className: "flex flex-col gap-1.5", children: [_jsxs("div", { className: "text-muted-foreground text-[10px] font-medium tracking-wider uppercase", children: [label, " skills"] }), skills.map((skill) => {
                            const isLoaded = loadedSkillNames.has(skill.name);
                            const isUnadvertised = skill.advertise === false;
                            return (_jsxs("div", { className: "flex items-start gap-2", children: [_jsx("div", { className: "bg-muted-foreground/30 mt-1.5 h-1 w-1 shrink-0 rounded-full" }), _jsxs("div", { className: "flex flex-col", children: [_jsxs("span", { className: cn("text-xs font-medium", isLoaded ? "text-foreground" : "text-muted-foreground"), children: [skill.name, isUnadvertised && (_jsx(EyeOff, { className: "text-muted-foreground ml-1 inline h-3 w-3", "aria-label": "Not advertised in system prompt" })), isLoaded && _jsx(Check, { className: "text-success ml-1 inline h-3 w-3" })] }), _jsx("span", { className: "text-muted-foreground text-[11px] leading-snug", children: skill.description })] })] }, skill.name));
                        })] }, scope));
            }), props.invalidSkills.length > 0 && (_jsxs("div", { className: "border-separator-light border-t pt-2", children: [_jsxs("div", { className: "text-danger-soft flex items-center gap-1 text-[10px] font-medium tracking-wider uppercase", children: [_jsx(AlertTriangle, { className: "h-3 w-3" }), "Invalid skills"] }), _jsx("div", { className: "mt-2 flex flex-col gap-3", children: SCOPE_CONFIG.map(({ scope, label }) => {
                            const issues = invalidSkillsByScope.get(scope);
                            if (!issues || issues.length === 0)
                                return null;
                            return (_jsxs("div", { className: "flex flex-col gap-1.5", children: [_jsx("div", { className: "text-muted-foreground text-[10px] font-medium tracking-wider uppercase", children: label }), issues.map((issue) => (_jsxs("div", { className: "flex items-start gap-2", children: [_jsx("div", { className: "bg-muted-foreground/30 mt-1.5 h-1 w-1 shrink-0 rounded-full" }), _jsxs("div", { className: "flex flex-col gap-0.5", children: [_jsx("span", { className: "text-xs font-medium", children: issue.directoryName }), _jsx("span", { className: "text-muted-foreground font-mono text-[10px] break-all", children: issue.displayPath }), _jsx("span", { className: "text-muted-foreground text-[11px] leading-snug", children: issue.message }), issue.hint && (_jsxs("span", { className: "text-muted-foreground text-[11px] leading-snug", children: ["Hint: ", issue.hint] }))] })] }, `${issue.scope}:${issue.directoryName}:${issue.displayPath}`)))] }, `invalid-${scope}`));
                        }) })] })), props.skillLoadErrors.length > 0 && (_jsxs("div", { className: "border-separator-light border-t pt-2", children: [_jsxs("div", { className: "text-danger-soft flex items-center gap-1 text-[10px] font-medium tracking-wider uppercase", children: [_jsx(XCircle, { className: "h-3 w-3" }), "Load errors"] }), _jsx("div", { className: "mt-1.5 flex flex-col gap-1.5", children: props.skillLoadErrors.map((err) => (_jsxs("div", { className: "flex items-start gap-2", children: [_jsx("div", { className: "bg-muted-foreground/30 mt-1.5 h-1 w-1 shrink-0 rounded-full" }), _jsxs("div", { className: "flex flex-col gap-0.5", children: [_jsx("span", { className: "text-xs font-medium", children: err.name }), _jsx("span", { className: "text-muted-foreground text-[11px] leading-snug", children: err.error })] })] }, err.name))) })] }))] }));
};
/**
 * Indicator showing loaded and available skills in a workspace.
 * Displays in the WorkspaceHeader to the right of the notification bell.
 * Hover to preview skills organized by scope (Project, Global, Built-in); click to pin the list open.
 */
export const SkillIndicator = (props) => {
    const loadedCount = props.loadedSkills.length;
    const totalCount = props.availableSkills.length;
    const invalidCount = props.invalidSkills?.length ?? 0;
    const loadErrorCount = props.skillLoadErrors?.length ?? 0;
    const errorCount = invalidCount + loadErrorCount;
    // Don't render if there's nothing to show.
    if (totalCount === 0 && errorCount === 0) {
        return null;
    }
    const ariaLabelParts = [];
    if (totalCount > 0) {
        ariaLabelParts.push(`${loadedCount} of ${totalCount} skill${totalCount === 1 ? "" : "s"} loaded`);
    }
    if (invalidCount > 0) {
        ariaLabelParts.push(`${invalidCount} invalid`);
    }
    if (loadErrorCount > 0) {
        ariaLabelParts.push(`${loadErrorCount} load error${loadErrorCount === 1 ? "" : "s"}`);
    }
    const ariaLabel = ariaLabelParts.join(", ");
    // Hover previews skills; click pins the list open to match the context indicator behavior.
    return (_jsx(HoverClickPopover, { content: _jsx(SkillsPopoverContent, { loadedSkills: props.loadedSkills, availableSkills: props.availableSkills, invalidSkills: props.invalidSkills ?? [], skillLoadErrors: props.skillLoadErrors ?? [] }), side: "bottom", align: "end", sideOffset: 8, contentClassName: cn("bg-modal-bg text-foreground z-[9999] rounded px-[10px] py-[6px]", "text-[11px] font-normal font-sans text-left", "border border-separator-light shadow-[0_2px_8px_rgba(0,0,0,0.4)]", "animate-in fade-in-0 zoom-in-95", "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95", "data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2", "data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2", "max-w-[280px] w-auto min-w-0"), children: _jsx("button", { type: "button", className: cn("relative flex h-6 w-6 shrink-0 items-center justify-center rounded", "text-muted hover:bg-sidebar-hover hover:text-foreground", props.className), "aria-label": ariaLabel, children: _jsxs("span", { className: "relative flex h-6 w-6 items-center justify-center", children: [_jsx(SkillIcon, { className: "h-4.5 w-4.5" }), _jsx("span", { className: cn("absolute -bottom-1 -right-1 flex h-3.5 min-w-3.5 items-center justify-center", "rounded-full border px-0.5 text-[9px] font-medium", errorCount > 0
                            ? "border-danger bg-danger text-on-danger"
                            : "border-border bg-sidebar", errorCount === 0 && (loadedCount > 0 ? "text-foreground" : "text-muted")), children: loadedCount })] }) }) }));
};
//# sourceMappingURL=SkillIndicator.js.map