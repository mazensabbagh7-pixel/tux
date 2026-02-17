import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useRef, useEffect } from "react";
import { Plus } from "lucide-react";
export const AddSectionButton = ({ onCreateSection }) => {
    const [isCreating, setIsCreating] = useState(false);
    const [name, setName] = useState("");
    const inputRef = useRef(null);
    useEffect(() => {
        if (isCreating && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isCreating]);
    const handleSubmit = () => {
        const trimmed = name.trim();
        if (trimmed) {
            onCreateSection(trimmed);
        }
        setName("");
        setIsCreating(false);
    };
    if (isCreating) {
        return (_jsxs("div", { className: "flex items-center gap-1 px-2 py-1.5 border-t border-white/10", children: [_jsx("div", { className: "flex h-5 w-5 shrink-0 items-center justify-center", children: _jsx(Plus, { size: 12, className: "text-muted/60" }) }), _jsx("input", { ref: inputRef, type: "text", value: name, onChange: (e) => setName(e.target.value), onBlur: handleSubmit, onKeyDown: (e) => {
                        if (e.key === "Enter")
                            handleSubmit();
                        if (e.key === "Escape") {
                            setName("");
                            setIsCreating(false);
                        }
                    }, placeholder: "Section name...", "data-testid": "add-section-input", className: "bg-background/50 text-foreground min-w-0 flex-1 rounded border border-white/20 px-1.5 py-0.5 text-[11px] outline-none" })] }));
    }
    return (_jsxs("button", { onClick: () => setIsCreating(true), "data-testid": "add-section-button", className: "text-muted/60 hover:text-muted flex w-full cursor-pointer items-center justify-center gap-1 border-t border-white/10 border-l-0 border-r-0 border-b-0 bg-transparent px-2 py-1.5 text-[11px] transition-colors", children: [_jsx(Plus, { size: 12 }), _jsx("span", { children: "Add section" })] }));
};
//# sourceMappingURL=AddSectionButton.js.map