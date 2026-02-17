import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { Download, Loader2, RefreshCw } from "lucide-react";
import { VERSION } from "@/version";
import MuxLogoDark from "@/browser/assets/logos/mux-logo-dark.svg?react";
import MuxLogoLight from "@/browser/assets/logos/mux-logo-light.svg?react";
import { useTheme } from "@/browser/contexts/ThemeContext";
import { useAPI } from "@/browser/contexts/API";
import { useAboutDialog } from "@/browser/contexts/AboutDialogContext";
import { Button } from "@/browser/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/browser/components/ui/dialog";
function formatExtendedTimestamp(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }
    return date.toLocaleString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        timeZoneName: "short",
    });
}
function parseVersionInfo(version) {
    if (typeof version !== "object" || version === null) {
        return {
            gitDescribe: "dev",
            buildTime: "Unknown build time",
        };
    }
    const versionRecord = version;
    const gitDescribe = typeof versionRecord.git_describe === "string"
        ? versionRecord.git_describe
        : typeof versionRecord.git === "string"
            ? versionRecord.git
            : "dev";
    return {
        gitDescribe,
        buildTime: typeof versionRecord.buildTime === "string"
            ? formatExtendedTimestamp(versionRecord.buildTime)
            : "Unknown build time",
    };
}
export function AboutDialog() {
    const { isOpen, close } = useAboutDialog();
    const { api } = useAPI();
    const { theme } = useTheme();
    const MuxLogo = theme === "dark" || theme.endsWith("-dark") ? MuxLogoDark : MuxLogoLight;
    const { gitDescribe, buildTime } = parseVersionInfo(VERSION);
    const [updateStatus, setUpdateStatus] = useState({ type: "idle" });
    const isDesktop = typeof window !== "undefined" && Boolean(window.api);
    useEffect(() => {
        if (!isOpen || !isDesktop || !api) {
            return;
        }
        const controller = new AbortController();
        const { signal } = controller;
        (async () => {
            try {
                const iterator = await api.update.onStatus(undefined, { signal });
                for await (const status of iterator) {
                    if (signal.aborted) {
                        break;
                    }
                    setUpdateStatus(status);
                }
            }
            catch (error) {
                if (!signal.aborted) {
                    console.error("Update status stream error:", error);
                }
            }
        })();
        return () => {
            controller.abort();
        };
    }, [api, isDesktop, isOpen]);
    const canUseUpdateApi = isDesktop && Boolean(api);
    const isChecking = canUseUpdateApi && (updateStatus.type === "checking" || updateStatus.type === "downloading");
    const handleCheckForUpdates = () => {
        if (!api) {
            return;
        }
        api.update.check({ source: "manual" }).catch(console.error);
    };
    const handleDownload = () => {
        if (!api) {
            return;
        }
        api.update.download(undefined).catch(console.error);
    };
    const handleInstall = () => {
        if (!api) {
            return;
        }
        api.update.install(undefined).catch(console.error);
    };
    return (_jsx(Dialog, { open: isOpen, onOpenChange: (nextOpen) => !nextOpen && close(), children: _jsxs(DialogContent, { maxWidth: "520px", "aria-describedby": undefined, className: "titlebar-no-drag space-y-4", children: [_jsx(DialogTitle, { children: "About" }), _jsx("div", { className: "border-border-medium bg-modal-bg flex justify-center rounded-md border py-6", children: _jsx(MuxLogo, { className: "h-14 w-auto", "aria-hidden": "true" }) }), _jsxs("div", { className: "space-y-1 text-sm", children: [_jsxs("div", { className: "flex items-center justify-between gap-4", children: [_jsx("span", { className: "text-muted", children: "Version" }), _jsx("span", { className: "text-foreground font-mono", children: gitDescribe })] }), _jsxs("div", { className: "flex items-center justify-between gap-4", children: [_jsx("span", { className: "text-muted", children: "Built" }), _jsx("span", { className: "text-foreground text-right text-xs", children: buildTime })] })] }), _jsxs("div", { className: "border-border-medium space-y-3 border-t pt-3", children: [_jsx("div", { className: "text-foreground text-sm font-medium", children: "Updates" }), !isDesktop ? (_jsx("div", { className: "text-muted text-xs", children: "Desktop updates are available in the Electron app only." })) : !canUseUpdateApi ? (_jsx("div", { className: "text-muted text-xs", children: "Connecting to desktop update service\u2026" })) : (_jsxs(_Fragment, { children: [_jsxs(Button, { variant: "outline", size: "sm", disabled: isChecking, onClick: handleCheckForUpdates, children: [isChecking ? _jsx(Loader2, { className: "h-3.5 w-3.5 animate-spin" }) : null, "Check for Updates"] }), updateStatus.type === "checking" && (_jsx("div", { className: "text-muted text-xs", children: "Checking for updates\u2026" })), updateStatus.type === "available" && (_jsxs("div", { className: "flex items-center justify-between gap-3", children: [_jsxs("div", { className: "text-foreground text-xs", children: ["Update available: ", _jsx("span", { className: "font-mono", children: updateStatus.info.version })] }), _jsxs(Button, { size: "sm", onClick: handleDownload, children: [_jsx(Download, { className: "h-3.5 w-3.5" }), "Download"] })] })), updateStatus.type === "downloading" && (_jsxs("div", { className: "text-muted text-xs", children: ["Downloading update: ", updateStatus.percent, "%"] })), updateStatus.type === "downloaded" && (_jsxs("div", { className: "flex items-center justify-between gap-3", children: [_jsxs("div", { className: "text-foreground text-xs", children: ["Ready to install: ", _jsx("span", { className: "font-mono", children: updateStatus.info.version })] }), _jsxs(Button, { size: "sm", onClick: handleInstall, children: [_jsx(RefreshCw, { className: "h-3.5 w-3.5" }), "Install & restart"] })] })), updateStatus.type === "up-to-date" && (_jsx("div", { className: "text-muted text-xs", children: "Mux is up to date." })), updateStatus.type === "idle" && (_jsx("div", { className: "text-muted text-xs", children: "Run a manual check to look for updates." })), updateStatus.type === "error" && (_jsxs("div", { className: "space-y-2", children: [_jsx("div", { className: "text-destructive text-xs", children: updateStatus.phase === "download"
                                                ? `Download failed: ${updateStatus.message}`
                                                : updateStatus.phase === "install"
                                                    ? `Install failed: ${updateStatus.message}`
                                                    : `Update check failed: ${updateStatus.message}` }), _jsxs("div", { className: "flex items-center gap-2", children: [updateStatus.phase === "download" && (_jsxs(Button, { size: "sm", onClick: handleDownload, children: [_jsx(Download, { className: "h-3.5 w-3.5" }), "Retry download"] })), updateStatus.phase === "install" && (_jsxs(Button, { size: "sm", onClick: handleInstall, children: [_jsx(RefreshCw, { className: "h-3.5 w-3.5" }), "Try install again"] })), _jsx(Button, { variant: "outline", size: "sm", onClick: handleCheckForUpdates, children: updateStatus.phase === "check" ? "Try again" : "Check again" })] })] }))] })), _jsx("a", { href: "https://github.com/coder/mux/releases", target: "_blank", rel: "noopener noreferrer", className: "titlebar-no-drag text-accent inline-block text-xs hover:underline", children: "View all releases" })] })] }) }));
}
//# sourceMappingURL=AboutDialog.js.map