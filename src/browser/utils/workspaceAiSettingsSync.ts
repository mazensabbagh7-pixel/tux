import type { ThinkingLevel } from "@/common/types/thinking";

interface WorkspaceAiSettingsSnapshot {
  model: string;
  thinkingLevel: ThinkingLevel;
}

const pendingAiSettingsByWorkspace = new Map<string, WorkspaceAiSettingsSnapshot>();

function getPendingKey(workspaceId: string, agentId: string): string {
  return `${workspaceId}:${agentId}`;
}

export function markPendingWorkspaceAiSettings(
  workspaceId: string,
  agentId: string,
  settings: WorkspaceAiSettingsSnapshot
): void {
  if (!workspaceId || !agentId) {
    return;
  }
  pendingAiSettingsByWorkspace.set(getPendingKey(workspaceId, agentId), settings);
}

export function clearPendingWorkspaceAiSettings(
  workspaceId: string,
  agentId: string,
  expectedSettings?: WorkspaceAiSettingsSnapshot
): void {
  if (!workspaceId || !agentId) {
    return;
  }

  const key = getPendingKey(workspaceId, agentId);
  if (expectedSettings) {
    const current = pendingAiSettingsByWorkspace.get(key);
    // A newer write has superseded this one — keep the guard active for the newer value.
    if (
      current &&
      (current.model !== expectedSettings.model ||
        current.thinkingLevel !== expectedSettings.thinkingLevel)
    ) {
      return;
    }
  }

  pendingAiSettingsByWorkspace.delete(key);
}

export function shouldApplyWorkspaceAiSettingsFromBackend(
  workspaceId: string,
  agentId: string,
  incoming: WorkspaceAiSettingsSnapshot
): boolean {
  if (!workspaceId || !agentId) {
    return true;
  }

  const key = getPendingKey(workspaceId, agentId);
  const pending = pendingAiSettingsByWorkspace.get(key);
  if (!pending) {
    return true;
  }

  void incoming;

  // Guard is active — block ALL backend metadata for this agent.
  // When the incoming metadata matches the pending settings, the local
  // cache is already correct and applying would be harmless but clearing
  // the guard here would leave a window where a stale backend event
  // could overwrite the local value.
  // The guard is cleared only by:
  // - API failure (catch/then handlers in setWorkspaceAiSettings)
  // - A new local write (markPendingWorkspaceAiSettings replaces the value)
  return false;
}
