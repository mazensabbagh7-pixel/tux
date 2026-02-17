import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { ToolContainer, ToolHeader, StatusIndicator, ToolIcon } from "./shared/ToolPrimitives";
import { getStatusDisplay } from "./shared/toolUtils";
export const StatusSetToolCall = ({ args, result, status = "pending", }) => {
    const statusDisplay = getStatusDisplay(status);
    // Show error message if validation failed
    const errorMessage = status === "failed" && result && typeof result === "object" && "error" in result
        ? String(result.error)
        : undefined;
    return (_jsx(ToolContainer, { expanded: false, children: _jsxs(ToolHeader, { children: [_jsx(ToolIcon, { toolName: "status_set", emoji: args.emoji }), _jsx("span", { className: "text-muted-foreground italic", children: args.message }), errorMessage && _jsxs("span", { className: "text-error-foreground", children: ["(", errorMessage, ")"] }), _jsx(StatusIndicator, { status: status, children: statusDisplay })] }) }));
};
//# sourceMappingURL=StatusSetToolCall.js.map