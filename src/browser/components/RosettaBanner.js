import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { cn } from "@/common/lib/utils";
import { usePersistedState } from "@/browser/hooks/usePersistedState";
const ROSETTA_BANNER_DISMISSED_KEY = "rosettaBannerDismissedAt";
const DISMISS_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
/**
 * Banner shown when Mux is running under Rosetta 2 translation.
 * Users can dismiss it, but it will re-appear after 30 days.
 */
export const RosettaBanner = () => {
    const [dismissedAt, setDismissedAt] = usePersistedState(ROSETTA_BANNER_DISMISSED_KEY, null);
    const [isRosetta, setIsRosetta] = useState(() => {
        if (window.api?.isRosetta === true) {
            return true;
        }
        if (window.api?.isRosetta === false) {
            return false;
        }
        return null;
    });
    useEffect(() => {
        if (isRosetta !== null) {
            return;
        }
        let cancelled = false;
        const load = async () => {
            try {
                const result = await window.api?.getIsRosetta?.();
                if (cancelled)
                    return;
                setIsRosetta(result === true);
            }
            catch {
                if (cancelled)
                    return;
                setIsRosetta(false);
            }
        };
        void load();
        return () => {
            cancelled = true;
        };
    }, [isRosetta]);
    // Check if dismissal has expired (30 days)
    const isDismissed = dismissedAt !== null && Date.now() - dismissedAt < DISMISS_DURATION_MS;
    if (isRosetta !== true || isDismissed) {
        return null;
    }
    return (_jsxs("div", { className: cn("bg-warning/10 border-warning/30 text-warning flex items-center justify-between gap-3 border-b px-4 py-2 text-sm"), children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx(AlertTriangle, { className: "text-warning size-4 shrink-0" }), _jsxs("span", { children: ["Mux is running under Rosetta. For better performance,", " ", _jsx("a", { href: "https://mux.coder.com/install#downloads", target: "_blank", rel: "noopener noreferrer", className: "underline hover:no-underline", children: "download the native Apple Silicon version" }), "."] })] }), _jsx("button", { type: "button", onClick: () => setDismissedAt(Date.now()), className: "hover:text-warning/80 shrink-0 p-1 transition-colors", "aria-label": "Dismiss Rosetta warning", children: _jsx(X, { className: "size-4" }) })] }));
};
//# sourceMappingURL=RosettaBanner.js.map