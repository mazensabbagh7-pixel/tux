import { jsx as _jsx } from "react/jsx-runtime";
import { useState } from "react";
import { CopyIcon } from "@/browser/components/icons/CopyIcon";
import { copyToClipboard } from "@/browser/utils/clipboard";
/**
 * Reusable copy button with clipboard functionality and visual feedback
 */
export const CopyButton = ({ text, className = "", feedbackDuration = 2000, }) => {
    const [copied, setCopied] = useState(false);
    const handleCopy = () => {
        void (async () => {
            try {
                await copyToClipboard(text);
                setCopied(true);
                setTimeout(() => setCopied(false), feedbackDuration);
            }
            catch (error) {
                console.warn("Failed to copy to clipboard:", error);
            }
        })();
    };
    return (_jsx("button", { className: `copy-button ${className}`, onClick: handleCopy, "aria-label": "Copy to clipboard", children: copied ? _jsx("span", { className: "copy-feedback", children: "Copied!" }) : _jsx(CopyIcon, { className: "copy-icon" }) }));
};
//# sourceMappingURL=CopyButton.js.map