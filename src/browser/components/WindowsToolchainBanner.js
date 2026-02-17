import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { usePersistedState } from "@/browser/hooks/usePersistedState";
const WINDOWS_TOOLCHAIN_BANNER_DISMISSED_KEY = "windowsToolchainBannerDismissedAt";
const DISMISS_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
/**
 * Banner shown on Windows when the default shell appears to be WSL.
 * Users can dismiss it, but it will re-appear after 30 days.
 */
export function WindowsToolchainBanner() {
    const [dismissedAt, setDismissedAt] = usePersistedState(WINDOWS_TOOLCHAIN_BANNER_DISMISSED_KEY, null);
    const [isWslShell, setIsWslShell] = useState(() => {
        if (window.api?.platform && window.api.platform !== "win32") {
            return false;
        }
        // Prefer the sync preload signal if present.
        if (window.api?.isWindowsWslShell === true)
            return true;
        if (window.api?.isWindowsWslShell === false)
            return false;
        return null;
    });
    useEffect(() => {
        if (isWslShell !== null)
            return;
        let cancelled = false;
        (async () => {
            try {
                const result = await window.api?.getIsWindowsWslShell?.();
                if (!cancelled)
                    setIsWslShell(result === true);
            }
            catch {
                if (!cancelled)
                    setIsWslShell(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [isWslShell]);
    const now = Date.now();
    const isDismissed = dismissedAt !== null && now < dismissedAt + DISMISS_DURATION_MS;
    if (isWslShell !== true || isDismissed)
        return null;
    return (_jsxs("div", { className: "bg-warning/10 border-warning/30 text-warning flex items-center justify-between gap-3 border-b px-4 py-2 text-sm", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx(AlertTriangle, { className: "text-warning size-4 shrink-0" }), _jsxs("span", { children: ["Your default shell appears to be WSL. Mux requires Git for Windows (Git Bash) on Windows for reliable git + path handling.", _jsx("a", { href: "https://mux.coder.com/install#windows", target: "_blank", rel: "noopener noreferrer", className: "underline hover:no-underline", children: "Install Git for Windows" }), " ", "and restart Mux."] })] }), _jsx("button", { type: "button", onClick: () => setDismissedAt(now), className: "hover:text-warning/80 shrink-0 p-1 transition-colors", "aria-label": "Dismiss Windows toolchain warning", children: _jsx(X, { className: "size-4" }) })] }));
}
//# sourceMappingURL=WindowsToolchainBanner.js.map