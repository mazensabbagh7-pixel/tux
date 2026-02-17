import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useEffect, useRef } from "react";
import { ToolContainer, ToolHeader, ExpandIcon, ToolName, StatusIndicator, ToolDetails, } from "./shared/ToolPrimitives";
import { useToolExpansion, getStatusDisplay } from "./shared/toolUtils";
import { MarkdownRenderer } from "../Messages/MarkdownRenderer";
import { Button } from "../ui/button";
import { Tooltip, TooltipTrigger, TooltipContent } from "../ui/tooltip";
import { IconActionButton } from "../Messages/MessageWindow";
import { formatKeybind, KEYBINDS } from "@/browser/utils/ui/keybinds";
import { useStartHere } from "@/browser/hooks/useStartHere";
import { createMuxMessage } from "@/common/types/message";
import { useCopyToClipboard } from "@/browser/hooks/useCopyToClipboard";
import { cn } from "@/common/lib/utils";
import { useAPI } from "@/browser/contexts/API";
import { useAgent } from "@/browser/contexts/AgentContext";
import { useOpenInEditor } from "@/browser/hooks/useOpenInEditor";
import { useOptionalWorkspaceContext } from "@/browser/contexts/WorkspaceContext";
import { usePopoverError } from "@/browser/hooks/usePopoverError";
import { PopoverError } from "../PopoverError";
import { AGENT_AI_DEFAULTS_KEY, getAgentIdKey, getModelKey, getPlanContentKey, getThinkingLevelKey, getWorkspaceAISettingsByAgentKey, } from "@/common/constants/storage";
import { getDefaultModel } from "@/browser/hooks/useModelsFromSettings";
import { readPersistedState, updatePersistedState } from "@/browser/hooks/usePersistedState";
import { getSendOptionsFromStorage } from "@/browser/utils/messages/sendOptions";
import { setWorkspaceModelWithOrigin } from "@/browser/utils/modelChange";
import { resolveWorkspaceAiSettingsForAgent, } from "@/browser/utils/workspaceModeAi";
import { Clipboard, ClipboardCheck, ClipboardList, FileText, ListStart, Pencil, Play, Workflow, X, } from "lucide-react";
import { ShareMessagePopover } from "../ShareMessagePopover";
/**
 * Check if the result is a successful file-based propose_plan result.
 * Note: planContent may be absent in newer results (context optimization).
 */
function isProposePlanResult(result) {
    return (result !== null &&
        typeof result === "object" &&
        "success" in result &&
        result.success === true &&
        "planPath" in result);
}
/**
 * Check if the result is an error from propose_plan tool
 */
function isProposePlanError(result) {
    return (result !== null &&
        typeof result === "object" &&
        "success" in result &&
        result.success === false &&
        "error" in result);
}
/**
 * Check if the result is from the legacy propose_plan tool (title + plan params)
 */
function isLegacyProposePlanResult(result) {
    return (result !== null &&
        typeof result === "object" &&
        "success" in result &&
        result.success === true &&
        "title" in result &&
        "plan" in result);
}
/**
 * Check if args are from the legacy propose_plan tool
 */
function isLegacyProposePlanArgs(args) {
    return args !== null && typeof args === "object" && "title" in args && "plan" in args;
}
export const ProposePlanToolCall = (props) => {
    const { args, result, status = "pending", workspaceId, isLatest, isEphemeralPreview, onClose, content: directContent, path: directPath, className, } = props;
    const { expanded, toggleExpanded } = useToolExpansion(true); // Expand by default
    const [showRaw, setShowRaw] = useState(false);
    const [isStartingOrchestrator, setIsStartingOrchestrator] = useState(false);
    const [isImplementing, setIsImplementing] = useState(false);
    const [implementReplacesChatHistory, setImplementReplacesChatHistory] = useState(false);
    // On small screens, render the primary plan actions (Implement / Start Orchestrator)
    // as shortcut icons alongside the other action buttons to avoid right-side overflow.
    const [isNarrowScreen, setIsNarrowScreen] = useState(() => {
        if (typeof window === "undefined")
            return false;
        return window.innerWidth <= 768;
    });
    const isStartingOrchestratorRef = useRef(false);
    const isImplementingRef = useRef(false);
    const isMountedRef = useRef(true);
    const { api } = useAPI();
    const { agents } = useAgent();
    const openInEditor = useOpenInEditor();
    const workspaceContext = useOptionalWorkspaceContext();
    const editorError = usePopoverError();
    const editButtonRef = useRef(null);
    // Get runtimeConfig and name for the workspace (needed for SSH-aware editor opening and share filename)
    const workspaceMetadata = workspaceId
        ? workspaceContext?.workspaceMetadata.get(workspaceId)
        : undefined;
    const runtimeConfig = workspaceMetadata?.runtimeConfig;
    const workspaceName = workspaceMetadata?.name;
    // Fresh content from disk for the latest plan (external edit detection)
    // Only use cache for completed tools (page reload case) - not for in-flight tools
    // which may have stale cache from a previous propose_plan call
    const cacheKey = workspaceId ? getPlanContentKey(workspaceId) : "";
    const shouldUseCache = workspaceId && isLatest && !isEphemeralPreview && status === "completed";
    const cached = shouldUseCache
        ? readPersistedState(cacheKey, null)
        : null;
    const [freshContent, setFreshContent] = useState(cached?.content ?? null);
    const [freshPath, setFreshPath] = useState(cached?.path ?? null);
    useEffect(() => {
        return () => {
            isMountedRef.current = false;
        };
    }, []);
    useEffect(() => {
        if (typeof window === "undefined")
            return;
        const handleResize = () => {
            setIsNarrowScreen(window.innerWidth <= 768);
        };
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);
    useEffect(() => {
        if (!api)
            return;
        if (isEphemeralPreview)
            return;
        if (!isLatest)
            return;
        if (status !== "completed")
            return;
        let cancelled = false;
        void api.config
            .getConfig()
            .then((cfg) => {
            if (cancelled)
                return;
            setImplementReplacesChatHistory(cfg.taskSettings.proposePlanImplementReplacesChatHistory ?? false);
        })
            .catch(() => {
            // Ignore failures (we'll default to old behavior).
        });
        return () => {
            cancelled = true;
        };
    }, [api, isEphemeralPreview, isLatest, status]);
    // Fetch fresh plan content for the latest plan
    // Re-fetches on mount, when window regains focus, and when tool completes
    useEffect(() => {
        if (isEphemeralPreview || !isLatest || !workspaceId || !api)
            return;
        const fetchPlan = async () => {
            try {
                const res = await api.workspace.getPlanContent({ workspaceId });
                if (res.success) {
                    setFreshContent(res.data.content);
                    setFreshPath(res.data.path);
                    // Update cache for page reload (only useful when tool is completed)
                    updatePersistedState(cacheKey, { content: res.data.content, path: res.data.path });
                }
            }
            catch {
                // Fetch failed, keep existing content
            }
        };
        // Fetch immediately on mount
        void fetchPlan();
        // Re-fetch when window regains focus (user returns from external editor)
        const handleFocus = () => void fetchPlan();
        window.addEventListener("focus", handleFocus);
        return () => window.removeEventListener("focus", handleFocus);
        // status in deps ensures refetch when tool completes (captures final file state)
    }, [api, workspaceId, isLatest, isEphemeralPreview, cacheKey, status]);
    // Determine plan content and title based on result type
    // For ephemeral previews, use direct content/path props
    // For the latest plan, prefer fresh content from disk (external edit support)
    let planContent;
    let planTitle;
    let planPath;
    let errorMessage;
    if (isEphemeralPreview && directContent !== undefined) {
        // Ephemeral preview mode: use direct props
        planContent = directContent;
        planPath = directPath;
        const titleMatch = /^#\s+(.+)$/m.exec(directContent);
        planTitle = titleMatch ? titleMatch[1] : "Plan";
    }
    else if (isLatest && freshContent !== null) {
        planContent = freshContent;
        planPath = freshPath ?? undefined;
        // Extract title from first markdown heading or use filename
        const titleMatch = /^#\s+(.+)$/m.exec(freshContent);
        planTitle = titleMatch ? titleMatch[1] : (planPath?.split("/").pop() ?? "Plan");
    }
    else if (isProposePlanResult(result)) {
        // New format: planContent may be absent (context optimization)
        // For backwards compatibility, check if planContent exists in old chat history
        const resultWithContent = result;
        planPath = result.planPath;
        if (resultWithContent.planContent) {
            // Old result with embedded content (backwards compatibility)
            planContent = resultWithContent.planContent;
            const titleMatch = /^#\s+(.+)$/m.exec(resultWithContent.planContent);
            planTitle = titleMatch ? titleMatch[1] : (planPath.split("/").pop() ?? "Plan");
        }
        else {
            // New result without content - show path info, content is fetched for latest
            planContent = `*Plan saved to ${planPath}*`;
            planTitle = planPath.split("/").pop() ?? "Plan";
        }
    }
    else if (isLegacyProposePlanResult(result)) {
        // Legacy format: title + plan passed directly (no file)
        planContent = result.plan;
        planTitle = result.title;
    }
    else if (isProposePlanError(result)) {
        // Error from backend (e.g., plan file missing or empty)
        planContent = "";
        planTitle = "Plan Error";
        errorMessage = result.error;
    }
    else if (isLegacyProposePlanArgs(args)) {
        // Fallback to args for legacy format (streaming state before result)
        planContent = args.plan;
        planTitle = args.title;
    }
    else {
        // No valid plan data available (e.g., pending state)
        planContent = "";
        planTitle = "Plan";
    }
    // Format: Title as H1 + plan content for "Start Here" functionality.
    // Note: we intentionally preserve the plan file on disk when starting here so it can be
    // referenced later (e.g., via post-compaction attachments).
    const planContentTrimmed = planContent.trim();
    const hasPlanContentInChat = planContentTrimmed.length > 0 && !planContentTrimmed.startsWith("*Plan saved to ");
    // When using "Start Here" (replace chat history), the plan is already included in the
    // conversation *only* when the Propose Plan tool result includes full plan text.
    // Keeping this note short avoids token bloat while discouraging redundant plan-file
    // reads in Exec.
    const startHereNote = hasPlanContentInChat
        ? "\n\nNote: This chat already contains the full plan; no need to re-open the plan file."
        : planContentTrimmed.startsWith("*Plan saved to ")
            ? "\n\nNote: This chat only includes a placeholder. Read the plan file below for the full plan."
            : "";
    const planPathNote = planPath ? `\n\n---\n\n*Plan file preserved at:* \`${planPath}\`` : "";
    const startHereContent = `# ${planTitle}\n\n${planContent}${startHereNote}${planPathNote}`;
    const { openModal, buttonLabel, disabled: startHereDisabled, modal, } = useStartHere(workspaceId, startHereContent, false, {
        // Preserve the source agent so exec can detect a plan→exec transition
        // even after replacing chat history.
        sourceAgentId: "plan",
    });
    const replaceChatHistoryWithPlan = async (args) => {
        if (!workspaceId || !api)
            return;
        try {
            const summaryMessage = createMuxMessage(`${args.idPrefix}-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`, "assistant", startHereContent, {
                timestamp: Date.now(),
                compacted: "user",
                // Preserve the source agent so plan-origin compactions can be detected.
                agentId: "plan",
            });
            const result = await api.workspace.replaceChatHistory({
                workspaceId,
                summaryMessage,
                mode: "append-compaction-boundary",
                deletePlanFile: false,
            });
            if (!result.success) {
                console.error(args.errorContext, result.error);
            }
        }
        catch (err) {
            console.error(args.errorContext, err);
        }
    };
    // User request: propose_plan primary actions send immediately after agent switch.
    // Resolve and persist model/thinking synchronously here so the follow-up message
    // uses the target agent defaults instead of stale planning-mode preferences.
    const resolveAndPersistTargetAgentSettings = (args) => {
        const modelKey = getModelKey(args.workspaceId);
        const thinkingKey = getThinkingLevelKey(args.workspaceId);
        const fallbackModel = getDefaultModel();
        const existingModel = readPersistedState(modelKey, fallbackModel);
        const existingThinking = readPersistedState(thinkingKey, "off");
        const agentAiDefaults = readPersistedState(AGENT_AI_DEFAULTS_KEY, {});
        const workspaceByAgent = readPersistedState(getWorkspaceAISettingsByAgentKey(args.workspaceId), {});
        const { resolvedModel, resolvedThinking } = resolveWorkspaceAiSettingsForAgent({
            agentId: args.targetAgentId,
            agents,
            agentAiDefaults,
            workspaceByAgent,
            fallbackModel,
            existingModel,
            existingThinking,
        });
        updatePersistedState(getAgentIdKey(args.workspaceId), args.targetAgentId);
        if (existingModel !== resolvedModel) {
            setWorkspaceModelWithOrigin(args.workspaceId, resolvedModel, "agent");
        }
        if (existingThinking !== resolvedThinking) {
            updatePersistedState(thinkingKey, resolvedThinking);
        }
        return { resolvedModel, resolvedThinking };
    };
    const handleStartOrchestrator = async () => {
        if (!workspaceId || !api)
            return;
        if (isStartingOrchestratorRef.current)
            return;
        isStartingOrchestratorRef.current = true;
        if (isMountedRef.current) {
            setIsStartingOrchestrator(true);
        }
        try {
            let shouldReplaceChatHistory = false;
            try {
                const cfg = await api.config.getConfig();
                shouldReplaceChatHistory =
                    cfg.taskSettings.proposePlanImplementReplacesChatHistory ?? false;
            }
            catch {
                // Ignore config read errors (we'll default to old behavior).
            }
            if (shouldReplaceChatHistory) {
                await replaceChatHistoryWithPlan({
                    idPrefix: "start-orchestrator",
                    errorContext: "Failed to replace chat history before starting orchestrator:",
                });
            }
            const targetAgentId = "orchestrator";
            const { resolvedModel, resolvedThinking } = resolveAndPersistTargetAgentSettings({
                workspaceId,
                targetAgentId,
            });
            const sendMessageOptions = getSendOptionsFromStorage(workspaceId);
            await api.workspace.sendMessage({
                workspaceId,
                message: "Start orchestrating the implementation of this plan.",
                options: {
                    ...sendMessageOptions,
                    agentId: targetAgentId,
                    model: resolvedModel,
                    thinkingLevel: resolvedThinking,
                },
            });
        }
        catch (err) {
            console.error("Failed to start orchestrator:", err);
        }
        finally {
            isStartingOrchestratorRef.current = false;
            if (isMountedRef.current) {
                setIsStartingOrchestrator(false);
            }
        }
    };
    const handleImplement = async () => {
        if (!workspaceId || !api)
            return;
        if (isImplementingRef.current)
            return;
        isImplementingRef.current = true;
        if (isMountedRef.current) {
            setIsImplementing(true);
        }
        try {
            let shouldReplaceChatHistory = false;
            try {
                const cfg = await api.config.getConfig();
                shouldReplaceChatHistory =
                    cfg.taskSettings.proposePlanImplementReplacesChatHistory ?? false;
            }
            catch {
                // Ignore config read errors (we'll default to old behavior).
            }
            if (shouldReplaceChatHistory) {
                await replaceChatHistoryWithPlan({
                    idPrefix: "start-here",
                    errorContext: "Failed to replace chat history before implementing:",
                });
            }
            const targetAgentId = "exec";
            const { resolvedModel, resolvedThinking } = resolveAndPersistTargetAgentSettings({
                workspaceId,
                targetAgentId,
            });
            const sendMessageOptions = getSendOptionsFromStorage(workspaceId);
            await api.workspace.sendMessage({
                workspaceId,
                message: "Implement the plan",
                options: {
                    ...sendMessageOptions,
                    agentId: targetAgentId,
                    model: resolvedModel,
                    thinkingLevel: resolvedThinking,
                },
            });
        }
        catch {
            // Best-effort: user can retry manually if sending fails.
        }
        finally {
            isImplementingRef.current = false;
            if (isMountedRef.current) {
                setIsImplementing(false);
            }
        }
    };
    // Copy to clipboard with feedback
    const { copied, copyToClipboard } = useCopyToClipboard();
    const handleOpenInEditor = async () => {
        if (!planPath || !workspaceId)
            return;
        // Capture positioning from the ref for error popover placement
        const anchorPosition = editButtonRef.current
            ? (() => {
                const { bottom, left } = editButtonRef.current.getBoundingClientRect();
                return { top: bottom + 8, left };
            })()
            : { top: 100, left: 100 };
        try {
            const result = await openInEditor(workspaceId, planPath, runtimeConfig, { isFile: true });
            if (!result.success && result.error) {
                editorError.showError("plan-editor", result.error, anchorPosition);
            }
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            editorError.showError("plan-editor", message, anchorPosition);
        }
    };
    const statusDisplay = getStatusDisplay(status);
    // Build action buttons array (similar to AssistantMessage)
    const copyButton = {
        label: copied ? "Copied" : "Copy",
        onClick: () => void copyToClipboard(planContent),
        icon: copied ? _jsx(ClipboardCheck, {}) : _jsx(Clipboard, {}),
    };
    const actionButtons = [
        copyButton,
        {
            label: "Share",
            component: (_jsx(ShareMessagePopover, { content: planContent, disabled: !planContent, workspaceName: workspaceName })),
        },
    ];
    // Edit button config (rendered separately with ref for error positioning)
    const showEditButton = (isEphemeralPreview ?? isLatest) && planPath && workspaceId;
    const editButton = showEditButton
        ? {
            label: "Edit",
            onClick: () => void handleOpenInEditor(),
            icon: _jsx(Pencil, {}),
            tooltip: "Open plan in external editor",
        }
        : null;
    const shouldShowPrimaryActions = Boolean(status === "completed" && !errorMessage && isLatest && !isEphemeralPreview && workspaceId);
    const implementButton = shouldShowPrimaryActions
        ? {
            label: "Implement",
            onClick: () => void handleImplement(),
            disabled: !api || isImplementing || isStartingOrchestrator,
            icon: _jsx(Play, { className: "size-4" }),
            tooltip: implementReplacesChatHistory
                ? "Replace chat history with this plan, switch to Exec, and start implementing"
                : "Switch to Exec and start implementing",
        }
        : null;
    const orchestratorButton = shouldShowPrimaryActions
        ? {
            label: "Start Orchestrator",
            onClick: () => void handleStartOrchestrator(),
            disabled: !api || isStartingOrchestrator || isImplementing,
            icon: _jsx(Workflow, { className: "size-4" }),
            tooltip: implementReplacesChatHistory
                ? "Replace chat history with this plan, switch to Orchestrator, and start delegating"
                : "Switch to Orchestrator and start delegating",
        }
        : null;
    // Start Here button: only for tool calls, not ephemeral previews
    if (!isEphemeralPreview && workspaceId) {
        actionButtons.push({
            label: buttonLabel,
            onClick: openModal,
            disabled: startHereDisabled,
            icon: _jsx(ListStart, {}),
            tooltip: "Replace all chat history with this plan",
        });
    }
    // Show raw toggle
    actionButtons.push({
        label: showRaw ? "Show Markdown" : "Show Text",
        onClick: () => setShowRaw(!showRaw),
        active: showRaw,
        icon: _jsx(FileText, {}),
    });
    // Close button: only for ephemeral previews
    if (isEphemeralPreview && onClose) {
        actionButtons.push({
            label: "Close",
            onClick: onClose,
            icon: _jsx(X, {}),
            tooltip: "Close preview",
        });
    }
    // Shared plan UI content (used in both tool call and ephemeral preview modes)
    const planUI = (_jsxs("div", { className: "plan-surface rounded-md p-3 shadow-md", children: [_jsxs("div", { className: "plan-divider mb-3 flex items-center gap-2 border-b pb-2", children: [_jsx(ClipboardList, { "aria-hidden": "true", className: "h-4 w-4" }), _jsx("div", { className: "text-plan-mode font-mono text-[13px] font-semibold", children: planTitle }), isEphemeralPreview && (_jsx("div", { className: "text-muted font-mono text-[10px] italic", children: "preview only" }))] }), errorMessage ? (_jsx("div", { className: "text-error rounded-sm p-2 font-mono text-xs", children: errorMessage })) : showRaw ? (_jsxs("div", { className: "relative", children: [_jsx("pre", { className: "text-text bg-code-bg m-0 rounded-sm p-2 pb-8 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap", children: planContent }), _jsx("div", { className: "absolute right-2 bottom-2", children: _jsxs(Button, { type: "button", variant: "outline", size: "sm", className: "h-6 px-2 text-[11px] [&_svg]:size-3.5", onClick: () => void copyToClipboard(planContent), children: [copied ? _jsx(ClipboardCheck, {}) : _jsx(Clipboard, {}), copied ? "Copied" : "Copy to clipboard"] }) })] })) : (_jsx("div", { className: "plan-content", children: _jsx(MarkdownRenderer, { content: planContent }) })), !isEphemeralPreview && status === "completed" && !errorMessage && (_jsxs("div", { className: "plan-divider text-muted mt-3 border-t pt-3 text-[11px] leading-normal italic", children: ["Respond with revisions or switch to the Exec agent (", _jsx("span", { className: "font-primary not-italic", children: formatKeybind(KEYBINDS.CYCLE_AGENT) }), " to cycle) and ask to implement."] })), _jsxs("div", { className: "mt-3 flex items-center gap-0.5", children: [_jsxs("div", { className: "flex min-w-0 flex-1 items-center gap-0.5", children: [actionButtons.map((button, index) => (_jsx(IconActionButton, { button: button }, index))), isNarrowScreen && (implementButton ?? orchestratorButton) && (_jsxs(_Fragment, { children: [implementButton && _jsx(IconActionButton, { button: implementButton }), orchestratorButton && _jsx(IconActionButton, { button: orchestratorButton })] })), editButton && (_jsx("div", { ref: editButtonRef, children: _jsx(IconActionButton, { button: editButton }) }))] }), !isNarrowScreen && (implementButton ?? orchestratorButton) && (_jsxs("div", { className: "ml-auto flex items-center gap-1", children: [implementButton && (_jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsxs(Button, { type: "button", variant: "outline", size: "sm", className: "h-7 gap-1", onClick: implementButton.onClick, disabled: implementButton.disabled, children: [implementButton.icon, _jsx("span", { className: "leading-none", children: implementButton.label })] }) }), _jsx(TooltipContent, { align: "center", children: implementButton.tooltip ?? implementButton.label })] })), orchestratorButton && (_jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsxs(Button, { type: "button", variant: "outline", size: "sm", className: "h-7 gap-1", onClick: orchestratorButton.onClick, disabled: orchestratorButton.disabled, children: [orchestratorButton.icon, _jsx("span", { className: "leading-none", children: orchestratorButton.label })] }) }), _jsx(TooltipContent, { align: "center", children: orchestratorButton.tooltip ?? orchestratorButton.label })] }))] }))] })] }));
    // Ephemeral preview mode: simple wrapper without tool container
    if (isEphemeralPreview) {
        return (_jsxs(_Fragment, { children: [_jsx("div", { className: cn("px-4 py-2", className), children: planUI }), _jsx(PopoverError, { error: editorError.error, prefix: "Failed to open editor" })] }));
    }
    // Tool call mode: full tool container with header
    return (_jsxs(_Fragment, { children: [_jsxs(ToolContainer, { expanded: expanded, children: [_jsxs(ToolHeader, { onClick: toggleExpanded, children: [_jsx(ExpandIcon, { expanded: expanded, children: "\u25B6" }), _jsx(ToolName, { children: "propose_plan" }), _jsx(StatusIndicator, { status: status, children: statusDisplay })] }), expanded && _jsx(ToolDetails, { children: planUI }), modal] }), _jsx(PopoverError, { error: editorError.error, prefix: "Failed to open editor" })] }));
};
//# sourceMappingURL=ProposePlanToolCall.js.map