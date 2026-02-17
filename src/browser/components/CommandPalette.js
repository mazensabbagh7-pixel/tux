import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Command } from "cmdk";
import { useCommandRegistry } from "@/browser/contexts/CommandRegistryContext";
import { useAPI } from "@/browser/contexts/API";
import { usePersistedState } from "@/browser/hooks/usePersistedState";
import { formatKeybind, KEYBINDS, isEditableElement, matchesKeybind, } from "@/browser/utils/ui/keybinds";
import { stopKeyboardPropagation } from "@/browser/utils/events";
import { getSlashCommandSuggestions } from "@/browser/utils/slashCommands/suggestions";
import { CUSTOM_EVENTS, createCustomEvent } from "@/common/constants/events";
import { getDisableWorkspaceAgentsKey, GLOBAL_SCOPE_ID } from "@/common/constants/storage";
import { filterCommandsByPrefix } from "@/browser/utils/commandPaletteFiltering";
import { matchesAllTerms } from "@/browser/utils/fuzzySearch";
export const CommandPalette = ({ getSlashContext }) => {
    const { api } = useAPI();
    const slashContext = getSlashContext?.();
    const slashWorkspaceId = slashContext?.workspaceId;
    const [disableWorkspaceAgents] = usePersistedState(getDisableWorkspaceAgentsKey(slashWorkspaceId ?? GLOBAL_SCOPE_ID), false, { listener: true });
    const [agentSkills, setAgentSkills] = useState([]);
    const agentSkillsCacheRef = useRef(new Map());
    const { isOpen, initialQuery, close, getActions, addRecent, recent } = useCommandRegistry();
    const [query, setQuery] = useState("");
    const [activePrompt, setActivePrompt] = useState(null);
    const [promptError, setPromptError] = useState(null);
    const resetPaletteState = useCallback(() => {
        setActivePrompt(null);
        setPromptError(null);
        setQuery("");
    }, []);
    // Close palette with Escape
    useEffect(() => {
        const onKey = (e) => {
            if (matchesKeybind(e, KEYBINDS.CANCEL) && isOpen) {
                // Intercept Escape in capture phase so it doesn't reach global bubble handlers
                // (e.g., stream interrupt).
                e.preventDefault();
                e.stopPropagation();
                resetPaletteState();
                close();
            }
        };
        window.addEventListener("keydown", onKey, { capture: true });
        return () => window.removeEventListener("keydown", onKey, { capture: true });
    }, [isOpen, close, resetPaletteState]);
    // useLayoutEffect fires after DOM commit but before browser paint —
    // ensures ">" appears in the input on the very first visible frame
    // when opening via F1, with no flash.
    useLayoutEffect(() => {
        if (isOpen) {
            setQuery(initialQuery);
        }
        else {
            resetPaletteState();
        }
    }, [isOpen, initialQuery, resetPaletteState]);
    useEffect(() => {
        if (!isOpen || !api || !slashWorkspaceId) {
            setAgentSkills([]);
            return;
        }
        const cacheKey = `${slashWorkspaceId}:${disableWorkspaceAgents ? "project" : "worktree"}`;
        const cached = agentSkillsCacheRef.current.get(cacheKey);
        if (cached) {
            setAgentSkills(cached);
            return;
        }
        let cancelled = false;
        api.agentSkills
            .list({
            workspaceId: slashWorkspaceId,
            disableWorkspaceAgents: disableWorkspaceAgents || undefined,
        })
            .then((skills) => {
            if (cancelled)
                return;
            agentSkillsCacheRef.current.set(cacheKey, skills);
            setAgentSkills(skills);
        })
            .catch(() => {
            if (cancelled)
                return;
            setAgentSkills([]);
        });
        return () => {
            cancelled = true;
        };
    }, [api, isOpen, slashWorkspaceId, disableWorkspaceAgents]);
    const rawActions = getActions();
    const recentIndex = useMemo(() => {
        const idx = new Map();
        recent.forEach((id, i) => idx.set(id, i));
        return idx;
    }, [recent]);
    const startPrompt = useCallback((action) => {
        if (!action.prompt)
            return;
        setPromptError(null);
        setQuery("");
        setActivePrompt({
            title: action.prompt.title ?? action.title,
            fields: action.prompt.fields,
            onSubmit: action.prompt.onSubmit,
            idx: 0,
            values: {},
        });
    }, []);
    // Listen for EXECUTE_COMMAND events
    useEffect(() => {
        const handleExecuteCommand = (e) => {
            const customEvent = e;
            const { commandId } = customEvent.detail;
            const action = getActions().find((a) => a.id === commandId);
            if (!action) {
                console.warn(`Command not found: ${commandId}`);
                return;
            }
            // Run the action directly
            void action.run();
            addRecent(action.id);
        };
        window.addEventListener(CUSTOM_EVENTS.EXECUTE_COMMAND, handleExecuteCommand);
        return () => window.removeEventListener(CUSTOM_EVENTS.EXECUTE_COMMAND, handleExecuteCommand);
    }, [getActions, startPrompt, addRecent]);
    const handlePromptValue = useCallback((value) => {
        let nextInitial = null;
        setPromptError(null);
        setActivePrompt((current) => {
            if (!current)
                return current;
            const field = current.fields[current.idx];
            if (!field)
                return current;
            const nextValues = { ...current.values, [field.name]: value };
            const nextIdx = current.idx + 1;
            if (nextIdx < current.fields.length) {
                const nextField = current.fields[nextIdx];
                if (nextField.type === "text") {
                    nextInitial = nextField.getInitialValue?.(nextValues) ?? nextField.initialValue ?? "";
                }
                else {
                    nextInitial = "";
                }
                return {
                    ...current,
                    idx: nextIdx,
                    values: nextValues,
                };
            }
            const submit = current.onSubmit;
            setTimeout(() => void submit(nextValues), 0);
            close();
            setQuery("");
            return null;
        });
        if (nextInitial !== null) {
            const valueToSet = nextInitial;
            setTimeout(() => setQuery(valueToSet), 0);
        }
    }, [close]);
    const handlePromptTextSubmit = useCallback(() => {
        if (!activePrompt)
            return;
        const field = activePrompt.fields[activePrompt.idx];
        if (field?.type !== "text")
            return;
        const trimmed = query.trim();
        const err = field.validate?.(trimmed) ?? null;
        if (err) {
            setPromptError(err);
            return;
        }
        handlePromptValue(trimmed);
    }, [activePrompt, query, handlePromptValue]);
    const handleQueryChange = useCallback((value) => {
        setQuery(value);
        if (activePrompt) {
            setPromptError(null);
        }
    }, [activePrompt]);
    const generalResults = useMemo(() => {
        const q = query.trim();
        if (q.startsWith("/")) {
            const ctx = getSlashContext?.() ?? {};
            const suggestions = getSlashCommandSuggestions(q, {
                agentSkills,
                variant: ctx.workspaceId ? "workspace" : "creation",
            });
            const section = "Slash Commands";
            const groups = [
                {
                    name: section,
                    items: suggestions.map((s) => ({
                        id: `slash:${s.id}`,
                        title: s.display,
                        subtitle: s.description,
                        section,
                        shortcutHint: `${formatKeybind(KEYBINDS.SEND_MESSAGE)} to insert`,
                        run: () => {
                            const text = s.replacement;
                            window.dispatchEvent(createCustomEvent(CUSTOM_EVENTS.UPDATE_CHAT_INPUT, {
                                text,
                                mode: "append",
                            }));
                        },
                    })),
                },
            ];
            return {
                groups,
                emptyText: suggestions.length ? undefined : "No command suggestions",
            };
        }
        // Filter actions based on prefix (extracted to utility for testing)
        const actionsToShow = filterCommandsByPrefix(q, rawActions);
        const filtered = [...actionsToShow].sort((a, b) => {
            const ai = recentIndex.has(a.id) ? recentIndex.get(a.id) : 9999;
            const bi = recentIndex.has(b.id) ? recentIndex.get(b.id) : 9999;
            if (ai !== bi)
                return ai - bi;
            return a.title.localeCompare(b.title);
        });
        const bySection = new Map();
        for (const action of filtered) {
            const sec = action.section || "Other";
            const list = bySection.get(sec) ?? [];
            list.push(action);
            bySection.set(sec, list);
        }
        const groups = Array.from(bySection.entries()).map(([name, items]) => ({
            name,
            items,
        }));
        return {
            groups,
            emptyText: filtered.length ? undefined : "No results",
        };
    }, [query, rawActions, recentIndex, getSlashContext, agentSkills]);
    useEffect(() => {
        if (!activePrompt)
            return;
        const field = activePrompt.fields[activePrompt.idx];
        if (!field)
            return;
        if (field.type === "text") {
            const initial = field.getInitialValue?.(activePrompt.values) ?? field.initialValue ?? "";
            setQuery(initial);
        }
        else {
            setQuery("");
        }
    }, [activePrompt]);
    const [selectOptions, setSelectOptions] = useState([]);
    const [isLoadingOptions, setIsLoadingOptions] = useState(false);
    const currentField = activePrompt
        ? (activePrompt.fields[activePrompt.idx] ?? null)
        : null;
    useEffect(() => {
        // Select prompts can return options synchronously or as a promise. This effect normalizes
        // both flows, keeps the loading state in sync, and bails out early if the prompt switches
        // while a request is in flight.
        let cancelled = false;
        const resetState = () => {
            if (cancelled)
                return;
            setSelectOptions([]);
            setIsLoadingOptions(false);
        };
        const hydrateSelectOptions = async () => {
            if (currentField?.type !== "select") {
                resetState();
                return;
            }
            setIsLoadingOptions(true);
            try {
                const rawOptions = await Promise.resolve(currentField.getOptions(activePrompt?.values ?? {}));
                if (!Array.isArray(rawOptions)) {
                    throw new Error("Prompt select options must resolve to an array");
                }
                if (!cancelled) {
                    setSelectOptions(rawOptions);
                }
            }
            catch (error) {
                if (!cancelled) {
                    console.error("Failed to resolve prompt select options", error);
                    setSelectOptions([]);
                }
            }
            finally {
                if (!cancelled) {
                    setIsLoadingOptions(false);
                }
            }
        };
        void hydrateSelectOptions();
        return () => {
            cancelled = true;
        };
    }, [currentField, activePrompt]);
    const isSlashQuery = !currentField && query.trim().startsWith("/");
    const isCommandQuery = !currentField && query.trim().startsWith(">");
    // Enable cmdk filtering for all cases except slash queries (which we handle manually)
    const shouldUseCmdkFilter = currentField ? currentField.type === "select" : !isSlashQuery;
    let groups = generalResults.groups;
    let emptyText = generalResults.emptyText;
    if (currentField) {
        const promptTitle = activePrompt?.title ?? currentField.label ?? "Provide details";
        if (currentField.type === "select") {
            const options = selectOptions;
            groups = [
                {
                    name: promptTitle,
                    items: options.map((opt) => ({
                        id: `prompt-select:${currentField.name}:${opt.id}`,
                        title: opt.label,
                        section: promptTitle,
                        keywords: opt.keywords,
                        run: () => handlePromptValue(opt.id),
                    })),
                },
            ];
            emptyText = isLoadingOptions
                ? "Loading options..."
                : options.length
                    ? undefined
                    : "No options";
        }
        else {
            const typed = query.trim();
            const fallbackHint = currentField.placeholder ?? "Type value and press Enter";
            const hint = promptError ?? (typed.length > 0 ? `Press Enter to use “${typed}”` : fallbackHint);
            groups = [
                {
                    name: promptTitle,
                    items: [
                        {
                            id: `prompt-text:${currentField.name}`,
                            title: hint,
                            section: promptTitle,
                            run: handlePromptTextSubmit,
                        },
                    ],
                },
            ];
            emptyText = undefined;
        }
    }
    if (!isOpen)
        return null;
    const groupsWithItems = groups.filter((group) => group.items.length > 0);
    const hasAnyItems = groupsWithItems.length > 0;
    return (_jsx("div", { className: "fixed inset-0 z-[2000] flex items-start justify-center bg-black/40 pt-[10vh]", onMouseDown: () => {
            resetPaletteState();
            close();
        }, children: _jsxs(Command, { className: "font-primary w-[min(720px,92vw)] overflow-hidden rounded-lg border border-[var(--color-command-border)] bg-[var(--color-command-surface)] text-[var(--color-command-foreground)] shadow-[0_10px_40px_rgba(0,0,0,0.4)]", onMouseDown: (e) => e.stopPropagation(), shouldFilter: shouldUseCmdkFilter, filter: (value, search, keywords) => {
                // We intentionally *don't* use cmdk's scoring/ranking so we can keep our
                // stable ordering (recent-first, then alphabetical). We just decide
                // whether an item matches and return 1|0.
                //
                // This is expected to feel more like fzf:
                // - space-separated terms are ANDed
                // - formatting punctuation doesn't block matches (e.g. `Ask: check` vs `ask check`)
                const searchableText = keywords ? `${value} ${keywords.join(" ")}` : value;
                // When using ">" prefix, filter using the text after ">".
                if (isCommandQuery && search.startsWith(">")) {
                    return matchesAllTerms(searchableText, search.slice(1).trim()) ? 1 : 0;
                }
                return matchesAllTerms(searchableText, search) ? 1 : 0;
            }, children: [_jsx(Command.Input, { className: "w-full border-b border-[var(--color-command-input-border)] bg-[var(--color-command-input)] px-3.5 py-3 text-sm text-[var(--color-command-foreground)] outline-none placeholder:text-[var(--color-command-subdued)]", value: query, onValueChange: handleQueryChange, placeholder: currentField
                        ? currentField.type === "text"
                            ? (currentField.placeholder ?? "Type value…")
                            : (currentField.placeholder ?? "Search options…")
                        : `Switch workspaces or type > for all commands, / for slash commands…`, autoFocus: true, onKeyDown: (e) => {
                        if (!currentField && isEditableElement(e.target))
                            return;
                        if (currentField) {
                            if (e.key === "Enter" && currentField.type === "text") {
                                e.preventDefault();
                                stopKeyboardPropagation(e);
                                handlePromptTextSubmit();
                            }
                            else if (e.key === "Escape") {
                                e.preventDefault();
                                stopKeyboardPropagation(e);
                                resetPaletteState();
                                close();
                            }
                            return;
                        }
                    } }), _jsxs(Command.List, { className: "max-h-[420px] overflow-auto", children: [groupsWithItems.map((group) => (_jsx(Command.Group, { heading: _jsx("div", { className: "px-2.5 py-1 text-[11px] tracking-[0.08em] text-[var(--color-command-subdued)] uppercase", children: group.name }), className: "px-1.5 py-2", children: group.items.map((item) => {
                                // Always include subtitle in keywords so searches can match secondary
                                // info (e.g. workspace "streaming" status).
                                const itemKeywords = (() => {
                                    const keywords = [
                                        ...(item.keywords ?? []),
                                        ...(item.subtitle ? [item.subtitle] : []),
                                    ]
                                        .map((k) => k.trim())
                                        .filter((k) => k.length > 0);
                                    if (keywords.length === 0) {
                                        return undefined;
                                    }
                                    return Array.from(new Set(keywords));
                                })();
                                return (_jsxs(Command.Item, { value: item.title, keywords: itemKeywords, className: "hover:bg-hover aria-selected:bg-hover mx-1 my-0.5 grid cursor-pointer grid-cols-[1fr_auto] items-center gap-2 rounded-md px-3 py-2 text-[13px] aria-selected:text-[var(--color-command-foreground)]", onSelect: () => {
                                        if ("prompt" in item && item.prompt) {
                                            addRecent(item.id);
                                            startPrompt(item);
                                            return;
                                        }
                                        if (currentField) {
                                            void item.run();
                                            return;
                                        }
                                        addRecent(item.id);
                                        close();
                                        setTimeout(() => {
                                            void item.run();
                                        }, 0);
                                    }, children: [_jsxs("div", { children: [item.title, "subtitle" in item && item.subtitle && (_jsxs(_Fragment, { children: [_jsx("br", {}), _jsx("span", { className: "text-xs text-[var(--color-command-subdued)]", children: item.subtitle })] }))] }), "shortcutHint" in item && item.shortcutHint && (_jsx("span", { className: "font-monospace text-[11px] text-[var(--color-command-subdued)]", children: item.shortcutHint }))] }, item.id));
                            }) }, group.name))), !hasAnyItems && (_jsx("div", { className: "p-4 text-[13px] text-[var(--color-command-subdued)]", children: emptyText ?? "No results" }))] })] }) }));
};
//# sourceMappingURL=CommandPalette.js.map