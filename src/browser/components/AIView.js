import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/common/lib/utils";
import { ThinkingProvider } from "@/browser/contexts/ThinkingContext";
import { WorkspaceModeAISync } from "@/browser/components/WorkspaceModeAISync";
import { AgentProvider } from "@/browser/contexts/AgentContext";
import { BackgroundBashProvider } from "@/browser/contexts/BackgroundBashContext";
import { WorkspaceShell } from "./WorkspaceShell";
/**
 * Incompatible workspace error display.
 * Shown when a workspace was created with a newer version of mux.
 */
const IncompatibleWorkspaceView = ({ message, className, }) => (_jsx("div", { className: cn("flex h-full w-full flex-col items-center justify-center p-8", className), children: _jsxs("div", { className: "max-w-md text-center", children: [_jsx("div", { className: "mb-4 flex justify-center", children: _jsx(AlertTriangle, { "aria-hidden": "true", className: "text-warning h-10 w-10" }) }), _jsx("h2", { className: "mb-2 text-xl font-semibold text-[var(--color-text-primary)]", children: "Incompatible Workspace" }), _jsx("p", { className: "mb-4 text-[var(--color-text-secondary)]", children: message }), _jsx("p", { className: "text-sm text-[var(--color-text-tertiary)]", children: "You can delete this workspace and create a new one, or upgrade mux to use it." })] }) }));
// Wrapper component that provides the agent and thinking contexts
export const AIView = (props) => {
    // Early return for incompatible workspaces - no hooks called in this path
    if (props.incompatibleRuntime) {
        return (_jsx(IncompatibleWorkspaceView, { message: props.incompatibleRuntime, className: props.className }));
    }
    return (_jsxs(AgentProvider, { workspaceId: props.workspaceId, projectPath: props.projectPath, children: [_jsx(WorkspaceModeAISync, { workspaceId: props.workspaceId }), _jsx(ThinkingProvider, { workspaceId: props.workspaceId, children: _jsx(BackgroundBashProvider, { workspaceId: props.workspaceId, children: _jsx(WorkspaceShell, { ...props }) }) })] }));
};
//# sourceMappingURL=AIView.js.map