import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { ToolContainer, ToolHeader, ExpandIcon, StatusIndicator, ToolDetails, ToolIcon, } from "./shared/ToolPrimitives";
import { useToolExpansion, getStatusDisplay } from "./shared/toolUtils";
import { TodoList } from "../TodoList";
export const TodoToolCall = ({ args, result: _result, status = "pending", }) => {
    const { expanded, toggleExpanded } = useToolExpansion(false); // Collapsed by default
    const statusDisplay = getStatusDisplay(status);
    return (_jsxs(ToolContainer, { expanded: expanded, children: [_jsxs(ToolHeader, { onClick: toggleExpanded, children: [_jsx(ExpandIcon, { expanded: expanded, children: "\u25B6" }), _jsx(ToolIcon, { toolName: "todo_write" }), _jsx(StatusIndicator, { status: status, children: statusDisplay })] }), expanded && (_jsx(ToolDetails, { children: _jsx(TodoList, { todos: args.todos }) }))] }));
};
//# sourceMappingURL=TodoToolCall.js.map