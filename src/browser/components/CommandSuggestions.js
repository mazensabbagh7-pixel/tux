import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect, useRef, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/common/lib/utils";
import { FileIcon } from "@/browser/components/FileIcon";
// Keys for navigating slash command suggestions.
// Enter or Tab accepts the highlighted suggestion; Shift+Enter inserts a newline.
export const COMMAND_SUGGESTION_KEYS = ["Tab", "Enter", "ArrowUp", "ArrowDown", "Escape"];
// Keys for navigating file path (@mention) suggestions.
//
// Enter accepts the selected file path (then a subsequent Enter sends the message).
export const FILE_SUGGESTION_KEYS = ["Tab", "Enter", "ArrowUp", "ArrowDown", "Escape"];
/**
 * Highlight matching portions of text based on a query.
 * Performs case-insensitive substring matching and highlights all occurrences.
 */
function HighlightedText({ text, query, className, }) {
    if (!query || query.length === 0) {
        return _jsx("span", { className: className, children: text });
    }
    const parts = [];
    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();
    let lastIndex = 0;
    let matchIndex = lowerText.indexOf(lowerQuery);
    while (matchIndex !== -1) {
        // Add non-matching prefix
        if (matchIndex > lastIndex) {
            parts.push(_jsx("span", { className: "opacity-60", children: text.slice(lastIndex, matchIndex) }, `text-${lastIndex}`));
        }
        // Add highlighted match
        parts.push(_jsx("span", { className: "text-light", children: text.slice(matchIndex, matchIndex + query.length) }, `match-${matchIndex}`));
        lastIndex = matchIndex + query.length;
        matchIndex = lowerText.indexOf(lowerQuery, lastIndex);
    }
    // Add remaining non-matching suffix
    if (lastIndex < text.length) {
        parts.push(_jsx("span", { className: "opacity-60", children: text.slice(lastIndex) }, `text-${lastIndex}`));
    }
    return _jsx("span", { className: className, children: parts });
}
// Main component
export const CommandSuggestions = ({ suggestions, onSelectSuggestion, onDismiss, isVisible, ariaLabel = "Command suggestions", listId, anchorRef, highlightQuery, isFileSuggestion = false, }) => {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [position, setPosition] = useState(null);
    const menuRef = useRef(null);
    const selectedRef = useRef(null);
    const previousSuggestionsRef = useRef(suggestions);
    const wasVisibleRef = useRef(isVisible);
    // Keep selection stable while suggestions update (e.g. user keeps typing).
    // We reset selection only when the menu becomes visible.
    useLayoutEffect(() => {
        const wasVisible = wasVisibleRef.current;
        wasVisibleRef.current = isVisible;
        const prevSuggestions = previousSuggestionsRef.current;
        previousSuggestionsRef.current = suggestions;
        if (!isVisible || suggestions.length === 0) {
            setSelectedIndex(0);
            return;
        }
        // Menu just opened: default to the first suggestion.
        if (!wasVisible) {
            setSelectedIndex(0);
            return;
        }
        // Preserve the previously-selected suggestion if it still exists; otherwise clamp.
        setSelectedIndex((prevIndex) => {
            const prevSelected = prevSuggestions[prevIndex];
            if (prevSelected) {
                const nextIndex = suggestions.findIndex((s) => s.id === prevSelected.id);
                if (nextIndex !== -1) {
                    return nextIndex;
                }
            }
            return Math.min(prevIndex, suggestions.length - 1);
        });
    }, [isVisible, suggestions]);
    // Scroll selected item into view
    useLayoutEffect(() => {
        selectedRef.current?.scrollIntoView({ block: "nearest" });
    }, [selectedIndex]);
    // Calculate position when using portal mode
    useLayoutEffect(() => {
        if (!anchorRef?.current || !isVisible) {
            setPosition(null);
            return;
        }
        const updatePosition = () => {
            const anchor = anchorRef.current;
            if (!anchor)
                return;
            const rect = anchor.getBoundingClientRect();
            const menuHeight = menuRef.current?.offsetHeight ?? 200;
            setPosition({
                top: rect.top - menuHeight - 8, // 8px gap above anchor
                left: rect.left,
                width: rect.width,
            });
        };
        updatePosition();
        // Update on resize/scroll
        window.addEventListener("resize", updatePosition);
        window.addEventListener("scroll", updatePosition, true);
        return () => {
            window.removeEventListener("resize", updatePosition);
            window.removeEventListener("scroll", updatePosition, true);
        };
    }, [anchorRef, isVisible, suggestions]);
    // Handle keyboard navigation
    useEffect(() => {
        if (!isVisible || suggestions.length === 0)
            return;
        const handleKeyDown = (e) => {
            switch (e.key) {
                case "ArrowDown":
                    e.preventDefault();
                    setSelectedIndex((i) => (i + 1) % suggestions.length);
                    break;
                case "ArrowUp":
                    e.preventDefault();
                    setSelectedIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
                    break;
                case "Tab":
                    if (!e.shiftKey && suggestions.length > 0) {
                        e.preventDefault();
                        onSelectSuggestion(suggestions[selectedIndex]);
                    }
                    break;
                case "Enter":
                    if (!e.shiftKey && suggestions.length > 0) {
                        e.preventDefault();
                        onSelectSuggestion(suggestions[selectedIndex]);
                    }
                    break;
                case "Escape":
                    e.preventDefault();
                    e.stopPropagation();
                    onDismiss();
                    break;
            }
        };
        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [isVisible, suggestions, selectedIndex, onSelectSuggestion, onDismiss, isFileSuggestion]);
    // Click outside handler
    useEffect(() => {
        if (!isVisible)
            return;
        const handleClickOutside = (e) => {
            const target = e.target;
            if (!target.closest("[data-command-suggestions]")) {
                onDismiss();
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [isVisible, onDismiss]);
    if (!isVisible || suggestions.length === 0) {
        return null;
    }
    const activeSuggestion = suggestions[selectedIndex] ?? suggestions[0];
    const resolvedListId = listId ?? `command-suggestions-list`;
    const content = (_jsxs("div", { ref: menuRef, id: resolvedListId, role: "listbox", "aria-label": ariaLabel, "aria-activedescendant": activeSuggestion ? `${resolvedListId}-option-${activeSuggestion.id}` : undefined, "data-command-suggestions": true, className: cn("bg-separator border-border-light z-[1010] flex max-h-[200px] flex-col overflow-y-auto rounded border shadow-[0_-4px_12px_rgba(0,0,0,0.4)]", 
        // Use absolute positioning relative to parent when not in portal mode
        !anchorRef && "absolute right-0 bottom-full left-0 mb-2"), style: anchorRef && position
            ? {
                position: "fixed",
                top: position.top,
                left: position.left,
                width: position.width,
            }
            : undefined, children: [suggestions.map((suggestion, index) => (_jsxs("div", { ref: index === selectedIndex ? selectedRef : undefined, onMouseEnter: () => setSelectedIndex(index), onClick: () => onSelectSuggestion(suggestion), id: `${resolvedListId}-option-${suggestion.id}`, role: "option", "aria-selected": index === selectedIndex, className: cn("cursor-pointer flex items-center gap-2 px-2.5 py-1.5 hover:bg-hover", index === selectedIndex ? "bg-hover" : "bg-transparent"), children: [isFileSuggestion && (_jsx(FileIcon, { filePath: suggestion.display, className: "shrink-0 text-sm" })), _jsx("div", { className: cn("font-monospace text-foreground text-xs", isFileSuggestion ? "min-w-0 flex-1 truncate" : "shrink-0 whitespace-nowrap"), children: _jsx(HighlightedText, { text: suggestion.display, query: highlightQuery }) }), _jsx("div", { className: cn("text-secondary min-w-0 truncate text-[11px]", isFileSuggestion ? "max-w-[70%]" : "flex-1 text-right"), title: suggestion.description, children: suggestion.description })] }, suggestion.id))), _jsxs("div", { className: "border-border-light bg-dark text-placeholder [&_span]:text-medium shrink-0 border-t px-2.5 py-1 text-center text-[10px] [&_span]:font-medium", children: [_jsx("span", { children: "Enter" }), " or ", _jsx("span", { children: "Tab" }), " to complete \u2022 ", _jsx("span", { children: "\u2191\u2193" }), " to navigate \u2022", " ", _jsx("span", { children: "Esc" }), " to dismiss"] })] }));
    // Use portal when anchorRef is provided (to escape overflow:hidden containers)
    if (anchorRef) {
        return createPortal(content, document.body);
    }
    return content;
};
//# sourceMappingURL=CommandSuggestions.js.map