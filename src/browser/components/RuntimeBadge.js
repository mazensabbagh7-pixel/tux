import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Copy, Check } from "lucide-react";
import { cn } from "@/common/lib/utils";
import { isSSHRuntime, isWorktreeRuntime, isLocalProjectRuntime, isDockerRuntime, isDevcontainerRuntime, } from "@/common/types/runtime";
import { extractSshHostname } from "@/browser/utils/ui/runtimeBadge";
import { Tooltip, TooltipTrigger, TooltipContent } from "./ui/tooltip";
import { useCopyToClipboard } from "@/browser/hooks/useCopyToClipboard";
import { RUNTIME_BADGE_UI } from "@/browser/utils/runtimeUi";
/**
 * Badge to display runtime type information.
 * Shows icon-only badge with tooltip describing the runtime type.
 * - SSH: server icon with hostname (blue theme)
 * - Worktree: git branch icon (purple theme)
 * - Local: folder icon (gray theme)
 *
 * When isWorking=true, badges brighten and pulse within their color scheme.
 */
function TooltipRow({ label, value, copyable, }) {
    const { copied, copyToClipboard } = useCopyToClipboard();
    return (_jsxs("div", { className: "flex items-center gap-1.5", children: [_jsx("span", { className: "text-muted shrink-0 text-xs", children: label }), _jsx("span", { className: "font-mono text-xs whitespace-nowrap", children: value }), copyable && (_jsx("button", { onClick: (e) => {
                    e.stopPropagation();
                    void copyToClipboard(value);
                }, className: "text-muted hover:text-foreground shrink-0", "aria-label": `Copy ${label.toLowerCase()}`, children: copied ? _jsx(Check, { className: "h-3 w-3" }) : _jsx(Copy, { className: "h-3 w-3" }) }))] }));
}
function getRuntimeInfo(runtimeConfig) {
    if (isSSHRuntime(runtimeConfig)) {
        // Coder-backed SSH runtime gets special treatment
        if (runtimeConfig.coder) {
            const coderWorkspaceName = runtimeConfig.coder.workspaceName;
            return {
                type: "coder",
                label: `Coder Workspace: ${coderWorkspaceName ?? runtimeConfig.host}`,
            };
        }
        const hostname = extractSshHostname(runtimeConfig);
        return { type: "ssh", label: `SSH: ${hostname ?? runtimeConfig.host}` };
    }
    if (isWorktreeRuntime(runtimeConfig)) {
        return { type: "worktree", label: "Worktree: isolated git worktree" };
    }
    if (isLocalProjectRuntime(runtimeConfig)) {
        return { type: "local", label: "Local: project directory" };
    }
    if (isDockerRuntime(runtimeConfig)) {
        return { type: "docker", label: `Docker: ${runtimeConfig.image}` };
    }
    if (isDevcontainerRuntime(runtimeConfig)) {
        return {
            type: "devcontainer",
            label: runtimeConfig.configPath
                ? `Dev container: ${runtimeConfig.configPath}`
                : "Dev container",
        };
    }
    return null;
}
export function RuntimeBadge({ runtimeConfig, className, isWorking = false, workspacePath, workspaceName, tooltipSide = "top", }) {
    const info = getRuntimeInfo(runtimeConfig);
    if (!info)
        return null;
    const badgeUi = RUNTIME_BADGE_UI[info.type];
    const styles = isWorking ? badgeUi.badge.workingClass : badgeUi.badge.idleClass;
    const Icon = badgeUi.Icon;
    return (_jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("span", { className: cn("inline-flex items-center rounded px-1 py-0.5 border transition-colors", styles, className), children: _jsx(Icon, {}) }) }), _jsx(TooltipContent, { side: tooltipSide, align: "start", className: "max-w-[500px]", children: _jsxs("div", { className: "flex flex-col gap-1", children: [_jsx("div", { className: "text-xs font-medium", children: info.label }), workspaceName && _jsx(TooltipRow, { label: "Name", value: workspaceName }), workspacePath && _jsx(TooltipRow, { label: "Path", value: workspacePath, copyable: true })] }) })] }));
}
//# sourceMappingURL=RuntimeBadge.js.map