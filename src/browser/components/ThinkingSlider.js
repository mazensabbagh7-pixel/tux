import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { THINKING_LEVELS, getThinkingDisplayLabel, } from "@/common/types/thinking";
import { useThinkingLevel } from "@/browser/hooks/useThinkingLevel";
import { Tooltip, TooltipTrigger, TooltipContent } from "./ui/tooltip";
import { formatKeybind, KEYBINDS } from "@/browser/utils/ui/keybinds";
import { enforceThinkingPolicy, getThinkingPolicyForModel } from "@/common/utils/thinking/policy";
import { cn } from "@/common/lib/utils";
// Uses CSS variable --color-thinking-mode for theme compatibility
// All levels are shown; policy determines which are available per model
const BASE_THINKING_LEVELS = [...THINKING_LEVELS];
// Text styling based on level (n: 0-5, mapping off/low/medium/high/xhigh/max)
// Uses CSS variables for theme compatibility
const getTextStyle = (n) => {
    if (n === 0) {
        return {
            color: "var(--color-text-secondary)",
            fontWeight: 400,
        };
    }
    // Active levels use the thinking mode color
    // Low uses lighter variant, medium/high use main color
    const fontWeight = 400 + n * 100; // 500 → 600 → 700
    return {
        color: n === 1 ? "var(--color-thinking-mode-light)" : "var(--color-thinking-mode)",
        fontWeight,
    };
};
export const ThinkingSliderComponent = ({ modelString }) => {
    const [thinkingLevel, setThinkingLevel] = useThinkingLevel();
    const allowed = getThinkingPolicyForModel(modelString);
    const effectiveThinkingLevel = enforceThinkingPolicy(modelString, thinkingLevel);
    // Map current level to index within the *allowed* subset
    const currentIndex = allowed.indexOf(effectiveThinkingLevel);
    // Map levels to visual intensity indices (0-3) so colors stay consistent
    const visualValue = (() => {
        const idx = BASE_THINKING_LEVELS.indexOf(effectiveThinkingLevel);
        if (idx >= 0)
            return idx;
        return BASE_THINKING_LEVELS.length - 1; // clamp extras (e.g., xhigh) to strongest
    })();
    const textStyle = getTextStyle(visualValue);
    const canGoLeft = currentIndex > 0;
    const canGoRight = currentIndex < allowed.length - 1;
    const goLeft = () => {
        if (canGoLeft) {
            setThinkingLevel(allowed[currentIndex - 1]);
        }
    };
    const goRight = () => {
        if (canGoRight) {
            setThinkingLevel(allowed[currentIndex + 1]);
        }
    };
    const displayLabel = getThinkingDisplayLabel(effectiveThinkingLevel, modelString);
    // Single-option policy: render non-interactive badge
    if (allowed.length <= 1) {
        const fixedLevel = allowed[0] || "off";
        const standardIndex = BASE_THINKING_LEVELS.indexOf(fixedLevel);
        const value = standardIndex === -1 ? 0 : standardIndex;
        const tooltipMessage = `Model ${modelString} locks thinking at ${getThinkingDisplayLabel(fixedLevel, modelString)} to match its capabilities.`;
        return (_jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("div", { className: "flex items-center", children: _jsx("span", { className: "w-[5ch] text-center text-[11px] select-none", style: getTextStyle(value), "aria-label": `Thinking level fixed to ${fixedLevel}`, children: getThinkingDisplayLabel(fixedLevel, modelString) }) }) }), _jsx(TooltipContent, { align: "center", children: tooltipMessage })] }));
    }
    return (_jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsxs("div", { className: "flex items-center", children: [_jsx("button", { type: "button", onClick: goLeft, disabled: !canGoLeft, "data-thinking-paddle": "left", className: cn("flex h-4 w-4 items-center justify-center rounded-sm transition-colors", canGoLeft
                                ? "text-muted hover:bg-hover hover:text-foreground cursor-pointer"
                                : "text-muted/30 cursor-default"), "aria-label": "Decrease thinking level", children: _jsx(ChevronLeft, { className: "h-3 w-3" }) }), _jsx("button", { type: "button", onClick: () => {
                                // On narrow layouts the paddles may be hidden, so the label remains a usable control.
                                const nextIndex = (currentIndex + 1) % allowed.length;
                                setThinkingLevel(allowed[nextIndex]);
                            }, "data-thinking-label": true, className: "hover:bg-hover w-[5ch] min-w-[5ch] shrink-0 rounded-sm bg-transparent p-0 text-center text-[11px] transition-all duration-200 select-none", style: textStyle, "aria-live": "polite", "aria-label": `Thinking level: ${effectiveThinkingLevel}. Click to cycle.`, children: displayLabel }), _jsx("button", { type: "button", onClick: goRight, disabled: !canGoRight, "data-thinking-paddle": "right", className: cn("flex h-4 w-4 items-center justify-center rounded-sm transition-colors", canGoRight
                                ? "text-muted hover:bg-hover hover:text-foreground cursor-pointer"
                                : "text-muted/30 cursor-default"), "aria-label": "Increase thinking level", children: _jsx(ChevronRight, { className: "h-3 w-3" }) })] }) }), _jsxs(TooltipContent, { align: "center", children: ["Thinking:", " ", _jsxs("span", { className: "mobile-hide-shortcut-hints", children: [formatKeybind(KEYBINDS.TOGGLE_THINKING), " to cycle.", " "] }), "Saved per workspace."] })] }));
};
//# sourceMappingURL=ThinkingSlider.js.map