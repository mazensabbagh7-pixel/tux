import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { AlertTriangle, Check, CircleDot, EyeOff, X } from "lucide-react";
import { LoadingDots } from "./ToolPrimitives";
/**
 * Hook for managing tool expansion state
 */
export function useToolExpansion(initialExpanded = false) {
    const [expanded, setExpanded] = useState(initialExpanded);
    const toggleExpanded = () => setExpanded(!expanded);
    return { expanded, setExpanded, toggleExpanded };
}
/**
 * Get display element for tool status
 */
export function getStatusDisplay(status) {
    switch (status) {
        case "executing":
            return (_jsxs(_Fragment, { children: [_jsx(LoadingDots, {}), " ", _jsx("span", { className: "status-text", children: "executing" })] }));
        case "completed":
            return (_jsxs(_Fragment, { children: [_jsx(Check, { "aria-hidden": "true", className: "mr-1 inline-block h-3 w-3 align-[-2px]" }), _jsx("span", { className: "status-text", children: "completed" })] }));
        case "failed":
            return (_jsxs(_Fragment, { children: [_jsx(X, { "aria-hidden": "true", className: "mr-1 inline-block h-3 w-3 align-[-2px]" }), _jsx("span", { className: "status-text", children: "failed" })] }));
        case "interrupted":
            return (_jsxs(_Fragment, { children: [_jsx(AlertTriangle, { "aria-hidden": "true", className: "mr-1 inline-block h-3 w-3 align-[-2px]" }), _jsx("span", { className: "status-text", children: "interrupted" })] }));
        case "redacted":
            return (_jsxs(_Fragment, { children: [_jsx(EyeOff, { "aria-hidden": "true", className: "mr-1 inline-block h-3 w-3 align-[-2px]" }), _jsx("span", { className: "status-text", children: "redacted" })] }));
        case "backgrounded":
            return (_jsxs(_Fragment, { children: [_jsx(CircleDot, { "aria-hidden": "true", className: "mr-1 inline-block h-3 w-3 align-[-2px]" }), _jsx("span", { className: "status-text", children: "backgrounded" })] }));
        default:
            return _jsx("span", { className: "status-text", children: "pending" });
    }
}
/**
 * Format a value for display (JSON or string)
 */
export function formatValue(value) {
    if (value === null || value === undefined)
        return "None";
    if (typeof value === "string")
        return value;
    if (typeof value === "number" || typeof value === "boolean")
        return String(value);
    try {
        return JSON.stringify(value, null, 2);
    }
    catch {
        // If JSON.stringify fails (e.g., circular reference), return a safe fallback
        return "[Complex Object - Cannot Stringify]";
    }
}
/**
 * Format duration in human-readable form (ms, s, m, h)
 */
export function formatDuration(ms) {
    if (ms < 1000)
        return `${Math.round(ms)}ms`;
    if (ms < 60000)
        return `${Math.round(ms / 1000)}s`;
    if (ms < 3600000)
        return `${Math.round(ms / 60000)}m`;
    return `${Math.round(ms / 3600000)}h`;
}
/**
 * Type guard for ToolErrorResult shape: { success: false, error: string }.
 * Use this when you need type narrowing to access error.
 */
export function isToolErrorResult(val) {
    if (!val || typeof val !== "object")
        return false;
    const record = val;
    return record.success === false && typeof record.error === "string";
}
/**
 * Determine if a tool output indicates failure.
 * Handles both `{ success: false }` and `{ error: "..." }` shapes.
 * Note: Use isToolErrorResult() when you need type narrowing.
 */
export function isFailedToolOutput(output) {
    if (!output || typeof output !== "object")
        return false;
    if ("success" in output && output.success === false)
        return true;
    if ("error" in output)
        return true;
    return false;
}
/**
 * Determine the display status for a nested tool call.
 * - output-available + failure → "failed"
 * - output-available + success → "completed"
 * - input-available + parentInterrupted → "interrupted"
 * - input-available + running → "executing"
 */
export function getNestedToolStatus(state, output, parentInterrupted, failed) {
    if (state === "output-available") {
        return isFailedToolOutput(output) ? "failed" : "completed";
    }
    if (state === "output-redacted")
        return failed ? "failed" : "redacted";
    return parentInterrupted ? "interrupted" : "executing";
}
//# sourceMappingURL=toolUtils.js.map