import { useCallback, useEffect, useMemo, useRef, useState } from "react";
/**
 * Hook for managing popover error state with auto-dismiss and click-outside behavior.
 * @param autoDismissMs - Time in ms before auto-dismissing (default: 5000)
 */
export function usePopoverError(autoDismissMs = 5000) {
    const [error, setError] = useState(null);
    const timeoutRef = useRef(null);
    const clearError = useCallback(() => {
        setError(null);
        if (timeoutRef.current) {
            window.clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
    }, []);
    const showError = useCallback((id, errorMsg, anchor) => {
        if (timeoutRef.current) {
            window.clearTimeout(timeoutRef.current);
        }
        const position = anchor ?? {
            top: window.scrollY + 32,
            left: Math.max(window.innerWidth - 420, 16),
        };
        setError({ id, error: errorMsg, position });
        timeoutRef.current = window.setTimeout(() => {
            setError(null);
            timeoutRef.current = null;
        }, autoDismissMs);
    }, [autoDismissMs]);
    // Cleanup timeout on unmount
    useEffect(() => {
        return () => {
            if (timeoutRef.current) {
                window.clearTimeout(timeoutRef.current);
            }
        };
    }, []);
    // Click-outside to dismiss
    useEffect(() => {
        if (!error)
            return;
        const handleClickOutside = () => clearError();
        // Delay to avoid immediate dismissal from the triggering click
        const timeoutId = window.setTimeout(() => {
            document.addEventListener("click", handleClickOutside, { once: true });
        }, 0);
        return () => {
            window.clearTimeout(timeoutId);
            document.removeEventListener("click", handleClickOutside);
        };
    }, [error, clearError]);
    return useMemo(() => ({ error, showError, clearError }), [error, showError, clearError]);
}
//# sourceMappingURL=usePopoverError.js.map