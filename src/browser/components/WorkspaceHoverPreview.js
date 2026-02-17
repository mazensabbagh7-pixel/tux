import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { cn } from "@/common/lib/utils";
import { RuntimeBadge } from "./RuntimeBadge";
import { BranchSelector } from "./BranchSelector";
import { WorkspaceLinks } from "./WorkspaceLinks";
/**
 * Dense workspace info preview for hover cards.
 * Shows runtime badge, project name, branch selector, git status, and PR link.
 */
export function WorkspaceHoverPreview({ workspaceId, projectName, workspaceName, namedWorkspacePath, runtimeConfig, isWorking, className, }) {
    return (_jsxs("div", { className: cn("flex min-w-0 items-center gap-2 text-[11px]", className), children: [_jsx(RuntimeBadge, { runtimeConfig: runtimeConfig, isWorking: isWorking, workspacePath: namedWorkspacePath, workspaceName: workspaceName, tooltipSide: "bottom" }), _jsx("span", { className: "min-w-0 truncate font-mono text-[11px]", children: projectName }), _jsxs("div", { className: "flex items-center gap-1", children: [_jsx(BranchSelector, { workspaceId: workspaceId, workspaceName: workspaceName }), _jsx(WorkspaceLinks, { workspaceId: workspaceId })] })] }));
}
//# sourceMappingURL=WorkspaceHoverPreview.js.map