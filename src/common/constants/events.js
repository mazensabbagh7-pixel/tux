/**
 * Custom Event Constants & Types
 * These are window-level custom events used for cross-component communication
 *
 * Each event has a corresponding type in CustomEventPayloads for type safety
 */
export const CUSTOM_EVENTS = {
    /**
     * Event to show a toast notification when thinking level changes
     * Detail: { workspaceId: string, level: ThinkingLevel }
     */
    THINKING_LEVEL_TOAST: "mux:thinkingLevelToast",
    /**
     * Event to insert text into the chat input
     * Detail: { text: string, mode?: "replace" | "append", fileParts?: FilePart[], reviews?: ReviewNoteDataForDisplay[] }
     */
    UPDATE_CHAT_INPUT: "mux:updateChatInput",
    /**
     * Event to open the model selector
     * No detail
     */
    OPEN_MODEL_SELECTOR: "mux:openModelSelector",
    /**
     * Event to open the agent picker (AgentModePicker)
     * No detail
     */
    OPEN_AGENT_PICKER: "mux:openAgentPicker",
    /**
     * Event to close the agent picker (AgentModePicker)
     * No detail
     */
    CLOSE_AGENT_PICKER: "mux:closeAgentPicker",
    /**
     * Event to request a refresh of the agent definition list (AgentContext).
     * No detail.
     */
    AGENTS_REFRESH_REQUESTED: "mux:agentsRefreshRequested",
    /**
     * Event to trigger resume check for a workspace
     * Detail: { workspaceId: string }
     *
     * Emitted when:
     * - Stream error occurs
     * - Stream aborted
     * - App startup (for all workspaces with interrupted streams)
     *
     * useResumeManager handles this idempotently - safe to emit multiple times
     */
    RESUME_CHECK_REQUESTED: "mux:resumeCheckRequested",
    /**
     * Event emitted when the mux gateway session expires.
     * No detail
     */
    MUX_GATEWAY_SESSION_EXPIRED: "mux:muxGatewaySessionExpired",
    /**
     * Event to switch to a different workspace after fork
     * Detail: { workspaceId: string, projectPath: string, projectName: string, workspacePath: string, branch: string }
     */
    WORKSPACE_FORK_SWITCH: "mux:workspaceForkSwitch",
    /**
     * Event to execute a command from the command palette
     * Detail: { commandId: string }
     */
    EXECUTE_COMMAND: "mux:executeCommand",
    /**
     * Event to enter the chat-based workspace creation experience.
     * Detail: { projectPath: string, startMessage?: string, model?: string, trunkBranch?: string, runtime?: string }
     */
    START_WORKSPACE_CREATION: "mux:startWorkspaceCreation",
    /**
     * Event to toggle voice input (dictation) mode
     * No detail
     */
    TOGGLE_VOICE_INPUT: "mux:toggleVoiceInput",
    /**
     * Event to open the debug LLM request modal
     * No detail
     */
    OPEN_DEBUG_LLM_REQUEST: "mux:openDebugLlmRequest",
};
/**
 * Helper to create a typed custom event
 *
 * @example
 * ```typescript
 * const event = createCustomEvent(CUSTOM_EVENTS.RESUME_CHECK_REQUESTED, {
 *   workspaceId: 'abc123',
 *   isManual: true
 * });
 * window.dispatchEvent(event);
 * ```
 */
export function createCustomEvent(eventName, ...args) {
    const [detail] = args;
    return new CustomEvent(eventName, { detail });
}
/**
 * Helper to create a storage change event name for a specific key
 * Used by usePersistedState for same-tab synchronization
 */
export const getStorageChangeEvent = (key) => `storage-change:${key}`;
//# sourceMappingURL=events.js.map