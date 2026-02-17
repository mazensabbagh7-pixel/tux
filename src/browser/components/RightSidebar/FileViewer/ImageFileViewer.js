import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * ImageFileViewer - Displays image files with zoom controls.
 * Supports scroll wheel zoom with constrained range.
 */
import React from "react";
import { ZoomIn, ZoomOut, RotateCcw } from "lucide-react";
import { cn } from "@/common/lib/utils";
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 10; // 1000%
const ZOOM_STEP = 0.1;
const ZOOM_PRESETS = [10, 25, 50, 75, 100, 200, 300, 400, 500]; // percentages
const BASE_CHECKER_SIZE = 16;
// Returns checkerboard style with size scaled by zoom
// Uses conic-gradient for clean edges (no diagonal seam artifacts)
const getCheckerboardStyle = (zoom) => {
    const size = BASE_CHECKER_SIZE * zoom;
    return {
        background: `repeating-conic-gradient(
      color-mix(in srgb, var(--color-background) 85%, var(--color-foreground)) 0% 25%,
      var(--color-background) 0% 50%
    ) 0 0 / ${size}px ${size}px`,
    };
};
export const ImageFileViewer = (props) => {
    const [zoom, setZoom] = React.useState(1);
    const containerRef = React.useRef(null);
    const [containerSize, setContainerSize] = React.useState(null);
    const [imageDimensions, setImageDimensions] = React.useState(null);
    // Track container size to compute max zoom
    React.useEffect(() => {
        const container = containerRef.current;
        if (!container)
            return;
        const observer = new ResizeObserver((entries) => {
            const entry = entries[0];
            if (entry) {
                setContainerSize({
                    width: entry.contentRect.width,
                    height: entry.contentRect.height,
                });
            }
        });
        observer.observe(container);
        return () => observer.disconnect();
    }, []);
    // Compute max zoom so image fits within container (with padding)
    const padding = 32;
    const maxZoom = React.useMemo(() => {
        if (!containerSize || !imageDimensions)
            return MAX_ZOOM;
        const maxZoomX = (containerSize.width - padding) / imageDimensions.width;
        const maxZoomY = (containerSize.height - padding) / imageDimensions.height;
        // Use the smaller ratio so image fits in both dimensions, but at least MIN_ZOOM
        return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, maxZoomX, maxZoomY));
    }, [containerSize, imageDimensions]);
    // Clamp zoom when maxZoom changes (e.g., container resized)
    React.useEffect(() => {
        setZoom((prev) => Math.min(prev, maxZoom));
    }, [maxZoom]);
    // Format file size for display
    const formatSize = (bytes) => {
        if (bytes < 1024)
            return `${bytes} B`;
        if (bytes < 1024 * 1024)
            return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };
    const handleWheel = (e) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
        setZoom((prev) => Math.min(maxZoom, Math.max(MIN_ZOOM, prev + delta)));
    };
    const handleZoomIn = () => setZoom((prev) => Math.min(maxZoom, prev + ZOOM_STEP));
    const handleZoomOut = () => setZoom((prev) => Math.max(MIN_ZOOM, prev - ZOOM_STEP));
    // Reset to 100% or maxZoom if the image doesn't fit at 100%
    const handleReset = () => setZoom(Math.min(1, maxZoom));
    const handleImageLoad = (e) => {
        const img = e.currentTarget;
        setImageDimensions({ width: img.naturalWidth, height: img.naturalHeight });
    };
    const dataUrl = `data:${props.mimeType};base64,${props.base64}`;
    return (_jsxs("div", { "data-testid": "image-file-viewer", className: "flex h-full flex-col", children: [_jsxs("div", { className: "border-border-light flex items-center justify-between border-b px-2 py-1", children: [_jsxs("div", { className: "text-muted-foreground flex min-w-0 flex-1 items-center gap-2 text-xs", children: [_jsx("span", { className: "min-w-0 truncate", children: props.filePath }), imageDimensions && (_jsxs("span", { className: "shrink-0", children: [imageDimensions.width, " \u00D7 ", imageDimensions.height] })), _jsx("span", { className: "shrink-0", children: formatSize(props.size) }), _jsx("span", { className: "shrink-0 truncate opacity-60", children: props.mimeType })] }), _jsxs("div", { className: "flex shrink-0 items-center gap-1", children: [_jsx("button", { type: "button", className: "text-muted hover:bg-accent/50 hover:text-foreground rounded p-1", onClick: handleZoomOut, title: "Zoom out", children: _jsx(ZoomOut, { className: "h-3.5 w-3.5" }) }), _jsxs("select", { value: Math.round(zoom * 100), onChange: (e) => setZoom(Number(e.target.value) / 100), className: "text-muted-foreground hover:text-foreground bg-background cursor-pointer rounded px-1 py-0.5 text-center text-xs outline-none", title: "Select zoom level", children: [!ZOOM_PRESETS.includes(Math.round(zoom * 100)) && (_jsxs("option", { value: Math.round(zoom * 100), children: [Math.round(zoom * 100), "%"] })), ZOOM_PRESETS.filter((p) => p / 100 <= maxZoom).map((preset) => (_jsxs("option", { value: preset, children: [preset, "%"] }, preset)))] }), _jsx("button", { type: "button", className: "text-muted hover:bg-accent/50 hover:text-foreground rounded p-1", onClick: handleZoomIn, title: "Zoom in", children: _jsx(ZoomIn, { className: "h-3.5 w-3.5" }) }), _jsx("button", { type: "button", className: cn("text-muted hover:bg-accent/50 hover:text-foreground rounded p-1", zoom === 1 && "opacity-50"), onClick: handleReset, title: "Reset zoom", disabled: zoom === 1, children: _jsx(RotateCcw, { className: "h-3.5 w-3.5" }) })] })] }), _jsx("div", { ref: containerRef, className: "flex min-h-0 flex-1 items-center justify-center overflow-hidden", onWheel: handleWheel, children: _jsx("img", { src: dataUrl, alt: "File preview", onLoad: handleImageLoad, style: {
                        ...getCheckerboardStyle(zoom),
                        ...(imageDimensions
                            ? {
                                width: imageDimensions.width * zoom,
                                height: imageDimensions.height * zoom,
                            }
                            : {}),
                    }, className: "block", draggable: false }) })] }));
};
//# sourceMappingURL=ImageFileViewer.js.map