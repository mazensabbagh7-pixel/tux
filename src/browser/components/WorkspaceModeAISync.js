import { useEffect, useRef } from "react";
import { useAgent } from "@/browser/contexts/AgentContext";
import { readPersistedState, updatePersistedState, usePersistedState, } from "@/browser/hooks/usePersistedState";
import { getModelKey, getThinkingLevelKey, getWorkspaceAISettingsByAgentKey, AGENT_AI_DEFAULTS_KEY, } from "@/common/constants/storage";
import { getDefaultModel } from "@/browser/hooks/useModelsFromSettings";
import { setWorkspaceModelWithOrigin } from "@/browser/utils/modelChange";
import { resolveWorkspaceAiSettingsForAgent, } from "@/browser/utils/workspaceModeAi";
export function WorkspaceModeAISync(props) {
    const workspaceId = props.workspaceId;
    const { agentId, agents } = useAgent();
    const [agentAiDefaults] = usePersistedState(AGENT_AI_DEFAULTS_KEY, {}, { listener: true });
    const [workspaceByAgent] = usePersistedState(getWorkspaceAISettingsByAgentKey(workspaceId), {}, { listener: true });
    // User request: this effect runs on mount and during background sync (defaults/config).
    // Only treat *real* agentId changes as explicit (origin "agent"); everything else is "sync"
    // so we don't show context-switch warnings on workspace entry.
    const prevAgentIdRef = useRef(null);
    const prevWorkspaceIdRef = useRef(null);
    useEffect(() => {
        const fallbackModel = getDefaultModel();
        const modelKey = getModelKey(workspaceId);
        const thinkingKey = getThinkingLevelKey(workspaceId);
        const normalizedAgentId = typeof agentId === "string" && agentId.trim().length > 0
            ? agentId.trim().toLowerCase()
            : "exec";
        const isExplicitAgentSwitch = prevAgentIdRef.current !== null &&
            prevWorkspaceIdRef.current === workspaceId &&
            prevAgentIdRef.current !== normalizedAgentId;
        // Update refs for the next run (even if no model changes).
        prevAgentIdRef.current = normalizedAgentId;
        prevWorkspaceIdRef.current = workspaceId;
        const existingModel = readPersistedState(modelKey, fallbackModel);
        const existingThinking = readPersistedState(thinkingKey, "off");
        const { resolvedModel, resolvedThinking } = resolveWorkspaceAiSettingsForAgent({
            agentId: normalizedAgentId,
            agents,
            agentAiDefaults,
            workspaceByAgent,
            fallbackModel,
            existingModel,
            existingThinking,
        });
        if (existingModel !== resolvedModel) {
            setWorkspaceModelWithOrigin(workspaceId, resolvedModel, isExplicitAgentSwitch ? "agent" : "sync");
        }
        if (existingThinking !== resolvedThinking) {
            updatePersistedState(thinkingKey, resolvedThinking);
        }
    }, [agentAiDefaults, agentId, agents, workspaceByAgent, workspaceId]);
    return null;
}
//# sourceMappingURL=WorkspaceModeAISync.js.map