import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { ToolContainer, ToolHeader, StatusIndicator, ToolIcon } from "./shared/ToolPrimitives";
import { getStatusDisplay } from "./shared/toolUtils";
export const NotifyToolCall = ({ args, result, status = "pending", }) => {
    const statusDisplay = getStatusDisplay(status);
    // Show error message if failed
    const errorMessage = status === "failed" && result && typeof result === "object" && "error" in result
        ? String(result.error)
        : undefined;
    return (_jsx(ToolContainer, { expanded: false, children: _jsxs(ToolHeader, { children: [_jsx(ToolIcon, { toolName: "notify" }), _jsx("span", { className: "text-muted-foreground truncate italic", children: args.title }), args.message && (_jsxs("span", { className: "text-muted-foreground/60 hidden truncate @[300px]:inline", children: ["\u2014 ", args.message] })), errorMessage && _jsxs("span", { className: "text-error-foreground", children: ["(", errorMessage, ")"] }), _jsx(StatusIndicator, { status: status, children: statusDisplay })] }) }));
};
//# sourceMappingURL=NotifyToolCall.js.map