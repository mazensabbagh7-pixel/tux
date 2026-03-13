import { useEffect, useRef } from "react";
import { useAgent } from "@/browser/contexts/AgentContext";
import {
  readPersistedState,
  updatePersistedState,
  usePersistedState,
} from "@/browser/hooks/usePersistedState";
import {
  getModelKey,
  getThinkingLevelKey,
  getWorkspaceAISettingsByAgentKey,
  AGENT_AI_DEFAULTS_KEY,
} from "@/common/constants/storage";
import { getDefaultModel } from "@/browser/hooks/useModelsFromSettings";
import { setWorkspaceModelWithOrigin } from "@/browser/utils/modelChange";
import { readLegacyPerModelThinking } from "@/browser/utils/messages/sendOptions";
import {
  resolveActiveWorkspaceThinkingForAgent,
  resolveWorkspaceAiSettingsForAgent,
  type WorkspaceAISettingsCache,
} from "@/browser/utils/workspaceModeAi";
import type { AgentAiDefaults } from "@/common/types/agentAiDefaults";
import type { ThinkingLevel } from "@/common/types/thinking";

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
    const modelKey = getModelKey(workspaceId);

    const normalizedAgentId =
      typeof agentId === "string" && agentId.trim().length > 0
        ? agentId.trim().toLowerCase()
        : "exec";
    const previousAgentId = prevAgentIdRef.current;
    const isExplicitAgentSwitch =
      previousAgentId !== null &&
      prevWorkspaceIdRef.current === workspaceId &&
      previousAgentId !== normalizedAgentId;
    const sourceAgentId =
      isExplicitAgentSwitch && previousAgentId !== null ? previousAgentId : normalizedAgentId;

    // Update refs for the next run (even if no model changes).
    prevAgentIdRef.current = normalizedAgentId;
    prevWorkspaceIdRef.current = workspaceId;

    const existingModel = readPersistedState<string>(modelKey, fallbackModel);
    const legacyThinkingLevel =
      readPersistedState<ThinkingLevel | undefined>(getThinkingLevelKey(workspaceId), undefined) ??
      readLegacyPerModelThinking(existingModel);
    const existingThinking = resolveActiveWorkspaceThinkingForAgent({
      agentId: sourceAgentId,
      agentAiDefaults,
      workspaceByAgent,
      fallbackModel,
      currentModel: existingModel,
      legacyThinkingLevel,
    });
    const { resolvedModel, resolvedThinking } = resolveWorkspaceAiSettingsForAgent({
      agentId: normalizedAgentId,
      agentAiDefaults,
      // Keep deterministic handoff behavior: background sync should trust the
      // currently active workspace model, but explicit mode switches should
      // restore the selected agent's per-workspace override (if any).
      workspaceByAgent,
      useWorkspaceByAgentFallback: isExplicitAgentSwitch,
      fallbackModel,
      existingModel,
      existingThinking,
    });

    // Preserve first-switch inheritance in the per-agent cache without backfilling the
    // legacy flat thinking key from this sync path.
    if (isExplicitAgentSwitch) {
      const existingTargetSettings = workspaceByAgent[normalizedAgentId];
      if (
        existingTargetSettings?.model !== resolvedModel ||
        existingTargetSettings?.thinkingLevel !== resolvedThinking
      ) {
        updatePersistedState<WorkspaceAISettingsCache>(
          workspaceAiSettingsKey,
          (prev) => {
            const record: WorkspaceAISettingsCache = prev && typeof prev === "object" ? prev : {};
            return {
              ...record,
              [normalizedAgentId]: { model: resolvedModel, thinkingLevel: resolvedThinking },
            };
          },
          {}
        );
      }
    }

    if (existingModel !== resolvedModel) {
      setWorkspaceModelWithOrigin(
        workspaceId,
        resolvedModel,
        isExplicitAgentSwitch ? "agent" : "sync"
      );
    }
  }, [agentAiDefaults, agentId, workspaceAiSettingsKey, workspaceByAgent, workspaceId]);

  return null;
}
