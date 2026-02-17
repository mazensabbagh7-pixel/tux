import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { getStoredAuthToken } from "@/browser/components/AuthTokenModal";
import { getBrowserBackendBaseUrl } from "@/browser/utils/backendBaseUrl";
import { SplashScreen } from "@/browser/components/splashScreens/SplashScreen";
import { CUSTOM_EVENTS } from "@/common/constants/events";
import { MUX_GATEWAY_SESSION_EXPIRED_MESSAGE } from "@/common/constants/muxGatewayOAuth";
function getServerAuthToken() {
    const urlToken = new URLSearchParams(window.location.search).get("token")?.trim();
    return urlToken?.length ? urlToken : getStoredAuthToken();
}
export function MuxGatewaySessionExpiredDialog() {
    const [isOpen, setIsOpen] = useState(false);
    const [loginError, setLoginError] = useState(null);
    const [isStartingLogin, setIsStartingLogin] = useState(false);
    useEffect(() => {
        if (typeof window === "undefined") {
            return;
        }
        const handler = () => {
            setLoginError(null);
            setIsStartingLogin(false);
            setIsOpen(true);
        };
        window.addEventListener(CUSTOM_EVENTS.MUX_GATEWAY_SESSION_EXPIRED, handler);
        return () => {
            window.removeEventListener(CUSTOM_EVENTS.MUX_GATEWAY_SESSION_EXPIRED, handler);
        };
    }, []);
    const dismiss = () => {
        setIsOpen(false);
        setLoginError(null);
        setIsStartingLogin(false);
    };
    const startMuxGatewayLogin = async () => {
        if (isStartingLogin) {
            return;
        }
        setIsStartingLogin(true);
        setLoginError(null);
        try {
            const isDesktop = !!window.api;
            if (isDesktop) {
                const client = window.__ORPC_CLIENT__;
                if (!client) {
                    throw new Error("Mux API not connected.");
                }
                const startResult = await client.muxGatewayOauth.startDesktopFlow();
                if (!startResult.success) {
                    throw new Error(startResult.error);
                }
                // Desktop main process intercepts external window.open() calls and routes them via shell.openExternal.
                window.open(startResult.data.authorizeUrl, "_blank", "noopener");
                dismiss();
                return;
            }
            // Browser/server mode: use unauthenticated bootstrap route.
            // Open popup synchronously to preserve user gesture context (avoids popup blockers).
            const popup = window.open("about:blank", "_blank");
            if (!popup) {
                throw new Error("Popup blocked - please allow popups and try again.");
            }
            const backendBaseUrl = getBrowserBackendBaseUrl();
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
            if (typeof json.authorizeUrl !== "string") {
                popup.close();
                throw new Error(`Invalid response from ${startUrl.pathname}`);
            }
            popup.location.href = json.authorizeUrl;
            dismiss();
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            setIsStartingLogin(false);
            setLoginError(message);
        }
    };
    if (!isOpen) {
        return null;
    }
    return (_jsxs(SplashScreen, { title: "Mux Gateway session expired", onDismiss: dismiss, dismissOnPrimaryAction: false, primaryAction: {
            label: isStartingLogin ? "Starting login..." : "Login to mux gateway",
            disabled: isStartingLogin,
            onClick: () => {
                void startMuxGatewayLogin();
            },
        }, dismissLabel: "Cancel", children: [_jsx("p", { className: "text-muted text-sm", children: MUX_GATEWAY_SESSION_EXPIRED_MESSAGE }), loginError && (_jsxs("p", { className: "mt-3 text-sm", children: [_jsx("strong", { className: "text-destructive", children: "Login failed:" }), " ", loginError] }))] }));
}
//# sourceMappingURL=MuxGatewaySessionExpiredDialog.js.map