import { jsx as _jsx } from "react/jsx-runtime";
import React from "react";
import ReactDOM from "react-dom/client";
import { installBrowserLogCapture } from "@/browser/utils/browserLog";
import { AppLoader } from "@/browser/components/AppLoader";
import { initTelemetry, trackAppStarted } from "@/common/telemetry";
import { initTitlebarInsets } from "@/browser/hooks/useDesktopTitlebar";
// Initialize telemetry on app startup
try {
    installBrowserLogCapture();
}
catch {
    // Silent failure — never crash the app for logging capture
}
initTelemetry();
trackAppStarted();
// Initialize titlebar CSS custom properties (platform-specific insets)
initTitlebarInsets();
// Global error handlers for renderer process
// These catch errors that escape the ErrorBoundary
window.addEventListener("error", (event) => {
    console.error("Uncaught error in renderer:", event.error);
    console.error("Error details:", {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        error: event.error,
        stack: event.error?.stack,
    });
});
window.addEventListener("unhandledrejection", (event) => {
    console.error("Unhandled promise rejection in renderer:", event.reason);
    console.error("Promise:", event.promise);
    if (event.reason instanceof Error) {
        console.error("Stack:", event.reason.stack);
    }
});
ReactDOM.createRoot(document.getElementById("root")).render(_jsx(React.StrictMode, { children: _jsx(AppLoader, {}) }));
// Register service worker for PWA support
// Service worker disabled for development
if ("serviceWorker" in navigator) {
    // Unregister any existing service workers
    navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const registration of registrations) {
            registration.unregister();
        }
    });
}
//# sourceMappingURL=main.js.map