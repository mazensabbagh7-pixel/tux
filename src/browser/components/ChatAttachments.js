import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { FileText, X } from "lucide-react";
function getBaseMediaType(mediaType) {
    return mediaType.toLowerCase().trim().split(";")[0];
}
export const ChatAttachments = (props) => {
    if (props.attachments.length === 0)
        return null;
    const handleRemove = props.onRemove;
    return (_jsx("div", { className: "flex flex-wrap gap-2 py-2", children: props.attachments.map((attachment) => {
            const baseMediaType = getBaseMediaType(attachment.mediaType);
            const isImage = baseMediaType.startsWith("image/");
            if (isImage) {
                return (_jsxs("div", { className: "border-border-light bg-dark group grid h-20 w-20 overflow-hidden rounded border", children: [_jsx("img", { src: attachment.url, alt: "Attached image", className: "pointer-events-none col-start-1 row-start-1 h-full w-full object-cover" }), handleRemove && (_jsx("button", { onClick: () => handleRemove(attachment.id), title: "Remove attachment", className: "col-start-1 row-start-1 m-0.5 flex h-5 w-5 cursor-pointer items-center justify-center self-start justify-self-end rounded-full border-0 bg-black/70 p-0 text-sm leading-none text-white hover:bg-black/90", "aria-label": "Remove attachment", children: _jsx(X, { className: "h-3 w-3" }) }))] }, attachment.id));
            }
            const label = attachment.filename ?? (baseMediaType === "application/pdf" ? "PDF" : baseMediaType);
            return (_jsxs("div", { className: "border-border-light bg-dark flex max-w-[260px] items-center gap-2 rounded border px-2 py-1", children: [_jsx(FileText, { className: "h-4 w-4 shrink-0 text-[var(--color-subtle)]" }), _jsx("span", { className: "truncate text-xs text-[var(--color-subtle)]", children: label }), handleRemove && (_jsx("button", { onClick: () => handleRemove(attachment.id), title: "Remove attachment", className: "ml-auto flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent p-0 text-[var(--color-subtle)] hover:bg-black/40", "aria-label": "Remove attachment", children: _jsx(X, { className: "h-3 w-3" }) }))] }, attachment.id));
        }) }));
};
//# sourceMappingURL=ChatAttachments.js.map