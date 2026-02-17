import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import React from "react";
import { usePersistedState } from "@/browser/hooks/usePersistedState";
import { useWorkspaceStatsSnapshot } from "@/browser/stores/WorkspaceStore";
import { ToggleGroup } from "../ToggleGroup";
import { useTelemetry } from "@/browser/hooks/useTelemetry";
import { computeTimingPercentages } from "@/browser/utils/timingPercentages";
import { calculateAverageTPS } from "@/browser/utils/messages/StreamingTPSCalculator";
// Colors for timing components (matching TOKEN_COMPONENT_COLORS style)
const TIMING_COLORS = {
    ttft: "#f59e0b", // amber - waiting for first token
    model: "#3b82f6", // blue - model inference
    tools: "#10b981", // green - tool execution
};
function formatDuration(ms) {
    if (ms < 1000)
        return `${Math.round(ms)}ms`;
    if (ms < 10000)
        return `${(ms / 1000).toFixed(1)}s`;
    if (ms < 60000)
        return `${Math.round(ms / 1000)}s`;
    const mins = Math.floor(ms / 60000);
    const secs = Math.round((ms % 60000) / 1000);
    return `${mins}m ${secs}s`;
}
function formatTokens(tokens) {
    if (tokens < 1000)
        return String(tokens);
    return `${(tokens / 1000).toFixed(1)}k`;
}
const VIEW_MODE_OPTIONS = [
    { value: "session", label: "Session" },
    { value: "last-request", label: "Last Request" },
];
// Exported for unit tests.
export function formatModelBreakdownLabel(entry) {
    const splitLabel = entry.agentId ?? entry.mode;
    return splitLabel ? `${entry.model} (${splitLabel})` : entry.model;
}
function computeAverageTtft(totalTtftMs, ttftCount) {
    if (ttftCount <= 0)
        return null;
    return totalTtftMs / ttftCount;
}
export function StatsTab(props) {
    const liveSnapshot = useWorkspaceStatsSnapshot(props.workspaceId);
    const snapshot = props._snapshot ?? liveSnapshot;
    const telemetry = useTelemetry();
    const [viewMode, setViewMode] = usePersistedState("statsTab:viewMode", "session");
    const [showModeBreakdown, setShowModeBreakdown] = usePersistedState("statsTab:showModeBreakdown", false);
    const [isClearing, setIsClearing] = React.useState(false);
    const [clearError, setClearError] = React.useState(null);
    React.useEffect(() => {
        telemetry.statsTabOpened(viewMode, showModeBreakdown);
    }, [telemetry, viewMode, showModeBreakdown]);
    const active = snapshot?.active;
    const session = snapshot?.session;
    const lastRequest = snapshot?.lastRequest;
    const hasAnyData = active !== undefined || lastRequest !== undefined || (session?.responseCount ?? 0) > 0;
    const onClearStats = props._clearStats ??
        (async () => {
            const client = window.__ORPC_CLIENT__;
            if (!client)
                throw new Error("ORPC client not initialized");
            await client.workspace.stats.clear({ workspaceId: props.workspaceId });
        });
    const handleClearStats = async () => {
        if (isClearing) {
            return;
        }
        setIsClearing(true);
        setClearError(null);
        try {
            await onClearStats();
        }
        catch (error) {
            console.warn(`[StatsTab] Failed to clear stats for ${props.workspaceId}:`, error);
            setClearError("Failed to clear stats. Please try again.");
        }
        finally {
            setIsClearing(false);
        }
    };
    if (!hasAnyData) {
        return (_jsx("div", { className: "text-light font-primary text-[13px] leading-relaxed", children: _jsxs("div", { className: "text-secondary px-5 py-10 text-center", children: [_jsx("p", { children: "No timing data yet." }), _jsx("p", { children: "Send a message to see timing statistics." })] }) }));
    }
    // --- Timing data selection ---
    const sessionTotalDuration = (session?.totalDurationMs ?? 0) + (active?.elapsedMs ?? 0);
    const sessionToolExecutionMs = (session?.totalToolExecutionMs ?? 0) + (active?.toolExecutionMs ?? 0);
    // Includes TTFT (used as a fallback for TPS when streaming time is unavailable/corrupted).
    const sessionModelTimeMs = Math.max(0, sessionTotalDuration - sessionToolExecutionMs);
    const sessionStreamingMs = (session?.totalStreamingMs ?? 0) + (active?.streamingMs ?? 0);
    const sessionAvgTtftMs = computeAverageTtft(session?.totalTtftMs ?? 0, session?.ttftCount ?? 0);
    const sessionTotalTtftMs = (session?.totalTtftMs ?? 0) + (active?.ttftMs ?? 0);
    const lastData = active ?? lastRequest;
    const isActive = Boolean(active);
    const lastTotalDuration = active ? active.elapsedMs : (lastRequest?.totalDurationMs ?? 0);
    const lastToolExecutionMs = active ? active.toolExecutionMs : (lastRequest?.toolExecutionMs ?? 0);
    // Includes TTFT (used as a fallback for TPS when streaming time is unavailable/corrupted).
    const lastModelTimeMs = active
        ? active.modelTimeMs
        : (lastRequest?.modelTimeMs ?? Math.max(0, lastTotalDuration - lastToolExecutionMs));
    const lastStreamingMs = active ? active.streamingMs : (lastRequest?.streamingMs ?? 0);
    const lastTtftMs = active ? active.ttftMs : (lastRequest?.ttftMs ?? null);
    const totalDuration = viewMode === "session" ? sessionTotalDuration : lastTotalDuration;
    const toolExecutionMs = viewMode === "session" ? sessionToolExecutionMs : lastToolExecutionMs;
    const modelTimeMs = viewMode === "session" ? sessionModelTimeMs : lastModelTimeMs;
    const streamingMs = viewMode === "session" ? sessionStreamingMs : lastStreamingMs;
    const ttftMs = viewMode === "session" ? sessionAvgTtftMs : lastTtftMs;
    const ttftMsForBar = viewMode === "session" ? sessionTotalTtftMs : (lastTtftMs ?? 0);
    // Stats snapshot provides both modelTime (includes TTFT) and streaming time.
    // For display breakdowns, prefer streaming time so TTFT isn't double-counted.
    const modelDisplayMs = streamingMs;
    const waitingForTtft = viewMode === "last-request" && isActive && active?.ttftMs === null;
    const timingPercentages = computeTimingPercentages({
        totalDurationMs: totalDuration,
        ttftMs: ttftMsForBar,
        modelMs: modelDisplayMs,
        toolsMs: toolExecutionMs,
    });
    const ttftPercentage = timingPercentages.ttft;
    const modelPercentage = timingPercentages.model;
    const toolPercentage = timingPercentages.tools;
    const totalTokensForView = (() => {
        if (viewMode === "session") {
            const output = session?.totalOutputTokens ?? 0;
            const reasoning = session?.totalReasoningTokens ?? 0;
            return output + reasoning;
        }
        const output = lastData?.outputTokens ?? 0;
        const reasoning = lastData?.reasoningTokens ?? 0;
        return output + reasoning;
    })();
    const avgTPS = calculateAverageTPS(streamingMs, modelTimeMs, totalTokensForView, viewMode === "last-request" ? (active?.liveTPS ?? null) : null);
    const components = [
        {
            name: viewMode === "session" ? "Avg. Time to First Token" : "Time to First Token",
            duration: ttftMs,
            color: TIMING_COLORS.ttft,
            show: ttftMs !== null || waitingForTtft,
            waiting: waitingForTtft,
            percentage: ttftPercentage,
        },
        {
            name: "Model Time",
            duration: modelDisplayMs,
            color: TIMING_COLORS.model,
            show: true,
            percentage: modelPercentage,
        },
        {
            name: "Tool Execution",
            duration: toolExecutionMs,
            color: TIMING_COLORS.tools,
            show: toolExecutionMs > 0,
            percentage: toolPercentage,
        },
    ].filter((c) => c.show);
    // --- Per-model breakdown (session view only) ---
    const modelEntries = (() => {
        if (!session)
            return [];
        return Object.entries(session.byModel).map(([key, entry]) => ({ key, ...entry }));
    })();
    const hasSplitData = modelEntries.some((e) => e.agentId !== undefined || e.mode !== undefined);
    const consolidatedByModel = (() => {
        const byModel = new Map();
        for (const entry of modelEntries) {
            const existing = byModel.get(entry.model);
            if (!existing) {
                byModel.set(entry.model, {
                    ...entry,
                    key: entry.model,
                    mode: undefined,
                    agentId: undefined,
                });
                continue;
            }
            existing.totalDurationMs += entry.totalDurationMs;
            existing.totalToolExecutionMs += entry.totalToolExecutionMs;
            existing.totalStreamingMs += entry.totalStreamingMs;
            existing.totalTtftMs += entry.totalTtftMs;
            existing.ttftCount += entry.ttftCount;
            existing.responseCount += entry.responseCount;
            existing.totalOutputTokens += entry.totalOutputTokens;
            existing.totalReasoningTokens += entry.totalReasoningTokens;
        }
        return Array.from(byModel.values());
    })();
    const breakdownToShow = viewMode === "session" && hasSplitData && showModeBreakdown
        ? modelEntries
        : consolidatedByModel;
    breakdownToShow.sort((a, b) => b.totalDurationMs - a.totalDurationMs);
    // --- Render ---
    return (_jsxs("div", { className: "text-light font-primary text-[13px] leading-relaxed", children: [_jsx("div", { "data-testid": "timing-section", className: "mb-6", children: _jsxs("div", { className: "flex flex-col gap-3", children: [_jsxs("div", { "data-testid": "timing-header", className: "flex items-center justify-between gap-2", children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsxs("span", { className: "text-foreground inline-flex shrink-0 items-baseline gap-1 font-medium", children: ["Timing", isActive && _jsx("span", { className: "text-accent ml-1 animate-pulse text-xs", children: "\u25CF" })] }), _jsx(ToggleGroup, { options: VIEW_MODE_OPTIONS, value: viewMode, onChange: setViewMode })] }), _jsxs("div", { className: "flex shrink-0 items-center gap-2", children: [viewMode === "session" && (_jsx("button", { type: "button", className: "text-muted hover:text-foreground text-xs disabled:cursor-not-allowed disabled:opacity-50", disabled: isClearing, onClick: () => {
                                                void handleClearStats();
                                            }, children: isClearing ? "Clearing..." : "Clear stats" })), _jsx("span", { className: "text-muted text-xs", children: formatDuration(totalDuration) })] })] }), clearError && viewMode === "session" && (_jsx("div", { role: "alert", "data-testid": "clear-stats-error", className: "bg-destructive/10 text-destructive rounded px-2 py-1 text-xs", children: clearError })), viewMode === "session" && session && session.responseCount > 0 && (_jsxs("div", { className: "text-muted-light flex flex-wrap gap-x-3 gap-y-1 text-xs", children: [_jsxs("span", { children: [session.responseCount, " response", session.responseCount !== 1 ? "s" : ""] }), (session.totalOutputTokens > 0 || session.totalReasoningTokens > 0) && (_jsxs(_Fragment, { children: [_jsx("span", { children: "\u00B7" }), _jsxs("span", { children: [formatTokens(session.totalOutputTokens), " output tokens"] }), session.totalReasoningTokens > 0 && (_jsxs(_Fragment, { children: [_jsx("span", { children: "\u00B7" }), _jsxs("span", { children: [formatTokens(session.totalReasoningTokens), " thinking"] })] }))] }))] })), lastData?.invalid && viewMode === "last-request" && (_jsxs("div", { className: "text-muted-light text-xs", children: ["Invalid timing data: ", lastData.anomalies.join(", ")] })), avgTPS !== null && avgTPS > 0 && (_jsxs("div", { className: "text-muted-light text-xs", children: ["Avg. TPS: ", avgTPS.toFixed(0), " tok/s"] })), _jsx("div", { className: "relative w-full", children: _jsxs("div", { className: "bg-border-light flex h-1.5 w-full overflow-hidden rounded-[3px]", children: [ttftPercentage > 0 && (_jsx("div", { className: "h-full transition-[width] duration-300", style: { width: `${ttftPercentage}%`, backgroundColor: TIMING_COLORS.ttft } })), _jsx("div", { className: "h-full transition-[width] duration-300", style: { width: `${modelPercentage}%`, backgroundColor: TIMING_COLORS.model } }), _jsx("div", { className: "h-full transition-[width] duration-300", style: { width: `${toolPercentage}%`, backgroundColor: TIMING_COLORS.tools } })] }) }), _jsx("div", { className: "flex flex-col gap-2", children: components.map((component) => (_jsxs("div", { className: "flex items-center justify-between gap-3", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("div", { className: "h-2 w-2 rounded-full", style: { backgroundColor: component.color } }), _jsx("span", { className: "text-secondary text-xs", children: component.name })] }), _jsxs("div", { className: "flex items-center gap-2", children: [component.waiting ? (_jsx("span", { className: "text-muted text-xs", children: "waiting\u2026" })) : component.duration !== null ? (_jsx("span", { className: "text-muted text-xs", children: formatDuration(component.duration) })) : (_jsx("span", { className: "text-muted text-xs", children: "\u2014" })), component.percentage !== undefined && component.percentage > 0 && (_jsxs("span", { className: "text-muted text-[10px]", children: [component.percentage.toFixed(0), "%"] }))] })] }, component.name))) })] }) }), viewMode === "session" && breakdownToShow.length > 0 && (_jsxs("div", { className: "mb-2", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("span", { className: "text-foreground text-xs font-medium", children: "By model" }), hasSplitData && (_jsxs("label", { className: "text-muted flex items-center gap-2 text-xs select-none", children: [_jsx("input", { type: "checkbox", checked: showModeBreakdown, onChange: (e) => setShowModeBreakdown(e.target.checked) }), "Split by agent"] }))] }), _jsx("div", { className: "mt-3 flex flex-col gap-2", children: breakdownToShow.map((entry) => {
                            const avgTtft = computeAverageTtft(entry.totalTtftMs, entry.ttftCount);
                            const tokens = entry.totalOutputTokens + entry.totalReasoningTokens;
                            const entryAvgTPS = calculateAverageTPS(entry.totalStreamingMs, Math.max(0, entry.totalDurationMs - entry.totalToolExecutionMs), tokens, null);
                            const label = formatModelBreakdownLabel(entry);
                            return (_jsxs("div", { className: "bg-border-light/30 rounded-md px-3 py-2", children: [_jsxs("div", { className: "flex items-center justify-between gap-2", children: [_jsx("span", { className: "text-secondary truncate text-xs", title: label, children: label }), _jsx("span", { className: "text-muted shrink-0 text-xs", children: formatDuration(entry.totalDurationMs) })] }), _jsxs("div", { className: "text-muted-light mt-1 flex flex-wrap gap-x-2 gap-y-1 text-[11px]", children: [_jsxs("span", { children: [entry.responseCount, " req"] }), avgTtft !== null && (_jsxs(_Fragment, { children: [_jsx("span", { children: "\u00B7" }), _jsxs("span", { children: ["TTFT ", formatDuration(avgTtft)] })] })), entryAvgTPS !== null && entryAvgTPS > 0 && (_jsxs(_Fragment, { children: [_jsx("span", { children: "\u00B7" }), _jsxs("span", { children: [entryAvgTPS.toFixed(0), " tok/s"] })] }))] })] }, entry.key));
                        }) })] }))] }));
}
//# sourceMappingURL=StatsTab.js.map