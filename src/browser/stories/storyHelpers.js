/**
 * Shared story setup helpers to reduce boilerplate.
 *
 * These helpers encapsulate common patterns used across multiple stories,
 * making each story file more focused on the specific visual state being tested.
 */
import { SELECTED_WORKSPACE_KEY, EXPANDED_PROJECTS_KEY, RIGHT_SIDEBAR_COLLAPSED_KEY, getInputKey, getModelKey, getReviewsKey, getHunkFirstSeenKey, REVIEW_SORT_ORDER_KEY, WORKSPACE_DRAFTS_BY_PROJECT_KEY, getDraftScopeId, getWorkspaceNameStateKey, } from "@/common/constants/storage";
import { updatePersistedState } from "@/browser/hooks/usePersistedState";
import { DEFAULT_MODEL } from "@/common/constants/knownModels";
import { createWorkspace, groupWorkspacesByProject, createStaticChatHandler, createStreamingChatHandler, createGitStatusOutput, } from "./mockFactory";
import { createMockORPCClient } from "@/browser/stories/mocks/orpc";
// ═══════════════════════════════════════════════════════════════════════════════
// WORKSPACE SELECTION
// ═══════════════════════════════════════════════════════════════════════════════
/** Set localStorage to select a workspace */
export function selectWorkspace(workspace) {
    localStorage.setItem(SELECTED_WORKSPACE_KEY, JSON.stringify({
        workspaceId: workspace.id,
        projectPath: workspace.projectPath,
        projectName: workspace.projectName,
        namedWorkspacePath: workspace.namedWorkspacePath,
    }));
}
/** Clear workspace selection from localStorage (for sidebar-focused stories) */
export function clearWorkspaceSelection() {
    localStorage.removeItem(SELECTED_WORKSPACE_KEY);
}
/** Set input text for a workspace */
export function setWorkspaceInput(workspaceId, text) {
    localStorage.setItem(getInputKey(workspaceId), JSON.stringify(text));
}
/** Set model for a workspace */
export function setWorkspaceModel(workspaceId, model) {
    localStorage.setItem(getModelKey(workspaceId), model);
}
/** Expand projects in the sidebar */
export function expandProjects(projectPaths) {
    localStorage.setItem(EXPANDED_PROJECTS_KEY, JSON.stringify(projectPaths));
}
/** Collapse the right sidebar (default for most stories) */
export function collapseRightSidebar() {
    localStorage.setItem(RIGHT_SIDEBAR_COLLAPSED_KEY, JSON.stringify(true));
}
/** Expand the right sidebar (for stories testing it) */
export function expandRightSidebar() {
    localStorage.setItem(RIGHT_SIDEBAR_COLLAPSED_KEY, JSON.stringify(false));
}
/** Set reviews for a workspace */
export function setReviews(workspaceId, reviews) {
    const state = {
        workspaceId,
        reviews: Object.fromEntries(reviews.map((r) => [r.id, r])),
        lastUpdated: Date.now(),
    };
    updatePersistedState(getReviewsKey(workspaceId), state);
}
/** Set hunk first-seen timestamps for a workspace (for storybook) */
export function setHunkFirstSeen(workspaceId, firstSeen) {
    const state = { firstSeen };
    updatePersistedState(getHunkFirstSeenKey(workspaceId), state);
}
/** Set the review panel sort order (global) */
export function setReviewSortOrder(order) {
    localStorage.setItem(REVIEW_SORT_ORDER_KEY, JSON.stringify(order));
}
/**
 * Set workspace drafts for a project in localStorage.
 * This seeds the sidebar with UI-only draft placeholders.
 */
export function setWorkspaceDrafts(projectPath, drafts) {
    // Set the drafts index
    const draftsByProject = JSON.parse(localStorage.getItem(WORKSPACE_DRAFTS_BY_PROJECT_KEY) ?? "{}");
    draftsByProject[projectPath] = drafts.map((d) => ({
        draftId: d.draftId,
        sectionId: d.sectionId,
        createdAt: d.createdAt ?? Date.now(),
    }));
    localStorage.setItem(WORKSPACE_DRAFTS_BY_PROJECT_KEY, JSON.stringify(draftsByProject));
    // Set individual draft data (prompt and name)
    for (const draft of drafts) {
        const scopeId = getDraftScopeId(projectPath, draft.draftId);
        // Set prompt if provided
        if (draft.prompt !== undefined) {
            localStorage.setItem(getInputKey(scopeId), JSON.stringify(draft.prompt));
        }
        // Set workspace name state if provided
        if (draft.workspaceName !== undefined) {
            const nameState = {
                autoGenerate: false,
                manualName: draft.workspaceName,
            };
            localStorage.setItem(getWorkspaceNameStateKey(scopeId), JSON.stringify(nameState));
        }
    }
}
export function createReview(id, filePath, lineRange, note, status = "pending", createdAt) {
    return {
        id,
        data: {
            filePath,
            lineRange,
            selectedCode: "// sample code",
            userNote: note,
        },
        status,
        createdAt: createdAt ?? Date.now(),
        statusChangedAt: status === "checked" ? Date.now() : undefined,
    };
}
// Default mock file tree for explorer stories
// Mock ls output - order doesn't matter, parseLsOutput sorts the result
const DEFAULT_LS_OUTPUT = `total 40
drwxr-xr-x  5 user group  160 Jan 15 10:00 .
drwxr-xr-x  3 user group   96 Jan 15 10:00 ..
drwxr-xr-x 10 user group  320 Jan 15 10:00 node_modules
drwxr-xr-x  3 user group   96 Jan 15 10:00 src
drwxr-xr-x  2 user group   64 Jan 15 10:00 tests
-rw-r--r--  1 user group  128 Jan 15 10:00 README.md
-rw-r--r--  1 user group 1024 Jan 15 10:00 package.json
-rw-r--r--  1 user group  256 Jan 15 10:00 tsconfig.json`;
const DEFAULT_SRC_LS_OUTPUT = `total 24
drwxr-xr-x  3 user group   96 Jan 15 10:00 .
drwxr-xr-x  5 user group  160 Jan 15 10:00 ..
drwxr-xr-x  2 user group   64 Jan 15 10:00 components
-rw-r--r--  1 user group  256 Jan 15 10:00 App.tsx
-rw-r--r--  1 user group  512 Jan 15 10:00 index.ts`;
/**
 * Creates an executeBash function that returns git status and diff output for workspaces.
 * Handles: git status, git diff, git diff --numstat, git show (for read-more),
 * git ls-files --others (for untracked files), ls -la (for file explorer), git check-ignore
 */
export function createGitStatusExecutor(gitStatus, gitDiff) {
    return (workspaceId, script) => {
        // Handle ls -la for file explorer
        if (script.startsWith("ls -la")) {
            // Check if it's the root or a subdirectory
            const isRoot = script === "ls -la ." || script === "ls -la";
            const output = isRoot ? DEFAULT_LS_OUTPUT : DEFAULT_SRC_LS_OUTPUT;
            return Promise.resolve({ success: true, output, exitCode: 0, wall_duration_ms: 50 });
        }
        // Handle git check-ignore for empty ignored directories
        if (script.includes("git check-ignore")) {
            // Return node_modules as ignored if it's in the input
            const output = script.includes("node_modules") ? "node_modules" : "";
            return Promise.resolve({ success: true, output, exitCode: 0, wall_duration_ms: 50 });
        }
        if (script.includes("git status")) {
            const status = gitStatus?.get(workspaceId) ?? {};
            // For git status --ignored --porcelain, add !! node_modules to mark it as ignored
            let output = createGitStatusOutput(status);
            if (script.includes("--ignored")) {
                output = output ? `${output}\n!! node_modules/` : "!! node_modules/";
            }
            return Promise.resolve({ success: true, output, exitCode: 0, wall_duration_ms: 50 });
        }
        // Handle git ls-files --others (untracked files)
        if (script.includes("git ls-files --others")) {
            const diff = gitDiff?.get(workspaceId);
            const output = diff?.untrackedFiles?.join("\n") ?? "";
            return Promise.resolve({ success: true, output, exitCode: 0, wall_duration_ms: 50 });
        }
        // Handle git diff --numstat
        if (script.includes("git diff") && script.includes("--numstat")) {
            const diff = gitDiff?.get(workspaceId);
            const output = diff?.numstatOutput ?? "";
            return Promise.resolve({ success: true, output, exitCode: 0, wall_duration_ms: 50 });
        }
        // Handle git diff (regular diff output)
        if (script.includes("git diff")) {
            const diff = gitDiff?.get(workspaceId);
            const output = diff?.diffOutput ?? "";
            return Promise.resolve({ success: true, output, exitCode: 0, wall_duration_ms: 50 });
        }
        // Handle git show for read-more feature (e.g., git show "HEAD:file.ts" | sed -n '1,20p')
        const gitShowMatch = /git show "[^:]+:([^"]+)"/.exec(script);
        const sedMatch = /sed -n '(\d+),(\d+)p'/.exec(script);
        if (gitShowMatch && sedMatch) {
            const filePath = gitShowMatch[1];
            const startLine = parseInt(sedMatch[1], 10);
            const endLine = parseInt(sedMatch[2], 10);
            const diff = gitDiff?.get(workspaceId);
            const lines = diff?.fileContents?.get(filePath);
            if (lines) {
                // sed uses 1-based indexing
                const output = lines.slice(startLine - 1, endLine).join("\n");
                return Promise.resolve({
                    success: true,
                    output,
                    exitCode: 0,
                    wall_duration_ms: 50,
                });
            }
        }
        return Promise.resolve({
            success: true,
            output: "",
            exitCode: 0,
            wall_duration_ms: 0,
        });
    };
}
/** Adapts callback-based chat handlers to ORPC onChat format */
export function createOnChatAdapter(chatHandlers) {
    return (workspaceId, emit) => {
        const handler = chatHandlers.get(workspaceId);
        if (handler) {
            return handler(emit);
        }
        // Default: emit caught-up immediately
        queueMicrotask(() => emit({ type: "caught-up" }));
        return undefined;
    };
}
/**
 * Setup a simple chat story with one workspace and messages.
 * Returns an APIClient configured with the mock data.
 */
export function setupSimpleChatStory(opts) {
    const workspaceId = opts.workspaceId ?? "ws-chat";
    const projectName = opts.projectName ?? "my-app";
    const projectPath = opts.projectPath ?? `/home/user/projects/${projectName}`;
    const workspaces = [
        createWorkspace({
            id: workspaceId,
            name: opts.workspaceName ?? "feature",
            projectName,
            projectPath,
        }),
    ];
    const chatHandlers = new Map([[workspaceId, createStaticChatHandler(opts.messages)]]);
    const gitStatus = opts.gitStatus
        ? new Map([[workspaceId, opts.gitStatus]])
        : undefined;
    const gitDiff = opts.gitDiff
        ? new Map([[workspaceId, opts.gitDiff]])
        : undefined;
    // Set localStorage for workspace selection and collapse right sidebar by default
    selectWorkspace(workspaces[0]);
    collapseRightSidebar();
    // Set up background processes map
    const bgProcesses = opts.backgroundProcesses
        ? new Map([[workspaceId, opts.backgroundProcesses]])
        : undefined;
    // Set up session usage map
    const sessionUsageMap = opts.sessionUsage
        ? new Map([[workspaceId, opts.sessionUsage]])
        : undefined;
    // Set up idle compaction hours map
    const idleCompactionHours = opts.idleCompactionHours !== undefined
        ? new Map([[projectPath, opts.idleCompactionHours]])
        : undefined;
    // Create onChat handler that combines static messages with custom handler
    const baseOnChat = createOnChatAdapter(chatHandlers);
    const onChat = opts.onChat
        ? (wsId, emit) => {
            const cleanup = baseOnChat(wsId, emit);
            opts.onChat(wsId, emit);
            return cleanup;
        }
        : baseOnChat;
    // Compose executeBash: use custom if provided, otherwise fall back to git status executor
    const gitStatusExecutor = createGitStatusExecutor(gitStatus, gitDiff);
    const executeBash = opts.executeBash
        ? async (wsId, script) => {
            // Try custom handler first, fall back to git status executor
            const customResult = await opts.executeBash(wsId, script);
            if (customResult.output || customResult.exitCode !== 0) {
                return customResult;
            }
            // Fall back to git status executor for git commands
            return gitStatusExecutor(wsId, script);
        }
        : gitStatusExecutor;
    // Return ORPC client
    return createMockORPCClient({
        projects: groupWorkspacesByProject(workspaces),
        workspaces,
        onChat,
        executeBash,
        providersConfig: opts.providersConfig,
        backgroundProcesses: bgProcesses,
        statsTabVariant: opts.statsTabEnabled ? "stats" : "control",
        sessionUsage: sessionUsageMap,
        subagentTranscripts: opts.subagentTranscripts,
        idleCompactionHours,
        signingCapabilities: opts.signingCapabilities,
        agentSkills: opts.agentSkills,
        invalidAgentSkills: opts.invalidAgentSkills,
        logEntries: opts.logEntries,
        clearLogsResult: opts.clearLogsResult,
    });
}
/**
 * Setup a streaming chat story with active streaming state.
 * Returns an APIClient configured with the mock data.
 */
export function setupStreamingChatStory(opts) {
    const workspaceId = opts.workspaceId ?? "ws-streaming";
    const workspaces = [
        createWorkspace({
            id: workspaceId,
            name: opts.workspaceName ?? "feature",
            projectName: opts.projectName ?? "my-app",
        }),
    ];
    const chatHandlers = new Map([
        [
            workspaceId,
            createStreamingChatHandler({
                messages: opts.messages,
                streamingMessageId: opts.streamingMessageId,
                model: opts.model ?? DEFAULT_MODEL,
                historySequence: opts.historySequence,
                streamText: opts.streamText,
                pendingTool: opts.pendingTool,
            }),
        ],
    ]);
    const gitStatus = opts.gitStatus
        ? new Map([[workspaceId, opts.gitStatus]])
        : undefined;
    // Set localStorage for workspace selection and collapse right sidebar by default
    selectWorkspace(workspaces[0]);
    collapseRightSidebar();
    const workspaceStatsSnapshots = new Map();
    if (opts.statsTabEnabled) {
        workspaceStatsSnapshots.set(workspaceId, {
            workspaceId,
            generatedAt: Date.now(),
            active: {
                messageId: opts.streamingMessageId,
                model: "openai:gpt-4o",
                elapsedMs: 2000,
                ttftMs: 200,
                toolExecutionMs: 0,
                modelTimeMs: 2000,
                streamingMs: 1800,
                outputTokens: 100,
                reasoningTokens: 0,
                liveTokenCount: 100,
                liveTPS: 50,
                invalid: false,
                anomalies: [],
            },
            session: {
                totalDurationMs: 0,
                totalToolExecutionMs: 0,
                totalStreamingMs: 0,
                totalTtftMs: 0,
                ttftCount: 0,
                responseCount: 0,
                totalOutputTokens: 0,
                totalReasoningTokens: 0,
                byModel: {},
            },
        });
    }
    // Return ORPC client
    return createMockORPCClient({
        projects: groupWorkspacesByProject(workspaces),
        workspaces,
        onChat: createOnChatAdapter(chatHandlers),
        executeBash: createGitStatusExecutor(gitStatus),
        workspaceStatsSnapshots,
        statsTabVariant: opts.statsTabEnabled ? "stats" : "control",
    });
}
/**
 * Setup a chat story with a custom chat handler for special scenarios
 * (e.g., stream errors, custom message sequences).
 * Returns an APIClient configured with the mock data.
 */
export function setupCustomChatStory(opts) {
    const workspaceId = opts.workspaceId ?? "ws-custom";
    const workspaces = [
        createWorkspace({
            id: workspaceId,
            name: opts.workspaceName ?? "feature",
            projectName: opts.projectName ?? "my-app",
        }),
    ];
    const chatHandlers = new Map([[workspaceId, opts.chatHandler]]);
    // Set localStorage for workspace selection and collapse right sidebar by default
    selectWorkspace(workspaces[0]);
    collapseRightSidebar();
    // Return ORPC client
    return createMockORPCClient({
        projects: groupWorkspacesByProject(workspaces),
        workspaces,
        onChat: createOnChatAdapter(chatHandlers),
        providersConfig: opts.providersConfig,
    });
}
//# sourceMappingURL=storyHelpers.js.map