/**
 * Telemetry tracking functions
 *
 * These functions provide a clean API for tracking telemetry events.
 * Callers pass raw values; rounding and formatting happen internally.
 * This ensures consistent privacy-preserving transformations.
 */
import { trackEvent } from "./client";
import { roundToBase2 } from "./utils";
/**
 * Get frontend platform information for telemetry.
 * Uses browser APIs (navigator) which are safe to send and widely shared.
 */
function getFrontendPlatform() {
    if (typeof navigator === "undefined") {
        return { userAgent: "unknown", platform: "unknown" };
    }
    return {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
    };
}
// =============================================================================
// Tracking Functions
// =============================================================================
/**
 * Track workspace creation
 */
export function trackWorkspaceCreated(workspaceId, runtimeType) {
    trackEvent({
        event: "workspace_created",
        properties: {
            workspaceId,
            runtimeType,
            frontendPlatform: getFrontendPlatform(),
        },
    });
}
/**
 * Track workspace switch
 */
export function trackWorkspaceSwitched(fromWorkspaceId, toWorkspaceId) {
    trackEvent({
        event: "workspace_switched",
        properties: { fromWorkspaceId, toWorkspaceId },
    });
}
/**
 * Track message sent
 * @param messageLength - Raw character count (will be rounded to base-2)
 */
export function trackMessageSent(workspaceId, model, agentId, messageLength, runtimeType, thinkingLevel) {
    trackEvent({
        event: "message_sent",
        properties: {
            workspaceId,
            model,
            agentId,
            message_length_b2: roundToBase2(messageLength),
            runtimeType,
            frontendPlatform: getFrontendPlatform(),
            thinkingLevel,
        },
    });
}
/**
 * Track stats tab opening.
 */
export function trackStatsTabOpened(viewMode, showModeBreakdown) {
    trackEvent({
        event: "stats_tab_opened",
        properties: { viewMode, showModeBreakdown },
    });
}
/**
 * Track stream completion
 * @param durationSecs - Raw duration in seconds (will be rounded to base-2)
 * @param outputTokens - Raw token count (will be rounded to base-2)
 */
export function trackStreamCompleted(model, wasInterrupted, durationSecs, outputTokens) {
    trackEvent({
        event: "stream_completed",
        properties: {
            model,
            wasInterrupted,
            duration_b2: roundToBase2(durationSecs),
            output_tokens_b2: roundToBase2(outputTokens),
        },
    });
}
/**
 * Track provider configuration (not the key value, just that it was configured)
 */
export function trackProviderConfigured(provider, keyType) {
    trackEvent({
        event: "provider_configured",
        properties: { provider, keyType },
    });
}
/**
 * Track slash command usage
 */
export function trackCommandUsed(command) {
    trackEvent({
        event: "command_used",
        properties: { command },
    });
}
/**
 * Track voice transcription
 * @param audioDurationSecs - Raw duration in seconds (will be rounded to base-2)
 */
export function trackVoiceTranscription(audioDurationSecs, success) {
    trackEvent({
        event: "voice_transcription",
        properties: {
            audio_duration_b2: roundToBase2(audioDurationSecs),
            success,
        },
    });
}
/**
 * Track error occurrence
 */
export function trackErrorOccurred(errorType, context) {
    trackEvent({
        event: "error_occurred",
        properties: { errorType, context },
    });
}
/**
 * Track experiment override - when a user manually toggles an experiment
 * @param experimentId - The experiment identifier
 * @param assignedVariant - What PostHog assigned (null if not remote-controlled)
 * @param userChoice - What the user chose (true = enabled, false = disabled)
 */
export function trackExperimentOverridden(experimentId, assignedVariant, userChoice) {
    trackEvent({
        event: "experiment_overridden",
        properties: { experimentId, assignedVariant, userChoice },
    });
}
//# sourceMappingURL=tracking.js.map