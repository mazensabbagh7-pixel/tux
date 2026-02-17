import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Select as ShadcnSelect, SelectContent, SelectItem, SelectTrigger, SelectValue, } from "@/browser/components/ui/select";
/**
 * Reusable select component with consistent styling
 * Wraps shadcn Select with a simpler API for common use cases
 */
export function Select({ value, options, onChange, disabled = false, className = "", id, "aria-label": ariaLabel, }) {
    // Normalize options to SelectOption format
    const normalizedOptions = options.map((opt) => typeof opt === "string" ? { value: opt, label: opt } : opt);
    return (_jsxs(ShadcnSelect, { value: value, onValueChange: onChange, disabled: disabled, children: [_jsx(SelectTrigger, { id: id, className: className, "aria-label": ariaLabel, children: _jsx(SelectValue, {}) }), _jsx(SelectContent, { children: normalizedOptions.map((opt) => (_jsx(SelectItem, { value: opt.value, children: opt.label }, opt.value))) })] }));
}
//# sourceMappingURL=Select.js.map