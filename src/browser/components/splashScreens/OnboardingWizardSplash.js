import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Bot, Boxes, Briefcase, Command as CommandIcon, Server, Sparkles, } from "lucide-react";
import { SplashScreen } from "./SplashScreen";
import { DocsLink } from "@/browser/components/DocsLink";
import { ProviderWithIcon } from "@/browser/components/ProviderIcon";
import { CoderIcon, DockerIcon, LocalIcon, SSHIcon, WorktreeIcon, } from "@/browser/components/icons/RuntimeIcons";
import { ProjectAddForm } from "@/browser/components/ProjectCreateModal";
import { useProjectContext } from "@/browser/contexts/ProjectContext";
import { Button } from "@/browser/components/ui/button";
import { useSettings } from "@/browser/contexts/SettingsContext";
import { getStoredAuthToken } from "@/browser/components/AuthTokenModal";
import { getBrowserBackendBaseUrl } from "@/browser/utils/backendBaseUrl";
import { useAPI } from "@/browser/contexts/API";
import { updatePersistedState } from "@/browser/hooks/usePersistedState";
import { getEligibleGatewayModels } from "@/browser/utils/gatewayModels";
import { useProvidersConfig } from "@/browser/hooks/useProvidersConfig";
import { formatMuxGatewayBalance, useMuxGatewayAccountStatus, } from "@/browser/hooks/useMuxGatewayAccountStatus";
import { KEYBINDS, formatKeybind } from "@/browser/utils/ui/keybinds";
import { getAgentsInitNudgeKey } from "@/common/constants/storage";
import { PROVIDER_DISPLAY_NAMES } from "@/common/constants/providers";
import { usePolicy } from "@/browser/contexts/PolicyContext";
import { getAllowedProvidersForUi } from "@/browser/utils/policyUi";
function getServerAuthToken() {
    const urlToken = new URLSearchParams(window.location.search).get("token")?.trim();
    return urlToken?.length ? urlToken : getStoredAuthToken();
}
const GATEWAY_MODELS_KEY = "gateway-models";
const KBD_CLASSNAME = "bg-background-secondary text-foreground border-border-medium rounded border px-2 py-0.5 font-mono text-xs";
function ProgressDots(props) {
    return (_jsx("div", { className: "flex items-center gap-1", "aria-label": `Step ${props.activeIndex + 1} of ${props.count}`, children: Array.from({ length: props.count }).map((_, i) => (_jsx("span", { className: `h-1.5 w-1.5 rounded-full ${i === props.activeIndex ? "bg-accent" : "bg-border-medium"}` }, `dot-${i}`))) }));
}
function WizardHeader(props) {
    return (_jsxs("div", { className: "flex items-center justify-end gap-2", children: [_jsxs("span", { className: "text-muted text-xs", children: [props.stepIndex + 1, " / ", props.totalSteps] }), _jsx(ProgressDots, { count: props.totalSteps, activeIndex: props.stepIndex })] }));
}
function Card(props) {
    return (_jsxs("div", { className: `bg-background-secondary border-border-medium rounded-lg border p-3 ${props.className ?? ""}`, children: [_jsxs("div", { className: "text-foreground flex items-center gap-2 text-sm font-medium", children: [_jsx("span", { className: "bg-accent/10 text-accent inline-flex h-7 w-7 items-center justify-center rounded-md", children: props.icon }), props.title] }), _jsx("div", { className: "text-muted mt-2 text-sm", children: props.children })] }));
}
function CommandPalettePreview(props) {
    return (_jsxs("div", { className: "font-primary overflow-hidden rounded-lg border border-[var(--color-command-border)] bg-[var(--color-command-surface)] text-[var(--color-command-foreground)]", "aria-label": "Command palette preview", children: [_jsx("div", { className: "border-b border-[var(--color-command-input-border)] bg-[var(--color-command-input)] px-3.5 py-3 text-sm", children: _jsxs("span", { className: "text-[var(--color-command-subdued)]", children: ["Switch workspaces or type ", _jsx("span", { className: "font-mono", children: ">" }), " for all commands\u2026"] }) }), _jsxs("div", { className: "px-1.5 py-2", children: [_jsx("div", { className: "px-2.5 py-1 text-[11px] tracking-[0.08em] text-[var(--color-command-subdued)] uppercase", children: "Recent" }), _jsxs("div", { className: "hover:bg-hover mx-1 my-0.5 grid grid-cols-[1fr_auto] items-center gap-2 rounded-md px-3 py-2 text-[13px]", children: [_jsxs("div", { children: ["Create New Workspace\u2026", _jsx("br", {}), _jsx("span", { className: "text-xs text-[var(--color-command-subdued)]", children: "Start a new workspace (Local / Worktree / SSH / Docker)" })] }), _jsx("span", { className: "font-monospace text-[11px] text-[var(--color-command-subdued)]", children: ">new" })] }), _jsxs("div", { className: "bg-hover mx-1 my-0.5 grid grid-cols-[1fr_auto] items-center gap-2 rounded-md px-3 py-2 text-[13px]", children: [_jsxs("div", { children: ["Open Settings\u2026", _jsx("br", {}), _jsx("span", { className: "text-xs text-[var(--color-command-subdued)]", children: "Jump to providers, models, MCP\u2026" })] }), _jsx("span", { className: "font-monospace text-[11px] text-[var(--color-command-subdued)]", children: ">settings" })] }), _jsxs("div", { className: "hover:bg-hover mx-1 my-0.5 grid grid-cols-[1fr_auto] items-center gap-2 rounded-md px-3 py-2 text-[13px]", children: [_jsxs("div", { children: ["Help: Keybinds", _jsx("br", {}), _jsx("span", { className: "text-xs text-[var(--color-command-subdued)]", children: "Discover shortcuts for the whole app" })] }), _jsx("span", { className: "font-monospace text-[11px] text-[var(--color-command-subdued)]", children: props.shortcut })] })] })] }));
}
export function OnboardingWizardSplash(props) {
    const [stepIndex, setStepIndex] = useState(0);
    const { open: openSettings } = useSettings();
    const policyState = usePolicy();
    const effectivePolicy = policyState.status.state === "enforced" ? (policyState.policy ?? null) : null;
    const visibleProviders = useMemo(() => getAllowedProvidersForUi(effectivePolicy), [effectivePolicy]);
    const { config: providersConfig, loading: providersLoading } = useProvidersConfig();
    const { addProject, projects } = useProjectContext();
    const projectAddFormRef = useRef(null);
    const [isProjectCreating, setIsProjectCreating] = useState(false);
    const [direction, setDirection] = useState("forward");
    const { api } = useAPI();
    const { data: muxGatewayAccountStatus, error: muxGatewayAccountError, isLoading: muxGatewayAccountLoading, refresh: refreshMuxGatewayAccountStatus, } = useMuxGatewayAccountStatus();
    const backendBaseUrl = getBrowserBackendBaseUrl();
    const backendOrigin = useMemo(() => {
        try {
            return new URL(backendBaseUrl).origin;
        }
        catch {
            return window.location.origin;
        }
    }, [backendBaseUrl]);
    const isDesktop = !!window.api;
    const [muxGatewayLoginStatus, setMuxGatewayLoginStatus] = useState("idle");
    const [muxGatewayLoginError, setMuxGatewayLoginError] = useState(null);
    const muxGatewayApplyDefaultModelsOnSuccessRef = useRef(false);
    const muxGatewayLoginAttemptRef = useRef(0);
    const [muxGatewayDesktopFlowId, setMuxGatewayDesktopFlowId] = useState(null);
    const [muxGatewayServerState, setMuxGatewayServerState] = useState(null);
    const cancelMuxGatewayLogin = useCallback(() => {
        muxGatewayApplyDefaultModelsOnSuccessRef.current = false;
        muxGatewayLoginAttemptRef.current++;
        if (isDesktop && api && muxGatewayDesktopFlowId) {
            void api.muxGatewayOauth.cancelDesktopFlow({ flowId: muxGatewayDesktopFlowId });
        }
        setMuxGatewayDesktopFlowId(null);
        setMuxGatewayServerState(null);
        setMuxGatewayLoginStatus("idle");
        setMuxGatewayLoginError(null);
    }, [api, isDesktop, muxGatewayDesktopFlowId]);
    const startMuxGatewayLogin = useCallback(async () => {
        const attempt = ++muxGatewayLoginAttemptRef.current;
        // Enable Mux Gateway for all eligible models after the *first* successful login.
        const isLoggedIn = providersConfig?.["mux-gateway"]?.couponCodeSet ?? false;
        muxGatewayApplyDefaultModelsOnSuccessRef.current = !isLoggedIn;
        try {
            setMuxGatewayLoginError(null);
            setMuxGatewayDesktopFlowId(null);
            setMuxGatewayServerState(null);
            if (isDesktop) {
                if (!api) {
                    setMuxGatewayLoginStatus("error");
                    setMuxGatewayLoginError("Mux API not connected.");
                    return;
                }
                setMuxGatewayLoginStatus("starting");
                const startResult = await api.muxGatewayOauth.startDesktopFlow();
                if (attempt !== muxGatewayLoginAttemptRef.current) {
                    if (startResult.success) {
                        void api.muxGatewayOauth.cancelDesktopFlow({ flowId: startResult.data.flowId });
                    }
                    return;
                }
                if (!startResult.success) {
                    setMuxGatewayLoginStatus("error");
                    setMuxGatewayLoginError(startResult.error);
                    return;
                }
                const { flowId, authorizeUrl } = startResult.data;
                setMuxGatewayDesktopFlowId(flowId);
                setMuxGatewayLoginStatus("waiting");
                // Desktop main process intercepts external window.open() calls and routes them via shell.openExternal.
                window.open(authorizeUrl, "_blank", "noopener");
                if (attempt !== muxGatewayLoginAttemptRef.current) {
                    return;
                }
                const waitResult = await api.muxGatewayOauth.waitForDesktopFlow({ flowId });
                if (attempt !== muxGatewayLoginAttemptRef.current) {
                    return;
                }
                if (waitResult.success) {
                    if (muxGatewayApplyDefaultModelsOnSuccessRef.current) {
                        let latestConfig = providersConfig;
                        try {
                            latestConfig = await api.providers.getConfig();
                        }
                        catch {
                            // Ignore errors fetching config; fall back to the current snapshot.
                        }
                        if (attempt !== muxGatewayLoginAttemptRef.current) {
                            return;
                        }
                        updatePersistedState(GATEWAY_MODELS_KEY, getEligibleGatewayModels(latestConfig));
                        muxGatewayApplyDefaultModelsOnSuccessRef.current = false;
                    }
                    setMuxGatewayLoginStatus("success");
                    void refreshMuxGatewayAccountStatus();
                    return;
                }
                setMuxGatewayLoginStatus("error");
                setMuxGatewayLoginError(waitResult.error);
                return;
            }
            // Browser/server mode: use unauthenticated bootstrap route.
            // Open popup synchronously to preserve user gesture context (avoids popup blockers).
            const popup = window.open("about:blank", "_blank");
            if (!popup) {
                throw new Error("Popup blocked - please allow popups and try again.");
            }
            setMuxGatewayLoginStatus("starting");
            const startUrl = new URL(`${backendBaseUrl}/auth/mux-gateway/start`);
            const authToken = getServerAuthToken();
            let json;
            try {
                const res = await fetch(startUrl, {
                    headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined,
                });
                const contentType = res.headers.get("content-type") ?? "";
                if (!contentType.includes("application/json")) {
                    const body = await res.text();
                    const prefix = body.trim().slice(0, 80);
                    throw new Error(`Unexpected response from ${startUrl.toString()} (expected JSON, got ${contentType || "unknown"}): ${prefix}`);
                }
                json = (await res.json());
                if (!res.ok) {
                    const message = typeof json.error === "string" ? json.error : `HTTP ${res.status}`;
                    throw new Error(message);
                }
            }
            catch (err) {
                popup.close();
                throw err;
            }
            if (attempt !== muxGatewayLoginAttemptRef.current) {
                popup.close();
                return;
            }
            if (typeof json.authorizeUrl !== "string" || typeof json.state !== "string") {
                popup.close();
                throw new Error(`Invalid response from ${startUrl.pathname}`);
            }
            setMuxGatewayServerState(json.state);
            popup.location.href = json.authorizeUrl;
            setMuxGatewayLoginStatus("waiting");
        }
        catch (err) {
            if (attempt !== muxGatewayLoginAttemptRef.current) {
                return;
            }
            const message = err instanceof Error ? err.message : String(err);
            setMuxGatewayLoginStatus("error");
            setMuxGatewayLoginError(message);
        }
    }, [api, backendBaseUrl, isDesktop, providersConfig, refreshMuxGatewayAccountStatus]);
    useEffect(() => {
        const attempt = muxGatewayLoginAttemptRef.current;
        if (isDesktop || muxGatewayLoginStatus !== "waiting" || !muxGatewayServerState) {
            return;
        }
        const handleMessage = (event) => {
            if (event.origin !== backendOrigin)
                return;
            if (muxGatewayLoginAttemptRef.current !== attempt)
                return;
            const data = event.data;
            if (!data || typeof data !== "object")
                return;
            if (data.type !== "mux-gateway-oauth")
                return;
            if (data.state !== muxGatewayServerState)
                return;
            if (data.ok === true) {
                if (muxGatewayApplyDefaultModelsOnSuccessRef.current) {
                    muxGatewayApplyDefaultModelsOnSuccessRef.current = false;
                    const applyLatest = (latestConfig) => {
                        if (muxGatewayLoginAttemptRef.current !== attempt)
                            return;
                        updatePersistedState(GATEWAY_MODELS_KEY, getEligibleGatewayModels(latestConfig));
                    };
                    if (api) {
                        api.providers
                            .getConfig()
                            .then(applyLatest)
                            .catch(() => applyLatest(providersConfig));
                    }
                    else {
                        applyLatest(providersConfig);
                    }
                }
                setMuxGatewayLoginStatus("success");
                void refreshMuxGatewayAccountStatus();
                return;
            }
            const msg = typeof data.error === "string" ? data.error : "Login failed";
            setMuxGatewayLoginStatus("error");
            setMuxGatewayLoginError(msg);
        };
        window.addEventListener("message", handleMessage);
        return () => window.removeEventListener("message", handleMessage);
    }, [
        api,
        backendOrigin,
        isDesktop,
        muxGatewayLoginStatus,
        muxGatewayServerState,
        providersConfig,
        refreshMuxGatewayAccountStatus,
    ]);
    const muxGatewayCouponCodeSet = providersConfig?.["mux-gateway"]?.couponCodeSet ?? false;
    const muxGatewayLoginInProgress = muxGatewayLoginStatus === "waiting" || muxGatewayLoginStatus === "starting";
    const muxGatewayIsLoggedIn = muxGatewayCouponCodeSet || muxGatewayLoginStatus === "success";
    const muxGatewayLoginButtonLabel = muxGatewayLoginStatus === "error"
        ? "Try again"
        : muxGatewayLoginInProgress
            ? "Waiting for login..."
            : muxGatewayIsLoggedIn
                ? "Re-login to Mux Gateway"
                : "Login with Mux Gateway";
    const configuredProviders = useMemo(() => visibleProviders.filter((provider) => providersConfig?.[provider]?.isConfigured === true), [providersConfig, visibleProviders]);
    const configuredProvidersSummary = useMemo(() => {
        if (configuredProviders.length === 0) {
            return null;
        }
        return configuredProviders.map((p) => PROVIDER_DISPLAY_NAMES[p]).join(", ");
    }, [configuredProviders]);
    const [hasConfiguredProvidersAtStart, setHasConfiguredProvidersAtStart] = useState(null);
    useEffect(() => {
        if (hasConfiguredProvidersAtStart !== null) {
            return;
        }
        if (providersLoading) {
            return;
        }
        setHasConfiguredProvidersAtStart(configuredProviders.length > 0);
    }, [configuredProviders.length, hasConfiguredProvidersAtStart, providersLoading]);
    const commandPaletteShortcut = formatKeybind(KEYBINDS.OPEN_COMMAND_PALETTE);
    const commandPaletteShortcutAlt = formatKeybind(KEYBINDS.OPEN_COMMAND_PALETTE_ALT);
    const agentPickerShortcut = formatKeybind(KEYBINDS.TOGGLE_AGENT);
    const cycleAgentShortcut = formatKeybind(KEYBINDS.CYCLE_AGENT);
    const steps = useMemo(() => {
        if (hasConfiguredProvidersAtStart === null) {
            return [
                {
                    key: "loading",
                    title: "Getting started",
                    icon: _jsx(Sparkles, { className: "h-4 w-4" }),
                    body: (_jsx(_Fragment, { children: _jsx("p", { children: "Checking your provider configuration\u2026" }) })),
                },
            ];
        }
        const nextSteps = [];
        if (hasConfiguredProvidersAtStart === false) {
            nextSteps.push({
                key: "mux-gateway",
                title: "Mux Gateway (evaluation credits)",
                icon: _jsx(Sparkles, { className: "h-4 w-4" }),
                body: (_jsxs(_Fragment, { children: [_jsxs("p", { children: ["Mux Gateway enables you to use free AI tokens from", " ", _jsx("a", { href: "https://coder.com", target: "_blank", rel: "noopener noreferrer", className: "text-accent hover:underline", children: "Coder" }), "."] }), _jsx("p", { children: "OSS contributors with GitHub accounts older than 12 months (or GitHub Pro members) can use this to get free evaluation credits." }), muxGatewayIsLoggedIn ? (_jsx("div", { className: "mt-3 space-y-2", children: _jsxs("div", { className: "border-border-medium bg-background-secondary rounded-md border p-2 text-xs", children: [_jsxs("div", { className: "flex flex-wrap items-center justify-between gap-2", children: [_jsx("div", { className: "text-foreground font-medium", children: "Mux Gateway account" }), _jsx(Button, { variant: "secondary", size: "sm", onClick: () => {
                                                    void refreshMuxGatewayAccountStatus();
                                                }, disabled: muxGatewayAccountLoading, children: muxGatewayAccountLoading ? "Refreshing..." : "Refresh" })] }), _jsxs("div", { className: "mt-2 space-y-1", children: [_jsxs("div", { className: "flex items-center justify-between gap-4", children: [_jsx("span", { className: "text-muted", children: "Balance" }), _jsx("span", { className: "text-foreground font-mono", children: formatMuxGatewayBalance(muxGatewayAccountStatus?.remaining_microdollars) })] }), _jsxs("div", { className: "flex items-center justify-between gap-4", children: [_jsx("span", { className: "text-muted", children: "Concurrent requests per user" }), _jsx("span", { className: "text-foreground font-mono", children: muxGatewayAccountStatus?.ai_gateway_concurrent_requests_per_user ?? "—" })] })] }), muxGatewayAccountError && (_jsx("div", { className: "text-destructive mt-2", children: muxGatewayAccountError }))] }) })) : (_jsxs(_Fragment, { children: [_jsxs("div", { className: "mt-3 flex flex-wrap gap-2", children: [_jsx(Button, { onClick: () => {
                                                void startMuxGatewayLogin();
                                            }, disabled: muxGatewayLoginInProgress, children: muxGatewayLoginButtonLabel }), muxGatewayLoginInProgress && (_jsx(Button, { variant: "secondary", onClick: cancelMuxGatewayLogin, children: "Cancel" }))] }), muxGatewayLoginStatus === "waiting" && (_jsx("p", { className: "mt-3", children: "Finish the login flow in your browser, then return here." })), muxGatewayLoginStatus === "error" && muxGatewayLoginError && (_jsxs("p", { className: "mt-3", children: [_jsx("strong", { className: "text-destructive", children: "Login failed:" }), " ", muxGatewayLoginError] }))] })), _jsx("p", { className: "mt-3", children: "You can also receive those credits through:" }), _jsxs("ul", { className: "ml-4 list-disc space-y-1", children: [_jsxs("li", { children: ["early adopters can request credits tied to their GH logins on our", " ", _jsx("a", { href: "https://discord.gg/VfZXvtnR", target: "_blank", rel: "noopener noreferrer", className: "text-accent hover:underline", children: "Discord" })] }), _jsxs("li", { children: ["vouchers which you can", " ", _jsx("a", { href: "https://gateway.mux.coder.com", target: "_blank", rel: "noopener noreferrer", className: "text-accent hover:underline", children: "claim here" })] })] }), _jsxs("p", { className: "mt-3", children: ["You can enable this in", " ", _jsx("button", { type: "button", className: "text-accent hover:underline", onClick: () => openSettings("providers"), children: "Settings \u2192 Providers" }), "."] })] })),
            });
        }
        nextSteps.push({
            key: "providers",
            title: "Choose your own AI providers",
            icon: _jsx(Sparkles, { className: "h-4 w-4" }),
            body: (_jsxs(_Fragment, { children: [_jsx("p", { children: "Mux is provider-agnostic: bring your own keys, mix and match models, or run locally." }), configuredProviders.length > 0 && configuredProvidersSummary ? (_jsxs("p", { className: "mt-3 text-xs", children: [_jsx("span", { className: "text-foreground font-medium", children: "Configured:" }), " ", configuredProvidersSummary] })) : (_jsx("p", { className: "mt-3 text-xs", children: "No providers configured yet." })), _jsxs("div", { className: "mt-3", children: [_jsx("div", { className: "text-foreground mb-2 text-xs font-medium", children: "Available providers" }), _jsx("div", { className: "grid grid-cols-2 gap-2", children: visibleProviders.map((provider) => {
                                    const configured = providersConfig?.[provider]?.isConfigured === true;
                                    return (_jsxs("button", { type: "button", className: "bg-background-secondary border-border-medium text-foreground hover:bg-hover flex w-full cursor-pointer items-center justify-between rounded-md border px-2 py-1 text-left text-xs", title: configured ? "Configured" : "Not configured", onClick: () => openSettings("providers", { expandProvider: provider }), children: [_jsx(ProviderWithIcon, { provider: provider, displayName: true, iconClassName: "text-accent" }), _jsx("span", { className: `h-2 w-2 rounded-full ${configured ? "bg-green-500" : "bg-border-medium"}` })] }, provider));
                                }) }), _jsxs("div", { className: "text-muted mt-2 flex items-center gap-2 text-xs", children: [_jsx("span", { className: "h-2 w-2 rounded-full bg-green-500" }), _jsx("span", { children: "Configured" }), _jsx("span", { className: "bg-border-medium h-2 w-2 rounded-full" }), _jsx("span", { children: "Not configured" })] })] }), _jsxs("p", { className: "mt-3", children: ["Configure keys and endpoints in", " ", _jsx("button", { type: "button", className: "text-accent hover:underline", onClick: () => openSettings("providers"), children: "Settings \u2192 Providers" }), "."] })] })),
        });
        const projectStepIndex = nextSteps.length;
        nextSteps.push({
            key: "projects",
            title: "Add your first project",
            icon: _jsx(Briefcase, { className: "h-4 w-4" }),
            body: (_jsxs(_Fragment, { children: [_jsx("p", { children: "Projects are the folders or repos you want Mux to work in. Add a local folder or clone from GitHub, then click Next." }), projects.size > 0 ? (_jsxs("p", { className: "mt-3 text-xs", children: [_jsx("span", { className: "text-foreground font-medium", children: "Configured:" }), " ", projects.size, " ", "project", projects.size === 1 ? "" : "s"] })) : (_jsx("p", { className: "mt-3 text-xs", children: "No projects added yet." })), _jsx("div", { className: "mt-3", children: _jsx(ProjectAddForm, { ref: projectAddFormRef, isOpen: true, autoFocus: projects.size === 0, hideFooter: true, onIsCreatingChange: setIsProjectCreating, onSuccess: (normalizedPath, projectConfig) => {
                                addProject(normalizedPath, projectConfig);
                                updatePersistedState(getAgentsInitNudgeKey(normalizedPath), true);
                                setDirection("forward");
                                setStepIndex(projectStepIndex + 1);
                            } }) }), _jsx("p", { className: "mt-2 text-xs", children: projects.size > 0
                            ? "Add another folder or repo, or leave this blank and click Next to continue."
                            : "Click Next to add this project." })] })),
        });
        nextSteps.push({
            key: "agents",
            title: "Agents: Plan, Exec, and custom",
            icon: _jsx(Bot, { className: "h-4 w-4" }),
            body: (_jsxs(_Fragment, { children: [_jsxs("p", { children: ["Agents are file-based definitions (system prompt + tool policy). You can create project-local agents in ", _jsx("code", { className: "text-accent", children: ".mux/agents/*.md" }), " or global agents in ", _jsx("code", { className: "text-accent", children: "~/.mux/agents/*.md" }), "."] }), _jsxs("div", { className: "mt-3 grid gap-2", children: [_jsx(Card, { icon: _jsx(Sparkles, { className: "h-4 w-4" }), title: "Use Plan to design the spec", children: "When the change is complex, switch to a plan-like agent first: write an explicit plan (files, steps, risks), then execute." }), _jsx(Card, { icon: _jsx(Bot, { className: "h-4 w-4" }), title: "Quick shortcuts", children: _jsxs("div", { className: "mt-1 flex flex-wrap items-center gap-2", children: [_jsx("span", { children: "Agent picker" }), _jsx("kbd", { className: KBD_CLASSNAME, children: agentPickerShortcut }), _jsx("span", { className: "text-muted mx-1", children: "\u2022" }), _jsx("span", { children: "Cycle agent" }), _jsx("kbd", { className: KBD_CLASSNAME, children: cycleAgentShortcut })] }) })] }), _jsxs("div", { className: "mt-3 flex items-center gap-3", children: [_jsx(DocsLink, { path: "/agents", children: "Agent docs" }), _jsx(DocsLink, { path: "/agents/plan-mode", children: "Plan mode" })] })] })),
        });
        nextSteps.push({
            key: "runtimes",
            title: "Multiple runtimes",
            icon: _jsx(Boxes, { className: "h-4 w-4" }),
            body: (_jsxs(_Fragment, { children: [_jsx("p", { children: "Each workspace can run in the environment that fits the job: keep it local, isolate with a git worktree, run remotely over SSH, or use a per-workspace Docker container." }), _jsxs("div", { className: "mt-3 grid gap-2", children: [_jsx(Card, { icon: _jsx(LocalIcon, { size: 14 }), title: "Local", children: "Work directly in your project directory." }), _jsxs(Card, { icon: _jsx(WorktreeIcon, { size: 14 }), title: "Worktree", children: ["Isolated git worktree under ", _jsx("code", { className: "text-accent", children: "~/.mux/src" }), "."] }), _jsx(Card, { icon: _jsx(SSHIcon, { size: 14 }), title: "SSH", children: "Remote clone and commands run on an SSH host." }), _jsx(Card, { icon: _jsx(CoderIcon, { size: 14 }), title: "Coder (SSH)", children: "Use Coder workspaces over SSH for a managed remote dev environment." }), _jsx(Card, { icon: _jsx(DockerIcon, { size: 14 }), title: "Docker", children: "Isolated container per workspace." })] }), _jsx("p", { className: "mt-3", children: "You can set a project default runtime in the workspace controls." })] })),
        });
        nextSteps.push({
            key: "mcp",
            title: "MCP servers",
            icon: _jsx(Server, { className: "h-4 w-4" }),
            body: (_jsxs(_Fragment, { children: [_jsx("p", { children: "MCP servers extend Mux with tools (memory, ticketing, databases, internal APIs). Configure them globally, with optional repo overrides and per-workspace overrides." }), _jsxs("div", { className: "mt-3 grid gap-2", children: [_jsx(Card, { icon: _jsx(Server, { className: "h-4 w-4" }), title: "Global config", children: _jsx("code", { className: "text-accent", children: "~/.mux/mcp.jsonc" }) }), _jsx(Card, { icon: _jsx(Server, { className: "h-4 w-4" }), title: "Repo overrides", children: _jsx("code", { className: "text-accent", children: "./.mux/mcp.jsonc" }) }), _jsx(Card, { icon: _jsx(Server, { className: "h-4 w-4" }), title: "Workspace overrides", children: _jsx("code", { className: "text-accent", children: ".mux/mcp.local.jsonc" }) })] }), _jsxs("p", { className: "mt-3", children: ["Manage servers in ", _jsx("span", { className: "text-foreground", children: "Settings \u2192 MCP" }), "."] })] })),
        });
        nextSteps.push({
            key: "palette",
            title: "Command palette",
            icon: _jsx(CommandIcon, { className: "h-4 w-4" }),
            body: (_jsxs(_Fragment, { children: [_jsx("p", { children: "The command palette is the fastest way to navigate, create workspaces, and discover features." }), _jsxs("div", { className: "mt-3 flex flex-wrap items-center gap-2", children: [_jsx("span", { className: "text-muted text-sm", children: "Open command palette" }), _jsx("kbd", { className: KBD_CLASSNAME, children: commandPaletteShortcut }), _jsx("span", { className: "text-muted text-sm", children: "or" }), _jsx("kbd", { className: KBD_CLASSNAME, children: commandPaletteShortcutAlt })] }), _jsx("div", { className: "mt-3", children: _jsx(CommandPalettePreview, { shortcut: commandPaletteShortcut }) }), _jsxs("p", { className: "mt-3", children: ["Tip: type ", _jsx("code", { className: "text-accent", children: ">" }), " for commands and", " ", _jsx("code", { className: "text-accent", children: "/" }), " for slash commands."] })] })),
        });
        return nextSteps;
    }, [
        addProject,
        agentPickerShortcut,
        cancelMuxGatewayLogin,
        commandPaletteShortcut,
        commandPaletteShortcutAlt,
        configuredProviders.length,
        configuredProvidersSummary,
        cycleAgentShortcut,
        hasConfiguredProvidersAtStart,
        muxGatewayAccountError,
        muxGatewayAccountLoading,
        muxGatewayAccountStatus,
        muxGatewayIsLoggedIn,
        muxGatewayLoginButtonLabel,
        muxGatewayLoginError,
        muxGatewayLoginInProgress,
        muxGatewayLoginStatus,
        openSettings,
        projects.size,
        providersConfig,
        refreshMuxGatewayAccountStatus,
        startMuxGatewayLogin,
        visibleProviders,
    ]);
    useEffect(() => {
        setStepIndex((index) => Math.min(index, steps.length - 1));
    }, [steps.length]);
    const totalSteps = steps.length;
    const currentStep = steps[stepIndex] ?? steps[0];
    useEffect(() => {
        if (currentStep?.key !== "mux-gateway" && muxGatewayLoginInProgress) {
            cancelMuxGatewayLogin();
        }
    }, [cancelMuxGatewayLogin, currentStep?.key, muxGatewayLoginInProgress]);
    if (!currentStep) {
        return null;
    }
    const isLoading = hasConfiguredProvidersAtStart === null;
    const canGoBack = !isLoading && stepIndex > 0;
    const canGoForward = !isLoading && stepIndex < totalSteps - 1;
    const goBack = () => {
        if (!canGoBack) {
            return;
        }
        setDirection("back");
        setStepIndex((i) => Math.max(0, i - 1));
    };
    const goForward = () => {
        if (!canGoForward) {
            return;
        }
        setDirection("forward");
        setStepIndex((i) => Math.min(totalSteps - 1, i + 1));
    };
    const isProjectStep = currentStep.key === "projects";
    const primaryLabel = isLoading ? "Next" : canGoForward ? "Next" : "Done";
    const primaryButtonLabel = isProjectStep && isProjectCreating ? "Adding..." : primaryLabel;
    const primaryDisabled = isLoading || (isProjectStep && isProjectCreating);
    return (_jsx(SplashScreen, { title: currentStep.title, onDismiss: () => {
            cancelMuxGatewayLogin();
            props.onDismiss();
        }, dismissLabel: null, footerClassName: "justify-between", footer: _jsxs(_Fragment, { children: [_jsx("div", { children: canGoBack && (_jsxs(Button, { variant: "secondary", onClick: goBack, className: "min-w-24", children: [_jsx(ArrowLeft, { className: "h-4 w-4" }), "Back"] })) }), _jsxs("div", { className: "flex items-center gap-3", children: [_jsx(Button, { className: "min-w-24", onClick: () => {
                                if (primaryDisabled) {
                                    return;
                                }
                                if (isProjectStep) {
                                    const form = projectAddFormRef.current;
                                    if (!form) {
                                        goForward();
                                        return;
                                    }
                                    const trimmedInput = form.getTrimmedInput();
                                    if (!trimmedInput && projects.size > 0) {
                                        goForward();
                                        return;
                                    }
                                    void form.submit();
                                    return;
                                }
                                if (canGoForward) {
                                    goForward();
                                    return;
                                }
                                props.onDismiss();
                            }, disabled: primaryDisabled, children: primaryButtonLabel }), _jsx(Button, { variant: "secondary", onClick: props.onDismiss, className: "min-w-24", children: "Skip" })] })] }), children: _jsxs("div", { className: "text-muted flex flex-col gap-4", children: [_jsx(WizardHeader, { stepIndex: stepIndex, totalSteps: totalSteps }), _jsxs("div", { className: `flex flex-col gap-3 ${direction === "forward"
                        ? "animate-in fade-in-0 slide-in-from-right-2"
                        : "animate-in fade-in-0 slide-in-from-left-2"}`, children: [_jsxs("div", { className: "text-foreground flex items-center gap-2 text-sm font-medium", children: [_jsx("span", { className: "bg-accent/10 text-accent inline-flex h-8 w-8 items-center justify-center rounded-md", children: currentStep.icon }), _jsx("span", { children: currentStep.title })] }), _jsx("div", { className: "text-muted flex flex-col gap-3 text-sm", children: currentStep.body })] }, currentStep.key)] }) }));
}
//# sourceMappingURL=OnboardingWizardSplash.js.map