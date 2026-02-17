import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React from "react";
import { cn } from "@/common/lib/utils";
import { Bell, BookOpen, FileText, GitCommit, Globe, GraduationCap, Info, List, Pencil, Sparkles, Square, Wrench, } from "lucide-react";
import { EmojiIcon } from "../../icons/EmojiIcon";
import { Tooltip, TooltipTrigger, TooltipContent } from "../../ui/tooltip";
export const ToolContainer = ({ expanded, className, ...props }) => (_jsx("div", { className: cn("my-2 rounded font-mono text-[11px] transition-all duration-200", "[container-type:inline-size]", expanded ? "py-2 px-3" : "py-1 px-3", className), ...props }));
export const ToolHeader = ({ className, ...props }) => (_jsx("div", { className: cn("flex items-center gap-2 cursor-pointer select-none text-secondary hover:text-foreground", className), ...props }));
export const ExpandIcon = ({ expanded, className, ...props }) => (_jsx("span", { className: cn("inline-block transition-transform duration-200 text-[10px]", expanded ? "rotate-90" : "rotate-0", className), ...props }));
export const ToolName = ({ className, ...props }) => _jsx("span", { className: cn("font-medium", className), ...props });
const getStatusColor = (status) => {
    switch (status) {
        case "executing":
            return "text-pending";
        case "completed":
            return "text-success";
        case "failed":
            return "text-danger";
        case "interrupted":
            return "text-interrupted";
        case "backgrounded":
            return "text-backgrounded";
        case "redacted":
            return "text-foreground-secondary";
        default:
            return "text-foreground-secondary";
    }
};
export const StatusIndicator = ({ status, className, children, ...props }) => (_jsx("span", { className: cn("text-[10px] ml-auto opacity-80 whitespace-nowrap shrink-0", "[&_.status-text]:inline [@container(max-width:350px)]:[&_.status-text]:hidden", getStatusColor(status), className), ...props, children: children }));
export const ToolDetails = ({ className, ...props }) => (_jsx("div", { className: cn("mt-2 pt-2 border-t border-white/5 text-foreground", className), ...props }));
export const DetailSection = ({ className, ...props }) => _jsx("div", { className: cn("my-1.5", className), ...props });
export const DetailLabel = ({ className, ...props }) => (_jsx("div", { className: cn("text-[10px] text-foreground-secondary mb-1 uppercase tracking-wide", className), ...props }));
export const DetailContent = React.forwardRef(({ className, ...props }, ref) => (_jsx("pre", { ref: ref, className: cn("m-0 bg-code-bg rounded-sm text-[11px] leading-relaxed whitespace-pre-wrap break-words max-h-[200px] overflow-y-auto", className), ...props })));
DetailContent.displayName = "DetailContent";
export const LoadingDots = ({ className, ...props }) => (_jsx("span", { className: cn("after:inline-block after:w-[3ch] after:text-left after:content-[''] after:animate-[ellipsis_1.2s_steps(4,end)_infinite]", className), ...props }));
export const HeaderButton = ({ active, className, ...props }) => (_jsx("button", { className: cn("border border-white/20 text-foreground px-2 py-0.5 rounded-sm cursor-pointer text-[10px]", "transition-all duration-200 whitespace-nowrap hover:bg-white/10 hover:border-white/30", active && "bg-white/10", className), ...props }));
export const TOOL_NAME_TO_ICON = {
    bash: Wrench,
    bash_output: Wrench,
    bash_background_terminate: Square,
    bash_background_list: List,
    agent_report: FileText,
    agent_skill_read: GraduationCap,
    agent_skill_read_file: GraduationCap,
    file_read: BookOpen,
    file_edit_insert: Pencil,
    file_edit_replace_string: Pencil,
    file_edit_replace_lines: Pencil,
    todo_write: List,
    web_fetch: Globe,
    web_search: Globe,
    notify: Bell,
    task_apply_git_patch: GitCommit,
};
export const ToolIcon = ({ toolName, emoji, emojiSpin, className }) => {
    const Icon = TOOL_NAME_TO_ICON[toolName] ?? Sparkles;
    return (_jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("span", { className: cn("inline-flex shrink-0 items-center justify-center text-secondary [&_svg]:size-3", className), children: emoji ? _jsx(EmojiIcon, { emoji: emoji, spin: emojiSpin }) : _jsx(Icon, { "aria-hidden": "true" }) }) }), _jsx(TooltipContent, { children: toolName })] }));
};
export const ErrorBox = ({ className, ...props }) => (_jsx("div", { className: cn("rounded border-l-2 px-2 py-1.5 text-[11px] text-danger bg-danger-overlay border-danger", className), ...props }));
export const ExitCodeBadge = ({ exitCode, className }) => (_jsx("span", { className: cn("inline-block shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap", exitCode === 0 ? "bg-success text-on-success" : "bg-danger text-on-danger", className), children: exitCode }));
export const ProcessStatusBadge = ({ status, exitCode, className, }) => (_jsxs("span", { className: cn("inline-block shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap", status === "exited" && exitCode === 0
        ? "bg-success text-on-success"
        : status === "interrupted"
            ? "bg-warning text-on-warning"
            : "bg-danger text-on-danger", className), children: [status, exitCode !== undefined && ` (${exitCode})`] }));
export const OutputStatusBadge = ({ hasOutput, className }) => (_jsx("span", { className: cn("inline-block shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap", hasOutput ? "bg-pending/20 text-pending" : "bg-muted-foreground/20 text-muted-foreground", className), children: hasOutput ? "new output" : "no output" }));
export const OutputSection = ({ output, emptyMessage = "No output", note, }) => {
    const hasOutput = typeof output === "string" && output.length > 0;
    const showLabel = hasOutput || Boolean(note);
    // Preserve existing behavior: when we have no output (and no note), render only the empty message.
    if (!showLabel) {
        return (_jsx(DetailSection, { children: _jsx(DetailContent, { className: "text-muted px-2 py-1.5 italic", children: emptyMessage }) }));
    }
    return (_jsxs(DetailSection, { children: [_jsxs(DetailLabel, { className: "flex items-center gap-1", children: [_jsx("span", { children: "Output" }), note && (_jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("button", { type: "button", "aria-label": "View notice", className: "text-muted hover:text-secondary translate-y-[-1px] rounded p-0.5 transition-colors", children: _jsx(Info, { size: 12 }) }) }), _jsx(TooltipContent, { children: _jsx("div", { className: "max-w-xs break-words whitespace-pre-wrap", children: note }) })] }))] }), _jsx(DetailContent, { className: cn("px-2 py-1.5", !hasOutput && "text-muted italic"), children: hasOutput ? output : emptyMessage })] }));
};
//# sourceMappingURL=ToolPrimitives.js.map