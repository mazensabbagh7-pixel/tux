import { jsx as _jsx } from "react/jsx-runtime";
import { NestedToolRenderer } from "./NestedToolRenderer";
import { getNestedToolStatus } from "./toolUtils";
/**
 * Renders nested tool calls as a list.
 * Parent component provides the container styling (dashed border).
 */
export const NestedToolsContainer = ({ calls, parentInterrupted, }) => {
    if (calls.length === 0)
        return null;
    return (_jsx("div", { className: "-mx-3 space-y-3", children: calls.map((call) => {
            const status = getNestedToolStatus(call.state, call.output, parentInterrupted ?? false, call.failed);
            return (_jsx(NestedToolRenderer, { toolName: call.toolName, input: call.input, output: call.state === "output-available" ? call.output : undefined, status: status }, call.toolCallId));
        }) }));
};
//# sourceMappingURL=NestedToolsContainer.js.map