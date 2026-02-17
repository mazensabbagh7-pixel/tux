import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Recording overlay - shows live audio visualization during voice recording.
 * Replaces the chat textarea when voice input is active.
 */
import { useRef, useState, useLayoutEffect, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/common/lib/utils";
import { formatKeybind, KEYBINDS } from "@/browser/utils/ui/keybinds";
// Waveform shows last 10 seconds of audio, sampled every 50ms (200 samples)
const WINDOW_DURATION_MS = 10000;
const SAMPLE_INTERVAL_MS = 50;
const NUM_SAMPLES = WINDOW_DURATION_MS / SAMPLE_INTERVAL_MS;
// Target 60fps render cadence, throttled from rAF to stay vsync-aligned
// while avoiding 120Hz+ over-rendering on high refresh displays
const RENDER_INTERVAL_MS = 1000 / 60;
/**
 * Resolve CSS variable to its computed value.
 * Canvas 2D API doesn't understand CSS custom properties, so we need to resolve them.
 */
function resolveCssColor(color) {
    if (!color.startsWith("var("))
        return color;
    // Extract variable name from var(--name) or var(--name, fallback)
    const match = /^var\(([^,)]+)/.exec(color);
    if (!match)
        return color;
    const varName = match[1].trim();
    const computed = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
    return computed || color;
}
export const RecordingOverlay = (props) => {
    const isRecording = props.state === "recording";
    const isRequesting = props.state === "requesting";
    // Status text for non-recording states
    const statusText = isRequesting ? "Requesting microphone..." : "Transcribing...";
    // For recording state, we use inline styles with the agent color
    // For other states (requesting/transcribing), use amber classes
    const containerClasses = cn("mb-1 flex w-full flex-col items-center justify-center gap-1 rounded-md border px-3 py-2 transition-all focus:outline-none", isRecording ? "cursor-pointer" : "cursor-wait border-amber-500 bg-amber-500/10");
    return (_jsxs("button", { type: "button", onClick: isRecording ? props.onStop : undefined, disabled: !isRecording, className: containerClasses, "aria-label": isRecording ? "Stop recording" : statusText, style: isRecording
            ? {
                borderColor: props.agentColor,
                backgroundColor: `color-mix(in srgb, ${props.agentColor}, transparent 90%)`,
            }
            : undefined, children: [_jsx("div", { className: "flex h-8 w-full items-center justify-center", children: isRecording && props.mediaRecorder ? (_jsx(SlidingWaveform, { mediaRecorder: props.mediaRecorder, color: props.agentColor, height: 32 })) : (_jsx(Loader2, { className: "h-5 w-5 animate-spin text-amber-500" })) }), _jsx("span", { className: "text-xs font-medium", style: isRecording ? { color: props.agentColor } : undefined, children: isRecording ? _jsx(RecordingHints, {}) : _jsx("span", { className: "text-amber-500", children: statusText }) })] }));
};
/** Keyboard hint display for recording state */
const RecordingHints = () => (_jsxs("span", { className: "mobile-hide-shortcut-hints", children: [_jsx("span", { className: "opacity-70", children: "space" }), " send \u00B7", " ", _jsx("span", { className: "opacity-70", children: formatKeybind(KEYBINDS.TOGGLE_VOICE_INPUT) }), " review \u00B7", " ", _jsx("span", { className: "opacity-70", children: "esc" }), " cancel"] }));
/**
 * Renders a sliding window of audio amplitude over time.
 * New samples appear on the right and scroll left as time passes.
 * Falls back to a simple pulsing indicator if Web Audio API fails.
 */
const SlidingWaveform = (props) => {
    const canvasRef = useRef(null);
    const containerRef = useRef(null);
    const [containerWidth, setContainerWidth] = useState(600);
    const [audioError, setAudioError] = useState(false);
    // Audio analysis state (refs to avoid re-renders)
    const audioContextRef = useRef(null);
    const analyserRef = useRef(null);
    const samplesRef = useRef(new Array(NUM_SAMPLES).fill(0));
    const animationFrameRef = useRef(null);
    const lastRenderTimeRef = useRef(null);
    const lastSampleTimeRef = useRef(0);
    const resolvedColorRef = useRef(props.color);
    // Pre-allocate typed array to avoid GC pressure during animation
    const dataArrayRef = useRef(null);
    // Track container width for responsive canvas
    useLayoutEffect(() => {
        const container = containerRef.current;
        if (!container)
            return;
        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                setContainerWidth(entry.contentRect.width);
            }
        });
        observer.observe(container);
        setContainerWidth(container.offsetWidth);
        return () => observer.disconnect();
    }, []);
    // Initialize Web Audio API analyser
    useEffect(() => {
        const stream = props.mediaRecorder.stream;
        if (!stream)
            return;
        try {
            const audioContext = new AudioContext();
            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 256;
            analyser.smoothingTimeConstant = 0.3;
            const source = audioContext.createMediaStreamSource(stream);
            source.connect(analyser);
            audioContextRef.current = audioContext;
            analyserRef.current = analyser;
            dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);
            samplesRef.current = new Array(NUM_SAMPLES).fill(0);
            lastSampleTimeRef.current = performance.now();
            return () => {
                void audioContext.close();
                audioContextRef.current = null;
                analyserRef.current = null;
                dataArrayRef.current = null;
            };
        }
        catch (err) {
            console.error("Failed to initialize audio visualization:", err);
            setAudioError(true);
        }
    }, [props.mediaRecorder]);
    // Render loop using rAF throttled to 60fps for vsync-aligned updates
    useEffect(() => {
        if (audioError)
            return;
        resolvedColorRef.current = resolveCssColor(props.color);
        const draw = (now) => {
            const canvas = canvasRef.current;
            const analyser = analyserRef.current;
            const dataArray = dataArrayRef.current;
            if (!canvas || !analyser || !dataArray)
                return;
            // Sample audio at fixed intervals (reuse pre-allocated array)
            if (now - lastSampleTimeRef.current >= SAMPLE_INTERVAL_MS) {
                analyser.getByteTimeDomainData(dataArray);
                // Calculate RMS (root mean square) amplitude
                let sum = 0;
                for (const sample of dataArray) {
                    const normalized = (sample - 128) / 128;
                    sum += normalized * normalized;
                }
                const rms = Math.sqrt(sum / dataArray.length);
                samplesRef.current.shift();
                samplesRef.current.push(rms);
                lastSampleTimeRef.current = now;
            }
            const ctx = canvas.getContext("2d");
            if (!ctx)
                return;
            // Render bars
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            const samples = samplesRef.current;
            const numBars = samples.length;
            // Bar sizing: bars fill full width with 40% gap ratio
            const barWidth = canvas.width / (1.4 * numBars - 0.4);
            const gap = barWidth * 0.4;
            const centerY = canvas.height / 2;
            ctx.fillStyle = resolvedColorRef.current;
            for (let i = 0; i < numBars; i++) {
                const scaledAmplitude = Math.min(1, samples[i] * 3); // Boost for visibility
                const barHeight = Math.max(2, scaledAmplitude * canvas.height * 0.9);
                const x = i * (barWidth + gap);
                const y = centerY - barHeight / 2;
                ctx.beginPath();
                if (ctx.roundRect) {
                    ctx.roundRect(x, y, barWidth, barHeight, 1);
                }
                else {
                    ctx.rect(x, y, barWidth, barHeight);
                }
                ctx.fill();
            }
        };
        const renderFrame = (now) => {
            lastRenderTimeRef.current ?? (lastRenderTimeRef.current = now - RENDER_INTERVAL_MS);
            const elapsed = now - lastRenderTimeRef.current;
            if (elapsed >= RENDER_INTERVAL_MS) {
                draw(now);
                // Keep cadence stable by accounting for any drift
                lastRenderTimeRef.current = now - (elapsed % RENDER_INTERVAL_MS);
            }
            animationFrameRef.current = requestAnimationFrame(renderFrame);
        };
        animationFrameRef.current = requestAnimationFrame(renderFrame);
        return () => {
            if (animationFrameRef.current !== null) {
                cancelAnimationFrame(animationFrameRef.current);
            }
            animationFrameRef.current = null;
            lastRenderTimeRef.current = null;
        };
    }, [props.color, audioError]);
    // Fallback: simple pulsing indicator if Web Audio API unavailable
    if (audioError) {
        return (_jsx("div", { className: "flex h-full w-full items-center justify-center gap-1", children: [0, 1, 2, 3, 4].map((i) => (_jsx("div", { className: "animate-pulse rounded-full", style: {
                    width: 4,
                    height: 12 + (i % 3) * 4,
                    backgroundColor: props.color,
                    animationDelay: `${i * 100}ms`,
                } }, i))) }));
    }
    return (_jsx("div", { ref: containerRef, className: "flex h-full w-full items-center justify-center", children: _jsx("canvas", { ref: canvasRef, width: containerWidth, height: props.height, style: { width: containerWidth, height: props.height } }) }));
};
//# sourceMappingURL=RecordingOverlay.js.map