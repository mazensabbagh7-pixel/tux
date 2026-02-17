import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Check, Eye, EyeOff, ExternalLink, ShieldCheck, X, } from "lucide-react";
import { createEditKeyHandler } from "@/browser/utils/ui/keybinds";
import { getBrowserBackendBaseUrl } from "@/browser/utils/backendBaseUrl";
import { usePolicy } from "@/browser/contexts/PolicyContext";
import { getAllowedProvidersForUi } from "@/browser/utils/policyUi";
import { ProviderWithIcon } from "@/browser/components/ProviderIcon";
import { getStoredAuthToken } from "@/browser/components/AuthTokenModal";
import { useAPI } from "@/browser/contexts/API";
import { useSettings } from "@/browser/contexts/SettingsContext";
import { usePersistedState } from "@/browser/hooks/usePersistedState";
import { useProvidersConfig } from "@/browser/hooks/useProvidersConfig";
import { formatMuxGatewayBalance, useMuxGatewayAccountStatus, } from "@/browser/hooks/useMuxGatewayAccountStatus";
import { useGateway } from "@/browser/hooks/useGatewayModels";
import { getEligibleGatewayModels } from "@/browser/utils/gatewayModels";
import { Button } from "@/browser/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, } from "@/browser/components/ui/select";
import { Switch } from "@/browser/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/browser/components/ui/toggle-group";
import { HelpIndicator, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger, } from "@/browser/components/ui/tooltip";
function getServerAuthToken() {
    const urlToken = new URLSearchParams(window.location.search).get("token")?.trim();
    return urlToken?.length ? urlToken : getStoredAuthToken();
}
const GATEWAY_MODELS_KEY = "gateway-models";
/**
 * Get provider-specific field configuration.
 * Most providers use API Key + Base URL, but some (like Bedrock) have different needs.
 */
function getProviderFields(provider) {
    if (provider === "bedrock") {
        return [
            { key: "region", label: "Region", placeholder: "us-east-1", type: "text" },
            {
                key: "profile",
                label: "AWS Profile",
                placeholder: "my-sso-profile",
                type: "text",
                optional: true,
            },
            {
                key: "bearerToken",
                label: "Bearer Token",
                placeholder: "AWS_BEARER_TOKEN_BEDROCK",
                type: "secret",
                optional: true,
            },
            {
                key: "accessKeyId",
                label: "Access Key ID",
                placeholder: "AWS Access Key ID",
                type: "secret",
                optional: true,
            },
            {
                key: "secretAccessKey",
                label: "Secret Access Key",
                placeholder: "AWS Secret Access Key",
                type: "secret",
                optional: true,
            },
        ];
    }
    if (provider === "mux-gateway") {
        return [];
    }
    if (provider === "github-copilot") {
        return []; // OAuth-based, no manual key entry
    }
    // Default for most providers
    return [
        { key: "apiKey", label: "API Key", placeholder: "Enter API key", type: "secret" },
        {
            key: "baseUrl",
            label: "Base URL",
            placeholder: "https://api.example.com",
            type: "text",
            optional: true,
        },
    ];
}
/**
 * URLs to create/manage API keys for each provider.
 */
const PROVIDER_KEY_URLS = {
    anthropic: "https://console.anthropic.com/settings/keys",
    openai: "https://platform.openai.com/api-keys",
    google: "https://aistudio.google.com/app/apikey",
    xai: "https://console.x.ai/team/default/api-keys",
    deepseek: "https://platform.deepseek.com/api_keys",
    openrouter: "https://openrouter.ai/settings/keys",
    // bedrock: AWS credential chain, no simple key URL
    // ollama: local service, no key needed
};
export function ProvidersSection() {
    const policyState = usePolicy();
    const effectivePolicy = policyState.status.state === "enforced" ? (policyState.policy ?? null) : null;
    const visibleProviders = useMemo(() => getAllowedProvidersForUi(effectivePolicy), [effectivePolicy]);
    const { providersExpandedProvider, setProvidersExpandedProvider } = useSettings();
    const { api } = useAPI();
    const { config, refresh, updateOptimistically } = useProvidersConfig();
    const { data: muxGatewayAccountStatus, error: muxGatewayAccountError, isLoading: muxGatewayAccountLoading, refresh: refreshMuxGatewayAccountStatus, } = useMuxGatewayAccountStatus();
    const gateway = useGateway();
    const [gatewayModels, setGatewayModels] = usePersistedState(GATEWAY_MODELS_KEY, [], {
        listener: true,
    });
    const eligibleGatewayModels = useMemo(() => getEligibleGatewayModels(config), [config]);
    const canEnableGatewayForAllModels = useMemo(() => eligibleGatewayModels.length > 0 &&
        !eligibleGatewayModels.every((modelId) => gatewayModels.includes(modelId)), [eligibleGatewayModels, gatewayModels]);
    const persistGatewayModels = useCallback((nextModels) => {
        if (!api?.config?.updateMuxGatewayPrefs) {
            return;
        }
        api.config
            .updateMuxGatewayPrefs({
            muxGatewayEnabled: gateway.isEnabled,
            muxGatewayModels: nextModels,
        })
            .catch(() => {
            // Best-effort only.
        });
    }, [api, gateway.isEnabled]);
    const applyGatewayModels = useCallback((nextModels) => {
        setGatewayModels(nextModels);
        persistGatewayModels(nextModels);
    }, [persistGatewayModels, setGatewayModels]);
    const enableGatewayForAllModels = useCallback(() => {
        if (!canEnableGatewayForAllModels) {
            return;
        }
        applyGatewayModels(eligibleGatewayModels);
    }, [applyGatewayModels, canEnableGatewayForAllModels, eligibleGatewayModels]);
    const backendBaseUrl = getBrowserBackendBaseUrl();
    const backendOrigin = (() => {
        try {
            return new URL(backendBaseUrl).origin;
        }
        catch {
            return window.location.origin;
        }
    })();
    const isDesktop = !!window.api;
    // The "Connect (Browser)" OAuth flow requires a redirect back to this origin,
    // which only works when the host is the user's local machine. On a remote mux
    // server the redirect would land on the server, not the user's browser.
    const isRemoteServer = !isDesktop && !["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
    const [codexOauthStatus, setCodexOauthStatus] = useState("idle");
    const [codexOauthError, setCodexOauthError] = useState(null);
    const codexOauthAttemptRef = useRef(0);
    const [codexOauthDesktopFlowId, setCodexOauthDesktopFlowId] = useState(null);
    const [codexOauthDeviceFlow, setCodexOauthDeviceFlow] = useState(null);
    const [codexOauthCodeCopied, setCodexOauthCodeCopied] = useState(false);
    const codexOauthCopiedTimeoutRef = useRef(null);
    useEffect(() => {
        return () => {
            if (codexOauthCopiedTimeoutRef.current !== null) {
                clearTimeout(codexOauthCopiedTimeoutRef.current);
            }
        };
    }, []);
    const codexOauthIsConnected = config?.openai?.codexOauthSet === true;
    const openaiApiKeySet = config?.openai?.apiKeySet === true;
    const codexOauthDefaultAuth = config?.openai?.codexOauthDefaultAuth === "apiKey" ? "apiKey" : "oauth";
    const codexOauthDefaultAuthIsEditable = codexOauthIsConnected && openaiApiKeySet;
    const codexOauthLoginInProgress = codexOauthStatus === "starting" || codexOauthStatus === "waiting";
    const startCodexOauthBrowserConnect = async () => {
        const attempt = ++codexOauthAttemptRef.current;
        if (!api) {
            setCodexOauthStatus("error");
            setCodexOauthError("Mux API not connected.");
            return;
        }
        // Best-effort: cancel any in-progress flow before starting a new one.
        if (codexOauthDesktopFlowId) {
            void api.codexOauth.cancelDesktopFlow({ flowId: codexOauthDesktopFlowId });
        }
        if (codexOauthDeviceFlow) {
            void api.codexOauth.cancelDeviceFlow({ flowId: codexOauthDeviceFlow.flowId });
        }
        setCodexOauthError(null);
        setCodexOauthDesktopFlowId(null);
        setCodexOauthDeviceFlow(null);
        let popup = null;
        try {
            if (!isDesktop) {
                // Open popup synchronously to preserve user gesture context (avoids popup blockers).
                popup = window.open("about:blank", "_blank");
                if (!popup) {
                    throw new Error("Popup blocked - please allow popups and try again.");
                }
            }
            setCodexOauthStatus("starting");
            if (!isDesktop) {
                const startResult = await api.codexOauth.startDeviceFlow();
                if (attempt !== codexOauthAttemptRef.current) {
                    if (startResult.success) {
                        void api.codexOauth.cancelDeviceFlow({ flowId: startResult.data.flowId });
                    }
                    popup?.close();
                    return;
                }
                if (!startResult.success) {
                    popup?.close();
                    setCodexOauthStatus("error");
                    setCodexOauthError(startResult.error);
                    return;
                }
                setCodexOauthDeviceFlow({
                    flowId: startResult.data.flowId,
                    userCode: startResult.data.userCode,
                    verifyUrl: startResult.data.verifyUrl,
                });
                setCodexOauthStatus("waiting");
                if (popup) {
                    popup.location.href = startResult.data.verifyUrl;
                }
                const waitResult = await api.codexOauth.waitForDeviceFlow({
                    flowId: startResult.data.flowId,
                });
                if (attempt !== codexOauthAttemptRef.current) {
                    return;
                }
                if (!waitResult.success) {
                    setCodexOauthStatus("error");
                    setCodexOauthError(waitResult.error);
                    return;
                }
                setCodexOauthStatus("idle");
                setCodexOauthDeviceFlow(null);
                await refresh();
                return;
            }
            const startResult = await api.codexOauth.startDesktopFlow();
            if (attempt !== codexOauthAttemptRef.current) {
                if (startResult.success) {
                    void api.codexOauth.cancelDesktopFlow({ flowId: startResult.data.flowId });
                }
                popup?.close();
                return;
            }
            if (!startResult.success) {
                popup?.close();
                setCodexOauthStatus("error");
                setCodexOauthError(startResult.error);
                return;
            }
            const { flowId, authorizeUrl } = startResult.data;
            setCodexOauthDesktopFlowId(flowId);
            setCodexOauthStatus("waiting");
            // Desktop main process intercepts external window.open() calls and routes them via shell.openExternal.
            window.open(authorizeUrl, "_blank", "noopener");
            const waitResult = await api.codexOauth.waitForDesktopFlow({ flowId });
            if (attempt !== codexOauthAttemptRef.current) {
                return;
            }
            if (!waitResult.success) {
                setCodexOauthStatus("error");
                setCodexOauthError(waitResult.error);
                return;
            }
            setCodexOauthStatus("idle");
            setCodexOauthDesktopFlowId(null);
            await refresh();
        }
        catch (err) {
            popup?.close();
            if (attempt !== codexOauthAttemptRef.current) {
                return;
            }
            setCodexOauthStatus("error");
            setCodexOauthError(err instanceof Error ? err.message : String(err));
        }
    };
    const startCodexOauthDeviceConnect = async () => {
        const attempt = ++codexOauthAttemptRef.current;
        if (!api) {
            setCodexOauthStatus("error");
            setCodexOauthError("Mux API not connected.");
            return;
        }
        // Best-effort: cancel any in-progress flow before starting a new one.
        if (codexOauthDesktopFlowId) {
            void api.codexOauth.cancelDesktopFlow({ flowId: codexOauthDesktopFlowId });
        }
        if (codexOauthDeviceFlow) {
            void api.codexOauth.cancelDeviceFlow({ flowId: codexOauthDeviceFlow.flowId });
        }
        setCodexOauthError(null);
        setCodexOauthDesktopFlowId(null);
        setCodexOauthDeviceFlow(null);
        try {
            setCodexOauthStatus("starting");
            const startResult = await api.codexOauth.startDeviceFlow();
            if (attempt !== codexOauthAttemptRef.current) {
                if (startResult.success) {
                    void api.codexOauth.cancelDeviceFlow({ flowId: startResult.data.flowId });
                }
                return;
            }
            if (!startResult.success) {
                setCodexOauthStatus("error");
                setCodexOauthError(startResult.error);
                return;
            }
            setCodexOauthDeviceFlow({
                flowId: startResult.data.flowId,
                userCode: startResult.data.userCode,
                verifyUrl: startResult.data.verifyUrl,
            });
            setCodexOauthStatus("waiting");
            const waitResult = await api.codexOauth.waitForDeviceFlow({
                flowId: startResult.data.flowId,
            });
            if (attempt !== codexOauthAttemptRef.current) {
                return;
            }
            if (!waitResult.success) {
                setCodexOauthStatus("error");
                setCodexOauthError(waitResult.error);
                return;
            }
            setCodexOauthStatus("idle");
            setCodexOauthDeviceFlow(null);
            await refresh();
        }
        catch (err) {
            if (attempt !== codexOauthAttemptRef.current) {
                return;
            }
            setCodexOauthStatus("error");
            setCodexOauthError(err instanceof Error ? err.message : String(err));
        }
    };
    const disconnectCodexOauth = async () => {
        const attempt = ++codexOauthAttemptRef.current;
        if (!api) {
            setCodexOauthStatus("error");
            setCodexOauthError("Mux API not connected.");
            return;
        }
        // Best-effort: cancel any in-progress flow.
        if (codexOauthDesktopFlowId) {
            void api.codexOauth.cancelDesktopFlow({ flowId: codexOauthDesktopFlowId });
        }
        if (codexOauthDeviceFlow) {
            void api.codexOauth.cancelDeviceFlow({ flowId: codexOauthDeviceFlow.flowId });
        }
        setCodexOauthError(null);
        setCodexOauthDesktopFlowId(null);
        setCodexOauthDeviceFlow(null);
        try {
            setCodexOauthStatus("starting");
            const result = await api.codexOauth.disconnect();
            if (attempt !== codexOauthAttemptRef.current) {
                return;
            }
            if (!result.success) {
                setCodexOauthStatus("error");
                setCodexOauthError(result.error);
                return;
            }
            updateOptimistically("openai", { codexOauthSet: false });
            setCodexOauthStatus("idle");
            await refresh();
        }
        catch (err) {
            if (attempt !== codexOauthAttemptRef.current) {
                return;
            }
            setCodexOauthStatus("error");
            setCodexOauthError(err instanceof Error ? err.message : String(err));
        }
    };
    const [muxGatewayLoginStatus, setMuxGatewayLoginStatus] = useState("idle");
    const cancelCodexOauth = () => {
        codexOauthAttemptRef.current++;
        if (api) {
            if (codexOauthDesktopFlowId) {
                void api.codexOauth.cancelDesktopFlow({ flowId: codexOauthDesktopFlowId });
            }
            if (codexOauthDeviceFlow) {
                void api.codexOauth.cancelDeviceFlow({ flowId: codexOauthDeviceFlow.flowId });
            }
        }
        setCodexOauthDesktopFlowId(null);
        setCodexOauthDeviceFlow(null);
        setCodexOauthStatus("idle");
        setCodexOauthError(null);
    };
    const [muxGatewayLoginError, setMuxGatewayLoginError] = useState(null);
    const muxGatewayApplyDefaultModelsOnSuccessRef = useRef(false);
    const muxGatewayLoginAttemptRef = useRef(0);
    const [muxGatewayDesktopFlowId, setMuxGatewayDesktopFlowId] = useState(null);
    const [muxGatewayServerState, setMuxGatewayServerState] = useState(null);
    const cancelMuxGatewayLogin = () => {
        muxGatewayApplyDefaultModelsOnSuccessRef.current = false;
        muxGatewayLoginAttemptRef.current++;
        if (isDesktop && api && muxGatewayDesktopFlowId) {
            void api.muxGatewayOauth.cancelDesktopFlow({ flowId: muxGatewayDesktopFlowId });
        }
        setMuxGatewayDesktopFlowId(null);
        setMuxGatewayServerState(null);
        setMuxGatewayLoginStatus("idle");
        setMuxGatewayLoginError(null);
    };
    const clearMuxGatewayCredentials = () => {
        if (!api) {
            return;
        }
        cancelMuxGatewayLogin();
        updateOptimistically("mux-gateway", { couponCodeSet: false });
        void api.providers.setProviderConfig({
            provider: "mux-gateway",
            keyPath: ["couponCode"],
            value: "",
        });
        void api.providers.setProviderConfig({
            provider: "mux-gateway",
            keyPath: ["voucher"],
            value: "",
        });
    };
    const startMuxGatewayLogin = async () => {
        const attempt = ++muxGatewayLoginAttemptRef.current;
        // Enable Mux Gateway for all eligible models after the *first* successful login.
        // (If config isn't loaded yet, fall back to the persisted gateway-available state.)
        const isLoggedIn = config?.["mux-gateway"]?.couponCodeSet ?? gateway.isConfigured;
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
                        let latestConfig = config;
                        try {
                            latestConfig = await api.providers.getConfig();
                        }
                        catch {
                            // Ignore errors fetching config; fall back to the current snapshot.
                        }
                        if (attempt !== muxGatewayLoginAttemptRef.current) {
                            return;
                        }
                        applyGatewayModels(getEligibleGatewayModels(latestConfig));
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
    };
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
                        applyGatewayModels(getEligibleGatewayModels(latestConfig));
                    };
                    if (api) {
                        api.providers
                            .getConfig()
                            .then(applyLatest)
                            .catch(() => applyLatest(config));
                    }
                    else {
                        applyLatest(config);
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
        isDesktop,
        muxGatewayLoginStatus,
        muxGatewayServerState,
        backendOrigin,
        api,
        config,
        applyGatewayModels,
        refreshMuxGatewayAccountStatus,
    ]);
    const muxGatewayCouponCodeSet = config?.["mux-gateway"]?.couponCodeSet ?? false;
    const muxGatewayLoginInProgress = muxGatewayLoginStatus === "waiting" || muxGatewayLoginStatus === "starting";
    const muxGatewayIsLoggedIn = muxGatewayCouponCodeSet || muxGatewayLoginStatus === "success";
    const muxGatewayAuthStatusText = muxGatewayIsLoggedIn ? "Logged in" : "Not logged in";
    const muxGatewayLoginButtonLabel = muxGatewayLoginStatus === "error"
        ? "Try again"
        : muxGatewayLoginInProgress
            ? "Waiting for login..."
            : muxGatewayIsLoggedIn
                ? "Re-login to Mux Gateway"
                : "Login to Mux Gateway";
    // --- GitHub Copilot Device Code Flow ---
    const [copilotLoginStatus, setCopilotLoginStatus] = useState("idle");
    const [copilotLoginError, setCopilotLoginError] = useState(null);
    const [copilotFlowId, setCopilotFlowId] = useState(null);
    const [copilotUserCode, setCopilotUserCode] = useState(null);
    const [copilotVerificationUri, setCopilotVerificationUri] = useState(null);
    const [copilotCodeCopied, setCopilotCodeCopied] = useState(false);
    const copilotLoginAttemptRef = useRef(0);
    const copilotFlowIdRef = useRef(null);
    const copilotCopiedTimeoutRef = useRef(null);
    useEffect(() => {
        return () => {
            if (copilotCopiedTimeoutRef.current !== null) {
                clearTimeout(copilotCopiedTimeoutRef.current);
            }
        };
    }, []);
    const copilotApiKeySet = config?.["github-copilot"]?.apiKeySet ?? false;
    const copilotLoginInProgress = copilotLoginStatus === "waiting" || copilotLoginStatus === "starting";
    const copilotIsLoggedIn = copilotApiKeySet || copilotLoginStatus === "success";
    const cancelCopilotLogin = () => {
        copilotLoginAttemptRef.current++;
        if (api && copilotFlowId) {
            void api.copilotOauth.cancelDeviceFlow({
                flowId: copilotFlowId,
            });
        }
        setCopilotFlowId(null);
        copilotFlowIdRef.current = null;
        setCopilotUserCode(null);
        setCopilotVerificationUri(null);
        setCopilotLoginStatus("idle");
        setCopilotLoginError(null);
    };
    // Cancel any in-flight Copilot login if the component unmounts.
    // Use a ref for api so this only fires on true unmount, not on api identity
    // changes (e.g. reconnection), which would spuriously cancel active flows.
    const apiRef = useRef(api);
    apiRef.current = api;
    useEffect(() => {
        return () => {
            if (copilotFlowIdRef.current && apiRef.current) {
                void apiRef.current.copilotOauth.cancelDeviceFlow({ flowId: copilotFlowIdRef.current });
            }
        };
    }, []);
    const clearCopilotCredentials = () => {
        if (!api)
            return;
        cancelCopilotLogin();
        updateOptimistically("github-copilot", { apiKeySet: false });
        void api.providers.setProviderConfig({
            provider: "github-copilot",
            keyPath: ["apiKey"],
            value: "",
        });
    };
    const startCopilotLogin = async () => {
        const attempt = ++copilotLoginAttemptRef.current;
        try {
            setCopilotLoginError(null);
            setCopilotLoginStatus("starting");
            if (!api) {
                setCopilotLoginStatus("error");
                setCopilotLoginError("API not connected.");
                return;
            }
            // Best-effort: cancel any in-progress flow before starting a new one.
            if (copilotFlowIdRef.current) {
                void api.copilotOauth.cancelDeviceFlow({ flowId: copilotFlowIdRef.current });
                copilotFlowIdRef.current = null;
                setCopilotFlowId(null);
            }
            const startResult = await api.copilotOauth.startDeviceFlow();
            if (attempt !== copilotLoginAttemptRef.current) {
                if (startResult.success) {
                    void api.copilotOauth.cancelDeviceFlow({ flowId: startResult.data.flowId });
                }
                return;
            }
            if (!startResult.success) {
                setCopilotLoginStatus("error");
                setCopilotLoginError(startResult.error);
                return;
            }
            const { flowId, verificationUri, userCode } = startResult.data;
            setCopilotFlowId(flowId);
            copilotFlowIdRef.current = flowId;
            setCopilotUserCode(userCode);
            setCopilotVerificationUri(verificationUri);
            setCopilotLoginStatus("waiting");
            // Open verification URL in browser
            window.open(verificationUri, "_blank", "noopener");
            // Wait for flow to complete (polling happens on backend)
            const waitResult = await api.copilotOauth.waitForDeviceFlow({ flowId });
            if (attempt !== copilotLoginAttemptRef.current)
                return;
            if (waitResult.success) {
                setCopilotLoginStatus("success");
                return;
            }
            setCopilotLoginStatus("error");
            setCopilotLoginError(waitResult.error);
        }
        catch (err) {
            if (attempt !== copilotLoginAttemptRef.current)
                return;
            const message = err instanceof Error ? err.message : String(err);
            setCopilotLoginStatus("error");
            setCopilotLoginError(message);
        }
    };
    const [expandedProvider, setExpandedProvider] = useState(null);
    useEffect(() => {
        if (!providersExpandedProvider) {
            return;
        }
        setExpandedProvider(providersExpandedProvider);
        setProvidersExpandedProvider(null);
    }, [providersExpandedProvider, setProvidersExpandedProvider]);
    useEffect(() => {
        if (expandedProvider !== "mux-gateway" || !muxGatewayIsLoggedIn) {
            return;
        }
        // Fetch lazily when the user expands the Mux Gateway provider.
        //
        // Important: avoid auto-retrying after a failure. If the request fails,
        // `muxGatewayAccountStatus` remains null and we'd otherwise trigger a refresh
        // on every render while the provider stays expanded.
        if (muxGatewayAccountStatus || muxGatewayAccountLoading || muxGatewayAccountError) {
            return;
        }
        void refreshMuxGatewayAccountStatus();
    }, [
        expandedProvider,
        muxGatewayAccountError,
        muxGatewayAccountLoading,
        muxGatewayAccountStatus,
        muxGatewayIsLoggedIn,
        refreshMuxGatewayAccountStatus,
    ]);
    const [editingField, setEditingField] = useState(null);
    const [editValue, setEditValue] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const handleToggleProvider = (provider) => {
        setExpandedProvider((prev) => {
            const next = prev === provider ? null : provider;
            if (prev === "mux-gateway" && next !== "mux-gateway") {
                cancelMuxGatewayLogin();
            }
            if (prev === "github-copilot" && next !== "github-copilot") {
                cancelCopilotLogin();
            }
            return next;
        });
        setEditingField(null);
    };
    const handleStartEdit = (provider, field, fieldConfig) => {
        setEditingField({ provider, field });
        // For secrets, start empty since we only show masked value
        // For text fields, show current value
        const currentValue = getFieldValue(provider, field);
        setEditValue(fieldConfig.type === "text" && currentValue ? currentValue : "");
    };
    const handleCancelEdit = () => {
        setEditingField(null);
        setEditValue("");
        setShowPassword(false);
    };
    const handleSaveEdit = useCallback(() => {
        if (!editingField || !api)
            return;
        const { provider, field } = editingField;
        // Optimistic update for instant feedback
        if (field === "apiKey") {
            updateOptimistically(provider, { apiKeySet: editValue !== "" });
        }
        else if (field === "baseUrl") {
            updateOptimistically(provider, { baseUrl: editValue || undefined });
        }
        setEditingField(null);
        setEditValue("");
        setShowPassword(false);
        // Save in background
        void api.providers.setProviderConfig({ provider, keyPath: [field], value: editValue });
    }, [api, editingField, editValue, updateOptimistically]);
    const handleClearField = useCallback((provider, field) => {
        if (!api)
            return;
        // Optimistic update for instant feedback
        if (field === "apiKey") {
            updateOptimistically(provider, { apiKeySet: false });
        }
        else if (field === "baseUrl") {
            updateOptimistically(provider, { baseUrl: undefined });
        }
        // Save in background
        void api.providers.setProviderConfig({ provider, keyPath: [field], value: "" });
    }, [api, updateOptimistically]);
    const isEnabled = (provider) => {
        return config?.[provider]?.isEnabled ?? true;
    };
    /** Check if provider is configured (uses backend-computed isConfigured) */
    const isConfigured = (provider) => {
        return config?.[provider]?.isConfigured ?? false;
    };
    const hasAnyConfiguredProvider = useMemo(() => Object.values(config ?? {}).some((providerConfig) => providerConfig.isConfigured), [config]);
    const handleProviderEnabledChange = useCallback((provider, nextEnabled) => {
        if (!api || provider === "mux-gateway") {
            return;
        }
        updateOptimistically(provider, {
            isEnabled: nextEnabled,
            ...(nextEnabled ? {} : { isConfigured: false }),
        });
        // Persist only `enabled: false` for disabled providers. Re-enabling removes the key.
        void api.providers.setProviderConfig({
            provider,
            keyPath: ["enabled"],
            value: nextEnabled ? "" : "false",
        });
    }, [api, updateOptimistically]);
    const getFieldValue = (provider, field) => {
        const providerConfig = config?.[provider];
        if (!providerConfig)
            return undefined;
        // For bedrock, check aws nested object for region/profile
        if (provider === "bedrock" && (field === "region" || field === "profile")) {
            return field === "region" ? providerConfig.aws?.region : providerConfig.aws?.profile;
        }
        // For standard fields like baseUrl
        const value = providerConfig[field];
        return typeof value === "string" ? value : undefined;
    };
    const isFieldSet = (provider, field, fieldConfig) => {
        const providerConfig = config?.[provider];
        if (!providerConfig)
            return false;
        if (fieldConfig.type === "secret") {
            // For apiKey, we have apiKeySet from the sanitized config
            if (field === "apiKey")
                return providerConfig.apiKeySet ?? false;
            // For AWS secrets, check the aws nested object
            if (provider === "bedrock" && providerConfig.aws) {
                const { aws } = providerConfig;
                switch (field) {
                    case "bearerToken":
                        return aws.bearerTokenSet ?? false;
                    case "accessKeyId":
                        return aws.accessKeyIdSet ?? false;
                    case "secretAccessKey":
                        return aws.secretAccessKeySet ?? false;
                }
            }
            return false;
        }
        return !!getFieldValue(provider, field);
    };
    return (_jsxs("div", { className: "space-y-2", children: [_jsxs("p", { className: "text-muted mb-4 text-xs", children: ["Configure API keys and endpoints for AI providers. Keys are stored in", " ", _jsx("code", { className: "text-accent", children: "~/.mux/providers.jsonc" })] }), policyState.status.state === "enforced" && (_jsxs("div", { className: "border-border-medium bg-background-secondary/50 text-muted flex items-center gap-2 rounded-md border px-3 py-2 text-xs", children: [_jsx(ShieldCheck, { className: "h-4 w-4", "aria-hidden": true }), _jsx("span", { children: "Your settings are controlled by a policy." })] })), visibleProviders.map((provider) => {
                const isExpanded = expandedProvider === provider;
                const enabled = isEnabled(provider);
                const configured = isConfigured(provider);
                const fields = getProviderFields(provider);
                const statusDotColor = !enabled
                    ? "bg-warning"
                    : configured
                        ? "bg-success"
                        : "bg-border-medium";
                const statusDotTitle = !enabled ? "Disabled" : configured ? "Configured" : "Not configured";
                return (_jsxs("div", { className: "border-border-medium bg-background-secondary overflow-hidden rounded-md border", children: [_jsxs(Button, { variant: "ghost", onClick: () => handleToggleProvider(provider), className: "flex h-auto w-full items-center justify-between rounded-none px-4 py-3 text-left", children: [_jsxs("div", { className: "flex items-center gap-3", children: [isExpanded ? (_jsx(ChevronDown, { className: "text-muted h-4 w-4" })) : (_jsx(ChevronRight, { className: "text-muted h-4 w-4" })), _jsx(ProviderWithIcon, { provider: provider, displayName: true, className: "text-foreground text-sm font-medium" })] }), _jsx("div", { className: `h-2 w-2 rounded-full ${statusDotColor}`, title: statusDotTitle })] }), isExpanded && (_jsxs("div", { className: "border-border-medium space-y-3 border-t px-4 py-3", children: [provider !== "mux-gateway" && (_jsxs("div", { className: "flex items-center justify-between gap-3", children: [_jsxs("div", { children: [_jsx("label", { className: "text-foreground block text-xs font-medium", children: "Enabled" }), _jsx("span", { className: "text-muted text-xs", children: "Disable this provider without deleting saved credentials." })] }), _jsx(Switch, { checked: enabled, onCheckedChange: (nextChecked) => handleProviderEnabledChange(provider, nextChecked), "aria-label": `Toggle ${provider} provider`, disabled: !api })] })), PROVIDER_KEY_URLS[provider] && (_jsxs("div", { className: "space-y-1", children: [_jsxs("a", { href: PROVIDER_KEY_URLS[provider], target: "_blank", rel: "noopener noreferrer", className: "text-muted hover:text-accent inline-flex items-center gap-1 text-xs transition-colors", children: ["Get API Key", _jsx(ExternalLink, { className: "h-2.5 w-2.5" })] }), provider === "anthropic" &&
                                            configured &&
                                            config?.[provider]?.apiKeySet === false && (_jsx("div", { className: "text-muted text-xs", children: "Configured via environment variables." }))] })), provider === "mux-gateway" && (_jsxs("div", { className: "space-y-2", children: [_jsxs("div", { children: [_jsx("label", { className: "text-foreground block text-xs font-medium", children: "Authentication" }), _jsx("span", { className: "text-muted text-xs", children: muxGatewayAuthStatusText })] }), _jsxs("div", { className: "space-y-2", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx(Button, { size: "sm", onClick: () => {
                                                                void startMuxGatewayLogin();
                                                            }, disabled: muxGatewayLoginInProgress, children: muxGatewayLoginButtonLabel }), muxGatewayLoginInProgress && (_jsx(Button, { variant: "secondary", size: "sm", onClick: cancelMuxGatewayLogin, children: "Cancel" })), muxGatewayIsLoggedIn && (_jsx(Button, { variant: "ghost", size: "sm", onClick: clearMuxGatewayCredentials, children: "Log out" }))] }), muxGatewayLoginStatus === "waiting" && (_jsx("p", { className: "text-muted text-xs", children: "Finish the login flow in your browser, then return here." })), muxGatewayLoginStatus === "error" && muxGatewayLoginError && (_jsxs("p", { className: "text-destructive text-xs", children: ["Login failed: ", muxGatewayLoginError] }))] })] })), provider === "mux-gateway" && muxGatewayIsLoggedIn && (_jsxs("div", { className: "border-border-light space-y-2 border-t pt-3", children: [_jsxs("div", { className: "flex items-center justify-between gap-2", children: [_jsxs("div", { children: [_jsx("label", { className: "text-foreground block text-xs font-medium", children: "Account" }), _jsx("span", { className: "text-muted text-xs", children: "Balance and limits from Mux Gateway" })] }), _jsx(Button, { variant: "outline", size: "sm", onClick: () => {
                                                        void refreshMuxGatewayAccountStatus();
                                                    }, disabled: muxGatewayAccountLoading, children: muxGatewayAccountLoading ? "Refreshing..." : "Refresh" })] }), _jsxs("div", { className: "flex items-center justify-between gap-4", children: [_jsx("span", { className: "text-muted text-xs", children: "Balance" }), _jsx("span", { className: "text-foreground font-mono text-xs", children: formatMuxGatewayBalance(muxGatewayAccountStatus?.remaining_microdollars) })] }), _jsxs("div", { className: "flex items-center justify-between gap-4", children: [_jsx("span", { className: "text-muted text-xs", children: "Concurrent requests per user" }), _jsx("span", { className: "text-foreground font-mono text-xs", children: muxGatewayAccountStatus?.ai_gateway_concurrent_requests_per_user ?? "—" })] }), muxGatewayAccountError && (_jsx("p", { className: "text-destructive text-xs", children: muxGatewayAccountError }))] })), provider === "github-copilot" && (_jsxs("div", { className: "space-y-2", children: [_jsxs("div", { children: [_jsx("label", { className: "text-foreground block text-xs font-medium", children: "Authentication" }), _jsx("span", { className: "text-muted text-xs", children: copilotIsLoggedIn ? "Logged in" : "Not logged in" })] }), _jsxs("div", { className: "space-y-2", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx(Button, { size: "sm", onClick: () => {
                                                                void startCopilotLogin();
                                                            }, disabled: copilotLoginInProgress, children: copilotLoginStatus === "error"
                                                                ? "Try again"
                                                                : copilotLoginInProgress
                                                                    ? "Waiting for authorization..."
                                                                    : copilotIsLoggedIn
                                                                        ? "Re-login with GitHub"
                                                                        : "Login with GitHub" }), copilotLoginInProgress && (_jsx(Button, { variant: "secondary", size: "sm", onClick: cancelCopilotLogin, children: "Cancel" })), copilotIsLoggedIn && (_jsx(Button, { variant: "ghost", size: "sm", onClick: clearCopilotCredentials, children: "Log out" }))] }), copilotLoginStatus === "waiting" && copilotUserCode && (_jsxs("div", { className: "bg-background-tertiary space-y-2 rounded-md p-3", children: [_jsx("p", { className: "text-muted text-xs", children: "Enter this code on GitHub:" }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("code", { className: "text-accent text-lg font-bold tracking-widest", children: copilotUserCode }), _jsx(Button, { variant: "ghost", size: "sm", "aria-label": "Copy verification code", onClick: () => {
                                                                        void navigator.clipboard.writeText(copilotUserCode);
                                                                        setCopilotCodeCopied(true);
                                                                        if (copilotCopiedTimeoutRef.current !== null) {
                                                                            clearTimeout(copilotCopiedTimeoutRef.current);
                                                                        }
                                                                        copilotCopiedTimeoutRef.current = setTimeout(() => setCopilotCodeCopied(false), 2000);
                                                                    }, className: "text-muted hover:text-foreground h-auto px-1 py-0 text-xs", children: copilotCodeCopied ? "Copied!" : "Copy" })] }), copilotVerificationUri && (_jsxs("p", { className: "text-muted text-xs", children: ["If the browser didn't open,", " ", _jsx("a", { href: copilotVerificationUri, target: "_blank", rel: "noopener noreferrer", className: "text-accent hover:text-accent-light underline", children: "open the verification page" }), "."] }))] })), copilotLoginStatus === "error" && copilotLoginError && (_jsxs("p", { className: "text-destructive text-xs", children: ["Login failed: ", copilotLoginError] }))] })] })), fields.map((fieldConfig) => {
                                    const isEditing = editingField?.provider === provider && editingField?.field === fieldConfig.key;
                                    const fieldValue = getFieldValue(provider, fieldConfig.key);
                                    const fieldIsSet = isFieldSet(provider, fieldConfig.key, fieldConfig);
                                    return (_jsxs("div", { children: [_jsxs("label", { className: "text-muted mb-1 block text-xs", children: [fieldConfig.label, fieldConfig.optional && _jsx("span", { className: "text-dim", children: " (optional)" })] }), isEditing ? (_jsxs("div", { className: "flex gap-2", children: [_jsx("input", { type: fieldConfig.type === "secret" && !showPassword ? "password" : "text", value: editValue, onChange: (e) => setEditValue(e.target.value), placeholder: fieldConfig.placeholder, className: "bg-modal-bg border-border-medium focus:border-accent flex-1 rounded border px-2 py-1.5 font-mono text-xs focus:outline-none", autoFocus: true, onKeyDown: createEditKeyHandler({
                                                            onSave: handleSaveEdit,
                                                            onCancel: handleCancelEdit,
                                                        }) }), fieldConfig.type === "secret" && (_jsx(Button, { variant: "ghost", size: "icon", onClick: () => setShowPassword(!showPassword), className: "text-muted hover:text-foreground h-6 w-6", title: showPassword ? "Hide password" : "Show password", children: showPassword ? (_jsx(EyeOff, { className: "h-4 w-4" })) : (_jsx(Eye, { className: "h-4 w-4" })) })), _jsx(Button, { variant: "ghost", size: "icon", onClick: handleSaveEdit, className: "h-6 w-6 text-green-500 hover:text-green-400", children: _jsx(Check, { className: "h-4 w-4" }) }), _jsx(Button, { variant: "ghost", size: "icon", onClick: handleCancelEdit, className: "text-muted hover:text-foreground h-6 w-6", children: _jsx(X, { className: "h-4 w-4" }) })] })) : (_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("span", { className: "text-foreground font-mono text-xs", children: fieldConfig.type === "secret"
                                                            ? fieldIsSet
                                                                ? "••••••••"
                                                                : "Not set"
                                                            : (fieldValue ?? "Default") }), _jsxs("div", { className: "flex gap-2", children: [(fieldConfig.type === "text"
                                                                ? !!fieldValue
                                                                : fieldConfig.type === "secret" && fieldIsSet) && (_jsx(Button, { variant: "ghost", size: "sm", onClick: () => handleClearField(provider, fieldConfig.key), className: "text-muted hover:text-error h-auto px-1 py-0 text-xs", children: "Clear" })), _jsx(Button, { variant: "ghost", size: "sm", onClick: () => handleStartEdit(provider, fieldConfig.key, fieldConfig), className: "text-accent hover:text-accent-light h-auto px-1 py-0 text-xs", children: fieldIsSet || fieldValue ? "Change" : "Set" })] })] }))] }, fieldConfig.key));
                                }), provider === "openai" && (_jsxs("div", { className: "border-border-light space-y-3 border-t pt-3", children: [_jsxs("div", { children: [_jsx("label", { className: "text-foreground block text-xs font-medium", children: "ChatGPT (Codex) OAuth" }), _jsx("span", { className: "text-muted text-xs", children: codexOauthStatus === "starting"
                                                        ? "Starting..."
                                                        : codexOauthStatus === "waiting"
                                                            ? "Waiting for login..."
                                                            : codexOauthIsConnected
                                                                ? "Connected"
                                                                : "Not connected" })] }), _jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [!isRemoteServer && (_jsx(Button, { size: "sm", onClick: () => {
                                                        void startCodexOauthBrowserConnect();
                                                    }, disabled: !api || codexOauthLoginInProgress, children: "Connect (Browser)" })), _jsx(Button, { size: "sm", variant: "secondary", onClick: () => {
                                                        void startCodexOauthDeviceConnect();
                                                    }, disabled: !api || codexOauthLoginInProgress, children: "Connect (Device)" }), codexOauthLoginInProgress && (_jsx(Button, { variant: "secondary", size: "sm", onClick: cancelCodexOauth, children: "Cancel" })), codexOauthIsConnected && (_jsx(Button, { size: "sm", variant: "ghost", onClick: () => {
                                                        void disconnectCodexOauth();
                                                    }, disabled: !api || codexOauthLoginInProgress, children: "Disconnect" }))] }), codexOauthDeviceFlow && (_jsxs("div", { className: "bg-background-tertiary space-y-2 rounded-md p-3", children: [_jsx("p", { className: "text-muted text-xs", children: "Enter this code on the OpenAI verification page:" }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("code", { className: "text-accent text-lg font-bold tracking-widest", children: codexOauthDeviceFlow.userCode }), _jsx(Button, { variant: "ghost", size: "sm", "aria-label": "Copy verification code", onClick: () => {
                                                                void navigator.clipboard.writeText(codexOauthDeviceFlow.userCode);
                                                                setCodexOauthCodeCopied(true);
                                                                if (codexOauthCopiedTimeoutRef.current !== null) {
                                                                    clearTimeout(codexOauthCopiedTimeoutRef.current);
                                                                }
                                                                codexOauthCopiedTimeoutRef.current = setTimeout(() => setCodexOauthCodeCopied(false), 2000);
                                                            }, className: "text-muted hover:text-foreground h-auto px-1 py-0 text-xs", children: codexOauthCodeCopied ? "Copied!" : "Copy" })] }), _jsxs("p", { className: "text-muted text-xs", children: ["If the browser didn't open,", " ", _jsx("a", { href: codexOauthDeviceFlow.verifyUrl, target: "_blank", rel: "noopener noreferrer", className: "text-accent hover:text-accent-light underline", children: "open the verification page" }), "."] })] })), codexOauthStatus === "waiting" && !codexOauthDeviceFlow && (_jsx("p", { className: "text-muted text-xs", children: "Finish the login flow in your browser, then return here." })), codexOauthStatus === "error" && codexOauthError && (_jsx("p", { className: "text-destructive text-xs", children: codexOauthError })), _jsxs("div", { className: "border-border-light space-y-2 border-t pt-3", children: [_jsxs("div", { children: [_jsx("label", { className: "text-muted block text-xs", children: "Default auth (when both are set)" }), _jsxs("p", { className: "text-muted text-xs", children: ["Applies to models that support both ChatGPT OAuth and API keys (e.g.", " ", _jsx("code", { className: "text-accent", children: "gpt-5.2" }), ")."] })] }), _jsxs(ToggleGroup, { type: "single", value: codexOauthDefaultAuth, onValueChange: (next) => {
                                                        if (!api)
                                                            return;
                                                        if (next !== "oauth" && next !== "apiKey") {
                                                            return;
                                                        }
                                                        updateOptimistically("openai", { codexOauthDefaultAuth: next });
                                                        void api.providers.setProviderConfig({
                                                            provider: "openai",
                                                            keyPath: ["codexOauthDefaultAuth"],
                                                            value: next,
                                                        });
                                                    }, size: "sm", className: "h-9", disabled: !api || !codexOauthDefaultAuthIsEditable, children: [_jsx(ToggleGroupItem, { value: "oauth", size: "sm", className: "h-7 px-3 text-[13px]", children: "Use ChatGPT OAuth by default" }), _jsx(ToggleGroupItem, { value: "apiKey", size: "sm", className: "h-7 px-3 text-[13px]", children: "Use OpenAI API key by default" })] }), _jsx("p", { className: "text-muted text-xs", children: "ChatGPT OAuth uses subscription billing (costs included). API key uses OpenAI platform billing." }), !codexOauthDefaultAuthIsEditable && (_jsx("p", { className: "text-muted text-xs", children: "Connect ChatGPT OAuth and set an OpenAI API key to change this setting." }))] }), _jsxs("div", { className: "border-border-light border-t pt-3", children: [_jsxs("div", { className: "mb-1 flex items-center gap-1", children: [_jsx("label", { className: "text-muted block text-xs", children: "Service tier" }), _jsx(TooltipProvider, { children: _jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx(HelpIndicator, { "aria-label": "OpenAI service tier help", children: "?" }) }), _jsx(TooltipContent, { children: _jsxs("div", { className: "max-w-[260px]", children: [_jsx("div", { className: "font-semibold", children: "OpenAI service tier" }), _jsxs("div", { className: "mt-1", children: [_jsx("span", { className: "font-semibold", children: "auto" }), ": standard behavior."] }), _jsxs("div", { children: [_jsx("span", { className: "font-semibold", children: "priority" }), ": lower latency, higher cost."] }), _jsxs("div", { children: [_jsx("span", { className: "font-semibold", children: "flex" }), ": lower cost, higher latency."] })] }) })] }) })] }), _jsxs(Select, { value: config?.openai?.serviceTier ?? "auto", onValueChange: (next) => {
                                                        if (!api)
                                                            return;
                                                        if (next !== "auto" &&
                                                            next !== "default" &&
                                                            next !== "flex" &&
                                                            next !== "priority") {
                                                            return;
                                                        }
                                                        updateOptimistically("openai", { serviceTier: next });
                                                        void api.providers.setProviderConfig({
                                                            provider: "openai",
                                                            keyPath: ["serviceTier"],
                                                            value: next,
                                                        });
                                                    }, children: [_jsx(SelectTrigger, { className: "w-40", children: _jsx(SelectValue, {}) }), _jsxs(SelectContent, { children: [_jsx(SelectItem, { value: "auto", children: "auto" }), _jsx(SelectItem, { value: "default", children: "default" }), _jsx(SelectItem, { value: "flex", children: "flex" }), _jsx(SelectItem, { value: "priority", children: "priority" })] })] })] })] })), provider === "mux-gateway" && gateway.isConfigured && (_jsxs("div", { className: "border-border-light space-y-3 border-t pt-3", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsxs("div", { children: [_jsx("label", { className: "text-foreground block text-xs font-medium", children: "Enabled" }), _jsx("span", { className: "text-muted text-xs", children: "Route requests through Mux Gateway" })] }), _jsx(Switch, { checked: gateway.isEnabled, onCheckedChange: () => gateway.toggleEnabled(), "aria-label": "Toggle Mux Gateway" })] }), _jsxs("div", { className: "flex items-center justify-between gap-3", children: [_jsxs("div", { children: [_jsx("label", { className: "text-foreground block text-xs font-medium", children: "Enable for all models" }), _jsx("span", { className: "text-muted text-xs", children: "Turn on Mux Gateway for every eligible model." })] }), canEnableGatewayForAllModels ? (_jsx(Button, { size: "sm", variant: "secondary", onClick: enableGatewayForAllModels, "aria-label": "Enable Mux Gateway for all models", children: "Enable all" })) : (_jsx(TooltipProvider, { children: _jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("span", { className: "inline-flex", children: _jsx(Button, { size: "sm", variant: "secondary", onClick: enableGatewayForAllModels, disabled: true, "aria-label": "Enable Mux Gateway for all models", children: "Enable all" }) }) }), _jsx(TooltipContent, { children: "All eligible models are already enabled." })] }) }))] })] }))] }))] }, provider));
            }), config && !hasAnyConfiguredProvider && (_jsx("div", { className: "border-warning/40 bg-warning/10 text-warning rounded-md border px-3 py-2 text-xs", children: "No providers are currently enabled. You won't be able to send messages until you enable a provider." }))] }));
}
//# sourceMappingURL=ProvidersSection.js.map