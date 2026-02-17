import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useEffect, useRef, useCallback } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/browser/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, } from "@/browser/components/ui/select";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/browser/components/ui/tooltip";
import { Button } from "@/browser/components/ui/button";
import { Check, ExternalLink, Link2, Loader2, Trash2 } from "lucide-react";
import { CopyIcon } from "@/browser/components/icons/CopyIcon";
import { copyToClipboard } from "@/browser/utils/clipboard";
import { uploadToMuxMd, deleteFromMuxMd, updateMuxMdExpiration, } from "@/common/lib/muxMd";
import { getShareData, setShareData, removeShareData, updateShareExpiration, } from "@/browser/utils/sharedUrlCache";
import { cn } from "@/common/lib/utils";
import { EXPIRATION_OPTIONS, expirationToMs, timestampToExpiration, formatExpiration, } from "@/common/lib/shareExpiration";
import { SHARE_EXPIRATION_KEY, SHARE_SIGNING_KEY } from "@/common/constants/storage";
import { readPersistedState, updatePersistedState, usePersistedState, } from "@/browser/hooks/usePersistedState";
import { useLinkSharingEnabled } from "@/browser/contexts/TelemetryEnabledContext";
import { useAPI } from "@/browser/contexts/API";
import { EncryptionBadge, SigningBadge } from "./ShareSigningBadges";
export const ShareMessagePopover = ({ content, model, thinking, disabled = false, workspaceName, }) => {
    // Hide share button when user explicitly disabled telemetry
    const linkSharingEnabled = useLinkSharingEnabled();
    const { api } = useAPI();
    const [isOpen, setIsOpen] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [isUpdating, setIsUpdating] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [showUpdated, setShowUpdated] = useState(false);
    const [copied, setCopied] = useState(false);
    const [error, setError] = useState(null);
    const urlInputRef = useRef(null);
    // Current share data (from upload or cache)
    const [shareData, setLocalShareData] = useState(null);
    // Signing capabilities and enabled state
    const [signingCapabilities, setSigningCapabilities] = useState(null);
    const [signingCapabilitiesLoaded, setSigningCapabilitiesLoaded] = useState(false);
    const [signingEnabled, setSigningEnabled] = usePersistedState(SHARE_SIGNING_KEY, true);
    // Load signing capabilities on first popover open
    useEffect(() => {
        if (isOpen && !signingCapabilitiesLoaded && api) {
            void api.signing
                .capabilities({})
                .then(setSigningCapabilities)
                .catch(() => {
                // Signing unavailable - leave capabilities null
            })
                .finally(() => {
                setSigningCapabilitiesLoaded(true);
            });
        }
    }, [isOpen, api, signingCapabilitiesLoaded]);
    // Load cached data when content changes
    useEffect(() => {
        if (content) {
            const cached = getShareData(content);
            setLocalShareData(cached ?? null);
        }
    }, [content]);
    // Auto-upload when popover opens, no cached data exists, and signing capabilities are loaded
    useEffect(() => {
        const canAutoUpload = isOpen && content && !shareData && !isUploading && !error && signingCapabilitiesLoaded;
        if (canAutoUpload) {
            void handleShare();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, signingCapabilitiesLoaded]);
    // Auto-select URL text when popover opens with share data or share completes
    useEffect(() => {
        if (isOpen && shareData && urlInputRef.current) {
            // Small delay to ensure input is rendered
            requestAnimationFrame(() => {
                urlInputRef.current?.select();
            });
        }
    }, [isOpen, shareData]);
    const isAlreadyShared = Boolean(shareData);
    // Get preferred expiration from localStorage
    const getPreferredExpiration = () => {
        return readPersistedState(SHARE_EXPIRATION_KEY, "never");
    };
    // Save preferred expiration to localStorage
    const savePreferredExpiration = (value) => {
        updatePersistedState(SHARE_EXPIRATION_KEY, value);
    };
    // Retry key detection (user may have created a key after app launch)
    const handleRetryKeyDetection = async () => {
        if (!api)
            return;
        try {
            // Clear backend cache (will retry key loading on next capabilities call)
            await api.signing.clearIdentityCache({});
            // Re-fetch capabilities
            const caps = await api.signing.capabilities({});
            setSigningCapabilities(caps);
        }
        catch {
            // Silently fail - capabilities stay as-is
        }
    };
    // Derive filename: prefer workspaceName, fallback to default
    const getFileName = () => {
        if (workspaceName) {
            // Sanitize workspace name for filename (remove unsafe chars)
            const safeName = workspaceName.replace(/[^a-zA-Z0-9_-]/g, "-").replace(/-+/g, "-");
            return `${safeName}.md`;
        }
        return "message.md";
    };
    // Upload with preferred expiration and optional signing
    const handleShare = async () => {
        if (!content || isUploading)
            return;
        setIsUploading(true);
        setError(null);
        try {
            // Get preferred expiration and include in upload request
            const preferred = getPreferredExpiration();
            const ms = expirationToMs(preferred);
            const expiresAt = ms ? new Date(Date.now() + ms) : undefined;
            // Request a mux.md signature envelope from the backend when signing is enabled.
            let signature;
            if (signingEnabled && signingCapabilities?.publicKey && api) {
                try {
                    signature = await api.signing.signMessage({ content });
                }
                catch (signErr) {
                    console.warn("Failed to sign share content, uploading without signature:", signErr);
                    // Continue without signature - don't fail the upload
                }
            }
            const result = await uploadToMuxMd(content, {
                name: getFileName(),
                type: "text/markdown",
                size: new TextEncoder().encode(content).length,
                model,
                thinking,
            }, { expiresAt, signature });
            const data = {
                url: result.url,
                id: result.id,
                mutateKey: result.mutateKey,
                expiresAt: result.expiresAt,
                signed: Boolean(signature),
            };
            // Cache the share data
            setShareData(content, data);
            setLocalShareData(data);
        }
        catch (err) {
            console.error("Share failed:", err);
            setError(err instanceof Error ? err.message : "Failed to upload");
        }
        finally {
            setIsUploading(false);
        }
    };
    // Update expiration on server and cache
    const handleUpdateExpiration = async (data, value, silent = false) => {
        if (!data.mutateKey)
            return;
        if (!silent)
            setIsUpdating(true);
        setError(null);
        setShowUpdated(false);
        try {
            const ms = expirationToMs(value);
            const expiresAt = ms ? new Date(Date.now() + ms) : "never";
            const newExpiration = await updateMuxMdExpiration(data.id, data.mutateKey, expiresAt);
            // Update cache
            updateShareExpiration(content, newExpiration);
            setLocalShareData((prev) => (prev ? { ...prev, expiresAt: newExpiration } : null));
            // Save preference for future shares
            savePreferredExpiration(value);
            // Show success indicator briefly
            if (!silent) {
                setShowUpdated(true);
                setTimeout(() => setShowUpdated(false), 2000);
            }
        }
        catch (err) {
            console.error("Update expiration failed:", err);
            if (!silent) {
                setError(err instanceof Error ? err.message : "Failed to update expiration");
            }
        }
        finally {
            if (!silent)
                setIsUpdating(false);
        }
    };
    // Delete from server and remove from cache
    const handleDelete = async () => {
        if (!shareData?.mutateKey)
            return;
        setIsDeleting(true);
        setError(null);
        try {
            await deleteFromMuxMd(shareData.id, shareData.mutateKey);
            // Remove from cache
            removeShareData(content);
            setLocalShareData(null);
            // Close the popover after successful delete
            setIsOpen(false);
        }
        catch (err) {
            console.error("Delete failed:", err);
            setError(err instanceof Error ? err.message : "Failed to delete");
        }
        finally {
            setIsDeleting(false);
        }
    };
    // Toggle signing and regenerate URL inline if already shared
    const handleToggleSigning = async () => {
        const newSigningEnabled = !signingEnabled;
        setSigningEnabled(newSigningEnabled);
        // If we have an existing share, regenerate with new signing state
        if (shareData?.mutateKey && !isUploading) {
            setIsUploading(true);
            setError(null);
            try {
                // Delete the old share
                await deleteFromMuxMd(shareData.id, shareData.mutateKey);
                removeShareData(content);
                // Request a mux.md signature envelope from the backend if signing is now enabled.
                let signature;
                if (newSigningEnabled && signingCapabilities?.publicKey && api) {
                    try {
                        signature = await api.signing.signMessage({ content });
                    }
                    catch {
                        // Continue without signature
                    }
                }
                // Re-upload with current expiration preference
                const preferred = getPreferredExpiration();
                const ms = expirationToMs(preferred);
                const expiresAt = ms ? new Date(Date.now() + ms) : undefined;
                const result = await uploadToMuxMd(content, {
                    name: getFileName(),
                    type: "text/markdown",
                    size: new TextEncoder().encode(content).length,
                    model,
                    thinking,
                }, { expiresAt, signature });
                const data = {
                    url: result.url,
                    id: result.id,
                    mutateKey: result.mutateKey,
                    expiresAt: result.expiresAt,
                    signed: Boolean(signature),
                };
                setShareData(content, data);
                setLocalShareData(data);
            }
            catch (err) {
                console.error("Failed to regenerate share:", err);
                setError(err instanceof Error ? err.message : "Failed to update signing");
            }
            finally {
                setIsUploading(false);
            }
        }
    };
    const handleCopy = useCallback(() => {
        if (shareData?.url) {
            void copyToClipboard(shareData.url).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
            });
        }
    }, [shareData?.url]);
    const handleOpenInBrowser = useCallback(() => {
        if (shareData?.url) {
            window.open(shareData.url, "_blank", "noopener,noreferrer");
        }
    }, [shareData?.url]);
    const handleOpenChange = (open) => {
        setIsOpen(open);
        if (!open) {
            // Reset transient state when closing
            setTimeout(() => {
                setError(null);
            }, 150);
        }
    };
    const currentExpiration = timestampToExpiration(shareData?.expiresAt);
    const isBusy = isUploading || isUpdating || isDeleting;
    // Don't render the share button if link sharing is disabled or still loading
    if (linkSharingEnabled !== true) {
        return null;
    }
    return (_jsxs(Popover, { open: isOpen, onOpenChange: handleOpenChange, children: [_jsx(PopoverTrigger, { asChild: true, children: _jsx(Button, { variant: "ghost", size: "icon", disabled: disabled, "aria-label": isAlreadyShared ? "Already shared" : "Share", className: cn("flex h-6 w-6 items-center justify-center [&_svg]:size-3.5", isAlreadyShared ? "text-blue-400" : "text-placeholder"), children: _jsx(Link2, {}) }) }), _jsx(PopoverContent, { side: "top", align: "start", collisionPadding: 16, className: "w-[280px] p-3", children: !shareData ? (
                // Uploading state (auto-triggered on open)
                _jsxs("div", { className: "space-y-3", children: [_jsxs("div", { className: "flex items-center gap-1.5", children: [_jsx("span", { className: "text-foreground text-xs font-medium", children: "Share" }), _jsx(EncryptionBadge, {}), _jsx(SigningBadge, { signed: false, capabilities: signingCapabilities, signingEnabled: signingEnabled, onToggleSigning: () => setSigningEnabled(!signingEnabled), onRetryKeyDetection: () => void handleRetryKeyDetection() })] }), error ? (_jsxs(_Fragment, { children: [_jsx("div", { className: "bg-destructive/10 text-destructive rounded px-2 py-1.5 text-[11px]", children: error }), _jsx(Button, { onClick: () => void handleShare(), disabled: isUploading, className: "h-7 w-full text-xs", children: "Retry" })] })) : (_jsxs("div", { className: "flex items-center justify-center py-3", children: [_jsx(Loader2, { className: "text-muted h-4 w-4 animate-spin" }), _jsx("span", { className: "text-muted ml-2 text-xs", children: "Encrypting..." })] }))] })) : (
                // Post-upload: show URL, expiration controls, and delete option
                _jsxs("div", { className: "space-y-2", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsxs("div", { className: "flex items-center gap-1.5", children: [_jsx("span", { className: "text-foreground text-xs font-medium", children: "Shared" }), _jsx(EncryptionBadge, {}), _jsx(SigningBadge, { signed: Boolean(shareData.signed), capabilities: signingCapabilities, signingEnabled: signingEnabled, onToggleSigning: () => void handleToggleSigning(), onRetryKeyDetection: () => void handleRetryKeyDetection() })] }), shareData.mutateKey && (_jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("button", { onClick: () => void handleDelete(), className: "text-muted hover:bg-destructive/10 hover:text-destructive rounded p-1 transition-colors", "aria-label": "Delete shared link", disabled: isBusy, tabIndex: -1, children: isDeleting ? (_jsx(Loader2, { className: "h-3.5 w-3.5 animate-spin" })) : (_jsx(Trash2, { className: "h-3.5 w-3.5" })) }) }), _jsx(TooltipContent, { children: "Delete" })] }))] }), _jsxs("div", { className: "border-border bg-background flex items-center gap-1 rounded border px-2 py-1.5", children: [_jsx("input", { ref: urlInputRef, type: "text", readOnly: true, value: shareData.url, className: "text-foreground min-w-0 flex-1 bg-transparent font-mono text-[10px] outline-none", "data-testid": "share-url", onFocus: (e) => e.target.select() }), _jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("button", { onClick: handleCopy, className: "text-muted hover:bg-muted/50 hover:text-foreground shrink-0 rounded p-1 transition-colors", "aria-label": "Copy to clipboard", "data-testid": "copy-share-url", children: copied ? (_jsx(Check, { className: "h-3.5 w-3.5 text-green-500" })) : (_jsx(CopyIcon, { className: "h-3.5 w-3.5" })) }) }), _jsx(TooltipContent, { children: copied ? "Copied!" : "Copy" })] }), _jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("button", { onClick: handleOpenInBrowser, className: "text-muted hover:bg-muted/50 hover:text-foreground shrink-0 rounded p-1 transition-colors", "aria-label": "Open in browser", "data-testid": "open-share-url", children: _jsx(ExternalLink, { className: "h-3.5 w-3.5" }) }) }), _jsx(TooltipContent, { children: "Open" })] })] }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: "text-muted text-[10px]", children: "Expires:" }), shareData.mutateKey ? (_jsxs(Select, { value: currentExpiration, onValueChange: (v) => void handleUpdateExpiration(shareData, v), disabled: isBusy, children: [_jsx(SelectTrigger, { className: "h-6 flex-1 text-[10px]", children: _jsx(SelectValue, {}) }), _jsx(SelectContent, { children: EXPIRATION_OPTIONS.map((opt) => (_jsx(SelectItem, { value: opt.value, children: opt.label }, opt.value))) })] })) : (_jsx("span", { className: "text-foreground text-[10px]", children: formatExpiration(shareData.expiresAt) })), isUpdating && _jsx(Loader2, { className: "text-muted h-3.5 w-3.5 animate-spin" }), showUpdated && _jsx(Check, { className: "h-3.5 w-3.5 text-green-500" })] }), error && (_jsx("div", { className: "bg-destructive/10 text-destructive rounded px-2 py-1.5 text-[11px]", children: error }))] })) })] }));
};
//# sourceMappingURL=ShareMessagePopover.js.map