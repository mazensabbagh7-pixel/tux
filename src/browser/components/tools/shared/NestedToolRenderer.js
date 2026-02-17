import { jsx as _jsx } from "react/jsx-runtime";
import { getToolComponent } from "./getToolComponent";
/**
 * Routes nested tool calls to their specialized components.
 * Uses the shared registry for component lookup.
 */
export const NestedToolRenderer = ({ toolName, input, output, status, }) => {
    const ToolComponent = getToolComponent(toolName, input);
    return _jsx(ToolComponent, { args: input, result: output, status: status, toolName: toolName });
};
//# sourceMappingURL=NestedToolRenderer.js.map