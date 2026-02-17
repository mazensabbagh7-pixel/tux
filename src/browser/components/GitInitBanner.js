import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useState } from "react";
import { Check, GitBranch, Loader2 } from "lucide-react";
import { useAPI } from "@/browser/contexts/API";
/**
 * Banner prompting user to run git init for non-git directories.
 * Shown on the creation screen when the project is not a git repository.
 */
export function GitInitBanner(props) {
    const { api } = useAPI();
    const [isLoading, setIsLoading] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);
    const [error, setError] = useState(null);
    const handleGitInit = useCallback(async () => {
        if (!api || isLoading || isSuccess)
            return;
        setIsLoading(true);
        setError(null);
        try {
            const result = await api.projects.gitInit({ projectPath: props.projectPath });
            if (result.success) {
                setIsSuccess(true);
                // Brief delay to show success message before reloading
                setTimeout(() => {
                    void props.onSuccess();
                }, 1500);
            }
            else {
                setError(result.error);
            }
        }
        catch (err) {
            setError(err instanceof Error ? err.message : "Failed to initialize git repository");
        }
        finally {
            setIsLoading(false);
        }
    }, [api, isLoading, isSuccess, props]);
    // Success state
    if (isSuccess) {
        return (_jsxs("div", { className: "flex items-center gap-3 rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3", "data-testid": "git-init-banner", children: [_jsx(Check, { className: "h-5 w-5 shrink-0 text-green-500" }), _jsxs("div", { className: "flex flex-1 flex-col gap-0.5", children: [_jsx("span", { className: "text-sm font-medium text-green-500", "data-testid": "git-init-success", children: "Git repository initialized" }), _jsx("span", { className: "text-muted-foreground text-xs", children: "You can now use Worktree and Remote runtimes for isolated workspaces" })] })] }));
    }
    return (_jsxs("div", { className: "bg-bg-dark border-border-medium flex items-center gap-3 rounded-lg border px-4 py-3", "data-testid": "git-init-banner", children: [_jsx(GitBranch, { className: "text-muted-foreground h-5 w-5 shrink-0" }), _jsxs("div", { className: "flex flex-1 flex-col gap-0.5", children: [_jsx("span", { className: "text-foreground text-sm font-medium", children: "This directory is not a git repository" }), _jsxs("span", { className: "text-muted-foreground text-xs", children: ["Run ", _jsx("code", { className: "bg-bg-dark-hover rounded px-1 font-mono", children: "git init" }), " to enable Worktree and Remote runtimes"] }), error && (_jsx("span", { className: "text-xs text-red-500", "data-testid": "git-init-error", children: error }))] }), _jsx("button", { type: "button", onClick: () => void handleGitInit(), disabled: isLoading, className: "bg-accent hover:bg-accent/80 text-accent-foreground inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50", "data-testid": "git-init-button", children: isLoading ? (_jsxs(_Fragment, { children: [_jsx(Loader2, { className: "h-4 w-4 animate-spin" }), "Running..."] })) : ("Run git init") })] }));
}
//# sourceMappingURL=GitInitBanner.js.map