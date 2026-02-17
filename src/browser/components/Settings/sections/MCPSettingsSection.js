import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePolicy } from "@/browser/contexts/PolicyContext";
import { useAPI } from "@/browser/contexts/API";
import { Trash2, Play, Loader2, CheckCircle, XCircle, Plus, Pencil, Check, X, LogIn, ChevronDown, ChevronRight, } from "lucide-react";
import { Button } from "@/browser/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, } from "@/browser/components/ui/select";
import { createEditKeyHandler } from "@/browser/utils/ui/keybinds";
import { Switch } from "@/browser/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/browser/components/ui/tooltip";
import { cn } from "@/common/lib/utils";
import { formatRelativeTime } from "@/browser/utils/ui/dateTime";
import { useMCPTestCache } from "@/browser/hooks/useMCPTestCache";
import { MCPHeadersEditor } from "@/browser/components/MCPHeadersEditor";
import { mcpHeaderRowsToRecord, mcpHeadersRecordToRows, } from "@/browser/utils/mcpHeaders";
import { ToolSelector } from "@/browser/components/ToolSelector";
import { KebabMenu } from "@/browser/components/KebabMenu";
/** Component for managing tool allowlist for a single MCP server */
const ToolAllowlistSection = ({ serverName, availableTools, currentAllowlist, testedAt }) => {
    const { api } = useAPI();
    const [expanded, setExpanded] = useState(false);
    const [saving, setSaving] = useState(false);
    // Always use an array internally - undefined from props means all tools allowed
    const [localAllowlist, setLocalAllowlist] = useState(() => currentAllowlist ?? [...availableTools]);
    // Sync local state when prop changes
    useEffect(() => {
        setLocalAllowlist(currentAllowlist ?? [...availableTools]);
    }, [currentAllowlist, availableTools]);
    const allAllowed = localAllowlist.length === availableTools.length;
    const allDisabled = localAllowlist.length === 0;
    const handleToggleTool = useCallback(async (toolName, allowed) => {
        if (!api)
            return;
        const newAllowlist = allowed
            ? [...localAllowlist, toolName]
            : localAllowlist.filter((t) => t !== toolName);
        // Optimistic update
        setLocalAllowlist(newAllowlist);
        setSaving(true);
        try {
            const result = await api.mcp.setToolAllowlist({
                name: serverName,
                toolAllowlist: newAllowlist,
            });
            if (!result.success) {
                setLocalAllowlist(currentAllowlist ?? [...availableTools]);
                console.error("Failed to update tool allowlist:", result.error);
            }
        }
        catch (err) {
            setLocalAllowlist(currentAllowlist ?? [...availableTools]);
            console.error("Failed to update tool allowlist:", err);
        }
        finally {
            setSaving(false);
        }
    }, [api, serverName, localAllowlist, currentAllowlist, availableTools]);
    const handleAllowAll = useCallback(async () => {
        if (!api || allAllowed)
            return;
        const newAllowlist = [...availableTools];
        setLocalAllowlist(newAllowlist);
        setSaving(true);
        try {
            const result = await api.mcp.setToolAllowlist({
                name: serverName,
                toolAllowlist: newAllowlist,
            });
            if (!result.success) {
                setLocalAllowlist(currentAllowlist ?? [...availableTools]);
                console.error("Failed to clear tool allowlist:", result.error);
            }
        }
        catch (err) {
            setLocalAllowlist(currentAllowlist ?? [...availableTools]);
            console.error("Failed to clear tool allowlist:", err);
        }
        finally {
            setSaving(false);
        }
    }, [api, serverName, allAllowed, currentAllowlist, availableTools]);
    const handleSelectNone = useCallback(async () => {
        if (!api || allDisabled)
            return;
        setLocalAllowlist([]);
        setSaving(true);
        try {
            const result = await api.mcp.setToolAllowlist({
                name: serverName,
                toolAllowlist: [],
            });
            if (!result.success) {
                setLocalAllowlist(currentAllowlist ?? [...availableTools]);
                console.error("Failed to set empty tool allowlist:", result.error);
            }
        }
        catch (err) {
            setLocalAllowlist(currentAllowlist ?? [...availableTools]);
            console.error("Failed to set empty tool allowlist:", err);
        }
        finally {
            setSaving(false);
        }
    }, [api, serverName, allDisabled, currentAllowlist, availableTools]);
    return (_jsxs("div", { children: [_jsxs("button", { onClick: () => setExpanded(!expanded), className: "text-muted hover:text-foreground flex items-center gap-1 text-xs", children: [expanded ? _jsx(ChevronDown, { className: "h-3 w-3" }) : _jsx(ChevronRight, { className: "h-3 w-3" }), _jsxs("span", { children: ["Tools: ", localAllowlist.length, "/", availableTools.length] }), _jsxs("span", { className: "text-muted/60 ml-1", children: ["(", formatRelativeTime(testedAt), ")"] }), saving && _jsx(Loader2, { className: "ml-1 h-3 w-3 animate-spin" })] }), expanded && (_jsx("div", { className: "mt-2", children: _jsx(ToolSelector, { availableTools: availableTools, allowedTools: localAllowlist, onToggle: (tool, allowed) => void handleToggleTool(tool, allowed), onSelectAll: () => void handleAllowAll(), onSelectNone: () => void handleSelectNone(), disabled: saving }) }))] }));
};
function isRecord(value) {
    // In dev-server (browser) mode, the ORPC client can surface namespaces/procedures as Proxy
    // functions (callable objects). Treat functions as record-like so runtime guards don't
    // incorrectly report "OAuth is not available".
    if (value === null)
        return false;
    const type = typeof value;
    return type === "object" || type === "function";
}
/**
 * Defensive runtime guard: `mcpOauth` may not exist when running against older backends
 * or in non-desktop environments. Treat OAuth as unavailable instead of surfacing raw exceptions.
 */
function getMCPOAuthAPI(api) {
    if (!api)
        return null;
    // Avoid direct property access since `api.mcpOauth` may be missing at runtime.
    const maybeOauth = Reflect.get(api, "mcpOauth");
    if (!isRecord(maybeOauth))
        return null;
    const requiredFns = ["getAuthStatus", "logout"];
    for (const fn of requiredFns) {
        if (typeof maybeOauth[fn] !== "function") {
            return null;
        }
    }
    // Login flow support depends on whether the client can complete the callback.
    const hasDesktopFlowFns = typeof maybeOauth.startDesktopFlow === "function" &&
        typeof maybeOauth.waitForDesktopFlow === "function" &&
        typeof maybeOauth.cancelDesktopFlow === "function";
    const hasServerFlowFns = typeof maybeOauth.startServerFlow === "function" &&
        typeof maybeOauth.waitForServerFlow === "function" &&
        typeof maybeOauth.cancelServerFlow === "function";
    if (!hasDesktopFlowFns && !hasServerFlowFns) {
        return null;
    }
    return maybeOauth;
}
function getMCPOAuthLoginFlowMode(input) {
    const api = input.mcpOauthApi;
    if (!api || !isRecord(api)) {
        return null;
    }
    const hasDesktopFlowFns = typeof api.startDesktopFlow === "function" &&
        typeof api.waitForDesktopFlow === "function" &&
        typeof api.cancelDesktopFlow === "function";
    const hasServerFlowFns = typeof api.startServerFlow === "function" &&
        typeof api.waitForServerFlow === "function" &&
        typeof api.cancelServerFlow === "function";
    if (input.isDesktop) {
        return hasDesktopFlowFns ? "desktop" : null;
    }
    return hasServerFlowFns ? "server" : null;
}
function useMCPOAuthLogin(input) {
    const { api, isDesktop, serverName, pendingServer, onSuccess } = input;
    const loginAttemptRef = useRef(0);
    const [flowId, setFlowId] = useState(null);
    const [loginStatus, setLoginStatus] = useState("idle");
    const [loginError, setLoginError] = useState(null);
    const loginInProgress = loginStatus === "starting" || loginStatus === "waiting";
    const cancelLogin = useCallback(() => {
        loginAttemptRef.current++;
        const mcpOauthApi = getMCPOAuthAPI(api);
        const loginFlowMode = getMCPOAuthLoginFlowMode({
            isDesktop,
            mcpOauthApi,
        });
        if (mcpOauthApi && flowId && loginFlowMode === "desktop") {
            void mcpOauthApi.cancelDesktopFlow({ flowId });
        }
        if (mcpOauthApi && flowId && loginFlowMode === "server") {
            void mcpOauthApi.cancelServerFlow({ flowId });
        }
        setFlowId(null);
        setLoginStatus("idle");
        setLoginError(null);
    }, [api, flowId, isDesktop]);
    const startLogin = useCallback(async () => {
        const attempt = ++loginAttemptRef.current;
        try {
            setLoginError(null);
            setFlowId(null);
            if (!api) {
                setLoginStatus("error");
                setLoginError("Mux API not connected.");
                return;
            }
            if (!serverName.trim()) {
                setLoginStatus("error");
                setLoginError("Server name is required to start OAuth login.");
                return;
            }
            const mcpOauthApi = getMCPOAuthAPI(api);
            if (!mcpOauthApi) {
                setLoginStatus("error");
                setLoginError("OAuth is not available in this environment.");
                return;
            }
            const loginFlowMode = getMCPOAuthLoginFlowMode({
                isDesktop,
                mcpOauthApi,
            });
            if (!loginFlowMode) {
                setLoginStatus("error");
                setLoginError("OAuth login is not available in this environment.");
                return;
            }
            setLoginStatus("starting");
            const startResult = loginFlowMode === "desktop"
                ? await mcpOauthApi.startDesktopFlow({ serverName, pendingServer })
                : await mcpOauthApi.startServerFlow({ serverName, pendingServer });
            if (attempt !== loginAttemptRef.current) {
                if (startResult.success) {
                    if (loginFlowMode === "desktop") {
                        void mcpOauthApi.cancelDesktopFlow({ flowId: startResult.data.flowId });
                    }
                    else {
                        void mcpOauthApi.cancelServerFlow({ flowId: startResult.data.flowId });
                    }
                }
                return;
            }
            if (!startResult.success) {
                setLoginStatus("error");
                setLoginError(startResult.error);
                return;
            }
            const { flowId: nextFlowId, authorizeUrl } = startResult.data;
            setFlowId(nextFlowId);
            setLoginStatus("waiting");
            // Desktop main process intercepts external window.open() calls and routes them via shell.openExternal.
            // In browser mode, this opens a new tab/window.
            //
            // NOTE: In some browsers (especially when using `noopener`), `window.open()` may return null even when
            // the tab opens successfully. Do not treat a null return value as a failure signal; keep the OAuth flow
            // alive and show guidance to the user while we wait.
            try {
                window.open(authorizeUrl, "_blank", "noopener");
            }
            catch {
                // Popups can be blocked or restricted by the browser. The user can cancel and retry after allowing
                // popups; we intentionally do not auto-cancel the server flow here.
            }
            if (attempt !== loginAttemptRef.current) {
                return;
            }
            const waitResult = loginFlowMode === "desktop"
                ? await mcpOauthApi.waitForDesktopFlow({ flowId: nextFlowId })
                : await mcpOauthApi.waitForServerFlow({ flowId: nextFlowId });
            if (attempt !== loginAttemptRef.current) {
                return;
            }
            if (waitResult.success) {
                setLoginStatus("success");
                await onSuccess?.();
                return;
            }
            setLoginStatus("error");
            setLoginError(waitResult.error);
        }
        catch (err) {
            if (attempt !== loginAttemptRef.current) {
                return;
            }
            const message = err instanceof Error ? err.message : String(err);
            setLoginStatus("error");
            setLoginError(message);
        }
    }, [api, isDesktop, onSuccess, pendingServer, serverName]);
    return {
        loginStatus,
        loginError,
        loginInProgress,
        startLogin,
        cancelLogin,
    };
}
const MCPOAuthRequiredCallout = ({ serverName, pendingServer, disabledReason, onLoginSuccess }) => {
    const { api } = useAPI();
    const isDesktop = !!window.api;
    const { loginStatus, loginError, loginInProgress, startLogin, cancelLogin } = useMCPOAuthLogin({
        api,
        isDesktop,
        serverName,
        pendingServer,
        onSuccess: onLoginSuccess,
    });
    const mcpOauthApi = getMCPOAuthAPI(api);
    const loginFlowMode = getMCPOAuthLoginFlowMode({
        isDesktop,
        mcpOauthApi,
    });
    const disabledTitle = disabledReason ??
        (!api
            ? "Mux API not connected"
            : !mcpOauthApi
                ? "OAuth is not available in this environment."
                : !loginFlowMode
                    ? isDesktop
                        ? "OAuth login is not available in this environment."
                        : "OAuth login is only available in the desktop app."
                    : undefined);
    const loginDisabled = Boolean(disabledReason) || !api || !loginFlowMode || loginInProgress;
    const loginButton = (_jsx(Button, { size: "sm", onClick: () => {
            void startLogin();
        }, disabled: loginDisabled, "aria-label": "Login via OAuth", children: loginInProgress ? (_jsxs(_Fragment, { children: [_jsx(Loader2, { className: "h-3.5 w-3.5 animate-spin" }), "Waiting for login..."] })) : ("Login via OAuth") }));
    return (_jsx("div", { className: "bg-warning/10 border-warning/30 text-warning rounded-md border px-3 py-2 text-xs", children: _jsxs("div", { className: "flex items-start justify-between gap-3", children: [_jsxs("div", { className: "min-w-0", children: [_jsx("p", { className: "font-medium", children: "This server requires OAuth." }), disabledReason && _jsx("p", { className: "text-muted mt-0.5", children: disabledReason }), loginStatus === "waiting" && (_jsxs(_Fragment, { children: [_jsx("p", { className: "text-muted mt-0.5", children: "Finish the login flow in your browser, then return here." }), !isDesktop && (_jsx("p", { className: "text-muted mt-0.5", children: "If a new tab didn't open, your browser may have blocked the popup. Allow popups and try again." }))] })), loginStatus === "success" && _jsx("p", { className: "text-muted mt-0.5", children: "Logged in." }), loginStatus === "error" && loginError && (_jsxs("p", { className: "text-destructive mt-0.5", children: ["OAuth error: ", loginError] }))] }), _jsxs("div", { className: "flex shrink-0 items-center gap-2", children: [disabledTitle ? (_jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("span", { className: "inline-flex", children: loginButton }) }), _jsx(TooltipContent, { side: "top", children: disabledTitle })] })) : (loginButton), loginStatus === "waiting" && (_jsx(Button, { variant: "secondary", size: "sm", onClick: cancelLogin, children: "Cancel" }))] })] }) }));
};
const RemoteMCPOAuthSection = ({ serverName, transport, url, oauthRefreshNonce }) => {
    const { api } = useAPI();
    const isDesktop = !!window.api;
    const [authStatus, setAuthStatus] = useState(null);
    const [authStatusLoading, setAuthStatusLoading] = useState(false);
    const [authStatusError, setAuthStatusError] = useState(null);
    const [logoutInProgress, setLogoutInProgress] = useState(false);
    const [logoutError, setLogoutError] = useState(null);
    const refreshAuthStatus = useCallback(async () => {
        const mcpOauthApi = getMCPOAuthAPI(api);
        if (!mcpOauthApi) {
            setAuthStatus(null);
            setAuthStatusLoading(false);
            setAuthStatusError(null);
            return;
        }
        setAuthStatusLoading(true);
        setAuthStatusError(null);
        try {
            const status = await mcpOauthApi.getAuthStatus({ serverUrl: url });
            setAuthStatus(status);
        }
        catch (err) {
            setAuthStatus(null);
            setAuthStatusError(err instanceof Error ? err.message : "Failed to load OAuth status");
        }
        finally {
            setAuthStatusLoading(false);
        }
    }, [api, url]);
    useEffect(() => {
        void refreshAuthStatus();
    }, [refreshAuthStatus, transport, url, oauthRefreshNonce]);
    const { loginStatus, loginError, loginInProgress, startLogin, cancelLogin } = useMCPOAuthLogin({
        api,
        isDesktop,
        serverName,
        onSuccess: refreshAuthStatus,
    });
    const mcpOauthApi = getMCPOAuthAPI(api);
    const oauthAvailable = Boolean(mcpOauthApi);
    const loginFlowMode = getMCPOAuthLoginFlowMode({ isDesktop, mcpOauthApi });
    const oauthActionsAvailable = oauthAvailable && Boolean(loginFlowMode);
    const isLoggedIn = (authStatus?.isLoggedIn ?? false) || loginStatus === "success";
    const oauthDebugErrors = [
        authStatusError ? { label: "Status", message: authStatusError } : null,
        loginStatus === "error" && loginError ? { label: "Login", message: loginError } : null,
        logoutError ? { label: "Logout", message: logoutError } : null,
    ].filter((entry) => entry !== null);
    const authStatusText = !oauthAvailable
        ? "Not available"
        : authStatusLoading
            ? "Checking..."
            : loginInProgress
                ? "Waiting..."
                : oauthDebugErrors.length > 0
                    ? "Error"
                    : isLoggedIn
                        ? "Logged in"
                        : "Not logged in";
    const updatedAtText = oauthAvailable && isLoggedIn && authStatus?.updatedAtMs
        ? ` (${formatRelativeTime(authStatus.updatedAtMs)})`
        : "";
    const loginButtonLabel = loginStatus === "error" ? "Retry" : "Login";
    const reloginMenuLabel = loginStatus === "error" ? "Retry login" : "Re-login";
    const logout = useCallback(async () => {
        const mcpOauthApi = getMCPOAuthAPI(api);
        if (!mcpOauthApi) {
            setLogoutError("OAuth is not available in this environment.");
            return;
        }
        setLogoutError(null);
        cancelLogin();
        setLogoutInProgress(true);
        try {
            const result = await mcpOauthApi.logout({ serverUrl: url });
            if (!result.success) {
                setLogoutError(result.error);
                return;
            }
            await refreshAuthStatus();
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            setLogoutError(message);
        }
        finally {
            setLogoutInProgress(false);
        }
    }, [api, cancelLogin, refreshAuthStatus, url]);
    return (_jsxs("div", { className: "mt-1 flex items-center justify-between gap-2", children: [_jsxs("div", { className: "flex min-w-0 items-center gap-2 text-xs", children: [_jsx("span", { className: "text-foreground font-medium", children: "OAuth" }), _jsxs("span", { className: "text-muted truncate", children: [authStatusText, updatedAtText] }), oauthDebugErrors.length > 0 && (_jsxs("details", { className: "group inline-block", children: [_jsx("summary", { className: "text-muted hover:text-foreground cursor-pointer list-none text-[11px] underline-offset-2 group-open:underline", children: "Details" }), _jsx("div", { className: "border-border-medium bg-background-secondary mt-1 space-y-1 rounded-md border px-2 py-1 text-xs", children: oauthDebugErrors.map((entry) => (_jsxs("div", { className: "text-destructive break-words", children: [_jsxs("span", { className: "font-medium", children: [entry.label, ":"] }), " ", entry.message] }, entry.label))) })] }))] }), oauthActionsAvailable && (_jsx("div", { className: "flex shrink-0 items-center gap-1", children: loginInProgress ? (_jsxs(_Fragment, { children: [_jsxs(Button, { variant: "outline", size: "sm", className: "h-7 px-2", disabled: true, children: [_jsx(Loader2, { className: "h-3 w-3 animate-spin" }), isLoggedIn ? "Re-login" : "Login"] }), _jsx(Button, { variant: "ghost", size: "sm", className: "h-7 px-2", onClick: cancelLogin, children: "Cancel" })] })) : isLoggedIn ? (_jsxs(_Fragment, { children: [logoutInProgress && _jsx(Loader2, { className: "text-muted h-3 w-3 animate-spin" }), _jsx(KebabMenu, { className: "h-7 w-7 px-0 text-xs", items: [
                                {
                                    label: reloginMenuLabel,
                                    onClick: () => {
                                        void startLogin();
                                    },
                                    disabled: logoutInProgress,
                                },
                                {
                                    label: logoutInProgress ? "Logging out..." : "Logout",
                                    onClick: () => {
                                        void logout();
                                    },
                                    disabled: logoutInProgress,
                                },
                            ] })] })) : (_jsxs(Button, { variant: "outline", size: "sm", className: "h-7 px-2", onClick: () => {
                        void startLogin();
                    }, disabled: logoutInProgress, children: [_jsx(LogIn, {}), loginButtonLabel] })) }))] }));
};
export const MCPSettingsSection = () => {
    const { api } = useAPI();
    const policyState = usePolicy();
    const mcpAllowUserDefined = policyState.status.state === "enforced" ? policyState.policy?.mcp.allowUserDefined : undefined;
    const mcpDisabledByPolicy = Boolean(mcpAllowUserDefined?.stdio === false && mcpAllowUserDefined.remote === false);
    const [servers, setServers] = useState({});
    const [loading, setLoading] = useState(false);
    const [globalSecretKeys, setGlobalSecretKeys] = useState([]);
    const [error, setError] = useState(null);
    // Test state with caching (global MCP config)
    const { cache: testCache, setResult: cacheTestResult, clearResult: clearTestResult, } = useMCPTestCache("__global__");
    const [testingServer, setTestingServer] = useState(null);
    const [mcpOauthRefreshNonce, setMcpOauthRefreshNonce] = useState(0);
    // Add form state
    // Ensure the "Add server" transport select always points to a policy-allowed value.
    useEffect(() => {
        if (!mcpAllowUserDefined) {
            return;
        }
        const isAllowed = (transport) => {
            if (transport === "stdio") {
                return mcpAllowUserDefined.stdio;
            }
            return mcpAllowUserDefined.remote;
        };
        setNewServer((prev) => {
            if (isAllowed(prev.transport)) {
                return prev;
            }
            const fallback = mcpAllowUserDefined.stdio
                ? "stdio"
                : mcpAllowUserDefined.remote
                    ? "http"
                    : null;
            if (!fallback) {
                return prev;
            }
            return { ...prev, transport: fallback, value: "", headersRows: [] };
        });
    }, [mcpAllowUserDefined]);
    const [newServer, setNewServer] = useState({
        name: "",
        transport: "stdio",
        value: "",
        headersRows: [],
    });
    const [addingServer, setAddingServer] = useState(false);
    const [testingNew, setTestingNew] = useState(false);
    const [newTestResult, setNewTestResult] = useState(null);
    // Edit state
    const [editing, setEditing] = useState(null);
    const [savingEdit, setSavingEdit] = useState(false);
    const refresh = useCallback(async () => {
        if (!api)
            return;
        setLoading(true);
        try {
            const mcpResult = await api.mcp.list({});
            setServers(mcpResult ?? {});
            setError(null);
        }
        catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load MCP servers");
        }
        finally {
            setLoading(false);
        }
    }, [api]);
    // Load global secrets (used for {secret:"KEY"} header values).
    useEffect(() => {
        if (!api) {
            setGlobalSecretKeys([]);
            return;
        }
        let cancelled = false;
        (async () => {
            try {
                const secrets = await api.secrets.get({});
                if (cancelled)
                    return;
                setGlobalSecretKeys(secrets.map((s) => s.key));
            }
            catch (err) {
                if (cancelled)
                    return;
                console.error("Failed to load global secrets:", err);
                setGlobalSecretKeys([]);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [api]);
    useEffect(() => {
        void refresh();
    }, [refresh]);
    // Clear new-server test result when transport/value/headers change
    useEffect(() => {
        setNewTestResult(null);
    }, [newServer.transport, newServer.value, newServer.headersRows]);
    const handleRemove = useCallback(async (name) => {
        if (!api)
            return;
        setLoading(true);
        try {
            const result = await api.mcp.remove({ name });
            if (!result.success) {
                setError(result.error ?? "Failed to remove MCP server");
            }
            else {
                clearTestResult(name);
                await refresh();
            }
        }
        catch (err) {
            setError(err instanceof Error ? err.message : "Failed to remove MCP server");
        }
        finally {
            setLoading(false);
        }
    }, [api, refresh, clearTestResult]);
    const handleToggleEnabled = useCallback(async (name, enabled) => {
        if (!api)
            return;
        // Optimistic update
        setServers((prev) => ({
            ...prev,
            [name]: { ...prev[name], disabled: !enabled },
        }));
        try {
            const result = await api.mcp.setEnabled({
                name,
                enabled,
            });
            if (!result.success) {
                // Revert on error
                setServers((prev) => ({
                    ...prev,
                    [name]: { ...prev[name], disabled: enabled },
                }));
                setError(result.error ?? "Failed to update server");
            }
        }
        catch (err) {
            // Revert on error
            setServers((prev) => ({
                ...prev,
                [name]: { ...prev[name], disabled: enabled },
            }));
            setError(err instanceof Error ? err.message : "Failed to update server");
        }
    }, [api]);
    const handleTest = useCallback(async (name) => {
        if (!api)
            return;
        setTestingServer(name);
        try {
            const result = await api.mcp.test({ name });
            cacheTestResult(name, result);
        }
        catch (err) {
            cacheTestResult(name, {
                success: false,
                error: err instanceof Error ? err.message : "Test failed",
            });
        }
        finally {
            setTestingServer(null);
        }
    }, [api, cacheTestResult]);
    const serverDisplayValue = (entry) => entry.transport === "stdio" ? entry.command : entry.url;
    const handleTestNewServer = useCallback(async () => {
        if (!api || !newServer.value.trim())
            return;
        setTestingNew(true);
        setNewTestResult(null);
        try {
            const { headers, validation } = newServer.transport === "stdio"
                ? { headers: undefined, validation: { errors: [], warnings: [] } }
                : mcpHeaderRowsToRecord(newServer.headersRows, {
                    knownSecretKeys: new Set(globalSecretKeys),
                });
            if (validation.errors.length > 0) {
                throw new Error(validation.errors[0]);
            }
            const pendingName = newServer.name.trim();
            const result = await api.mcp.test({
                ...(newServer.transport === "stdio"
                    ? { command: newServer.value.trim() }
                    : {
                        ...(pendingName ? { name: pendingName } : {}),
                        transport: newServer.transport,
                        url: newServer.value.trim(),
                        headers,
                    }),
            });
            setNewTestResult({ result, testedAt: Date.now() });
        }
        catch (err) {
            setNewTestResult({
                result: { success: false, error: err instanceof Error ? err.message : "Test failed" },
                testedAt: Date.now(),
            });
        }
        finally {
            setTestingNew(false);
        }
    }, [
        api,
        newServer.name,
        newServer.transport,
        newServer.value,
        newServer.headersRows,
        globalSecretKeys,
    ]);
    const handleAddServer = useCallback(async () => {
        if (!api || !newServer.name.trim() || !newServer.value.trim())
            return;
        const serverName = newServer.name.trim();
        const serverTransport = newServer.transport;
        const serverValue = newServer.value.trim();
        const serverHeadersRows = newServer.headersRows;
        const existingTestResult = newTestResult;
        setAddingServer(true);
        setError(null);
        try {
            const { headers, validation } = serverTransport === "stdio"
                ? { headers: undefined, validation: { errors: [], warnings: [] } }
                : mcpHeaderRowsToRecord(serverHeadersRows, {
                    knownSecretKeys: new Set(globalSecretKeys),
                });
            if (validation.errors.length > 0) {
                throw new Error(validation.errors[0]);
            }
            const result = await api.mcp.add({
                name: serverName,
                ...(serverTransport === "stdio"
                    ? { transport: "stdio", command: serverValue }
                    : {
                        transport: serverTransport,
                        url: serverValue,
                        headers,
                    }),
            });
            if (!result.success) {
                setError(result.error ?? "Failed to add MCP server");
                return;
            }
            setNewServer({ name: "", transport: "stdio", value: "", headersRows: [] });
            setNewTestResult(null);
            await refresh();
            // For stdio, avoid running arbitrary user-provided commands automatically.
            if (serverTransport === "stdio") {
                if (existingTestResult?.result.success) {
                    cacheTestResult(serverName, existingTestResult.result);
                }
                return;
            }
            // For remote servers, always run a test immediately after adding so OAuth-required servers can
            // surface an OAuth callout without requiring a manual Test click.
            setTestingServer(serverName);
            try {
                const testResult = await api.mcp.test({
                    name: serverName,
                });
                cacheTestResult(serverName, testResult);
            }
            catch (err) {
                cacheTestResult(serverName, {
                    success: false,
                    error: err instanceof Error ? err.message : "Test failed",
                });
            }
            finally {
                setTestingServer(null);
            }
        }
        catch (err) {
            setError(err instanceof Error ? err.message : "Failed to add MCP server");
        }
        finally {
            setAddingServer(false);
        }
    }, [api, newServer, newTestResult, refresh, cacheTestResult, globalSecretKeys]);
    const handleStartEdit = useCallback((name, entry) => {
        setEditing({
            name,
            transport: entry.transport,
            value: entry.transport === "stdio" ? entry.command : entry.url,
            headersRows: entry.transport === "stdio" ? [] : mcpHeadersRecordToRows(entry.headers),
        });
    }, []);
    const handleCancelEdit = useCallback(() => {
        setEditing(null);
    }, []);
    const handleSaveEdit = useCallback(async () => {
        if (!api || !editing?.value.trim())
            return;
        setSavingEdit(true);
        setError(null);
        try {
            const { headers, validation } = editing.transport === "stdio"
                ? { headers: undefined, validation: { errors: [], warnings: [] } }
                : mcpHeaderRowsToRecord(editing.headersRows, {
                    knownSecretKeys: new Set(globalSecretKeys),
                });
            if (validation.errors.length > 0) {
                throw new Error(validation.errors[0]);
            }
            const result = await api.mcp.add({
                name: editing.name,
                ...(editing.transport === "stdio"
                    ? { transport: "stdio", command: editing.value.trim() }
                    : {
                        transport: editing.transport,
                        url: editing.value.trim(),
                        headers,
                    }),
            });
            if (!result.success) {
                setError(result.error ?? "Failed to update MCP server");
            }
            else {
                // Clear cached test result since config changed
                clearTestResult(editing.name);
                setEditing(null);
                await refresh();
            }
        }
        catch (err) {
            setError(err instanceof Error ? err.message : "Failed to update MCP server");
        }
        finally {
            setSavingEdit(false);
        }
    }, [api, editing, refresh, clearTestResult, globalSecretKeys]);
    const newHeadersValidation = newServer.transport === "stdio"
        ? { errors: [], warnings: [] }
        : mcpHeaderRowsToRecord(newServer.headersRows, {
            knownSecretKeys: new Set(globalSecretKeys),
        }).validation;
    const canAdd = newServer.name.trim().length > 0 &&
        newServer.value.trim().length > 0 &&
        (newServer.transport === "stdio" || newHeadersValidation.errors.length === 0);
    const canTest = newServer.value.trim().length > 0 &&
        (newServer.transport === "stdio" || newHeadersValidation.errors.length === 0);
    const editHeadersValidation = editing && editing.transport !== "stdio"
        ? mcpHeaderRowsToRecord(editing.headersRows, {
            knownSecretKeys: new Set(globalSecretKeys),
        }).validation
        : { errors: [], warnings: [] };
    return (_jsxs("div", { className: "space-y-6", children: [_jsx("div", { children: _jsxs("p", { className: "text-muted mb-4 text-xs", children: ["Configure global MCP servers. Global config lives in", " ", _jsx("code", { className: "text-accent", children: "~/.mux/mcp.jsonc" }), ", with optional repo overrides in", " ", _jsx("code", { className: "text-accent", children: "./.mux/mcp.jsonc" }), " and workspace overrides in", " ", _jsx("code", { className: "text-accent", children: ".mux/mcp.local.jsonc" }), "."] }) }), _jsxs("div", { children: [_jsx("h3", { className: "text-foreground mb-4 text-sm font-medium", children: "MCP Servers" }), mcpDisabledByPolicy ? (_jsx("p", { className: "text-muted py-2 text-sm", children: "MCP servers are disabled by policy." })) : (_jsxs(_Fragment, { children: [error && (_jsxs("div", { className: "bg-destructive/10 text-destructive mb-3 flex items-center gap-2 rounded-md px-3 py-2 text-sm", children: [_jsx(XCircle, { className: "h-4 w-4 shrink-0" }), error] })), _jsx("div", { className: "space-y-2", children: loading ? (_jsxs("div", { className: "text-muted flex items-center gap-2 py-4 text-sm", children: [_jsx(Loader2, { className: "h-4 w-4 animate-spin" }), "Loading servers\u2026"] })) : Object.keys(servers).length === 0 ? (_jsx("p", { className: "text-muted py-2 text-sm", children: "No MCP servers configured yet." })) : (Object.entries(servers).map(([name, entry]) => {
                                    const isTesting = testingServer === name;
                                    const cached = testCache[name];
                                    const isEditing = editing?.name === name;
                                    const isEnabled = !entry.disabled;
                                    const remoteEntry = entry.transport === "stdio" ? null : entry;
                                    return (_jsxs("div", { className: "border-border-medium bg-background-secondary overflow-hidden rounded-md border", children: [_jsxs("div", { className: "grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3 px-3 py-2", children: [_jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("div", { className: "mt-0.5 shrink-0", children: _jsx(Switch, { checked: isEnabled, onCheckedChange: (checked) => void handleToggleEnabled(name, checked), "aria-label": `Toggle ${name} enabled` }) }) }), _jsx(TooltipContent, { side: "top", children: isEnabled ? "Disable server" : "Enable server" })] }), _jsxs("div", { className: cn("min-w-0", !isEnabled && "opacity-50"), children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: "text-foreground text-sm font-medium", children: name }), cached?.result.success && !isEditing && isEnabled && (_jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsxs("span", { className: "rounded bg-green-500/10 px-1.5 py-0.5 text-xs text-green-500", children: [cached.result.tools.length, " tools"] }) }), _jsxs(TooltipContent, { side: "top", children: ["Tested ", formatRelativeTime(cached.testedAt)] })] })), !isEnabled && _jsx("span", { className: "text-muted text-xs", children: "disabled" })] }), isEditing ? (_jsxs("div", { className: "mt-2 space-y-2", children: [_jsxs("p", { className: "text-muted text-xs", children: ["transport: ", editing.transport] }), _jsx("input", { type: "text", value: editing.value, onChange: (e) => setEditing({ ...editing, value: e.target.value }), className: "bg-modal-bg border-border-medium focus:border-accent w-full rounded border px-2 py-1.5 font-mono text-xs focus:outline-none", autoFocus: true, spellCheck: false, onKeyDown: createEditKeyHandler({
                                                                            onSave: () => void handleSaveEdit(),
                                                                            onCancel: handleCancelEdit,
                                                                        }) }), editing.transport !== "stdio" && (_jsxs("div", { children: [_jsx("div", { className: "text-muted mb-1 text-[11px]", children: "HTTP headers (optional)" }), _jsx(MCPHeadersEditor, { rows: editing.headersRows, onChange: (rows) => setEditing({
                                                                                    ...editing,
                                                                                    headersRows: rows,
                                                                                }), secretKeys: globalSecretKeys, disabled: savingEdit })] }))] })) : (_jsx("p", { className: "text-muted mt-0.5 font-mono text-xs break-all", children: serverDisplayValue(entry) }))] }), _jsx("div", { className: "flex shrink-0 items-center gap-0.5", children: isEditing ? (_jsxs(_Fragment, { children: [_jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("span", { className: "inline-flex", children: _jsx(Button, { variant: "ghost", size: "icon", onClick: () => void handleSaveEdit(), disabled: savingEdit ||
                                                                                        !editing.value.trim() ||
                                                                                        editHeadersValidation.errors.length > 0, className: "h-7 w-7 text-green-500 hover:text-green-400", "aria-label": "Save", children: savingEdit ? (_jsx(Loader2, { className: "h-4 w-4 animate-spin" })) : (_jsx(Check, { className: "h-4 w-4" })) }) }) }), _jsx(TooltipContent, { side: "top", children: "Save (Enter)" })] }), _jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("span", { className: "inline-flex", children: _jsx(Button, { variant: "ghost", size: "icon", onClick: handleCancelEdit, disabled: savingEdit, className: "text-muted hover:text-foreground h-7 w-7", "aria-label": "Cancel", children: _jsx(X, { className: "h-4 w-4" }) }) }) }), _jsx(TooltipContent, { side: "top", children: "Cancel (Esc)" })] })] })) : (_jsxs(_Fragment, { children: [_jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("span", { className: "inline-flex", children: _jsx(Button, { variant: "ghost", size: "icon", onClick: () => void handleTest(name), disabled: isTesting, className: "text-muted hover:text-accent h-7 w-7", "aria-label": "Test connection", children: isTesting ? (_jsx(Loader2, { className: "h-4 w-4 animate-spin" })) : (_jsx(Play, { className: "h-4 w-4" })) }) }) }), _jsx(TooltipContent, { side: "top", children: "Test connection" })] }), _jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("span", { className: "inline-flex", children: _jsx(Button, { variant: "ghost", size: "icon", onClick: () => handleStartEdit(name, entry), className: "text-muted hover:text-accent h-7 w-7", "aria-label": "Edit server", children: _jsx(Pencil, { className: "h-4 w-4" }) }) }) }), _jsx(TooltipContent, { side: "top", children: "Edit server" })] }), _jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("span", { className: "inline-flex", children: _jsx(Button, { variant: "ghost", size: "icon", onClick: () => void handleRemove(name), disabled: loading, className: "text-muted hover:text-error h-7 w-7", "aria-label": "Remove server", children: _jsx(Trash2, { className: "h-4 w-4" }) }) }) }), _jsx(TooltipContent, { side: "top", children: "Remove server" })] })] })) }), !isEditing && remoteEntry && (_jsx("div", { className: cn("col-start-2 col-span-2 min-w-0", !isEnabled && "opacity-50"), children: _jsx(RemoteMCPOAuthSection, { serverName: name, transport: remoteEntry.transport, url: remoteEntry.url, oauthRefreshNonce: mcpOauthRefreshNonce }) }))] }), cached && !cached.result.success && !isEditing && (_jsxs("div", { className: "border-border-medium border-t px-3 py-2 text-xs", children: [_jsxs("div", { className: "text-destructive flex items-start gap-1.5", children: [_jsx(XCircle, { className: "mt-0.5 h-3 w-3 shrink-0" }), _jsx("span", { children: cached.result.error })] }), cached.result.oauthChallenge && (_jsx("div", { className: "mt-2", children: _jsx(MCPOAuthRequiredCallout, { serverName: name, disabledReason: remoteEntry
                                                                ? undefined
                                                                : "OAuth login is only supported for remote (http/sse) MCP servers.", onLoginSuccess: async () => {
                                                                setMcpOauthRefreshNonce((prev) => prev + 1);
                                                                await handleTest(name);
                                                            } }) }))] })), cached?.result.success && cached.result.tools.length > 0 && !isEditing && (_jsx("div", { className: "border-border-medium border-t px-3 py-2", children: _jsx(ToolAllowlistSection, { serverName: name, availableTools: cached.result.tools, currentAllowlist: entry.toolAllowlist, testedAt: cached.testedAt }) }))] }, name));
                                })) }), _jsxs("details", { className: "group mt-3", children: [_jsxs("summary", { className: "text-accent hover:text-accent/80 flex cursor-pointer list-none items-center gap-1 text-sm font-medium", children: [_jsx(ChevronRight, { className: "h-4 w-4 transition-transform group-open:rotate-90" }), "Add server"] }), _jsxs("div", { className: "border-border-medium bg-background-secondary mt-2 space-y-3 rounded-md border p-3", children: [_jsxs("div", { children: [_jsx("label", { htmlFor: "server-name", className: "text-muted mb-1 block text-xs", children: "Name" }), _jsx("input", { id: "server-name", type: "text", placeholder: "e.g., memory", value: newServer.name, onChange: (e) => setNewServer((prev) => ({ ...prev, name: e.target.value })), className: "bg-modal-bg border-border-medium focus:border-accent w-full rounded border px-2 py-1.5 text-sm focus:outline-none" })] }), _jsxs("div", { children: [_jsx("label", { className: "text-muted mb-1 block text-xs", children: "Transport" }), _jsxs(Select, { value: newServer.transport, onValueChange: (value) => setNewServer((prev) => ({
                                                            ...prev,
                                                            transport: value,
                                                            value: "",
                                                            headersRows: [],
                                                        })), children: [_jsx(SelectTrigger, { className: "border-border-medium bg-modal-bg h-8 w-full text-sm", children: _jsx(SelectValue, {}) }), _jsxs(SelectContent, { children: [mcpAllowUserDefined?.stdio !== false && (_jsx(SelectItem, { value: "stdio", children: "Stdio" })), mcpAllowUserDefined?.remote !== false && (_jsxs(_Fragment, { children: [_jsx(SelectItem, { value: "http", children: "HTTP (Streamable)" }), _jsx(SelectItem, { value: "sse", children: "SSE (Legacy)" }), _jsx(SelectItem, { value: "auto", children: "Auto (HTTP \u2192 SSE)" })] }))] })] })] }), _jsxs("div", { children: [_jsx("label", { htmlFor: "server-value", className: "text-muted mb-1 block text-xs", children: newServer.transport === "stdio" ? "Command" : "URL" }), _jsx("input", { id: "server-value", type: "text", placeholder: newServer.transport === "stdio"
                                                            ? "e.g., npx -y @modelcontextprotocol/server-memory"
                                                            : "e.g., http://localhost:3333/mcp", value: newServer.value, onChange: (e) => setNewServer((prev) => ({ ...prev, value: e.target.value })), spellCheck: false, className: "bg-modal-bg border-border-medium focus:border-accent w-full rounded border px-2 py-1.5 font-mono text-sm focus:outline-none" })] }), newServer.transport !== "stdio" && (_jsxs("div", { children: [_jsx("label", { className: "text-muted mb-1 block text-xs", children: "HTTP headers (optional)" }), _jsx(MCPHeadersEditor, { rows: newServer.headersRows, onChange: (rows) => setNewServer((prev) => ({
                                                            ...prev,
                                                            headersRows: rows,
                                                        })), secretKeys: globalSecretKeys, disabled: addingServer || testingNew })] })), newTestResult && (_jsx("div", { className: cn("flex items-start gap-2 rounded-md px-3 py-2 text-sm", newTestResult.result.success
                                                    ? "bg-green-500/10 text-green-500"
                                                    : "bg-destructive/10 text-destructive"), children: newTestResult.result.success ? (_jsxs(_Fragment, { children: [_jsx(CheckCircle, { className: "mt-0.5 h-4 w-4 shrink-0" }), _jsxs("div", { children: [_jsxs("span", { className: "font-medium", children: ["Connected \u2014 ", newTestResult.result.tools.length, " tools"] }), newTestResult.result.tools.length > 0 && (_jsx("p", { className: "mt-0.5 text-xs opacity-80", children: newTestResult.result.tools.join(", ") }))] })] })) : (_jsxs(_Fragment, { children: [_jsx(XCircle, { className: "mt-0.5 h-4 w-4 shrink-0" }), _jsx("span", { children: newTestResult.result.error })] })) })), newTestResult &&
                                                !newTestResult.result.success &&
                                                newTestResult.result.oauthChallenge && (_jsx("div", { className: "mt-2", children: _jsx(MCPOAuthRequiredCallout, { serverName: newServer.name.trim(), pendingServer: (() => {
                                                        const pendingName = newServer.name.trim();
                                                        if (!pendingName) {
                                                            return undefined;
                                                        }
                                                        // If the server already exists in config, prefer that config for OAuth.
                                                        const existing = servers[pendingName];
                                                        if (existing) {
                                                            return undefined;
                                                        }
                                                        if (newServer.transport === "stdio") {
                                                            return undefined;
                                                        }
                                                        const url = newServer.value.trim();
                                                        if (!url) {
                                                            return undefined;
                                                        }
                                                        return { transport: newServer.transport, url };
                                                    })(), disabledReason: (() => {
                                                        const pendingName = newServer.name.trim();
                                                        if (!pendingName) {
                                                            return "Enter a server name to enable OAuth login.";
                                                        }
                                                        const existing = servers[pendingName];
                                                        const transport = existing?.transport ?? newServer.transport;
                                                        if (transport === "stdio") {
                                                            return "OAuth login is only supported for remote (http/sse) MCP servers.";
                                                        }
                                                        return undefined;
                                                    })(), onLoginSuccess: async () => {
                                                        setMcpOauthRefreshNonce((prev) => prev + 1);
                                                        await handleTestNewServer();
                                                    } }) })), _jsxs("div", { className: "flex gap-2 pt-1", children: [_jsxs(Button, { variant: "outline", size: "sm", onClick: () => void handleTestNewServer(), disabled: !canTest || testingNew, children: [testingNew ? (_jsx(Loader2, { className: "h-3.5 w-3.5 animate-spin" })) : (_jsx(Play, { className: "h-3.5 w-3.5" })), testingNew ? "Testing…" : "Test"] }), _jsxs(Button, { size: "sm", onClick: () => void handleAddServer(), disabled: !canAdd || addingServer, children: [addingServer ? (_jsx(Loader2, { className: "h-3.5 w-3.5 animate-spin" })) : (_jsx(Plus, { className: "h-3.5 w-3.5" })), addingServer ? "Adding…" : "Add"] })] })] })] })] }))] })] }));
};
//# sourceMappingURL=MCPSettingsSection.js.map