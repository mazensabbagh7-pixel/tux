import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { ToolContainer, ToolHeader, StatusIndicator, ToolIcon } from "./shared/ToolPrimitives";
import { getStatusDisplay } from "./shared/toolUtils";
export const BashBackgroundTerminateToolCall = ({ args, result, status = "pending", }) => {
    const statusDisplay = getStatusDisplay(status);
    return (_jsx(ToolContainer, { expanded: false, children: _jsxs(ToolHeader, { children: [_jsx(ToolIcon, { toolName: "bash_background_terminate" }), _jsx("span", { className: "text-text font-mono", children: result?.success === true ? (result.display_name ?? args.process_id) : args.process_id }), result?.success === true && (_jsx("span", { className: "text-text-secondary text-[10px]", children: "terminated" })), result?.success === false && (_jsx("span", { className: "text-danger text-[10px]", children: result.error })), _jsx(StatusIndicator, { status: status, children: statusDisplay })] }) }));
};
//# sourceMappingURL=BashBackgroundTerminateToolCall.js.map