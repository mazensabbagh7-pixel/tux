import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useExperiment, useExperimentValue, useRemoteExperimentValue, } from "@/browser/contexts/ExperimentsContext";
import { getExperimentList, EXPERIMENT_IDS, } from "@/common/constants/experiments";
import { Switch } from "@/browser/components/ui/switch";
import { Button } from "@/browser/components/ui/button";
import { CopyButton } from "@/browser/components/ui/CopyButton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, } from "@/browser/components/ui/select";
import { Input } from "@/browser/components/ui/input";
import { useAPI } from "@/browser/contexts/API";
import { useTelemetry } from "@/browser/hooks/useTelemetry";
function ExperimentRow(props) {
    const [enabled, setEnabled] = useExperiment(props.experimentId);
    const remote = useRemoteExperimentValue(props.experimentId);
    const telemetry = useTelemetry();
    const { onToggle, experimentId } = props;
    const handleToggle = useCallback((value) => {
        setEnabled(value);
        // Track the override for analytics
        telemetry.experimentOverridden(experimentId, remote?.value ?? null, value);
        onToggle?.(value);
    }, [setEnabled, telemetry, experimentId, remote?.value, onToggle]);
    return (_jsxs("div", { className: "flex items-center justify-between py-3", children: [_jsxs("div", { className: "flex-1 pr-4", children: [_jsx("div", { className: "text-foreground text-sm font-medium", children: props.name }), _jsx("div", { className: "text-muted mt-0.5 text-xs", children: props.description })] }), _jsx(Switch, { checked: enabled, onCheckedChange: handleToggle, "aria-label": `Toggle ${props.name}` })] }));
}
function getErrorMessage(error) {
    if (error instanceof Error) {
        return error.message;
    }
    return String(error);
}
function ConfigurableBindUrlControls() {
    const enabled = useExperimentValue(EXPERIMENT_IDS.CONFIGURABLE_BIND_URL);
    const { api } = useAPI();
    const [status, setStatus] = useState(null);
    const [hostMode, setHostMode] = useState("localhost");
    const [customHost, setCustomHost] = useState("");
    const [serveWebUi, setServeWebUi] = useState(false);
    const [portMode, setPortMode] = useState("random");
    const [fixedPort, setFixedPort] = useState("");
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const requestIdRef = useRef(0);
    const syncFormFromStatus = useCallback((next) => {
        const configuredHost = next.configuredBindHost;
        if (!configuredHost || configuredHost === "127.0.0.1" || configuredHost === "localhost") {
            setHostMode("localhost");
            setCustomHost("");
        }
        else if (configuredHost === "0.0.0.0") {
            setHostMode("all");
            setCustomHost("");
        }
        else {
            setHostMode("custom");
            setCustomHost(configuredHost);
        }
        setServeWebUi(next.configuredServeWebUi);
        const configuredPort = next.configuredPort;
        if (!configuredPort) {
            setPortMode("random");
            setFixedPort("");
        }
        else {
            setPortMode("fixed");
            setFixedPort(String(configuredPort));
        }
    }, []);
    const loadStatus = useCallback(async () => {
        if (!api) {
            return;
        }
        const requestId = requestIdRef.current + 1;
        requestIdRef.current = requestId;
        setLoading(true);
        setError(null);
        try {
            const next = await api.server.getApiServerStatus();
            if (requestIdRef.current !== requestId) {
                return;
            }
            setStatus(next);
            syncFormFromStatus(next);
        }
        catch (e) {
            if (requestIdRef.current !== requestId) {
                return;
            }
            setError(getErrorMessage(e));
        }
        finally {
            if (requestIdRef.current === requestId) {
                setLoading(false);
            }
        }
    }, [api, syncFormFromStatus]);
    useEffect(() => {
        if (!enabled) {
            return;
        }
        loadStatus().catch(() => {
            // loadStatus handles error state
        });
    }, [enabled, loadStatus]);
    const handleApply = useCallback(async () => {
        if (!api) {
            return;
        }
        setError(null);
        let bindHost;
        if (hostMode === "localhost") {
            bindHost = null;
        }
        else if (hostMode === "all") {
            bindHost = "0.0.0.0";
        }
        else {
            const trimmed = customHost.trim();
            if (!trimmed) {
                setError("Custom bind host is required.");
                return;
            }
            bindHost = trimmed;
        }
        let port;
        if (portMode === "random") {
            port = null;
        }
        else {
            const parsed = Number.parseInt(fixedPort, 10);
            if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
                setError("Port must be an integer.");
                return;
            }
            if (parsed === 0) {
                setError("Port 0 means random. Choose “Random” instead.");
                return;
            }
            if (parsed < 1 || parsed > 65535) {
                setError("Port must be between 1 and 65535.");
                return;
            }
            port = parsed;
        }
        setSaving(true);
        try {
            const next = await api.server.setApiServerSettings({
                bindHost,
                port,
                serveWebUi: serveWebUi ? true : null,
            });
            setStatus(next);
            syncFormFromStatus(next);
        }
        catch (e) {
            setError(getErrorMessage(e));
        }
        finally {
            setSaving(false);
        }
    }, [api, hostMode, portMode, customHost, fixedPort, serveWebUi, syncFormFromStatus]);
    if (!enabled) {
        return null;
    }
    if (!api) {
        return (_jsx("div", { className: "bg-background-secondary px-4 py-3", children: _jsx("div", { className: "text-muted text-xs", children: "Connect to mux to configure this setting." }) }));
    }
    const encodedToken = status?.token ? encodeURIComponent(status.token) : null;
    const localWebUiUrl = status?.baseUrl ? `${status.baseUrl}/` : null;
    const localWebUiUrlWithToken = status?.baseUrl && encodedToken ? `${status.baseUrl}/?token=${encodedToken}` : null;
    const networkWebUiUrls = status?.networkBaseUrls.map((baseUrl) => `${baseUrl}/`) ?? [];
    const networkWebUiUrlsWithToken = encodedToken
        ? (status?.networkBaseUrls.map((baseUrl) => `${baseUrl}/?token=${encodedToken}`) ?? [])
        : [];
    const localDocsUrl = status?.baseUrl ? `${status.baseUrl}/api/docs` : null;
    const networkDocsUrls = status?.networkBaseUrls.map((baseUrl) => `${baseUrl}/api/docs`) ?? [];
    return (_jsxs("div", { className: "bg-background-secondary space-y-4 px-4 py-3", children: [_jsx("div", { className: "text-warning text-xs", children: "Exposes mux\u2019s API server to your LAN/VPN. Devices on your local network can connect if they have the auth token. Traffic is unencrypted HTTP; enable only on trusted networks (Tailscale recommended)." }), _jsxs("div", { className: "space-y-3", children: [_jsxs("div", { className: "flex items-center justify-between gap-4", children: [_jsxs("div", { children: [_jsx("div", { className: "text-foreground text-sm", children: "Bind host" }), _jsx("div", { className: "text-muted text-xs", children: "Where mux listens for HTTP + WS connections" })] }), _jsxs(Select, { value: hostMode, onValueChange: (value) => setHostMode(value), children: [_jsx(SelectTrigger, { className: "border-border-medium bg-background-secondary hover:bg-hover h-9 w-64 cursor-pointer rounded-md border px-3 text-sm transition-colors", children: _jsx(SelectValue, {}) }), _jsxs(SelectContent, { children: [_jsx(SelectItem, { value: "localhost", children: "Localhost only (127.0.0.1)" }), _jsx(SelectItem, { value: "all", children: "All interfaces (0.0.0.0)" }), _jsx(SelectItem, { value: "custom", children: "Custom\u2026" })] })] })] }), hostMode === "custom" && (_jsxs("div", { className: "flex items-center justify-between gap-4", children: [_jsxs("div", { children: [_jsx("div", { className: "text-foreground text-sm", children: "Custom host" }), _jsx("div", { className: "text-muted text-xs", children: "Example: 192.168.1.10 or 100.x.y.z" })] }), _jsx(Input, { value: customHost, onChange: (e) => setCustomHost(e.target.value), placeholder: "e.g. 192.168.1.10", className: "border-border-medium bg-background-secondary h-9 w-64" })] })), _jsxs("div", { className: "flex items-center justify-between gap-4", children: [_jsxs("div", { children: [_jsx("div", { className: "text-foreground text-sm", children: "Port" }), _jsx("div", { className: "text-muted text-xs", children: "Use a fixed port to avoid changing URLs each time mux restarts" })] }), _jsxs(Select, { value: portMode, onValueChange: (value) => setPortMode(value), children: [_jsx(SelectTrigger, { className: "border-border-medium bg-background-secondary hover:bg-hover h-9 w-64 cursor-pointer rounded-md border px-3 text-sm transition-colors", children: _jsx(SelectValue, {}) }), _jsxs(SelectContent, { children: [_jsx(SelectItem, { value: "random", children: "Random (changes on restart)" }), _jsx(SelectItem, { value: "fixed", children: "Fixed\u2026" })] })] })] }), portMode === "fixed" && (_jsxs("div", { className: "flex items-center justify-between gap-4", children: [_jsxs("div", { children: [_jsx("div", { className: "text-foreground text-sm", children: "Fixed port" }), _jsx("div", { className: "text-muted text-xs", children: "1\u201365535" })] }), _jsx(Input, { value: fixedPort, onChange: (e) => setFixedPort(e.target.value), placeholder: "e.g. 9999", className: "border-border-medium bg-background-secondary h-9 w-64" })] })), _jsxs("div", { className: "flex items-center justify-between gap-4", children: [_jsxs("div", { children: [_jsx("div", { className: "text-foreground text-sm", children: "Serve mux web UI" }), _jsx("div", { className: "text-muted text-xs", children: "Serve the mux web interface at / (browser mode)" })] }), _jsx(Switch, { checked: serveWebUi, onCheckedChange: (value) => setServeWebUi(value), "aria-label": "Toggle serving mux web UI" })] }), _jsxs("div", { className: "flex items-center justify-between", children: [_jsx("div", { className: "text-muted text-xs", children: loading
                                    ? "Loading server status…"
                                    : status?.running
                                        ? "Server is running"
                                        : "Server is not running" }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx(Button, { variant: "outline", size: "sm", onClick: () => {
                                            loadStatus().catch((e) => {
                                                setError(getErrorMessage(e));
                                            });
                                        }, disabled: loading || saving, children: "Refresh" }), _jsx(Button, { variant: "default", size: "sm", onClick: () => {
                                            handleApply().catch((e) => {
                                                setError(getErrorMessage(e));
                                            });
                                        }, disabled: loading || saving, children: saving ? "Applying…" : "Apply" })] })] }), error && _jsx("div", { className: "text-error text-xs", children: error })] }), status && (_jsxs("div", { className: "space-y-2", children: [_jsx("div", { className: "text-foreground text-sm font-medium", children: "Connection info" }), localDocsUrl && (_jsxs("div", { className: "flex items-start justify-between gap-2", children: [_jsxs("div", { className: "flex-1", children: [_jsx("div", { className: "text-muted text-xs", children: "Local docs URL" }), _jsx("div", { className: "font-mono text-xs break-all", children: localDocsUrl })] }), _jsx(CopyButton, { text: localDocsUrl })] })), networkDocsUrls.length > 0 ? (_jsx("div", { className: "space-y-2", children: networkDocsUrls.map((docsUrl) => (_jsxs("div", { className: "flex items-start justify-between gap-2", children: [_jsxs("div", { className: "flex-1", children: [_jsx("div", { className: "text-muted text-xs", children: "Network docs URL" }), _jsx("div", { className: "font-mono text-xs break-all", children: docsUrl })] }), _jsx(CopyButton, { text: docsUrl })] }, docsUrl))) })) : (_jsx("div", { className: "text-muted text-xs", children: "No network URLs detected (bind host may still be localhost)." })), status.configuredServeWebUi ? (_jsxs(_Fragment, { children: [(localWebUiUrlWithToken ?? localWebUiUrl) && (_jsxs("div", { className: "flex items-start justify-between gap-2", children: [_jsxs("div", { className: "flex-1", children: [_jsx("div", { className: "text-muted text-xs", children: "Local web UI URL" }), _jsx("div", { className: "font-mono text-xs break-all", children: localWebUiUrlWithToken ?? localWebUiUrl })] }), _jsx(CopyButton, { text: localWebUiUrlWithToken ?? localWebUiUrl ?? "" })] })), (encodedToken ? networkWebUiUrlsWithToken : networkWebUiUrls).length > 0 ? (_jsx("div", { className: "space-y-2", children: (encodedToken ? networkWebUiUrlsWithToken : networkWebUiUrls).map((uiUrl) => (_jsxs("div", { className: "flex items-start justify-between gap-2", children: [_jsxs("div", { className: "flex-1", children: [_jsx("div", { className: "text-muted text-xs", children: "Network web UI URL" }), _jsx("div", { className: "font-mono text-xs break-all", children: uiUrl })] }), _jsx(CopyButton, { text: uiUrl })] }, uiUrl))) })) : (_jsx("div", { className: "text-muted text-xs", children: "No network URLs detected for the web UI (bind host may still be localhost)." }))] })) : (_jsx("div", { className: "text-muted text-xs", children: "Web UI serving is disabled (enable \u201CServe mux web UI\u201D and Apply to access /)." })), status.token && (_jsxs("div", { className: "flex items-start justify-between gap-2", children: [_jsxs("div", { className: "flex-1", children: [_jsx("div", { className: "text-muted text-xs", children: "Auth token" }), _jsx("div", { className: "font-mono text-xs break-all", children: status.token })] }), _jsx(CopyButton, { text: status.token })] }))] }))] }));
}
export function ExperimentsSection() {
    const allExperiments = getExperimentList();
    const { api } = useAPI();
    // Only show user-overridable experiments (non-overridable ones are hidden since users can't change them)
    const experiments = useMemo(() => allExperiments.filter((exp) => exp.showInSettings !== false && exp.userOverridable === true), [allExperiments]);
    const handleConfigurableBindUrlToggle = useCallback((enabled) => {
        if (enabled) {
            return;
        }
        api?.server
            .setApiServerSettings({ bindHost: null, port: null, serveWebUi: null })
            .catch(() => {
            // ignore
        });
    }, [api]);
    return (_jsxs("div", { className: "space-y-2", children: [_jsx("p", { className: "text-muted mb-4 text-xs", children: "Experimental features that are still in development. Enable at your own risk." }), _jsx("div", { className: "divide-border-light divide-y", children: experiments.map((exp) => (_jsxs(React.Fragment, { children: [_jsx(ExperimentRow, { experimentId: exp.id, name: exp.name, description: exp.description, onToggle: exp.id === EXPERIMENT_IDS.CONFIGURABLE_BIND_URL
                                ? handleConfigurableBindUrlToggle
                                : undefined }), exp.id === EXPERIMENT_IDS.CONFIGURABLE_BIND_URL && _jsx(ConfigurableBindUrlControls, {})] }, exp.id))) }), experiments.length === 0 && (_jsx("p", { className: "text-muted py-4 text-center text-sm", children: "No experiments available at this time." }))] }));
}
//# sourceMappingURL=ExperimentsSection.js.map