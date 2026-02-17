import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import assert from "@/common/utils/assert";
import { AlertTriangle, Check } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { CUSTOM_EVENTS, createCustomEvent } from "@/common/constants/events";
import { useAPI } from "@/browser/contexts/API";
import { useAutoResizeTextarea } from "@/browser/hooks/useAutoResizeTextarea";
import { Checkbox } from "@/browser/components/ui/checkbox";
import { cn } from "@/common/lib/utils";
import { Button } from "@/browser/components/ui/button";
import { ErrorBox, ExpandIcon, StatusIndicator, ToolContainer, ToolDetails, ToolHeader, ToolName, } from "@/browser/components/tools/shared/ToolPrimitives";
import { getStatusDisplay, useToolExpansion, } from "@/browser/components/tools/shared/toolUtils";
import { getToolOutputUiOnly } from "@/common/utils/tools/toolOutputUiOnly";
const OTHER_VALUE = "__other__";
// Cache draft state by toolCallId so it survives workspace switches
const draftStateCache = new Map();
function unwrapJsonContainer(value) {
    if (!value || typeof value !== "object") {
        return value;
    }
    const record = value;
    if (record.type === "json" && "value" in record) {
        return record.value;
    }
    return value;
}
function isAskUserQuestionPayload(val) {
    if (!val || typeof val !== "object") {
        return false;
    }
    const record = val;
    if (!Array.isArray(record.questions)) {
        return false;
    }
    if (!record.answers || typeof record.answers !== "object") {
        return false;
    }
    for (const [, v] of Object.entries(record.answers)) {
        if (typeof v !== "string") {
            return false;
        }
    }
    return true;
}
function isToolErrorResult(val) {
    if (!val || typeof val !== "object") {
        return false;
    }
    const record = val;
    return record.success === false && typeof record.error === "string";
}
function parsePrefilledAnswer(question, answer) {
    const trimmed = answer.trim();
    if (trimmed.length === 0) {
        return { selected: [], otherText: "" };
    }
    const optionLabels = new Set(question.options.map((o) => o.label));
    if (!question.multiSelect) {
        if (optionLabels.has(trimmed)) {
            return { selected: [trimmed], otherText: "" };
        }
        return { selected: [OTHER_VALUE], otherText: trimmed };
    }
    const tokens = trimmed
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t.length > 0);
    const selected = [];
    const otherParts = [];
    for (const token of tokens) {
        if (optionLabels.has(token)) {
            selected.push(token);
        }
        else {
            otherParts.push(token);
        }
    }
    if (otherParts.length > 0) {
        selected.push(OTHER_VALUE);
    }
    return { selected, otherText: otherParts.join(", ") };
}
function isQuestionAnswered(_question, draft) {
    if (draft.selected.length === 0) {
        return false;
    }
    if (draft.selected.includes(OTHER_VALUE)) {
        return draft.otherText.trim().length > 0;
    }
    return true;
}
function draftToAnswerString(question, draft) {
    assert(isQuestionAnswered(question, draft), "draftToAnswerString requires a complete answer");
    const parts = [];
    for (const label of draft.selected) {
        if (label === OTHER_VALUE) {
            parts.push(draft.otherText.trim());
        }
        else {
            parts.push(label);
        }
    }
    if (!question.multiSelect) {
        assert(parts.length === 1, "Single-select questions must have exactly one answer");
        return parts[0];
    }
    return parts.join(", ");
}
/**
 * Get descriptions for selected answer labels from a question's options.
 * Filters out "Other" and labels not found in options.
 */
function getDescriptionsForLabels(question, labels) {
    return labels
        .filter((label) => label !== OTHER_VALUE)
        .map((label) => question.options.find((o) => o.label === label)?.description)
        .filter((d) => d !== undefined);
}
/** Auto-resizing textarea for "Other" text input. */
function AutoResizeTextarea(props) {
    const textareaRef = useRef(null);
    useAutoResizeTextarea(textareaRef, props.value, 30);
    return (_jsx("textarea", { ref: textareaRef, placeholder: props.placeholder, value: props.value, onChange: (e) => props.onChange(e.target.value), onKeyDown: (e) => {
            // Submit on Enter without shift (shift+Enter for newline)
            if (e.key === "Enter" && !e.shiftKey && props.value.trim().length > 0) {
                e.preventDefault();
                props.onSubmit();
            }
        }, className: cn("border-input placeholder:text-muted focus-visible:ring-ring", "w-full rounded-md border bg-transparent px-3 py-2 text-sm", "focus-visible:ring-1 focus-visible:outline-none", "resize-none min-h-[2.5rem] max-h-[30vh] overflow-y-auto") }));
}
export function AskUserQuestionToolCall(props) {
    const { api } = useAPI();
    const { expanded, toggleExpanded } = useToolExpansion(props.status === "executing");
    const statusDisplay = getStatusDisplay(props.status);
    const argsAnswers = props.args.answers ?? {};
    // Restore from cache if available (survives workspace switches)
    const cachedState = draftStateCache.get(props.toolCallId);
    const [activeIndex, setActiveIndex] = useState(() => cachedState?.activeIndex ?? 0);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState(null);
    const [draftAnswers, setDraftAnswers] = useState(() => {
        if (cachedState) {
            return cachedState.draftAnswers;
        }
        const initial = {};
        for (const q of props.args.questions) {
            const prefilled = argsAnswers[q.question];
            if (typeof prefilled === "string") {
                initial[q.question] = parsePrefilledAnswer(q, prefilled);
            }
            else {
                initial[q.question] = { selected: [], otherText: "" };
            }
        }
        return initial;
    });
    // Sync draft state to cache so it survives workspace switches
    useEffect(() => {
        if (props.status === "executing") {
            draftStateCache.set(props.toolCallId, { draftAnswers, activeIndex });
        }
        else {
            // Clean up cache when tool completes
            draftStateCache.delete(props.toolCallId);
        }
    }, [props.toolCallId, props.status, draftAnswers, activeIndex]);
    const resultUnwrapped = useMemo(() => {
        if (!props.result) {
            return null;
        }
        return unwrapJsonContainer(props.result);
    }, [props.result]);
    const uiOnlyPayload = getToolOutputUiOnly(resultUnwrapped)?.ask_user_question;
    const successResult = uiOnlyPayload ??
        (resultUnwrapped && isAskUserQuestionPayload(resultUnwrapped) ? resultUnwrapped : null);
    const errorResult = resultUnwrapped && isToolErrorResult(resultUnwrapped) ? resultUnwrapped : null;
    const isComplete = useMemo(() => {
        return props.args.questions.every((q) => {
            const draft = draftAnswers[q.question];
            return draft ? isQuestionAnswered(q, draft) : false;
        });
    }, [draftAnswers, props.args.questions]);
    const submitButtonRef = useRef(null);
    const summaryIndex = props.args.questions.length;
    const isOnSummary = activeIndex === summaryIndex;
    // Focus submit button when reaching summary so Enter submits
    useEffect(() => {
        if (props.status === "executing" && isOnSummary) {
            submitButtonRef.current?.focus();
        }
    }, [isOnSummary, props.status]);
    const currentQuestion = isOnSummary
        ? null
        : props.args.questions[Math.min(activeIndex, props.args.questions.length - 1)];
    const currentDraft = currentQuestion ? draftAnswers[currentQuestion.question] : undefined;
    const unansweredCount = useMemo(() => {
        return props.args.questions.filter((q) => {
            const draft = draftAnswers[q.question];
            return !draft || !isQuestionAnswered(q, draft);
        }).length;
    }, [draftAnswers, props.args.questions]);
    const handleSubmit = () => {
        setIsSubmitting(true);
        setSubmitError(null);
        let answers;
        let workspaceId;
        try {
            answers = {};
            for (const q of props.args.questions) {
                const draft = draftAnswers[q.question];
                if (draft && isQuestionAnswered(q, draft)) {
                    answers[q.question] = draftToAnswerString(q, draft);
                }
                else {
                    // Unanswered questions get empty string
                    answers[q.question] = "";
                }
            }
            assert(api, "API not connected");
            assert(props.workspaceId, "workspaceId is required");
            workspaceId = props.workspaceId;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            setSubmitError(errorMessage);
            setIsSubmitting(false);
            return;
        }
        api.workspace
            .answerAskUserQuestion({
            workspaceId,
            toolCallId: props.toolCallId,
            answers,
        })
            .then((result) => {
            if (!result.success) {
                setSubmitError(result.error);
                return;
            }
            // If the stream was interrupted (e.g. app restart) we need to explicitly
            // kick the resume manager so the assistant continues after answers.
            window.dispatchEvent(createCustomEvent(CUSTOM_EVENTS.RESUME_CHECK_REQUESTED, {
                workspaceId,
                isManual: true,
            }));
        })
            .catch((error) => {
            const errorMessage = error instanceof Error ? error.message : String(error);
            setSubmitError(errorMessage);
        })
            .finally(() => {
            setIsSubmitting(false);
        });
    };
    const title = "ask_user_question";
    return (_jsxs(ToolContainer, { expanded: expanded, children: [_jsxs(ToolHeader, { onClick: toggleExpanded, children: [_jsx(ExpandIcon, { expanded: expanded, children: "\u25B6" }), _jsxs("div", { className: "flex flex-1 flex-col", children: [_jsx(ToolName, { children: title }), _jsx("div", { className: "text-muted-foreground text-xs", children: "Answer below, or type in chat to cancel." })] }), _jsx(StatusIndicator, { status: props.status, children: statusDisplay })] }), expanded && (_jsx(ToolDetails, { children: _jsxs("div", { className: "flex flex-col gap-4", children: [props.status === "executing" && (_jsxs("div", { className: "flex flex-col gap-4", children: [_jsxs("div", { className: "flex flex-wrap gap-2", children: [props.args.questions.map((q, idx) => {
                                            const draft = draftAnswers[q.question];
                                            const answered = draft ? isQuestionAnswered(q, draft) : false;
                                            const isActive = idx === activeIndex;
                                            return (_jsxs("button", { type: "button", className: "text-xs px-2 py-1 rounded border " +
                                                    (isActive
                                                        ? "bg-primary text-primary-foreground border-primary"
                                                        : answered
                                                            ? "bg-green-900/30 text-green-400 border-green-700"
                                                            : "bg-muted text-foreground border-border"), onClick: () => setActiveIndex(idx), children: [q.header, answered && (_jsx(Check, { "aria-hidden": "true", className: "ml-1 inline-block h-3 w-3" }))] }, q.question));
                                        }), _jsxs("button", { type: "button", className: "text-xs px-2 py-1 rounded border " +
                                                (isOnSummary
                                                    ? "bg-primary text-primary-foreground border-primary"
                                                    : isComplete
                                                        ? "bg-green-900/30 text-green-400 border-green-700"
                                                        : "bg-muted text-foreground border-border"), onClick: () => setActiveIndex(summaryIndex), children: ["Summary", isComplete && (_jsx(Check, { "aria-hidden": "true", className: "ml-1 inline-block h-3 w-3" }))] })] }), !isOnSummary && currentQuestion && currentDraft && (_jsxs(_Fragment, { children: [_jsxs("div", { children: [_jsx("div", { className: "text-sm font-medium", children: currentQuestion.question }), _jsx("div", { className: "text-muted-foreground text-xs", children: currentQuestion.multiSelect
                                                        ? "Select one or more options"
                                                        : "Select one option" })] }), _jsxs("div", { className: "flex flex-col gap-3", children: [[
                                                    ...currentQuestion.options.map((opt) => ({
                                                        label: opt.label,
                                                        displayLabel: opt.label,
                                                        description: opt.description,
                                                    })),
                                                    {
                                                        label: OTHER_VALUE,
                                                        displayLabel: "Other",
                                                        description: "Provide a custom answer.",
                                                    },
                                                ].map((opt) => {
                                                    const checked = currentDraft.selected.includes(opt.label);
                                                    const toggle = () => {
                                                        const isSelecting = !checked;
                                                        setDraftAnswers((prev) => {
                                                            const draft = prev[currentQuestion.question] ?? {
                                                                selected: [],
                                                                otherText: "",
                                                            };
                                                            if (currentQuestion.multiSelect) {
                                                                // Multi-select: toggle this option
                                                                const selected = new Set(draft.selected);
                                                                if (selected.has(opt.label)) {
                                                                    selected.delete(opt.label);
                                                                }
                                                                else {
                                                                    selected.add(opt.label);
                                                                }
                                                                return {
                                                                    ...prev,
                                                                    [currentQuestion.question]: {
                                                                        ...draft,
                                                                        selected: Array.from(selected),
                                                                    },
                                                                };
                                                            }
                                                            else {
                                                                // Single-select: replace selection (clear otherText if not Other)
                                                                return {
                                                                    ...prev,
                                                                    [currentQuestion.question]: {
                                                                        selected: checked ? [] : [opt.label],
                                                                        otherText: opt.label === OTHER_VALUE ? draft.otherText : "",
                                                                    },
                                                                };
                                                            }
                                                        });
                                                        // For single-select questions, auto-advance *only* when the user selects
                                                        // a non-Other option (avoid useEffect auto-advance that breaks back-nav).
                                                        if (!currentQuestion.multiSelect &&
                                                            isSelecting &&
                                                            opt.label !== OTHER_VALUE) {
                                                            setActiveIndex((idx) => idx + 1);
                                                        }
                                                    };
                                                    return (_jsxs("div", { role: "button", tabIndex: 0, className: "flex cursor-pointer items-start gap-2 select-none", onClick: toggle, onKeyDown: (e) => {
                                                            if (e.key === "Enter" || e.key === " ") {
                                                                e.preventDefault();
                                                                toggle();
                                                            }
                                                        }, children: [_jsx(Checkbox, { checked: checked, onCheckedChange: toggle, onClick: (e) => e.stopPropagation() }), _jsxs("div", { className: "flex flex-col", children: [_jsx("div", { className: "text-sm", children: opt.displayLabel }), _jsx("div", { className: "text-muted-foreground text-xs", children: opt.description })] })] }, opt.label));
                                                }), currentDraft.selected.includes(OTHER_VALUE) && (_jsx(AutoResizeTextarea, { placeholder: "Type your answer", value: currentDraft.otherText, onChange: (value) => {
                                                        setDraftAnswers((prev) => ({
                                                            ...prev,
                                                            [currentQuestion.question]: {
                                                                ...(prev[currentQuestion.question] ?? {
                                                                    selected: [],
                                                                    otherText: "",
                                                                }),
                                                                otherText: value,
                                                            },
                                                        }));
                                                    }, onSubmit: () => setActiveIndex(activeIndex + 1) }))] })] })), isOnSummary && (_jsxs("div", { className: "flex flex-col gap-2", children: [_jsx("div", { className: "text-sm font-medium", children: "Review your answers" }), unansweredCount > 0 && (_jsxs("div", { className: "flex items-center gap-1 text-xs text-yellow-500", children: [_jsx(AlertTriangle, { "aria-hidden": "true", className: "h-3 w-3" }), _jsxs("span", { children: [unansweredCount, " question", unansweredCount > 1 ? "s" : "", " not answered"] })] })), _jsx("div", { className: "flex flex-col gap-2", children: props.args.questions.map((q, idx) => {
                                                const draft = draftAnswers[q.question];
                                                const answered = draft ? isQuestionAnswered(q, draft) : false;
                                                const answerText = answered ? draftToAnswerString(q, draft) : null;
                                                const descriptions = answered
                                                    ? getDescriptionsForLabels(q, draft.selected)
                                                    : [];
                                                return (_jsx("div", { role: "button", tabIndex: 0, className: "hover:bg-muted/50 -ml-2 cursor-pointer rounded px-2 py-1", onClick: () => setActiveIndex(idx), onKeyDown: (e) => {
                                                        if (e.key === "Enter" || e.key === " ") {
                                                            e.preventDefault();
                                                            setActiveIndex(idx);
                                                        }
                                                    }, children: _jsxs("div", { className: "flex items-start gap-1", children: [answered ? (_jsx(Check, { "aria-hidden": "true", className: "h-3 w-3 text-green-400" })) : (_jsx(AlertTriangle, { "aria-hidden": "true", className: "h-3 w-3 text-yellow-500" })), " ", _jsxs("div", { className: "flex flex-col", children: [_jsxs("div", { children: [_jsxs("span", { className: "font-medium", children: [q.header, ":"] }), " ", answered ? (_jsx("span", { className: "text-muted-foreground", children: answerText })) : (_jsx("span", { className: "text-muted-foreground italic", children: "Not answered" }))] }), descriptions.length > 0 && (_jsx("div", { className: "text-muted-foreground ml-1 text-xs italic", children: descriptions.join("; ") }))] })] }) }, q.question));
                                            }) })] })), _jsx("div", { className: "text-muted-foreground text-xs", children: "Tip: you can also just type a message to respond in chat (this will cancel these questions)." }), submitError && _jsx(ErrorBox, { children: submitError })] })), props.status !== "executing" && (_jsxs("div", { className: "flex flex-col gap-2", children: [successResult && (_jsxs("div", { className: "text-muted-foreground flex flex-col gap-2 text-sm", children: [_jsx("div", { children: "User answered:" }), Object.entries(successResult.answers).map(([question, answer]) => {
                                            const questionDef = successResult.questions.find((q) => q.question === question);
                                            // Parse answer labels (could be comma-separated for multi-select)
                                            const answerLabels = answer.split(",").map((s) => s.trim());
                                            const descriptions = questionDef
                                                ? getDescriptionsForLabels(questionDef, answerLabels)
                                                : [];
                                            return (_jsxs("div", { className: "ml-4 flex flex-col", children: [_jsxs("div", { children: ["\u2022 ", _jsxs("span", { className: "font-medium", children: [question, ":"] }), " ", answer] }), descriptions.length > 0 && (_jsx("div", { className: "text-muted-foreground ml-3 text-xs italic", children: descriptions.join("; ") }))] }, question));
                                        })] })), errorResult && _jsx(ErrorBox, { children: errorResult.error })] })), props.status === "executing" && (_jsx("div", { className: "flex justify-end", children: isOnSummary ? (_jsx(Button, { ref: submitButtonRef, disabled: isSubmitting, onClick: handleSubmit, children: isSubmitting ? "Submitting…" : "Submit answers" })) : (_jsx(Button, { onClick: () => setActiveIndex(activeIndex + 1), children: "Next" })) }))] }) }))] }));
}
//# sourceMappingURL=AskUserQuestionToolCall.js.map