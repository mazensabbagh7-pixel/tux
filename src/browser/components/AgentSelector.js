import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useAgent } from "@/browser/contexts/AgentContext";
import { HelpIndicator, Tooltip, TooltipContent, TooltipTrigger, } from "@/browser/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, } from "@/browser/components/ui/select";
import { formatKeybind, KEYBINDS } from "@/browser/utils/ui/keybinds";
import { sortAgentsStable } from "@/browser/utils/agents";
import { cn } from "@/common/lib/utils";
const AgentHelpTooltip = () => (_jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx(HelpIndicator, { children: "?" }) }), _jsxs(TooltipContent, { align: "center", className: "max-w-80 whitespace-normal", children: ["Selects an agent definition (system prompt + tool policy).", _jsx("br", {}), _jsx("br", {}), "Open picker: ", formatKeybind(KEYBINDS.TOGGLE_AGENT), _jsx("br", {}), "Cycle agents: ", formatKeybind(KEYBINDS.CYCLE_AGENT)] })] }));
export const AgentSelector = (props) => {
    const { agentId, setAgentId, agents, loaded } = useAgent();
    const selectable = agents.filter((entry) => entry.uiSelectable);
    const options = selectable.length > 0
        ? sortAgentsStable(selectable)
        : [
            { id: "exec", name: "Exec" },
            { id: "plan", name: "Plan" },
        ];
    const selectedLabel = options.find((option) => option.id === agentId)?.name ?? (loaded ? agentId : "Agent");
    return (_jsxs("div", { className: cn("flex items-center gap-1.5", props.className), children: [_jsxs(Select, { value: agentId, onValueChange: (next) => setAgentId(next), children: [_jsx(SelectTrigger, { className: "h-6 w-[120px] px-2 text-[11px]", children: _jsx(SelectValue, { children: selectedLabel }) }), _jsx(SelectContent, { children: options.map((option) => (_jsx(SelectItem, { value: option.id, children: option.name }, option.id))) })] }), _jsx(AgentHelpTooltip, {})] }));
};
//# sourceMappingURL=AgentSelector.js.map