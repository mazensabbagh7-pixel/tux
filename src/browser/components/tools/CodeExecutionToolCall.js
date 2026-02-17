import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useMemo, useEffect } from "react";
import { CodeIcon, TerminalIcon, CheckCircleIcon, XCircleIcon, AlertTriangleIcon, CirclePauseIcon, } from "lucide-react";
import { DetailContent } from "./shared/ToolPrimitives";
import { HighlightedCode } from "./shared/HighlightedCode";
import { ConsoleOutputDisplay } from "./shared/ConsoleOutput";
import { NestedToolsContainer } from "./shared/NestedToolsContainer";
import { cn } from "@/common/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/browser/components/ui/tooltip";
const ViewToggle = ({ active, onClick, tooltip, children, variant = "default", }) => (_jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("button", { type: "button", onClick: onClick, className: cn("flex h-5 w-5 items-center justify-center rounded-full p-0.5 transition-colors", active && "bg-foreground/10", variant === "default" && "text-muted hover:text-foreground", variant === "success" && "text-green-400 hover:text-green-300", variant === "error" && "text-red-400 hover:text-red-300", variant === "warning" && "text-yellow-400 hover:text-yellow-300"), children: children }) }), _jsx(TooltipContent, { side: "bottom", children: tooltip })] }));
export const CodeExecutionToolCall = ({ args, result, status = "pending", nestedCalls, }) => {
    // Use streaming nested calls if available, otherwise fall back to result
    const toolCalls = nestedCalls ?? [];
    const consoleOutput = result?.consoleOutput ?? [];
    const hasToolCalls = toolCalls.length > 0;
    const isComplete = status === "completed" || status === "failed";
    const [viewMode, setViewMode] = useState("tools");
    // Determine the appropriate default view for no-tool-calls case
    const hasFailed = isComplete && result && !result.success;
    const noToolCallsDefaultView = hasFailed ? "result" : "code";
    // When execution completes with no tool calls, switch to appropriate view
    useEffect(() => {
        if (isComplete && !hasToolCalls && viewMode === "tools") {
            setViewMode(noToolCallsDefaultView);
        }
    }, [isComplete, hasToolCalls, viewMode, noToolCallsDefaultView]);
    const toggleView = (mode) => {
        // When toggling off, return to tools if available, otherwise the no-tool-calls default
        const defaultView = hasToolCalls || !isComplete ? "tools" : noToolCallsDefaultView;
        setViewMode((prev) => (prev === mode ? defaultView : mode));
    };
    // Format result for display
    const formattedResult = useMemo(() => {
        if (!result?.success || result.result === undefined)
            return null;
        return typeof result.result === "string"
            ? result.result
            : JSON.stringify(result.result, null, 2);
    }, [result]);
    // Determine result icon and variant
    const isInterrupted = status === "interrupted";
    const isBackgrounded = status === "backgrounded";
    const resultVariant = isInterrupted
        ? "warning"
        : isBackgrounded
            ? "default"
            : !isComplete
                ? "default"
                : result?.success
                    ? "success"
                    : "error";
    return (_jsxs("fieldset", { className: "border-foreground/20 mt-3 flex flex-col gap-1.5 rounded-lg border border-dashed px-3 pt-1 pb-2", children: [_jsxs("legend", { className: "flex items-center gap-1.5 px-1.5", children: [_jsx("span", { className: "text-foreground text-xs font-medium", children: "Code Execution" }), _jsxs("div", { className: "flex items-center", children: [_jsx("div", { className: "mr-0.5", children: _jsx(ViewToggle, { active: viewMode === "result", onClick: () => toggleView("result"), tooltip: "Show Result", variant: resultVariant, children: isInterrupted ? (_jsx(AlertTriangleIcon, { className: "h-3.5 w-3.5" })) : isBackgrounded ? (_jsx(CirclePauseIcon, { className: "h-3.5 w-3.5" })) : !isComplete ? (_jsx("span", { className: "text-xs font-medium", children: "..." })) : result?.success ? (_jsx(CheckCircleIcon, { className: "h-3.5 w-3.5" })) : (_jsx(XCircleIcon, { className: "h-3.5 w-3.5" })) }) }), _jsx(ViewToggle, { active: viewMode === "code", onClick: () => toggleView("code"), tooltip: "Show Code", children: _jsx(CodeIcon, { className: "h-3.5 w-3.5" }) }), _jsx(ViewToggle, { active: viewMode === "console", onClick: () => toggleView("console"), tooltip: "Show Console", children: _jsx(TerminalIcon, { className: "h-3.5 w-3.5" }) })] })] }), viewMode === "tools" && hasToolCalls && (_jsx(NestedToolsContainer, { calls: toolCalls, parentInterrupted: isInterrupted })), viewMode === "code" && (_jsx("div", { className: "border-foreground/10 bg-code-bg rounded border p-2", children: _jsx(HighlightedCode, { language: "javascript", code: args.code.trim() }) })), viewMode === "console" && (_jsx("div", { className: "border-foreground/10 bg-code-bg rounded border p-2", children: consoleOutput.length > 0 ? (_jsx(ConsoleOutputDisplay, { output: consoleOutput })) : (_jsx("span", { className: "text-muted text-xs italic", children: "No console output" })) })), viewMode === "result" &&
                (isComplete && result ? (result.success ? (formattedResult ? (_jsx(DetailContent, { className: "p-2", children: formattedResult })) : (_jsx("div", { className: "text-muted text-xs italic", children: "(no return value)" }))) : (_jsx(DetailContent, { className: "border border-red-500/30 bg-red-500/10 p-2 text-red-400", children: result.error }))) : isInterrupted ? (_jsx("div", { className: "text-xs text-yellow-400 italic", children: "Execution interrupted" })) : isBackgrounded ? (_jsx("div", { className: "text-muted text-xs italic", children: "Execution backgrounded" })) : (_jsx("div", { className: "text-muted text-xs italic", children: "Execution in progress..." })))] }));
};
//# sourceMappingURL=CodeExecutionToolCall.js.map