import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { AlertTriangle, Check, Lock, PenTool } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent, HelpIndicator, } from "@/browser/components/ui/tooltip";
import { cn } from "@/common/lib/utils";
/** Encryption info tooltip shown next to share headers */
export const EncryptionBadge = () => (_jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx(HelpIndicator, { className: "text-[11px]", children: "?" }) }), _jsxs(TooltipContent, { className: "max-w-[240px]", children: [_jsxs("p", { className: "flex items-center gap-1.5 font-medium", children: [_jsx(Lock, { "aria-hidden": "true", className: "h-3 w-3" }), "End-to-end encrypted"] }), _jsx("p", { className: "text-muted-foreground mt-1 text-[11px]", children: "Content is encrypted in your browser (AES-256-GCM). The key stays in the URL fragment and is never sent to the server." })] })] }));
/** Truncate public key for display */
function truncatePublicKey(key) {
    // Format: "ssh-ed25519 AAAA...XXXX comment"
    const parts = key.split(" ");
    if (parts.length < 2)
        return key;
    const keyType = parts[0];
    const keyData = parts[1];
    if (keyData.length <= 16)
        return key;
    return `${keyType} ${keyData.slice(0, 8)}...${keyData.slice(-8)}`;
}
export const SigningBadge = ({ signed, capabilities, signingEnabled, onToggleSigning, onRetryKeyDetection, }) => {
    const hasKey = Boolean(capabilities?.publicKey);
    const hasEncryptedKey = capabilities?.error?.hasEncryptedKey ?? false;
    // Color states:
    // - blue = signed/enabled with key
    // - yellow/warning = encrypted key found but unusable
    // - muted = disabled or no key at all
    const isActive = signed || (signingEnabled && hasKey);
    const iconColor = isActive ? "text-blue-400" : hasEncryptedKey ? "text-yellow-500" : "text-muted";
    // Determine status header content
    const getStatusHeader = () => {
        if (signed) {
            return (_jsxs("span", { className: "flex items-center gap-1.5", children: [_jsx(Check, { "aria-hidden": "true", className: "h-3 w-3" }), "Signed"] }));
        }
        if (signingEnabled && hasKey)
            return "Signing enabled";
        if (hasEncryptedKey) {
            return (_jsxs("span", { className: "flex items-center gap-1.5", children: [_jsx(AlertTriangle, { "aria-hidden": "true", className: "h-3 w-3" }), "Key requires passphrase"] }));
        }
        return "Signing disabled";
    };
    // Build tooltip content with full signing info
    const tooltipContent = (_jsxs("div", { className: "space-y-1.5", children: [_jsx("p", { className: "font-medium", children: getStatusHeader() }), hasKey && capabilities && (_jsxs("div", { className: "text-muted-foreground space-y-0.5 text-[10px]", children: [capabilities.githubUser && _jsxs("p", { children: ["GitHub: @", capabilities.githubUser] }), capabilities.publicKey && (_jsx("p", { className: "font-mono", children: truncatePublicKey(capabilities.publicKey) }))] })), !hasKey && hasEncryptedKey && (_jsxs("p", { className: "text-muted-foreground text-[10px]", children: ["Use an unencrypted key file, or ensure your SSH agent (e.g. 1Password) is running and SSH_AUTH_SOCK is set", onRetryKeyDetection && (_jsxs(_Fragment, { children: [" · ", _jsx("button", { onClick: (e) => {
                                    e.stopPropagation();
                                    onRetryKeyDetection();
                                }, className: "text-foreground underline hover:no-underline", children: "Retry" })] }))] })), !hasKey && !hasEncryptedKey && (_jsxs("p", { className: "text-muted-foreground text-[10px]", children: ["No signing key found", onRetryKeyDetection && (_jsxs(_Fragment, { children: [" · ", _jsx("button", { onClick: (e) => {
                                    e.stopPropagation();
                                    onRetryKeyDetection();
                                }, className: "text-foreground underline hover:no-underline", children: "Retry" })] }))] })), _jsx("a", { href: "https://mux.coder.com/workspaces/sharing", target: "_blank", rel: "noopener noreferrer", className: "text-muted-foreground hover:text-foreground block text-[10px] underline", onClick: (e) => e.stopPropagation(), children: "Learn more" })] }));
    return (_jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("button", { onClick: onToggleSigning, disabled: !hasKey, tabIndex: -1, className: cn("flex items-center justify-center rounded p-0.5 transition-colors", hasKey ? "hover:bg-muted/50 cursor-pointer" : "cursor-default", iconColor), "aria-label": signingEnabled ? "Disable signing" : "Enable signing", children: _jsx(PenTool, { className: "h-3 w-3" }) }) }), _jsx(TooltipContent, { className: "max-w-[240px]", children: tooltipContent })] }));
};
//# sourceMappingURL=ShareSigningBadges.js.map