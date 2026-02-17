import { Fragment as _Fragment, jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import React, { useEffect, useRef, useState } from "react";
import { FileText, Info, Layers, Loader2 } from "lucide-react";
import { BASH_DEFAULT_TIMEOUT_SECS } from "@/common/constants/toolLimits";
import { ToolContainer, ToolHeader, ExpandIcon, StatusIndicator, ToolDetails, DetailSection, DetailLabel, DetailContent, ToolIcon, ErrorBox, ExitCodeBadge, } from "./shared/ToolPrimitives";
import { useToolExpansion, getStatusDisplay, formatDuration, } from "./shared/toolUtils";
import { cn } from "@/common/lib/utils";
import { useBashToolLiveOutput, useLatestStreamingBashId } from "@/browser/stores/WorkspaceStore";
import { useForegroundBashToolCallIds } from "@/browser/stores/BackgroundBashStore";
import { useBackgroundBashActions } from "@/browser/contexts/BackgroundBashContext";
import { Tooltip, TooltipTrigger, TooltipContent } from "../ui/tooltip";
import { BackgroundBashOutputDialog } from "../BackgroundBashOutputDialog";
/**
 * Isolated component for elapsed time display.
 * Uses requestAnimationFrame + local state to avoid re-rendering parent component.
 */
const ElapsedTimeDisplay = ({ startedAt, isActive, }) => {
    const elapsedRef = useRef(0);
    const frameRef = useRef(null);
    const [, forceUpdate] = React.useReducer((x) => x + 1, 0);
    const baseStart = useRef(startedAt ?? Date.now());
    useEffect(() => {
        if (!isActive) {
            elapsedRef.current = 0;
            if (frameRef.current !== null) {
                cancelAnimationFrame(frameRef.current);
                frameRef.current = null;
            }
            return;
        }
        baseStart.current = startedAt ?? Date.now();
        let lastSecond = -1;
        const tick = () => {
            const now = Date.now();
            const elapsed = now - baseStart.current;
            const currentSecond = Math.floor(elapsed / 1000);
            // Only update when second changes to minimize renders
            if (currentSecond !== lastSecond) {
                lastSecond = currentSecond;
                elapsedRef.current = elapsed;
                forceUpdate();
            }
            frameRef.current = requestAnimationFrame(tick);
        };
        tick();
        return () => {
            if (frameRef.current !== null) {
                cancelAnimationFrame(frameRef.current);
                frameRef.current = null;
            }
        };
    }, [isActive, startedAt]);
    if (!isActive || elapsedRef.current === 0) {
        return null;
    }
    return _jsxs(_Fragment, { children: [" \u2022 ", Math.round(elapsedRef.current / 1000), "s"] });
};
const EMPTY_LIVE_OUTPUT = {
    stdout: "",
    stderr: "",
    combined: "",
    truncated: false,
    phase: undefined,
};
export const BashToolCall = ({ workspaceId, toolCallId, args, result, status = "pending", startedAt, }) => {
    const { expanded, setExpanded, toggleExpanded } = useToolExpansion();
    const [outputDialogOpen, setOutputDialogOpen] = useState(false);
    const resultHasOutput = typeof result?.output === "string";
    const shouldTrackLiveBashState = Boolean(workspaceId &&
        toolCallId &&
        (status === "executing" || (status === "completed" && !resultHasOutput)));
    const shouldTrackLatestStreamingBash = Boolean(workspaceId && toolCallId && (status === "executing" || expanded));
    const foregroundBashToolCallIds = useForegroundBashToolCallIds(status === "executing" ? workspaceId : undefined);
    const { sendToBackground } = useBackgroundBashActions();
    const liveOutput = useBashToolLiveOutput(shouldTrackLiveBashState ? workspaceId : undefined, shouldTrackLiveBashState ? toolCallId : undefined);
    const latestStreamingBashId = useLatestStreamingBashId(shouldTrackLatestStreamingBash ? workspaceId : undefined);
    const isLatestStreamingBash = latestStreamingBashId === toolCallId;
    const outputRef = useRef(null);
    const outputPinnedRef = useRef(true);
    const updatePinned = (el) => {
        const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
        outputPinnedRef.current = distanceToBottom < 40;
    };
    const liveOutputView = liveOutput ?? EMPTY_LIVE_OUTPUT;
    const combinedLiveOutput = liveOutputView.combined;
    useEffect(() => {
        const el = outputRef.current;
        if (!el)
            return;
        if (outputPinnedRef.current) {
            el.scrollTop = el.scrollHeight;
        }
    }, [combinedLiveOutput]);
    // Track whether user manually toggled expansion to avoid fighting with auto-expand
    const userToggledRef = useRef(false);
    // Track whether this bash was auto-expanded (so we know to auto-collapse it)
    const wasAutoExpandedRef = useRef(false);
    // Timer for delayed auto-expand
    const expandTimerRef = useRef(null);
    // Auto-expand after a delay when this is the latest streaming bash.
    // Delay prevents layout flash for fast-completing commands.
    // Auto-collapse when a NEW bash starts streaming (but not on completion).
    useEffect(() => {
        if (userToggledRef.current)
            return; // Don't override user's choice
        if (isLatestStreamingBash && status === "executing") {
            // Delay expansion - if command completes quickly, we skip the expand entirely
            expandTimerRef.current = setTimeout(() => {
                if (!userToggledRef.current) {
                    setExpanded(true);
                    wasAutoExpandedRef.current = true;
                }
            }, 300);
        }
        else {
            // Clear pending expand if command finished before delay
            if (expandTimerRef.current) {
                clearTimeout(expandTimerRef.current);
                expandTimerRef.current = null;
            }
            // Collapse if a NEW bash took over (latestStreamingBashId is not null and not us)
            if (wasAutoExpandedRef.current && latestStreamingBashId !== null) {
                setExpanded(false);
                wasAutoExpandedRef.current = false;
            }
        }
        return () => {
            if (expandTimerRef.current) {
                clearTimeout(expandTimerRef.current);
            }
        };
    }, [isLatestStreamingBash, latestStreamingBashId, status, setExpanded]);
    const isPending = status === "executing" || status === "pending";
    const backgroundProcessId = result && "backgroundProcessId" in result ? result.backgroundProcessId : null;
    const isBackground = args.run_in_background ?? Boolean(backgroundProcessId);
    // Override status for backgrounded processes: the aggregator sees success=true and marks "completed",
    // but for a foreground→background migration we want to show "backgrounded"
    const effectiveStatus = status === "completed" && result && "backgroundProcessId" in result ? "backgrounded" : status;
    const showLiveOutput = !isBackground && (status === "executing" || (Boolean(liveOutput) && !resultHasOutput));
    const isFilteringLiveOutput = showLiveOutput && liveOutputView.phase === "filtering";
    const canSendToBackground = Boolean(toolCallId && workspaceId && foregroundBashToolCallIds.has(toolCallId));
    const handleSendToBackground = toolCallId && workspaceId
        ? () => {
            sendToBackground(toolCallId);
        }
        : undefined;
    const truncatedInfo = result && "truncated" in result ? result.truncated : undefined;
    const note = result && "note" in result ? result.note : undefined;
    const isBackgroundResult = Boolean(result && "backgroundProcessId" in result);
    const completedOutput = isBackgroundResult ? undefined : result?.output;
    const completedHasOutput = typeof completedOutput === "string" && completedOutput.length > 0;
    const showCompletedOutputSection = !isBackgroundResult && (completedHasOutput || Boolean(note));
    const handleToggle = () => {
        userToggledRef.current = true;
        toggleExpanded();
    };
    return (_jsxs(ToolContainer, { expanded: expanded, children: [_jsxs(ToolHeader, { onClick: handleToggle, children: [_jsx(ExpandIcon, { expanded: expanded, children: "\u25B6" }), _jsx(ToolIcon, { toolName: "bash" }), _jsx("span", { className: "text-text font-monospace max-w-96 truncate", children: args.script }), isBackground && backgroundProcessId && workspaceId && (_jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("button", { type: "button", onClick: (e) => {
                                        e.stopPropagation();
                                        setOutputDialogOpen(true);
                                    }, className: "text-muted hover:text-secondary ml-2 rounded p-1 transition-colors", children: _jsx(FileText, { size: 12 }) }) }), _jsx(TooltipContent, { children: "View output" })] })), isBackground && (
                    // Background mode: show icon and display name
                    _jsxs("span", { className: "text-muted ml-2 flex items-center gap-1 text-[10px] whitespace-nowrap", children: [_jsx(Layers, { size: 10 }), args.display_name] })), !isBackground && (
                    // Normal mode: show timeout and duration
                    _jsxs(_Fragment, { children: [_jsxs("span", { className: cn("ml-2 text-[10px] whitespace-nowrap [@container(max-width:500px)]:hidden", isPending ? "text-pending" : "text-text-secondary"), children: ["timeout: ", args.timeout_secs ?? BASH_DEFAULT_TIMEOUT_SECS, "s", result && ` • took ${formatDuration(result.wall_duration_ms)}`, !result && _jsx(ElapsedTimeDisplay, { startedAt: startedAt, isActive: isPending })] }), result && _jsx(ExitCodeBadge, { exitCode: result.exitCode, className: "ml-2" })] })), _jsx(StatusIndicator, { status: effectiveStatus, children: getStatusDisplay(effectiveStatus) }), status === "executing" && !isBackground && handleSendToBackground && (_jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("button", { type: "button", onClick: (e) => {
                                        e.stopPropagation(); // Don't toggle expand
                                        handleSendToBackground();
                                    }, disabled: !canSendToBackground, className: cn("ml-2 flex cursor-pointer items-center gap-1 rounded p-1 text-[10px] font-medium transition-colors", "bg-[var(--color-pending)]/20 text-[var(--color-pending)]", "hover:bg-[var(--color-pending)]/30", "disabled:pointer-events-none disabled:invisible"), children: _jsx(Layers, { size: 12 }) }) }), _jsx(TooltipContent, { children: "Send to background \u2014 process continues but agent stops waiting" })] }))] }), backgroundProcessId && workspaceId && (_jsx(BackgroundBashOutputDialog, { open: outputDialogOpen, onOpenChange: setOutputDialogOpen, workspaceId: workspaceId, processId: backgroundProcessId, displayName: args.display_name })), expanded && (_jsxs(ToolDetails, { children: [_jsxs(DetailSection, { children: [_jsx(DetailLabel, { children: "Script" }), _jsx(DetailContent, { className: "px-2 py-1.5", children: args.script })] }), showLiveOutput && liveOutputView.truncated && (_jsx("div", { className: "text-muted px-2 text-[10px] italic", children: "Live output truncated (showing last ~1MB)" })), result && (_jsxs(_Fragment, { children: [result.success === false && result.error && (_jsxs(DetailSection, { children: [_jsx(DetailLabel, { children: "Error" }), _jsx(ErrorBox, { children: result.error })] })), truncatedInfo && (_jsxs("div", { className: "text-muted px-2 text-[10px] italic", children: ["Output truncated \u2014 reason: ", truncatedInfo.reason, " \u2022 totalLines:", " ", truncatedInfo.totalLines] }))] })), (showLiveOutput || showCompletedOutputSection) && (_jsxs(DetailSection, { children: [_jsxs(DetailLabel, { className: "flex items-center gap-1", children: [_jsx("span", { children: "Output" }), note && (_jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("button", { type: "button", "aria-label": "View notice", className: "text-muted hover:text-secondary translate-y-[-1px] rounded p-0.5 transition-colors", children: _jsx(Info, { size: 12 }) }) }), _jsx(TooltipContent, { children: _jsx("div", { className: "max-w-xs break-words whitespace-pre-wrap", children: note }) })] }))] }), _jsxs("div", { className: "relative", children: [_jsx(DetailContent, { ref: outputRef, onScroll: showLiveOutput ? (e) => updatePinned(e.currentTarget) : undefined, className: cn("px-2 py-1.5", (showLiveOutput ? combinedLiveOutput.length === 0 : !completedHasOutput) &&
                                            "text-muted italic", isFilteringLiveOutput && "opacity-60 blur-[1px]"), children: showLiveOutput
                                            ? combinedLiveOutput.length > 0
                                                ? combinedLiveOutput
                                                : status === "redacted"
                                                    ? "Output excluded from shared transcript"
                                                    : "No output yet"
                                            : completedHasOutput
                                                ? completedOutput
                                                : "No output" }), isFilteringLiveOutput && (_jsx("div", { className: "pointer-events-none absolute inset-0 flex items-center justify-center", children: _jsxs("div", { className: "text-muted flex items-center gap-1 rounded border border-white/10 bg-[var(--color-bg-tertiary)]/80 px-2 py-1 text-[10px] backdrop-blur-sm", children: [_jsx(Loader2, { "aria-hidden": "true", className: "h-3 w-3 animate-spin" }), "Compacting output\u2026"] }) }))] })] })), result && "backgroundProcessId" in result && (_jsxs("div", { className: "flex items-center gap-2 text-[11px]", children: [_jsx(Layers, { size: 12, className: "text-muted shrink-0" }), _jsx("span", { className: "text-muted", children: "Background process" }), _jsx("code", { className: "rounded bg-[var(--color-bg-tertiary)] px-1.5 py-0.5 font-mono text-[10px]", children: result.backgroundProcessId })] }))] }))] }));
};
//# sourceMappingURL=BashToolCall.js.map