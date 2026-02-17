import { useCallback } from "react";
import { trackWorkspaceCreated, trackWorkspaceSwitched, trackMessageSent, trackStatsTabOpened, trackStreamCompleted, trackProviderConfigured, trackCommandUsed, trackVoiceTranscription, trackErrorOccurred, trackExperimentOverridden, } from "@/common/telemetry";
/**
 * Hook for clean telemetry integration in React components
 *
 * Provides stable callback references for telemetry tracking.
 * All numeric values are automatically rounded for privacy.
 *
 * Usage:
 *
 * ```tsx
 * const telemetry = useTelemetry();
 *
 * telemetry.workspaceSwitched(fromId, toId);
 * telemetry.workspaceCreated(workspaceId, runtimeType);
 * telemetry.messageSent(workspaceId, model, agentId, messageLength, runtimeType, thinkingLevel);
 * telemetry.streamCompleted(model, wasInterrupted, durationSecs, outputTokens);
 * telemetry.providerConfigured(provider, keyType);
 * telemetry.commandUsed(commandType);
 * telemetry.voiceTranscription(audioDurationSecs, success);
 * telemetry.errorOccurred(errorType, context);
 * telemetry.experimentOverridden(experimentId, assignedVariant, userChoice);
 * ```
 */
export function useTelemetry() {
    const workspaceSwitched = useCallback((fromWorkspaceId, toWorkspaceId) => {
        trackWorkspaceSwitched(fromWorkspaceId, toWorkspaceId);
    }, []);
    const workspaceCreated = useCallback((workspaceId, runtimeType) => {
        trackWorkspaceCreated(workspaceId, runtimeType);
    }, []);
    const messageSent = useCallback((workspaceId, model, agentId, messageLength, runtimeType, thinkingLevel) => {
        trackMessageSent(workspaceId, model, agentId, messageLength, runtimeType, thinkingLevel);
    }, []);
    const statsTabOpened = useCallback((viewMode, showModeBreakdown) => {
        trackStatsTabOpened(viewMode, showModeBreakdown);
    }, []);
    const streamCompleted = useCallback((model, wasInterrupted, durationSecs, outputTokens) => {
        trackStreamCompleted(model, wasInterrupted, durationSecs, outputTokens);
    }, []);
    const providerConfigured = useCallback((provider, keyType) => {
        trackProviderConfigured(provider, keyType);
    }, []);
    const commandUsed = useCallback((command) => {
        trackCommandUsed(command);
    }, []);
    const voiceTranscription = useCallback((audioDurationSecs, success) => {
        trackVoiceTranscription(audioDurationSecs, success);
    }, []);
    const errorOccurred = useCallback((errorType, context) => {
        trackErrorOccurred(errorType, context);
    }, []);
    const experimentOverridden = useCallback((experimentId, assignedVariant, userChoice) => {
        trackExperimentOverridden(experimentId, assignedVariant, userChoice);
    }, []);
    return {
        workspaceSwitched,
        workspaceCreated,
        messageSent,
        statsTabOpened,
        streamCompleted,
        providerConfigured,
        commandUsed,
        voiceTranscription,
        errorOccurred,
        experimentOverridden,
    };
}
//# sourceMappingURL=useTelemetry.js.map