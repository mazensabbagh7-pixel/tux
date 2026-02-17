import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from "react";
import { Dialog, DialogContent, DialogTitle, VisuallyHidden } from "@/browser/components/ui/dialog";
/**
 * Allowed image MIME types for display.
 * Excludes SVG (can contain scripts) and other potentially dangerous formats.
 */
const ALLOWED_IMAGE_TYPES = new Set([
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/gif",
    "image/webp",
    "image/avif",
    "image/bmp",
]);
/**
 * Validate base64 string contains only valid characters.
 * Prevents injection of malicious content through invalid base64.
 */
function isValidBase64(str) {
    // Base64 should only contain alphanumeric, +, /, and = for padding
    // Also allow reasonable length (up to ~10MB decoded = ~13MB base64)
    if (str.length > 15000000)
        return false;
    return /^[A-Za-z0-9+/]*={0,2}$/.test(str);
}
/**
 * Sanitize and validate image data from MCP tool results.
 * Returns a safe data URL or null if validation fails.
 */
export function sanitizeImageData(mediaType, data) {
    // Normalize and validate media type
    const normalizedType = mediaType.toLowerCase().trim();
    if (!ALLOWED_IMAGE_TYPES.has(normalizedType)) {
        return null;
    }
    // Validate base64 data
    if (!isValidBase64(data)) {
        return null;
    }
    return `data:${normalizedType};base64,${data}`;
}
/**
 * Extract images from a tool result.
 * Handles the transformed MCP result format: { type: "content", value: [...] }
 */
export function extractImagesFromToolResult(result) {
    if (typeof result !== "object" || result === null)
        return [];
    const contentResult = result;
    if (contentResult.type !== "content" || !Array.isArray(contentResult.value))
        return [];
    return contentResult.value.filter((item) => item.type === "media" && typeof item.data === "string" && typeof item.mediaType === "string");
}
/**
 * Display images extracted from MCP tool results (e.g., Chrome DevTools screenshots)
 */
export const ToolResultImages = ({ result }) => {
    const images = extractImagesFromToolResult(result);
    const [selectedImage, setSelectedImage] = useState(null);
    // Sanitize all images upfront, filtering out any that fail validation
    const safeImages = images
        .map((image) => sanitizeImageData(image.mediaType, image.data))
        .filter((url) => url !== null);
    if (safeImages.length === 0)
        return null;
    return (_jsxs(_Fragment, { children: [_jsx("div", { className: "mt-2 flex flex-wrap gap-2", children: safeImages.map((dataUrl, index) => (_jsx("button", { onClick: () => setSelectedImage(dataUrl), className: "border-border-light bg-dark block cursor-pointer overflow-hidden rounded border p-0 transition-opacity hover:opacity-80", title: "Click to view full size", children: _jsx("img", { src: dataUrl, alt: `Tool result image ${index + 1}`, className: "max-h-48 max-w-full object-contain" }) }, index))) }), _jsx(Dialog, { open: selectedImage !== null, onOpenChange: () => setSelectedImage(null), children: _jsxs(DialogContent, { maxWidth: "90vw", maxHeight: "90vh", className: "flex items-center justify-center bg-black/90 p-2", children: [_jsx(VisuallyHidden, { children: _jsx(DialogTitle, { children: "Image Preview" }) }), selectedImage && (_jsx("img", { src: selectedImage, alt: "Full size preview", className: "max-h-[85vh] max-w-full object-contain" }))] }) })] }));
};
//# sourceMappingURL=ToolResultImages.js.map