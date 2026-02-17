import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * BaseSelectorPopover - Dropdown for selecting diff base (similar to BranchSelector)
 *
 * Uses conditional rendering (not Radix Portal) to enable testing in happy-dom.
 * Pattern follows AgentModePicker.
 */
import { useState, useRef, useEffect } from "react";
import { Check } from "lucide-react";
import { cn } from "@/common/lib/utils";
const BASE_SUGGESTIONS = [
    "HEAD",
    "--staged",
    "main",
    "origin/main",
    "HEAD~1",
    "HEAD~2",
    "develop",
    "origin/develop",
];
export function BaseSelectorPopover({ value, onChange, onOpenChange, className, "data-testid": testId, }) {
    const [isOpen, setIsOpen] = useState(false);
    const [inputValue, setInputValue] = useState(value);
    const inputRef = useRef(null);
    const containerRef = useRef(null);
    const handleOpenChange = (open) => {
        setIsOpen(open);
        onOpenChange?.(open);
    };
    // Sync input with external value changes
    useEffect(() => {
        setInputValue(value);
    }, [value]);
    // Clear search and focus input when dropdown opens
    useEffect(() => {
        if (isOpen) {
            setInputValue(""); // Clear to show all suggestions
            setTimeout(() => inputRef.current?.focus(), 0);
        }
    }, [isOpen]);
    // Close dropdown on outside click
    useEffect(() => {
        if (!isOpen)
            return;
        const handleClickOutside = (e) => {
            if (containerRef.current && !containerRef.current.contains(e.target)) {
                setIsOpen(false);
                onOpenChange?.(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [isOpen, onOpenChange]);
    const handleSelect = (selected) => {
        onChange(selected);
        setInputValue(selected);
        handleOpenChange(false);
    };
    const handleInputKeyDown = (e) => {
        if (e.key === "Enter") {
            const trimmed = inputValue.trim();
            if (trimmed) {
                onChange(trimmed);
                handleOpenChange(false);
            }
        }
        else if (e.key === "Escape") {
            setInputValue(value);
            handleOpenChange(false);
        }
    };
    // Filter suggestions based on input
    const searchLower = inputValue.toLowerCase();
    const filteredSuggestions = BASE_SUGGESTIONS.filter((s) => s.toLowerCase().includes(searchLower));
    return (_jsxs("div", { ref: containerRef, className: "relative", children: [_jsx("button", { className: cn("text-muted-light hover:bg-hover hover:text-foreground flex items-center gap-1 rounded-sm px-1 py-0.5 font-mono text-[11px] transition-colors", className), "data-testid": testId, onClick: () => handleOpenChange(!isOpen), "aria-expanded": isOpen, children: _jsx("span", { className: "truncate", children: value }) }), isOpen && (_jsxs("div", { className: "bg-dark border-border absolute top-full left-0 z-[10001] mt-1 w-[160px] overflow-hidden rounded-md border shadow-md", children: [_jsx("div", { className: "border-border border-b px-2 py-1.5", children: _jsx("input", { ref: inputRef, type: "text", value: inputValue, onChange: (e) => setInputValue(e.target.value), onKeyDown: handleInputKeyDown, placeholder: "Enter base...", className: "text-foreground placeholder:text-muted w-full bg-transparent font-mono text-[11px] outline-none" }) }), _jsx("div", { className: "max-h-[200px] overflow-y-auto p-1", children: filteredSuggestions.length === 0 ? (_jsxs("div", { className: "text-muted py-2 text-center text-[10px]", children: ["Press Enter to use \u201C", inputValue, "\u201D"] })) : (filteredSuggestions.map((suggestion) => (_jsxs("button", { "data-testid": `base-suggestion-${suggestion}`, onMouseDown: (e) => e.preventDefault(), onClick: () => handleSelect(suggestion), className: "hover:bg-hover flex w-full items-center gap-1.5 rounded-sm px-2 py-1 font-mono text-[11px]", children: [_jsx(Check, { className: cn("h-3 w-3 shrink-0", suggestion === value ? "opacity-100" : "opacity-0") }), _jsx("span", { className: "truncate", children: suggestion })] }, suggestion)))) })] }))] }));
}
//# sourceMappingURL=BaseSelectorPopover.js.map