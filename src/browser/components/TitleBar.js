import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { cn } from "@/common/lib/utils";
import { GatewayIcon } from "./icons/GatewayIcon";
import { Tooltip, TooltipTrigger, TooltipContent } from "./ui/tooltip";
import { AlertTriangle, Download, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { useAPI } from "@/browser/contexts/API";
import { useAboutDialog } from "@/browser/contexts/AboutDialogContext";
import { usePolicy } from "@/browser/contexts/PolicyContext";
import { useSettings } from "@/browser/contexts/SettingsContext";
import { useGateway } from "@/browser/hooks/useGatewayModels";
import { formatMuxGatewayBalance, useMuxGatewayAccountStatus, } from "@/browser/hooks/useMuxGatewayAccountStatus";
import { isDesktopMode, getTitlebarLeftInset, DESKTOP_TITLEBAR_HEIGHT_CLASS, } from "@/browser/hooks/useDesktopTitlebar";
// Update check interval
const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours
export function TitleBar(_props) {
    const { api } = useAPI();
    const { open: openAboutDialog } = useAboutDialog();
    const policyState = usePolicy();
    const policyEnforced = policyState.status.state === "enforced";
    const { open: openSettings } = useSettings();
    const gateway = useGateway();
    const { data: muxGatewayAccountStatus, error: muxGatewayAccountError, refresh: refreshMuxGatewayAccountStatus, } = useMuxGatewayAccountStatus();
    const [updateStatus, setUpdateStatus] = useState({ type: "idle" });
    useEffect(() => {
        // Skip update checks in browser mode - app updates only apply to Electron
        if (!window.api) {
            return;
        }
        if (!api) {
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
        // Check for updates on mount
        api.update.check({ source: "auto" }).catch(console.error);
        // Check periodically
        const checkInterval = setInterval(() => {
            api.update.check({ source: "auto" }).catch(console.error);
        }, UPDATE_CHECK_INTERVAL_MS);
        return () => {
            controller.abort();
            clearInterval(checkInterval);
        };
    }, [api]);
    const updateBadgeIcon = (() => {
        if (updateStatus.type === "available") {
            return _jsx(Download, { className: "size-3.5" });
        }
        if (updateStatus.type === "downloaded") {
            return _jsx(RefreshCw, { className: "size-3.5" });
        }
        if (updateStatus.type === "downloading" || updateStatus.type === "checking") {
            return _jsx(Loader2, { className: "size-3.5 animate-spin" });
        }
        if (updateStatus.type === "error") {
            return _jsx(AlertTriangle, { className: "size-3.5" });
        }
        return null;
    })();
    // In desktop mode, add left padding for macOS traffic lights
    const leftInset = getTitlebarLeftInset();
    const isDesktop = isDesktopMode();
    return (_jsxs("div", { className: cn("bg-sidebar border-border-light font-primary text-muted flex shrink-0 items-center justify-between border-b px-4 text-[11px] select-none", isDesktop ? DESKTOP_TITLEBAR_HEIGHT_CLASS : "h-8", 
        // In desktop mode, make header draggable for window movement
        isDesktop && "titlebar-drag"), style: leftInset > 0 ? { paddingLeft: leftInset } : undefined, children: [_jsx("div", { 
                // Desktop titlebar: this wrapper is `flex-1` (for version ellipsis) so it fills the gap.
                // Keep it draggable; apply `titlebar-no-drag` only to the interactive controls inside.
                // Version display removed — now shown below the Mux logo in the sidebar.
                className: cn("mr-4 flex min-w-0 flex-1", leftInset > 0 ? "flex-col" : "items-center gap-2"), children: updateBadgeIcon && (_jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("button", { type: "button", "aria-label": "Open about dialog", className: cn("flex min-w-0 max-w-full cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0 text-left text-inherit transition-opacity hover:opacity-70", isDesktop && "titlebar-no-drag"), onClick: openAboutDialog, children: _jsx("div", { className: "text-accent flex h-3.5 w-3.5 items-center justify-center", children: updateBadgeIcon }) }) }), _jsx(TooltipContent, { align: "start", children: "Click for more details" })] })) }), _jsxs("div", { className: cn("flex shrink-0 items-center gap-1.5", isDesktop && "titlebar-no-drag"), children: [gateway.isActive && (_jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("button", { type: "button", onClick: () => openSettings("providers", { expandProvider: "mux-gateway" }), onMouseEnter: () => {
                                        void refreshMuxGatewayAccountStatus();
                                    }, className: "border-border-light text-muted-foreground hover:border-border-medium/80 hover:bg-toggle-bg/70 flex h-5 w-5 cursor-pointer items-center justify-center rounded border transition-opacity hover:opacity-70", "aria-label": "Mux Gateway", children: _jsx(GatewayIcon, { className: "h-3.5 w-3.5", "aria-hidden": true }) }) }), _jsxs(TooltipContent, { align: "end", className: "w-56", children: [_jsx("div", { className: "text-foreground text-[11px] font-medium", children: "Mux Gateway" }), _jsxs("div", { className: "mt-1.5 space-y-0.5 text-[11px]", children: [_jsxs("div", { className: "flex items-center justify-between gap-4", children: [_jsx("span", { className: "text-muted", children: "Balance" }), _jsx("span", { className: "text-foreground font-mono", children: formatMuxGatewayBalance(muxGatewayAccountStatus?.remaining_microdollars) })] }), _jsxs("div", { className: "flex items-center justify-between gap-4", children: [_jsx("span", { className: "text-muted", children: "Concurrent requests" }), _jsx("span", { className: "text-foreground font-mono", children: muxGatewayAccountStatus?.ai_gateway_concurrent_requests_per_user ?? "—" })] })] }), muxGatewayAccountError && (_jsx("div", { className: "text-destructive mt-1.5 text-[10px]", children: muxGatewayAccountError })), _jsx("div", { className: "text-muted border-separator-light mt-2 border-t pt-1.5 text-[10px]", children: "Click to open gateway settings" })] })] })), policyEnforced && (_jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("div", { role: "img", "aria-label": "Settings controlled by policy", className: "border-border-light text-muted-foreground hover:border-border-medium/80 hover:bg-toggle-bg/70 flex h-5 w-5 items-center justify-center rounded border", children: _jsx(ShieldCheck, { className: "h-3.5 w-3.5", "aria-hidden": true }) }) }), _jsx(TooltipContent, { align: "end", children: "Your settings are controlled by a policy." })] }))] })] }));
}
//# sourceMappingURL=TitleBar.js.map