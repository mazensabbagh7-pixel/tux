import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Governor Section - Enrollment UI for Mux Governor (enterprise policy service).
 * Gated behind the MUX_GOVERNOR experiment flag.
 */
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ExternalLink, ShieldCheck, X } from "lucide-react";
import { Button } from "@/browser/components/ui/button";
import { Input } from "@/browser/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/browser/components/ui/dialog";
import { useAPI } from "@/browser/contexts/API";
import { usePolicy } from "@/browser/contexts/PolicyContext";
import { JsonHighlight } from "@/browser/components/tools/shared/HighlightedCode";
import { getStoredAuthToken } from "@/browser/components/AuthTokenModal";
import { getBrowserBackendBaseUrl } from "@/browser/utils/backendBaseUrl";
/** Get server auth token from URL query param or localStorage. */
function getServerAuthToken() {
    const urlToken = new URLSearchParams(window.location.search).get("token")?.trim();
    return urlToken?.length ? urlToken : getStoredAuthToken();
}
export function GovernorSection() {
    const { api } = useAPI();
    const isDesktop = !!window.api;
    const policyState = usePolicy();
    // Enrollment state from config
    const [enrolled, setEnrolled] = useState(null);
    const [governorUrl, setGovernorUrl] = useState(null);
    const [loadingConfig, setLoadingConfig] = useState(true);
    // Policy refresh (enrolled only)
    const [refreshingPolicy, setRefreshingPolicy] = useState(false);
    const [refreshPolicyError, setRefreshPolicyError] = useState(null);
    // URL prompt dialog
    const [showUrlDialog, setShowUrlDialog] = useState(false);
    const [urlInput, setUrlInput] = useState("");
    const [urlError, setUrlError] = useState(null);
    const [urlWarning, setUrlWarning] = useState(null);
    // OAuth flow state
    const [enrollStatus, setEnrollStatus] = useState("idle");
    const [enrollError, setEnrollError] = useState(null);
    const [desktopFlowId, setDesktopFlowId] = useState(null);
    const enrollAttemptRef = useRef(0);
    // Cleanup function for browser OAuth flow (listener + interval)
    const browserFlowCleanupRef = useRef(null);
    // Load config on mount
    useEffect(() => {
        if (!api)
            return;
        const apiRef = api; // capture for closure
        async function loadConfig() {
            try {
                const config = await apiRef.config.getConfig();
                setEnrolled(config.muxGovernorEnrolled);
                setGovernorUrl(config.muxGovernorUrl);
            }
            catch {
                // Ignore load errors - show as not enrolled
                setEnrolled(false);
                setGovernorUrl(null);
            }
            finally {
                setLoadingConfig(false);
            }
        }
        void loadConfig();
    }, [api]);
    // Cleanup desktop flow on unmount only
    // We use refs to access current values without triggering re-runs of the cleanup
    const desktopFlowIdRef = useRef(desktopFlowId);
    desktopFlowIdRef.current = desktopFlowId;
    const apiRef = useRef(api);
    apiRef.current = api;
    useEffect(() => {
        return () => {
            // Cleanup desktop flow
            if (isDesktop && apiRef.current && desktopFlowIdRef.current) {
                void apiRef.current.muxGovernorOauth.cancelDesktopFlow({
                    flowId: desktopFlowIdRef.current,
                });
            }
            // Cleanup browser flow (listener + interval)
            browserFlowCleanupRef.current?.();
            browserFlowCleanupRef.current = null;
            enrollAttemptRef.current += 1;
        };
    }, [isDesktop]);
    // Validate and normalize URL input
    const validateUrl = (input) => {
        if (!input.trim()) {
            return { valid: false };
        }
        try {
            const url = new URL(input.trim());
            if (url.protocol !== "http:" && url.protocol !== "https:") {
                return { valid: false };
            }
            const warning = url.protocol === "http:"
                ? "Warning: Using HTTP is not secure. Use HTTPS in production."
                : undefined;
            return { valid: true, origin: url.origin, warning };
        }
        catch {
            return { valid: false };
        }
    };
    const handleUrlInputChange = (value) => {
        setUrlInput(value);
        setUrlError(null);
        const result = validateUrl(value);
        if (value.trim() && !result.valid) {
            setUrlError("Please enter a valid URL (e.g., https://governor.corp.com)");
            setUrlWarning(null);
        }
        else {
            setUrlWarning(result.warning ?? null);
        }
    };
    const handleStartEnroll = async () => {
        if (!api)
            return;
        const result = validateUrl(urlInput);
        if (!result.valid || !result.origin) {
            setUrlError("Please enter a valid URL");
            return;
        }
        const governorOrigin = result.origin;
        const currentAttempt = ++enrollAttemptRef.current;
        setShowUrlDialog(false);
        setEnrollStatus("starting");
        setEnrollError(null);
        if (isDesktop) {
            // Desktop flow: opens in system browser
            const startResult = await api.muxGovernorOauth.startDesktopFlow({ governorOrigin });
            if (currentAttempt !== enrollAttemptRef.current)
                return;
            if (!startResult.success) {
                setEnrollStatus("error");
                setEnrollError(startResult.error);
                return;
            }
            const { flowId, authorizeUrl } = startResult.data;
            setDesktopFlowId(flowId);
            setEnrollStatus("waiting");
            // Open in system browser
            window.open(authorizeUrl, "_blank", "noopener");
            const waitResult = await api.muxGovernorOauth.waitForDesktopFlow({ flowId });
            if (currentAttempt !== enrollAttemptRef.current)
                return;
            if (waitResult.success) {
                setEnrollStatus("success");
                // Reload config to show enrolled state
                const config = await api.config.getConfig();
                setEnrolled(config.muxGovernorEnrolled);
                setGovernorUrl(config.muxGovernorUrl);
            }
            else {
                setEnrollStatus("error");
                setEnrollError(waitResult.error);
            }
        }
        else {
            // Server/browser flow: open popup, fetch start URL, then navigate popup to authorize URL
            // (Matches gateway pattern - popup must be opened synchronously before async fetch)
            const popup = window.open("about:blank", "mux-governor-oauth", "width=600,height=700,popup=1");
            if (!popup) {
                setEnrollStatus("error");
                setEnrollError("Failed to open popup. Please allow popups for this site.");
                return;
            }
            setEnrollStatus("waiting");
            const backendBaseUrl = getBrowserBackendBaseUrl();
            // Fetch the authorize URL from the start endpoint
            const startUrl = new URL(`${backendBaseUrl}/auth/mux-governor/start`);
            startUrl.searchParams.set("governorUrl", governorOrigin);
            const authToken = getServerAuthToken();
            let json;
            try {
                const res = await fetch(startUrl.toString(), {
                    headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined,
                });
                const contentType = res.headers.get("content-type") ?? "";
                if (!contentType.includes("application/json")) {
                    const body = await res.text();
                    const prefix = body.trim().slice(0, 80);
                    throw new Error(`Unexpected response (expected JSON, got ${contentType || "unknown"}): ${prefix}`);
                }
                json = (await res.json());
                if (!res.ok) {
                    const message = typeof json.error === "string" ? json.error : `HTTP ${res.status}`;
                    throw new Error(message);
                }
            }
            catch (err) {
                popup.close();
                if (currentAttempt !== enrollAttemptRef.current)
                    return;
                setEnrollStatus("error");
                setEnrollError(err instanceof Error ? err.message : String(err));
                return;
            }
            if (currentAttempt !== enrollAttemptRef.current) {
                popup.close();
                return;
            }
            if (typeof json.authorizeUrl !== "string" || typeof json.state !== "string") {
                popup.close();
                setEnrollStatus("error");
                setEnrollError("Invalid response from start endpoint");
                return;
            }
            const oauthState = json.state;
            // Origin for callback validation (respects VITE_BACKEND_URL overrides)
            const backendOrigin = new URL(backendBaseUrl).origin;
            // Navigate popup to the authorize URL
            popup.location.href = json.authorizeUrl;
            function isGovernorOAuthMessage(data) {
                return (typeof data === "object" &&
                    data !== null &&
                    data.type === "mux-governor-oauth");
            }
            // Listen for postMessage from callback page
            const handleMessage = (event) => {
                // Validate origin to prevent cross-origin attacks
                if (event.origin !== backendOrigin)
                    return;
                if (!isGovernorOAuthMessage(event.data))
                    return;
                // Validate state to prevent CSRF
                if (event.data.state !== oauthState)
                    return;
                window.removeEventListener("message", handleMessage);
                if (currentAttempt !== enrollAttemptRef.current)
                    return;
                if (event.data.ok) {
                    setEnrollStatus("success");
                    // Reload config
                    void (async () => {
                        const config = await api.config.getConfig();
                        setEnrolled(config.muxGovernorEnrolled);
                        setGovernorUrl(config.muxGovernorUrl);
                    })();
                }
                else {
                    setEnrollStatus("error");
                    setEnrollError(event.data.error ?? "OAuth failed");
                }
            };
            window.addEventListener("message", handleMessage);
            // Cleanup listener if popup is closed without completing
            // Note: we don't check enrollStatus here since it's captured at closure time
            // and may be stale. The attempt ref ensures we only reset for the current flow.
            const checkClosed = setInterval(() => {
                if (popup.closed) {
                    clearInterval(checkClosed);
                    window.removeEventListener("message", handleMessage);
                    browserFlowCleanupRef.current = null;
                    if (currentAttempt === enrollAttemptRef.current) {
                        setEnrollStatus("idle");
                    }
                }
            }, 500);
            // Store cleanup function for unmount
            browserFlowCleanupRef.current = () => {
                clearInterval(checkClosed);
                window.removeEventListener("message", handleMessage);
                popup.close();
            };
        }
    };
    const handleRefreshPolicy = async () => {
        if (!api)
            return;
        setRefreshingPolicy(true);
        setRefreshPolicyError(null);
        try {
            const result = await api.policy.refreshNow();
            if (!result.success) {
                setRefreshPolicyError(result.error);
            }
        }
        catch (error) {
            setRefreshPolicyError(error instanceof Error ? error.message : String(error));
        }
        finally {
            setRefreshingPolicy(false);
        }
    };
    const handleUnenroll = async () => {
        if (!api)
            return;
        try {
            await api.config.unenrollMuxGovernor();
            setEnrolled(false);
            setGovernorUrl(null);
            setRefreshPolicyError(null);
        }
        catch (error) {
            // Show error but don't crash
            console.error("Failed to unenroll from Governor:", error);
        }
    };
    const handleOpenUrlDialog = () => {
        setUrlInput("");
        setUrlError(null);
        setUrlWarning(null);
        setShowUrlDialog(true);
    };
    if (loadingConfig) {
        return (_jsxs("div", { className: "space-y-4", children: [_jsx("h2", { className: "text-lg font-semibold", children: "Mux Governor" }), _jsx("p", { className: "text-muted-foreground text-sm", children: "Loading..." })] }));
    }
    return (_jsxs("div", { className: "space-y-4", children: [_jsx("h2", { className: "text-lg font-semibold", children: "Mux Governor" }), enrolled ? (
            // Enrolled state
            _jsxs("div", { className: "space-y-4", children: [_jsx("p", { className: "text-muted-foreground text-sm", children: "You are enrolled in Mux Governor for enterprise policy delivery." }), _jsxs("div", { className: "flex items-center gap-2 text-sm", children: [_jsx(ShieldCheck, { className: "h-4 w-4 text-green-500" }), _jsx("span", { className: "font-medium", children: "Governor URL:" }), _jsx("code", { className: "rounded bg-zinc-700/50 px-2 py-0.5", children: governorUrl })] }), _jsxs("div", { className: "flex flex-wrap gap-2", children: [_jsx(Button, { variant: "secondary", size: "sm", onClick: () => void handleRefreshPolicy(), disabled: refreshingPolicy, children: refreshingPolicy ? "Refreshing..." : "Refresh policy" }), _jsx(Button, { variant: "destructive", size: "sm", onClick: () => void handleUnenroll(), children: "Unenroll from Mux Governor" })] }), refreshPolicyError && (_jsxs("div", { className: "text-destructive flex items-start gap-2 text-sm", children: [_jsx(X, { className: "mt-0.5 h-4 w-4" }), _jsx("span", { children: refreshPolicyError })] })), _jsxs("div", { className: "mt-4 space-y-2", children: [_jsxs("div", { className: "flex items-center gap-2 text-sm", children: [_jsx("span", { className: "font-medium", children: "Policy source:" }), _jsx("code", { className: "rounded bg-zinc-700/50 px-2 py-0.5", children: policyState.source })] }), _jsxs("div", { className: "flex items-center gap-2 text-sm", children: [_jsx("span", { className: "font-medium", children: "Policy status:" }), _jsx("code", { className: "rounded bg-zinc-700/50 px-2 py-0.5", children: policyState.status.state }), policyState.status.state === "blocked" && policyState.status.reason && (_jsxs("span", { className: "text-destructive text-xs", children: ["(", policyState.status.reason, ")"] }))] }), policyState.policy && (_jsxs("div", { className: "space-y-1", children: [_jsx("span", { className: "text-sm font-medium", children: "Effective policy:" }), _jsx(JsonHighlight, { value: policyState.policy })] }))] })] })) : enrollStatus === "idle" || enrollStatus === "success" ? (
            // Not enrolled - show enroll button
            _jsxs("div", { className: "space-y-4", children: [_jsx("p", { className: "text-muted-foreground text-sm", children: "Mux Governor enables enterprise policy delivery for centralized agent control. Enroll to connect to your organization's Governor server." }), _jsxs(Button, { onClick: handleOpenUrlDialog, children: [_jsx(ExternalLink, { className: "mr-2 h-4 w-4" }), "Enroll in Mux Governor"] })] })) : enrollStatus === "starting" ? (
            // Starting OAuth
            _jsx("div", { className: "space-y-4", children: _jsx("p", { className: "text-muted-foreground text-sm", children: "Starting enrollment..." }) })) : enrollStatus === "waiting" ? (
            // Waiting for OAuth callback
            _jsxs("div", { className: "space-y-4", children: [_jsx("p", { className: "text-muted-foreground text-sm", children: "Complete the sign-in in your browser, then return here." }), _jsx(Button, { variant: "secondary", onClick: () => {
                            // Bump attempt to invalidate any in-flight browser flow listeners
                            enrollAttemptRef.current += 1;
                            if (isDesktop && desktopFlowId && api) {
                                void api.muxGovernorOauth.cancelDesktopFlow({ flowId: desktopFlowId });
                            }
                            setEnrollStatus("idle");
                            setDesktopFlowId(null);
                        }, children: "Cancel" })] })) : (
            // Error state
            _jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "text-destructive flex items-start gap-2 text-sm", children: [_jsx(X, { className: "mt-0.5 h-4 w-4" }), _jsx("span", { children: enrollError ?? "Enrollment failed" })] }), _jsx(Button, { onClick: handleOpenUrlDialog, children: "Try Again" })] })), _jsx(Dialog, { open: showUrlDialog, onOpenChange: setShowUrlDialog, children: _jsxs(DialogContent, { children: [_jsx(DialogHeader, { children: _jsx(DialogTitle, { children: "Enter Governor URL" }) }), _jsxs("div", { className: "space-y-4 pt-4", children: [_jsx("p", { className: "text-muted-foreground text-sm", children: "Enter the URL of your organization's Mux Governor server." }), _jsx(Input, { placeholder: "https://governor.corp.com", value: urlInput, onChange: (e) => handleUrlInputChange(e.target.value), onKeyDown: (e) => {
                                        if (e.key === "Enter" && !urlError) {
                                            void handleStartEnroll();
                                        }
                                    } }), urlError && _jsx("p", { className: "text-destructive text-sm", children: urlError }), urlWarning && (_jsxs("div", { className: "flex items-start gap-2 rounded-md border border-yellow-500/50 bg-yellow-500/10 p-3 text-sm text-yellow-600 dark:text-yellow-400", children: [_jsx(AlertTriangle, { className: "mt-0.5 h-4 w-4 shrink-0" }), _jsx("span", { children: urlWarning })] })), _jsxs("div", { className: "flex justify-end gap-2", children: [_jsx(Button, { variant: "secondary", onClick: () => setShowUrlDialog(false), children: "Cancel" }), _jsx(Button, { onClick: () => void handleStartEnroll(), disabled: !urlInput.trim() || !!urlError, children: "Continue" })] })] })] }) })] }));
}
//# sourceMappingURL=GovernorSection.js.map