import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Check, Eye, Info, Pencil, Star, Trash2, X } from "lucide-react";
import { createEditKeyHandler } from "@/browser/utils/ui/keybinds";
import { GatewayToggleButton } from "@/browser/components/GatewayToggleButton";
import { cn } from "@/common/lib/utils";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/browser/components/ui/tooltip";
import { ProviderWithIcon } from "@/browser/components/ProviderIcon";
import { Button } from "@/browser/components/ui/button";
import { getModelStats } from "@/common/utils/tokens/modelStats";
/** Format tokens as human-readable string (e.g. 200000 -> "200k") */
function formatTokenCount(tokens) {
    if (tokens >= 1000000) {
        const m = tokens / 1000000;
        return m % 1 === 0 ? `${m}M` : `${m.toFixed(1)}M`;
    }
    if (tokens >= 1000) {
        const k = tokens / 1000;
        return k % 1 === 0 ? `${k}k` : `${k.toFixed(1)}k`;
    }
    return tokens.toString();
}
/** Format cost per million tokens (e.g. 0.000001 -> "$1.00") */
function formatCostPerMillion(costPerToken) {
    const perMillion = costPerToken * 1000000;
    if (perMillion < 0.01)
        return "~$0.00";
    return `$${perMillion.toFixed(2)}`;
}
function ModelTooltipContent(props) {
    return (_jsxs("div", { className: "max-w-xs space-y-2 text-xs", children: [_jsx("div", { className: "text-foreground font-mono", children: props.fullId }), props.aliases && props.aliases.length > 0 && (_jsxs("div", { className: "text-muted", children: [_jsx("span", { className: "text-muted-light", children: "Aliases: " }), props.aliases.join(", ")] })), props.stats && (_jsxs(_Fragment, { children: [_jsx("div", { className: "border-separator-light border-t pt-2", children: _jsxs("div", { className: "grid grid-cols-2 gap-x-3 gap-y-1", children: [_jsx("div", { className: "text-muted-light", children: "Context Window" }), _jsx("div", { className: "text-foreground", children: formatTokenCount(props.stats.max_input_tokens) }), props.stats.max_output_tokens && (_jsxs(_Fragment, { children: [_jsx("div", { className: "text-muted-light", children: "Max Output" }), _jsx("div", { className: "text-foreground", children: formatTokenCount(props.stats.max_output_tokens) })] }))] }) }), _jsxs("div", { className: "border-separator-light border-t pt-2", children: [_jsx("div", { className: "text-muted-light mb-1", children: "Pricing (per 1M tokens)" }), _jsxs("div", { className: "grid grid-cols-2 gap-x-3 gap-y-1", children: [_jsx("div", { className: "text-muted-light", children: "Input" }), _jsx("div", { className: "text-foreground", children: formatCostPerMillion(props.stats.input_cost_per_token) }), _jsx("div", { className: "text-muted-light", children: "Output" }), _jsx("div", { className: "text-foreground", children: formatCostPerMillion(props.stats.output_cost_per_token) }), props.stats.cache_read_input_token_cost !== undefined && (_jsxs(_Fragment, { children: [_jsx("div", { className: "text-muted-light", children: "Cache Read" }), _jsx("div", { className: "text-foreground", children: formatCostPerMillion(props.stats.cache_read_input_token_cost) })] })), props.stats.cache_creation_input_token_cost !== undefined && (_jsxs(_Fragment, { children: [_jsx("div", { className: "text-muted-light", children: "Cache Write" }), _jsx("div", { className: "text-foreground", children: formatCostPerMillion(props.stats.cache_creation_input_token_cost) })] }))] })] })] })), !props.stats && _jsx("div", { className: "text-muted-light italic", children: "No pricing data available" })] }));
}
/**
 * Inline toggle that slides between the model's base context window and 1M.
 * Renders as a compact pill: clicking toggles the state, with the active
 * end highlighted in accent.
 */
function ContextWindowSlider(props) {
    const baseLabel = formatTokenCount(props.baseTokens);
    return (_jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsxs("button", { type: "button", onClick: (e) => {
                        e.stopPropagation();
                        props.onToggle();
                    }, className: "border-border-medium bg-background-tertiary flex items-center gap-px rounded-full border px-0.5 py-px", "aria-label": props.enabled ? "Disable 1M context (beta)" : "Enable 1M context (beta)", children: [_jsx("span", { className: cn("rounded-full px-1.5 py-0.5 text-[10px] leading-none font-medium transition-colors", !props.enabled ? "bg-background-secondary text-foreground" : "text-muted"), children: baseLabel }), _jsx("span", { className: cn("rounded-full px-1.5 py-0.5 font-mono text-[10px] leading-none font-bold transition-colors", props.enabled ? "bg-accent/20 text-accent" : "text-muted"), children: "1M" })] }) }), _jsx(TooltipContent, { side: "top", children: props.enabled ? "1M context enabled (beta)" : "Enable 1M context (beta)" })] }));
}
export function ModelRow(props) {
    const stats = getModelStats(props.fullId);
    // Editing mode - render as a full-width row
    if (props.isEditing) {
        return (_jsx("tr", { className: "border-border-medium border-b", children: _jsxs("td", { colSpan: 4, className: "px-2 py-1.5 md:px-3", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx(ProviderWithIcon, { provider: props.provider, displayName: true, className: "text-muted w-16 shrink-0 overflow-hidden text-xs md:w-20" }), _jsx("input", { type: "text", value: props.editValue ?? props.modelId, onChange: (e) => props.onEditChange?.(e.target.value), onKeyDown: createEditKeyHandler({
                                    onSave: () => props.onSaveEdit?.(),
                                    onCancel: () => props.onCancelEdit?.(),
                                }), className: "bg-modal-bg border-border-medium focus:border-accent min-w-0 flex-1 rounded border px-2 py-0.5 font-mono text-xs focus:outline-none", autoFocus: true }), _jsx(Button, { variant: "ghost", size: "icon", onClick: props.onSaveEdit, disabled: props.saving, className: "text-accent hover:text-accent-dark h-6 w-6", title: "Save changes (Enter)", children: _jsx(Check, { className: "h-3.5 w-3.5" }) }), _jsx(Button, { variant: "ghost", size: "icon", onClick: props.onCancelEdit, disabled: props.saving, className: "text-muted hover:text-foreground h-6 w-6", title: "Cancel (Escape)", children: _jsx(X, { className: "h-3.5 w-3.5" }) })] }), props.editError && _jsx("div", { className: "text-error mt-1 text-xs", children: props.editError })] }) }));
    }
    return (_jsxs("tr", { className: cn("border-border-medium hover:bg-background-secondary/50 group border-b transition-colors", props.isHiddenFromSelector && "opacity-50"), children: [_jsx("td", { className: "w-20 py-1.5 pr-2 pl-2 md:w-24 md:pl-3", children: _jsx(ProviderWithIcon, { provider: props.provider, displayName: true, className: "text-muted overflow-hidden text-xs" }) }), _jsx("td", { className: "min-w-0 py-1.5 pr-2", children: _jsxs("div", { className: "flex min-w-0 items-center gap-2", children: [_jsx("span", { className: "text-foreground min-w-0 truncate font-mono text-xs", children: props.modelId }), props.aliases && props.aliases.length > 0 && (_jsxs("span", { className: "text-muted-light shrink-0 text-xs", children: ["(", props.aliases[0], ")"] }))] }) }), _jsx("td", { className: "w-16 py-1.5 pr-2 md:w-20", children: props.onToggle1MContext && stats ? (_jsx(ContextWindowSlider, { baseTokens: stats.max_input_tokens, enabled: props.is1MContextEnabled ?? false, onToggle: props.onToggle1MContext })) : (_jsx("span", { className: "text-muted block text-right text-xs", children: stats ? formatTokenCount(stats.max_input_tokens) : "—" })) }), _jsx("td", { className: "w-28 py-1.5 pr-2 md:w-32 md:pr-3", children: _jsxs("div", { className: "flex items-center justify-end gap-0.5", children: [_jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("button", { type: "button", className: "text-muted hover:text-foreground p-0.5 transition-colors", "aria-label": "Model details", children: _jsx(Info, { className: "h-3.5 w-3.5" }) }) }), _jsx(TooltipContent, { side: "top", align: "end", className: "p-3", children: _jsx(ModelTooltipContent, { fullId: props.fullId, aliases: props.aliases, stats: stats }) })] }), props.onToggleVisibility && (_jsxs("button", { type: "button", onClick: (e) => {
                                e.stopPropagation();
                                props.onToggleVisibility?.();
                            }, className: cn("relative p-0.5 transition-colors", props.isHiddenFromSelector ? "text-muted-light" : "text-muted hover:text-foreground"), "aria-label": props.isHiddenFromSelector ? "Show in model selector" : "Hide from model selector", children: [_jsx(Eye, { className: cn("h-3.5 w-3.5", props.isHiddenFromSelector ? "opacity-30" : "opacity-70") }), props.isHiddenFromSelector && (_jsx("span", { className: "bg-muted-light absolute inset-0 m-auto h-px w-4 rotate-45" }))] })), props.onToggleGateway && (_jsx(GatewayToggleButton, { active: props.isGatewayEnabled ?? false, onToggle: () => props.onToggleGateway?.() })), _jsx("button", { type: "button", onClick: (e) => {
                                e.stopPropagation();
                                if (!props.isDefault)
                                    props.onSetDefault();
                            }, className: cn("p-0.5 transition-colors", props.isDefault
                                ? "cursor-default text-yellow-400"
                                : "text-muted hover:text-yellow-400"), disabled: props.isDefault, "aria-label": props.isDefault ? "Current default model" : "Set as default model", children: _jsx(Star, { className: cn("h-3.5 w-3.5", props.isDefault && "fill-current") }) }), props.isCustom && (_jsxs(_Fragment, { children: [_jsx("button", { type: "button", onClick: (e) => {
                                        e.stopPropagation();
                                        props.onStartEdit?.();
                                    }, disabled: Boolean(props.saving) || Boolean(props.hasActiveEdit), className: "text-muted hover:text-foreground p-0.5 transition-colors", "aria-label": "Edit model", children: _jsx(Pencil, { className: "h-3.5 w-3.5" }) }), _jsx("button", { type: "button", onClick: (e) => {
                                        e.stopPropagation();
                                        props.onRemove?.();
                                    }, disabled: Boolean(props.saving) || Boolean(props.hasActiveEdit), className: "text-muted hover:text-error p-0.5 transition-colors", "aria-label": "Remove model", children: _jsx(Trash2, { className: "h-3.5 w-3.5" }) })] }))] }) })] }));
}
//# sourceMappingURL=ModelRow.js.map