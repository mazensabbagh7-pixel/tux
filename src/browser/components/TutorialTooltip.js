import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useRef, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/common/lib/utils";
export const TutorialTooltip = ({ step, currentStep, totalSteps, onNext, onDismiss, onDisableTutorial, }) => {
    const tooltipRef = useRef(null);
    const [position, setPosition] = useState(null);
    const [showDisableOption, setShowDisableOption] = useState(false);
    useLayoutEffect(() => {
        const targetEl = document.querySelector(`[data-tutorial="${step.target}"]`);
        if (!targetEl || !tooltipRef.current) {
            return;
        }
        const calculatePosition = () => {
            const target = targetEl.getBoundingClientRect();
            const tooltip = tooltipRef.current.getBoundingClientRect();
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;
            const gap = 12;
            const preferredPosition = step.position ?? "bottom";
            let actualPosition = preferredPosition;
            let top;
            let left;
            // Try preferred position, flip if it doesn't fit
            if (preferredPosition === "bottom" || preferredPosition === "top") {
                if (preferredPosition === "bottom") {
                    top = target.bottom + gap;
                    if (top + tooltip.height > viewportHeight) {
                        actualPosition = "top";
                        top = target.top - tooltip.height - gap;
                    }
                }
                else {
                    top = target.top - tooltip.height - gap;
                    if (top < 0) {
                        actualPosition = "bottom";
                        top = target.bottom + gap;
                    }
                }
                // Center horizontally relative to target
                left = target.left + target.width / 2 - tooltip.width / 2;
            }
            else {
                // left or right
                if (preferredPosition === "right") {
                    left = target.right + gap;
                    if (left + tooltip.width > viewportWidth) {
                        actualPosition = "left";
                        left = target.left - tooltip.width - gap;
                    }
                }
                else {
                    left = target.left - tooltip.width - gap;
                    if (left < 0) {
                        actualPosition = "right";
                        left = target.right + gap;
                    }
                }
                // Center vertically relative to target
                top = target.top + target.height / 2 - tooltip.height / 2;
            }
            // Clamp to viewport bounds
            const minMargin = 8;
            left = Math.max(minMargin, Math.min(viewportWidth - tooltip.width - minMargin, left));
            top = Math.max(minMargin, Math.min(viewportHeight - tooltip.height - minMargin, top));
            // Calculate arrow position
            const arrowStyle = {};
            if (actualPosition === "bottom" || actualPosition === "top") {
                const arrowLeft = target.left + target.width / 2 - left;
                arrowStyle.left = `${Math.max(12, Math.min(tooltip.width - 12, arrowLeft))}px`;
                if (actualPosition === "bottom") {
                    arrowStyle.top = "-6px";
                    arrowStyle.borderWidth = "0 6px 6px 6px";
                    arrowStyle.borderColor = "transparent transparent var(--color-accent) transparent";
                }
                else {
                    arrowStyle.bottom = "-6px";
                    arrowStyle.borderWidth = "6px 6px 0 6px";
                    arrowStyle.borderColor = "var(--color-accent) transparent transparent transparent";
                }
            }
            else {
                const arrowTop = target.top + target.height / 2 - top;
                arrowStyle.top = `${Math.max(12, Math.min(tooltip.height - 12, arrowTop))}px`;
                if (actualPosition === "right") {
                    arrowStyle.left = "-6px";
                    arrowStyle.borderWidth = "6px 6px 6px 0";
                    arrowStyle.borderColor = "transparent var(--color-accent) transparent transparent";
                }
                else {
                    arrowStyle.right = "-6px";
                    arrowStyle.borderWidth = "6px 0 6px 6px";
                    arrowStyle.borderColor = "transparent transparent transparent var(--color-accent)";
                }
            }
            setPosition({ top, left, arrowStyle, actualPosition });
        };
        calculatePosition();
        // Recalculate on resize
        window.addEventListener("resize", calculatePosition);
        return () => window.removeEventListener("resize", calculatePosition);
    }, [step.target, step.position]);
    // Add highlight to target element
    useLayoutEffect(() => {
        const targetEl = document.querySelector(`[data-tutorial="${step.target}"]`);
        if (!targetEl)
            return;
        targetEl.classList.add("tutorial-highlight");
        return () => {
            targetEl.classList.remove("tutorial-highlight");
        };
    }, [step.target]);
    const isLastStep = currentStep === totalSteps;
    const handleDismissClick = () => {
        if (showDisableOption) {
            onDismiss();
        }
        else {
            setShowDisableOption(true);
        }
    };
    return createPortal(_jsxs(_Fragment, { children: [_jsx("div", { className: "fixed inset-0 z-[9998] bg-black/20", "data-testid": "tutorial-backdrop", onClick: onDismiss }), _jsxs("div", { ref: tooltipRef, style: {
                    position: "fixed",
                    top: position?.top ?? -9999,
                    left: position?.left ?? -9999,
                    visibility: position ? "visible" : "hidden",
                }, className: cn("z-[9999] w-72 rounded-lg border-2 border-accent bg-modal-bg p-4 shadow-lg", "text-foreground"), children: [_jsx("div", { className: "absolute h-0 w-0 border-solid", style: position?.arrowStyle }), _jsxs("div", { className: "mb-2 flex items-start justify-between", children: [_jsx("h3", { className: "text-sm font-semibold", children: step.title }), _jsxs("span", { className: "text-muted text-xs", children: [currentStep, "/", totalSteps] })] }), _jsx("p", { className: "text-muted mb-4 text-xs leading-relaxed", children: step.content }), _jsxs("div", { className: "flex items-center justify-between", children: [_jsx("div", { children: showDisableOption ? (_jsx("button", { onClick: onDisableTutorial, className: "text-muted hover:text-foreground text-[10px] underline transition-colors", children: "Don't show tutorials again" })) : (_jsx("button", { onClick: handleDismissClick, className: "text-muted hover:text-foreground text-xs transition-colors", children: "Skip" })) }), _jsx("button", { onClick: isLastStep ? onDismiss : onNext, className: "bg-accent rounded px-3 py-1.5 text-xs font-medium text-white transition-colors hover:opacity-90", children: isLastStep ? "Done" : "Next" })] })] })] }), document.body);
};
//# sourceMappingURL=TutorialTooltip.js.map