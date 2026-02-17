import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import React from "react";
import { FileText } from "lucide-react";
import { cn } from "@/common/lib/utils";
import { ReviewBlockFromData } from "../shared/ReviewBlock";
import { HoverCard, HoverCardContent, HoverCardPortal, HoverCardTrigger } from "../ui/hover-card";
import { isDesktopMode } from "@/browser/hooks/useDesktopTitlebar";
import { MarkdownRenderer } from "./MarkdownRenderer";
const markdownStyles = {
    sent: {
        color: "var(--color-user-text)",
        overflowWrap: "break-word",
        wordBreak: "break-word",
    },
    queued: {
        color: "var(--color-subtle)",
        fontFamily: "var(--font-monospace)",
        fontSize: "12px",
        lineHeight: "16px",
        overflowWrap: "break-word",
        wordBreak: "break-word",
        opacity: 0.9,
    },
};
const imageContainerStyles = {
    sent: "mt-3 flex flex-wrap gap-3",
    queued: "mt-2 flex flex-wrap gap-2",
};
const markdownClassName = "user-message-markdown";
function buildAgentSkillSnapshotMarkdown(snapshot) {
    if (!snapshot)
        return null;
    const frontmatterYaml = typeof snapshot.frontmatterYaml === "string" && snapshot.frontmatterYaml.trim().length > 0
        ? snapshot.frontmatterYaml.trimEnd()
        : undefined;
    const body = typeof snapshot.body === "string" ? snapshot.body : undefined;
    if (!frontmatterYaml && !body) {
        return null;
    }
    const yamlBlock = frontmatterYaml ? `\`\`\`yaml\n---\n${frontmatterYaml}\n---\n\`\`\`\n\n` : "";
    return `${yamlBlock}${body ?? ""}`;
}
function dataUrlToBlob(dataUrl) {
    if (!dataUrl.startsWith("data:"))
        return null;
    const commaIndex = dataUrl.indexOf(",");
    if (commaIndex === -1)
        return null;
    const header = dataUrl.slice("data:".length, commaIndex);
    if (!header.includes(";base64"))
        return null;
    const mimeType = header.split(";")[0] ?? "application/octet-stream";
    try {
        const base64 = dataUrl.slice(commaIndex + 1);
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return new Blob([bytes], { type: mimeType });
    }
    catch {
        return null;
    }
}
function getBaseMediaType(mediaType) {
    return mediaType.toLowerCase().trim().split(";")[0];
}
const fileAttachmentStyles = {
    sent: "flex max-w-80 items-center gap-2 rounded-xl border border-[var(--color-attachment-border)] px-3 py-2 text-sm text-[var(--color-subtle)]",
    queued: "border-border-light flex max-w-80 items-center gap-2 rounded border px-2 py-1 text-xs text-[var(--color-subtle)]",
};
const imageStyles = {
    sent: "max-h-[300px] max-w-72 rounded-xl border border-[var(--color-attachment-border)] object-cover",
    queued: "border-border-light max-h-[300px] max-w-80 rounded border",
};
/** Styled command prefix (e.g., "/compact" or "/skill-name") */
const CommandPrefixBadge = React.forwardRef(({ prefix, className, ...rest }, ref) => (_jsx("span", { ref: ref, className: cn("font-mono text-[13px] font-medium text-[var(--color-plan-mode-light)]", className), ...rest, children: prefix })));
CommandPrefixBadge.displayName = "CommandPrefixBadge";
/**
 * Shared content renderer for user messages (sent and queued).
 * Handles reviews, text content, and attachments.
 */
export const UserMessageContent = (props) => {
    const reviews = props.reviews ?? [];
    const fileParts = props.fileParts ?? [];
    const hasReviews = reviews.length > 0;
    // Strip review tags from text when displaying alongside review blocks
    const textContent = hasReviews
        ? props.content.replace(/<review>[\s\S]*?<\/review>\s*/g, "").trim()
        : props.content;
    // Check if content starts with the command prefix
    const shouldHighlightPrefix = props.commandPrefix && textContent.startsWith(props.commandPrefix)
        ? props.commandPrefix
        : undefined;
    // Content after the prefix (if highlighting)
    const remainingContent = shouldHighlightPrefix
        ? textContent.slice(shouldHighlightPrefix.length)
        : textContent;
    // Render text content with optional command prefix badge
    const renderTextContent = () => {
        if (!remainingContent && !shouldHighlightPrefix)
            return null;
        // No prefix highlighting - render markdown directly without wrapper
        if (!shouldHighlightPrefix) {
            return (_jsx(MarkdownRenderer, { content: textContent, className: markdownClassName, style: markdownStyles[props.variant], preserveLineBreaks: true }));
        }
        // Check what whitespace follows the prefix to preserve visual layout
        const charAfterPrefix = textContent.charAt(shouldHighlightPrefix.length);
        const hasSpaceAfterPrefix = charAfterPrefix === " ";
        const hasNewlineAfterPrefix = charAfterPrefix === "\n";
        const snapshotMarkdown = buildAgentSkillSnapshotMarkdown(props.agentSkillSnapshot);
        const badge = snapshotMarkdown ? (_jsxs(HoverCard, { openDelay: 150, children: [_jsx(HoverCardTrigger, { asChild: true, children: _jsx(CommandPrefixBadge, { prefix: shouldHighlightPrefix, className: "cursor-help" }) }), _jsx(HoverCardPortal, { children: _jsx(HoverCardContent, { align: "start", side: "top", className: "border-border-medium bg-modal-bg z-[1600] max-h-[360px] w-[520px] max-w-[80vw] overflow-auto border-2 p-3", children: _jsx(MarkdownRenderer, { content: snapshotMarkdown, preserveLineBreaks: true }) }) })] })) : (_jsx(CommandPrefixBadge, { prefix: shouldHighlightPrefix }));
        // Newline after prefix: block layout (badge on own line)
        // Space after prefix: inline layout (badge + content on same line)
        return (_jsxs("div", { className: hasNewlineAfterPrefix ? "" : "flex flex-wrap items-baseline", children: [badge, hasSpaceAfterPrefix && _jsx("span", { children: "\u00A0" }), remainingContent.trim() && (_jsx(MarkdownRenderer, { content: remainingContent.trim(), className: markdownClassName, style: markdownStyles[props.variant], preserveLineBreaks: true }))] }));
    };
    return (_jsxs(_Fragment, { children: [hasReviews ? (_jsxs("div", { className: "space-y-2", children: [reviews.map((review, idx) => (_jsx(ReviewBlockFromData, { data: review }, idx))), renderTextContent()] })) : (renderTextContent()), fileParts.length > 0 && (_jsx("div", { className: imageContainerStyles[props.variant], children: fileParts.map((part, idx) => {
                    const baseMediaType = getBaseMediaType(part.mediaType);
                    if (baseMediaType.startsWith("image/")) {
                        return (_jsx("img", { src: part.url, alt: `Attachment ${idx + 1}`, className: imageStyles[props.variant] }, idx));
                    }
                    const label = part.filename ??
                        (baseMediaType === "application/pdf"
                            ? "PDF attachment"
                            : `Attachment (${baseMediaType})`);
                    return (_jsxs("a", { href: part.url, target: "_blank", rel: "noreferrer", className: fileAttachmentStyles[props.variant], onClick: (event) => {
                            const blob = dataUrlToBlob(part.url);
                            if (!blob) {
                                return;
                            }
                            event.preventDefault();
                            const blobUrl = URL.createObjectURL(blob);
                            if (isDesktopMode()) {
                                // In desktop mode, new windows are routed via shell.openExternal.
                                // blob: URLs are tied to this renderer and won't resolve externally,
                                // so download the file in-app instead.
                                const link = document.createElement("a");
                                link.href = blobUrl;
                                link.download =
                                    part.filename ??
                                        (baseMediaType === "application/pdf" ? "attachment.pdf" : "attachment");
                                document.body.appendChild(link);
                                link.click();
                                link.remove();
                                setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
                                return;
                            }
                            window.open(blobUrl, "_blank", "noopener,noreferrer");
                            // Keep the blob URL alive long enough for the new tab to load.
                            setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
                        }, children: [_jsx(FileText, { className: "h-4 w-4 shrink-0" }), _jsx("span", { className: "truncate", children: label })] }, idx));
                }) }))] }));
};
//# sourceMappingURL=UserMessageContent.js.map