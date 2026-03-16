import { useEffect, useRef } from "react";
import { useAgent } from "@/browser/contexts/AgentContext";
import { readPersistedState, usePersistedState } from "@/browser/hooks/usePersistedState";
import {
  getModelKey,
  getWorkspaceAISettingsByAgentKey,
  AGENT_AI_DEFAULTS_KEY,
} from "@/common/constants/storage";
import { getDefaultModel } from "@/browser/hooks/useModelsFromSettings";
import { setWorkspaceModelWithOrigin } from "@/browser/utils/modelChange";
import {
  getWorkspaceAiSettings,
  normalizeAgentId,
  type WorkspaceAISettingsCache,
} from "@/browser/services/workspaceAiSettings";
import type { AgentAiDefaults } from "@/common/types/agentAiDefaults";

export function WorkspaceModeAISync(props: { workspaceId: string }): null {
  const workspaceId = props.workspaceId;
  const { agentId } = useAgent();

  const workspaceAiSettingsKey = getWorkspaceAISettingsByAgentKey(workspaceId);
  const [agentAiDefaults] = usePersistedState<AgentAiDefaults>(
    AGENT_AI_DEFAULTS_KEY,
    {},
    { listener: true }
  );
  const [workspaceByAgent] = usePersistedState<WorkspaceAISettingsCache>(
    workspaceAiSettingsKey,
    {},
    { listener: true }
  );

  // User request: this effect runs on mount and during background sync (defaults/config).
  // Only treat *real* agentId changes as explicit (origin "agent"); everything else is "sync"
  // so we don't show context-switch warnings on workspace entry.
  const prevAgentIdRef = useRef<string | null>(null);
  const prevWorkspaceIdRef = useRef<string | null>(null);

  useEffect(() => {
    const fallbackModel = getDefaultModel();
    const existingModel = readPersistedState<string>(getModelKey(workspaceId), fallbackModel);
    const normalizedCurrentAgentId = normalizeAgentId(agentId);
    const previousAgentId = prevAgentIdRef.current;
    const isExplicitAgentSwitch =
      previousAgentId !== null &&
      prevWorkspaceIdRef.current === workspaceId &&
      previousAgentId !== normalizedCurrentAgentId;

    // Update refs for the next run (even if no model changes).
    prevAgentIdRef.current = normalizedCurrentAgentId;
    prevWorkspaceIdRef.current = workspaceId;

    if (isExplicitAgentSwitch && previousAgentId !== null) {
      const resolvedSettings = getWorkspaceAiSettings(workspaceId, normalizedCurrentAgentId, {
        inheritFromAgentId: previousAgentId,
      });

      // getWorkspaceAiSettings already caches inherited settings internally
      // when the target agent has no cache entry and incomplete defaults.
      // Don't write resolved settings here — that would turn agent defaults
      // into sticky workspace overrides that outlive default changes.
      // Reconcile against the persisted model key so interleaved UI updates
      // cannot leave an older model selection behind when source/target resolve
      // to the same model string.
      if (existingModel !== resolvedSettings.model) {
        setWorkspaceModelWithOrigin(workspaceId, resolvedSettings.model, "agent");
      }
      return;
    }

    const configuredModelCandidate = agentAiDefaults[normalizedCurrentAgentId]?.modelString;
    const configuredModel =
      typeof configuredModelCandidate === "string" && configuredModelCandidate.trim().length > 0
        ? configuredModelCandidate.trim()
        : undefined;

    if (configuredModel && existingModel !== configuredModel) {
      setWorkspaceModelWithOrigin(workspaceId, configuredModel, "sync");
    }
  }, [agentAiDefaults, agentId, workspaceByAgent, workspaceId]);

  return null;
}
