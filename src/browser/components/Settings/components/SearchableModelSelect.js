import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/browser/components/ui/popover";
import { ProviderIcon } from "@/browser/components/ProviderIcon";
import { stopKeyboardPropagation } from "@/browser/utils/events";
import { cn } from "@/common/lib/utils";
import { getModelName, getModelProvider } from "@/common/utils/ai/models";
/** Searchable model dropdown with keyboard navigation */
export function SearchableModelSelect(props) {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState("");
    const [highlightedIndex, setHighlightedIndex] = useState(0);
    const inputRef = useRef(null);
    const listRef = useRef(null);
    const displayValue = props.emptyOption && !props.value
        ? props.emptyOption.label
        : (getModelName(props.value) ?? props.placeholder ?? "Select model");
    const selectedProvider = props.value ? getModelProvider(props.value) : "";
    // Filter models based on search
    const searchLower = search.toLowerCase();
    const filteredModels = props.models.filter((model) => model.toLowerCase().includes(searchLower) ||
        (getModelName(model)?.toLowerCase().includes(searchLower) ?? false));
    // Build list of all selectable items (empty option + filtered models)
    const items = [];
    if (props.emptyOption) {
        items.push({
            value: props.emptyOption.value,
            label: props.emptyOption.label,
            isMuted: true,
        });
    }
    for (const model of filteredModels) {
        items.push({
            value: model,
            label: getModelName(model) ?? model,
            provider: getModelProvider(model),
        });
    }
    // Reset highlight when search changes
    useEffect(() => {
        setHighlightedIndex(0);
    }, [search]);
    useEffect(() => {
        if (!isOpen) {
            return;
        }
        setSearch("");
        setHighlightedIndex(0);
        // Focus input after popover renders.
        const timer = setTimeout(() => inputRef.current?.focus(), 10);
        return () => clearTimeout(timer);
    }, [isOpen]);
    // Scroll highlighted item into view
    useEffect(() => {
        if (!listRef.current) {
            return;
        }
        const highlighted = listRef.current.querySelector("[data-highlighted=true]");
        if (highlighted) {
            highlighted.scrollIntoView({ block: "nearest" });
        }
    }, [highlightedIndex]);
    const handleSelect = (value) => {
        props.onChange(value);
        setIsOpen(false);
    };
    const handleKeyDown = (e) => {
        switch (e.key) {
            case "ArrowDown":
                e.preventDefault();
                setHighlightedIndex((i) => Math.min(i + 1, items.length - 1));
                break;
            case "ArrowUp":
                e.preventDefault();
                setHighlightedIndex((i) => Math.max(i - 1, 0));
                break;
            case "Enter":
                e.preventDefault();
                if (items[highlightedIndex]) {
                    handleSelect(items[highlightedIndex].value);
                }
                break;
            case "Escape":
                e.preventDefault();
                // Prevent Escape from triggering global handlers (like stream interrupt).
                stopKeyboardPropagation(e);
                setIsOpen(false);
                break;
        }
    };
    return (_jsxs(Popover, { open: isOpen, onOpenChange: setIsOpen, modal: true, children: [_jsx(PopoverTrigger, { asChild: true, children: _jsxs("button", { className: "bg-background-secondary border-border-medium focus:border-accent flex h-8 w-full items-center justify-between rounded border px-2 text-xs", children: [_jsxs("span", { className: cn("flex items-center gap-1.5 truncate", !props.value && props.emptyOption && "text-muted"), children: [selectedProvider && (_jsx(ProviderIcon, { provider: selectedProvider, className: "text-muted shrink-0" })), displayValue] }), _jsx(ChevronDown, { className: "text-muted h-3 w-3 shrink-0" })] }) }), _jsxs(PopoverContent, { align: "start", className: "max-h-[350px] w-[320px] p-0", children: [_jsx("div", { className: "border-border border-b px-2 py-1.5", children: _jsx("input", { ref: inputRef, type: "text", value: search, onChange: (e) => setSearch(e.target.value), onKeyDown: handleKeyDown, placeholder: "Search models...", className: "text-foreground placeholder:text-muted w-full bg-transparent text-xs outline-none" }) }), _jsx("div", { ref: listRef, className: "max-h-[280px] overflow-y-auto p-1", children: items.length === 0 ? (_jsx("div", { className: "text-muted py-2 text-center text-[10px]", children: "No matching models" })) : (items.map((item, index) => (_jsxs("button", { "data-highlighted": index === highlightedIndex, onClick: () => handleSelect(item.value), onMouseEnter: () => setHighlightedIndex(index), className: cn("flex w-full items-center gap-1.5 rounded-sm px-2 py-1 text-xs", index === highlightedIndex ? "bg-hover" : "hover:bg-hover"), children: [_jsx(Check, { className: cn("h-3 w-3 shrink-0", props.value === item.value || (!props.value && !item.value)
                                        ? "opacity-100"
                                        : "opacity-0") }), item.provider && (_jsx(ProviderIcon, { provider: item.provider, className: "text-muted shrink-0" })), _jsx("span", { className: cn("truncate", item.isMuted && "text-muted"), children: item.label })] }, item.value || "__empty__")))) })] })] }));
}
//# sourceMappingURL=SearchableModelSelect.js.map