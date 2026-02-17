import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useRef, useEffect } from "react";
import dancingBlinkDarkSrc from "@/browser/assets/animations/dancing-blink-dark.webm";
import dancingBlinkLightSrc from "@/browser/assets/animations/dancing-blink-light.webm";
import { useTheme } from "@/browser/contexts/ThemeContext";
/**
 * Loading overlay displayed during workspace creation.
 * Shown as an overlay when isSending is true.
 */
export function CreationCenterContent(props) {
    const { theme } = useTheme();
    const isDark = theme === "dark" || theme.endsWith("-dark");
    const videoSrc = isDark ? dancingBlinkDarkSrc : dancingBlinkLightSrc;
    const videoRef = useRef(null);
    useEffect(() => {
        if (!props.isSending || !videoRef.current) {
            return;
        }
        videoRef.current.playbackRate = 1.3;
    }, [props.isSending, videoSrc]);
    return (_jsxs(_Fragment, { children: [!props.isSending && (_jsx("video", { className: "pointer-events-none absolute h-0 w-0 opacity-0", src: videoSrc, preload: "auto", muted: true, playsInline: true, "aria-hidden": "true" })), props.isSending && (_jsxs("div", { className: `absolute inset-0 z-10 flex flex-col items-center justify-center pb-[30vh] ${isDark ? "bg-sidebar" : "bg-white"}`, children: [_jsx("video", { ref: videoRef, className: "h-[50vh] w-[50vw] object-contain", src: videoSrc, preload: "auto", autoPlay: true, loop: true, muted: true, playsInline: true }), _jsxs("div", { className: "-mt-32 max-w-xl px-8 text-center", children: [_jsx("h2", { className: "text-foreground mb-2 text-2xl font-medium", children: "Creating workspace" }), _jsx("p", { className: "text-muted text-sm leading-relaxed", children: props.workspaceName ? (_jsxs(_Fragment, { children: [_jsx("code", { className: "bg-separator rounded px-1", children: props.workspaceName }), props.workspaceTitle && (_jsxs("span", { className: "text-muted-foreground ml-1", children: ["\u2014 ", props.workspaceTitle] }))] })) : ("Generating name…") })] })] }))] }));
}
//# sourceMappingURL=CreationCenterContent.js.map