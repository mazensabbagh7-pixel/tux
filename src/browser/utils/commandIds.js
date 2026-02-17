/**
 * Centralized command ID construction and matching
 * Single source of truth for all command ID patterns
 */
/**
 * Command ID prefixes for pattern matching
 * Single source of truth for all dynamic ID patterns
 */
const COMMAND_ID_PREFIXES = {
    WS_SWITCH: "ws:switch:",
    CHAT_TRUNCATE: "chat:truncate:",
    PROJECT_REMOVE: "project:remove:",
};
/**
 * Command ID builders - construct IDs with consistent patterns
 */
export const CommandIds = {
    // Workspace commands
    workspaceSwitch: (workspaceId) => `${COMMAND_ID_PREFIXES.WS_SWITCH}${workspaceId}`,
    workspaceNew: () => "ws:new",
    workspaceNewInProject: () => "ws:new-in-project",
    workspaceRemove: () => "ws:remove",
    workspaceRemoveAny: () => "ws:remove-any",
    workspaceRename: () => "ws:rename",
    workspaceRenameAny: () => "ws:rename-any",
    workspaceOpenTerminal: () => "ws:open-terminal",
    workspaceOpenTerminalCurrent: () => "ws:open-terminal-current",
    workspaceArchiveMergedInProject: () => "ws:archive-merged-in-project",
    // Navigation commands
    navNext: () => "nav:next",
    navPrev: () => "nav:prev",
    navToggleSidebar: () => "nav:toggleSidebar",
    navRightSidebarFocusTerminal: () => "nav:rightSidebar:focusTerminal",
    navRightSidebarSplitHorizontal: () => "nav:rightSidebar:splitHorizontal",
    navRightSidebarSplitVertical: () => "nav:rightSidebar:splitVertical",
    navRightSidebarAddTool: () => "nav:rightSidebar:addTool",
    navToggleOutput: () => "nav:toggle-output",
    navOpenLogFile: () => "nav:open-log-file",
    // Chat commands
    chatClear: () => "chat:clear",
    chatTruncate: (pct) => `${COMMAND_ID_PREFIXES.CHAT_TRUNCATE}${pct}`,
    chatInterrupt: () => "chat:interrupt",
    chatJumpBottom: () => "chat:jumpBottom",
    chatVoiceInput: () => "chat:voiceInput",
    chatClearTimingStats: () => "chat:clearTimingStats",
    // Mode commands
    modeToggle: () => "mode:toggle",
    modelChange: () => "model:change",
    thinkingSetLevel: () => "thinking:set-level",
    // Project commands
    projectAdd: () => "project:add",
    projectRemove: (projectPath) => `${COMMAND_ID_PREFIXES.PROJECT_REMOVE}${projectPath}`,
    // Appearance commands
    themeToggle: () => "appearance:theme:toggle",
    themeSet: (theme) => `appearance:theme:set:${theme}`,
    // Layout commands
    layoutApplySlot: (slot) => `layout:apply-slot:${slot}`,
    layoutCaptureSlot: (slot) => `layout:capture-slot:${slot}`,
    // Settings commands
    settingsOpen: () => "settings:open",
    settingsOpenSection: (section) => `settings:open:${section}`,
    // Help commands
    helpKeybinds: () => "help:keybinds",
};
/**
 * Command ID matchers - test if an ID matches a pattern
 */
export const CommandIdMatchers = {
    /**
     * Check if ID is a workspace switching command (ws:switch:*)
     */
    isWorkspaceSwitch: (id) => id.startsWith(COMMAND_ID_PREFIXES.WS_SWITCH),
    /**
     * Check if ID is a chat truncate command (chat:truncate:*)
     */
    isChatTruncate: (id) => id.startsWith(COMMAND_ID_PREFIXES.CHAT_TRUNCATE),
    /**
     * Check if ID is a project remove command (project:remove:*)
     */
    isProjectRemove: (id) => id.startsWith(COMMAND_ID_PREFIXES.PROJECT_REMOVE),
};
//# sourceMappingURL=commandIds.js.map