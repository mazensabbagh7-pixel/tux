import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useWorkspaceSidebarState } from "@/browser/stores/WorkspaceStore";
import { ModelDisplay } from "@/browser/components/Messages/ModelDisplay";
import { EmojiIcon } from "@/browser/components/icons/EmojiIcon";
import { CircleHelp, ExternalLinkIcon, Loader2, AlertTriangle, Check } from "lucide-react";
import { memo } from "react";
import { Tooltip, TooltipTrigger, TooltipContent } from "./ui/tooltip";
import { Button } from "./ui/button";
export const WorkspaceStatusIndicator = memo(({ workspaceId, fallbackModel, isCreating, hasError, isCompleted }) => {
    const { canInterrupt, isStarting, awaitingUserQuestion, currentModel, agentStatus } = useWorkspaceSidebarState(workspaceId);
    // Show prompt when ask_user_question is pending - make it prominent
    if (awaitingUserQuestion) {
        return (_jsxs("div", { className: "text-muted flex min-w-0 items-center gap-1.5 text-xs", children: [_jsx(CircleHelp, { "aria-hidden": "true", className: "h-3 w-3 shrink-0" }), _jsx("span", { className: "min-w-0 truncate", children: "Mux has a few questions" })] }));
    }
    if (agentStatus) {
        return (_jsxs("div", { className: "text-muted flex min-w-0 items-center gap-1.5 text-xs", children: [agentStatus.emoji && _jsx(EmojiIcon, { emoji: agentStatus.emoji, className: "h-3 w-3 shrink-0" }), _jsx("span", { className: "min-w-0 truncate", children: agentStatus.message }), agentStatus.url && (_jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx(Button, { variant: "ghost", size: "icon", className: "flex h-4 w-4 shrink-0 items-center justify-center [&_svg]:size-3", children: _jsx("a", { href: agentStatus.url, target: "_blank", rel: "noopener noreferrer", children: _jsx(ExternalLinkIcon, {}) }) }) }), _jsx(TooltipContent, { align: "center", children: agentStatus.url })] }))] }));
    }
    // Show error state
    if (hasError) {
        return (_jsxs("div", { className: "text-red-400 flex min-w-0 items-center gap-1.5 text-xs", children: [_jsx(AlertTriangle, { "aria-hidden": "true", className: "h-3 w-3 shrink-0" }), _jsx("span", { className: "min-w-0 truncate", children: "Error encountered" })] }));
    }
    // Show completed state with checkmark
    if (isCompleted && !canInterrupt && !isStarting && !isCreating && !awaitingUserQuestion && !agentStatus) {
        return (_jsxs("div", { className: "text-muted flex min-w-0 items-center gap-1.5 text-xs", children: [_jsx(Check, { "aria-hidden": "true", className: "h-3 w-3 shrink-0" }), _jsx("span", { className: "min-w-0 truncate", children: "Completed" })] }));
    }
    const phase = canInterrupt
        ? "streaming"
        : isStarting || isCreating
            ? "starting"
            : null;
    if (!phase) {
        return null;
    }
    const modelToShow = canInterrupt ? (currentModel ?? fallbackModel) : fallbackModel;
    const suffix = phase === "starting" ? "- starting..." : "- streaming...";
    return (_jsxs("div", { className: "text-muted flex min-w-0 items-center gap-1.5 text-xs", children: [phase === "starting" && (_jsx(Loader2, { "aria-hidden": "true", className: "h-3 w-3 shrink-0 animate-spin opacity-70" })), modelToShow ? (_jsxs(_Fragment, { children: [_jsx("span", { className: "min-w-0 truncate", children: _jsx(ModelDisplay, { modelString: modelToShow, showTooltip: false }) }), _jsx("span", { className: "shrink-0 opacity-70", children: suffix })] })) : (_jsx("span", { className: "min-w-0 truncate", children: phase === "starting" ? "Assistant - starting..." : "Assistant - streaming..." }))] }));
});
WorkspaceStatusIndicator.displayName = "WorkspaceStatusIndicator";
//# sourceMappingURL=WorkspaceStatusIndicator.js.map