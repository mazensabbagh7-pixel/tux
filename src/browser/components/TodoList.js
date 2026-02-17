import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Check, Circle, Loader2 } from "lucide-react";
import { cn } from "@/common/lib/utils";
const statusBgColors = {
    completed: "color-mix(in srgb, var(--color-success), transparent 92%)",
    in_progress: "color-mix(in srgb, var(--color-info), transparent 92%)",
    pending: "color-mix(in srgb, var(--color-muted), transparent 96%)",
};
const statusBorderColors = {
    completed: "var(--color-success)",
    in_progress: "var(--color-info)",
    pending: "var(--color-dim)",
};
const statusTextColors = {
    completed: "var(--color-muted)",
    in_progress: "var(--color-info)",
    pending: "var(--color-text)",
};
/**
 * Calculate opacity fade for items distant from the center (exponential decay).
 * @param distance - How far from the center (higher = more fade)
 * @param minOpacity - Minimum opacity floor
 * @returns Opacity value between minOpacity and 1.0
 */
function calculateFadeOpacity(distance, minOpacity) {
    return Math.max(minOpacity, 1 - distance * 0.15);
}
function calculateTextOpacity(status, completedIndex, totalCompleted, pendingIndex, totalPending) {
    if (status === "completed") {
        // Apply gradient fade for old completed items (distant past)
        if (completedIndex !== undefined &&
            totalCompleted !== undefined &&
            totalCompleted > 2 &&
            completedIndex < totalCompleted - 2) {
            const distance = totalCompleted - completedIndex;
            return calculateFadeOpacity(distance, 0.35);
        }
        return 0.7;
    }
    if (status === "pending") {
        // Apply gradient fade for far future pending items (distant future)
        if (pendingIndex !== undefined &&
            totalPending !== undefined &&
            totalPending > 2 &&
            pendingIndex > 1) {
            const distance = pendingIndex - 1;
            return calculateFadeOpacity(distance, 0.5);
        }
    }
    return 1;
}
function getStatusIcon(status) {
    switch (status) {
        case "completed":
            return _jsx(Check, { "aria-hidden": "true", className: "h-3 w-3" });
        case "in_progress":
            return _jsx(Loader2, { "aria-hidden": "true", className: "h-3 w-3 animate-spin" });
        case "pending":
        default:
            return _jsx(Circle, { "aria-hidden": "true", className: "h-3 w-3" });
    }
}
/**
 * Shared TODO list component used by:
 * - TodoToolCall (in expanded tool history)
 * - PinnedTodoList (pinned at bottom of chat)
 */
export const TodoList = ({ todos }) => {
    // Count completed and pending items for fade effects
    const completedCount = todos.filter((t) => t.status === "completed").length;
    const pendingCount = todos.filter((t) => t.status === "pending").length;
    let completedIndex = 0;
    let pendingIndex = 0;
    return (_jsx("div", { className: "flex flex-col gap-[3px] px-2 py-1.5", children: todos.map((todo, index) => {
            const currentCompletedIndex = todo.status === "completed" ? completedIndex++ : undefined;
            const currentPendingIndex = todo.status === "pending" ? pendingIndex++ : undefined;
            const textOpacity = calculateTextOpacity(todo.status, currentCompletedIndex, completedCount, currentPendingIndex, pendingCount);
            return (_jsxs("div", { className: "font-monospace flex items-start gap-1.5 rounded border-l-2 px-2 py-1 text-[11px] leading-[1.35]", style: {
                    background: statusBgColors[todo.status],
                    borderLeftColor: statusBorderColors[todo.status],
                    color: "var(--color-text)",
                }, children: [_jsx("div", { className: "mt-px shrink-0 text-xs opacity-80", children: getStatusIcon(todo.status) }), _jsx("div", { className: "min-w-0 flex-1", children: _jsx("div", { title: todo.content, className: cn("truncate", todo.status === "completed" && "line-through", todo.status === "in_progress" &&
                                "font-medium after:content-['...'] after:inline after:overflow-hidden after:animate-[ellipsis_1.5s_steps(4,end)_infinite]"), style: {
                                color: statusTextColors[todo.status],
                                opacity: textOpacity,
                            }, children: todo.content }) })] }, index));
        }) }));
};
//# sourceMappingURL=TodoList.js.map