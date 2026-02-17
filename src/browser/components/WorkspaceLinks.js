import { jsx as _jsx } from "react/jsx-runtime";
/**
 * Component to display the PR badge in the workspace header.
 * PR is detected from the workspace's current branch via `gh pr view`.
 */
import { useWorkspacePR } from "@/browser/stores/PRStatusStore";
import { PRLinkBadge } from "./PRLinkBadge";
export function WorkspaceLinks({ workspaceId }) {
    const workspacePR = useWorkspacePR(workspaceId);
    if (!workspacePR) {
        return null;
    }
    return _jsx(PRLinkBadge, { prLink: workspacePR });
}
//# sourceMappingURL=WorkspaceLinks.js.map