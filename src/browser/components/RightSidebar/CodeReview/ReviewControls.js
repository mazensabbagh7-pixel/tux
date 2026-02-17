import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { usePersistedState } from "@/browser/hooks/usePersistedState";
import { STORAGE_KEYS, WORKSPACE_DEFAULTS } from "@/constants/workspaceDefaults";
import { RefreshButton } from "./RefreshButton";
import { BaseSelectorPopover } from "./BaseSelectorPopover";
const SORT_OPTIONS = [
    { value: "file-order", label: "File order" },
    { value: "last-edit", label: "Last edit" },
];
export const ReviewControls = ({ filters, stats, onFiltersChange, onRefresh, isLoading = false, isRefreshBlocked = false, projectPath, lastRefreshInfo, }) => {
    // Per-project default base (used for new workspaces in this project)
    const [defaultBase, setDefaultBase] = usePersistedState(STORAGE_KEYS.reviewDefaultBase(projectPath), WORKSPACE_DEFAULTS.reviewBase, { listener: true });
    // Use callback form to avoid stale closure issues with filters prop
    const handleBaseChange = (value) => {
        onFiltersChange((prev) => ({ ...prev, diffBase: value }));
    };
    const handleUncommittedToggle = (e) => {
        const checked = e.target.checked;
        onFiltersChange((prev) => ({ ...prev, includeUncommitted: checked }));
    };
    const handleShowReadToggle = (e) => {
        const checked = e.target.checked;
        onFiltersChange((prev) => ({ ...prev, showReadHunks: checked }));
    };
    const handleSortChange = (e) => {
        const sortOrder = e.target.value;
        onFiltersChange((prev) => ({ ...prev, sortOrder }));
    };
    const handleSetDefault = () => {
        setDefaultBase(filters.diffBase);
    };
    // Show "Set Default" button if current base is different from default
    const showSetDefault = filters.diffBase !== defaultBase;
    return (_jsxs("div", { className: "border-border-light flex flex-wrap items-center gap-2 border-b px-2 py-1 text-[11px]", children: [onRefresh && (_jsx(RefreshButton, { onClick: onRefresh, isLoading: isLoading, disabled: isRefreshBlocked, lastRefreshInfo: lastRefreshInfo })), _jsxs("div", { className: "text-muted flex items-center gap-1 whitespace-nowrap", "data-testid": "review-base-selector", children: [_jsx("span", { children: "Base:" }), _jsx(BaseSelectorPopover, { value: filters.diffBase, onChange: handleBaseChange, "data-testid": "review-base-value" }), showSetDefault && (_jsx("button", { onClick: handleSetDefault, className: "text-dim font-primary hover:text-muted cursor-pointer border-none bg-transparent p-0 text-[10px] whitespace-nowrap transition-colors duration-150", title: "Set as default base", children: "\u2605" }))] }), _jsx("div", { className: "bg-border-light h-3 w-px" }), _jsxs("label", { className: "text-muted hover:text-foreground flex cursor-pointer items-center gap-1 whitespace-nowrap", children: [_jsx("span", { children: "Uncommitted:" }), _jsx("input", { type: "checkbox", checked: filters.includeUncommitted, onChange: handleUncommittedToggle, className: "h-3 w-3 cursor-pointer" })] }), _jsx("div", { className: "bg-border-light h-3 w-px" }), _jsxs("label", { className: "text-muted hover:text-foreground flex cursor-pointer items-center gap-1 whitespace-nowrap", children: [_jsx("span", { children: "Read:" }), _jsx("input", { type: "checkbox", checked: filters.showReadHunks, onChange: handleShowReadToggle, className: "h-3 w-3 cursor-pointer" })] }), _jsx("div", { className: "bg-border-light h-3 w-px" }), _jsxs("label", { className: "text-muted flex items-center gap-1 whitespace-nowrap", children: [_jsx("span", { children: "Sort:" }), _jsx("select", { "aria-label": "Sort hunks by", value: filters.sortOrder, onChange: handleSortChange, className: "text-muted-light hover:bg-hover hover:text-foreground cursor-pointer rounded-sm bg-transparent px-1 py-0.5 font-mono transition-colors focus:outline-none", children: SORT_OPTIONS.map((opt) => (_jsx("option", { value: opt.value, children: opt.label }, opt.value))) })] }), _jsxs("span", { className: "text-dim ml-auto whitespace-nowrap", children: [stats.read, "/", stats.total] })] }));
};
//# sourceMappingURL=ReviewControls.js.map