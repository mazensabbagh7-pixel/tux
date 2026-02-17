import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React from "react";
import { Loader2, Plus, Server } from "lucide-react";
import { useAPI } from "@/browser/contexts/API";
import { useSettings } from "@/browser/contexts/SettingsContext";
import { Button } from "@/browser/components/ui/button";
import { getMCPServersKey } from "@/common/constants/storage";
import { readPersistedState, updatePersistedState } from "@/browser/hooks/usePersistedState";
export const ProjectMCPOverview = (props) => {
    const projectPath = props.projectPath;
    const { api } = useAPI();
    const settings = useSettings();
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState(null);
    // Initialize from localStorage cache to avoid flash
    const [servers, setServers] = React.useState(() => readPersistedState(getMCPServersKey(projectPath), {}));
    React.useEffect(() => {
        if (!api || settings.isOpen)
            return;
        let cancelled = false;
        setLoading(true);
        api.mcp
            .list({ projectPath })
            .then((result) => {
            if (cancelled)
                return;
            const newServers = result ?? {};
            setServers(newServers);
            // Cache for next load
            updatePersistedState(getMCPServersKey(projectPath), newServers);
            setError(null);
        })
            .catch((err) => {
            if (cancelled)
                return;
            setServers({});
            setError(err instanceof Error ? err.message : "Failed to load MCP servers");
        })
            .finally(() => {
            if (!cancelled) {
                setLoading(false);
            }
        });
        return () => {
            cancelled = true;
        };
    }, [api, projectPath, settings.isOpen]);
    const enabledServerNames = Object.entries(servers)
        .filter(([, info]) => !info.disabled)
        .map(([name]) => name)
        .sort((a, b) => a.localeCompare(b));
    const shownServerNames = enabledServerNames.slice(0, 3);
    const remainingCount = enabledServerNames.length - shownServerNames.length;
    return (_jsx("div", { className: "border-border rounded-lg border", children: _jsxs("div", { className: "flex items-start gap-3 px-4 py-3", children: [_jsx(Server, { className: "text-muted mt-0.5 h-4 w-4" }), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsxs("span", { className: "text-foreground font-medium", children: ["MCP Servers (", enabledServerNames.length, " enabled)"] }), loading && _jsx(Loader2, { className: "text-muted h-4 w-4 animate-spin" })] }), error ? (_jsx("div", { className: "text-error mt-1 text-xs", children: error })) : enabledServerNames.length === 0 ? (_jsx("div", { className: "text-muted mt-1 text-xs", children: "No MCP servers enabled for this project." })) : (_jsxs("div", { className: "text-muted mt-1 text-xs", children: [shownServerNames.join(", "), remainingCount > 0 && _jsxs("span", { className: "text-muted/60", children: [" +", remainingCount, " more"] })] }))] }), _jsxs(Button, { type: "button", variant: "secondary", size: "sm", className: "shrink-0", onClick: () => settings.open("mcp"), children: [_jsx(Plus, {}), "Add MCP server"] })] }) }));
};
//# sourceMappingURL=ProjectMCPOverview.js.map