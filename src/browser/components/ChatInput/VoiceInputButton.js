import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { Mic, Loader2 } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "../ui/tooltip";
import { formatKeybind, KEYBINDS } from "@/browser/utils/ui/keybinds";
import { cn } from "@/common/lib/utils";
/** Color classes for non-recording voice input states */
const STATE_COLORS = {
    idle: "text-muted/50 hover:text-muted",
    requesting: "text-amber-500 animate-pulse",
    transcribing: "text-amber-500",
};
export const VoiceInputButton = (props) => {
    if (!props.shouldShowUI)
        return null;
    // Allow stop/cancel controls while actively recording or transcribing,
    // even if the provider was disabled mid-session (e.g. from another window).
    const isActiveSession = props.state === "recording" || props.state === "transcribing";
    const needsHttps = props.requiresSecureContext;
    const providerDisabled = !needsHttps && !props.isProviderEnabled;
    const needsApiKey = !needsHttps && !providerDisabled && !props.isApiKeySet;
    const isDisabled = !isActiveSession && (needsHttps || providerDisabled || needsApiKey);
    const label = isDisabled
        ? needsHttps
            ? "Voice input (requires HTTPS)"
            : providerDisabled
                ? "Voice input (OpenAI provider disabled)"
                : "Voice input (requires OpenAI API key)"
        : props.state === "recording"
            ? "Stop recording"
            : props.state === "transcribing"
                ? "Transcribing..."
                : "Voice input";
    const isRecording = props.state === "recording";
    const isTranscribing = props.state === "transcribing";
    const colorClass = isDisabled
        ? "text-muted/50"
        : isRecording
            ? "animate-pulse"
            : STATE_COLORS[props.state];
    const Icon = isTranscribing ? Loader2 : Mic;
    return (_jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("button", { type: "button", onClick: props.onToggle, disabled: (props.disabled ?? false) || isTranscribing || isDisabled, "aria-label": label, "aria-pressed": isRecording, className: cn("inline-flex items-center justify-center rounded p-0.5 transition-colors duration-150", "disabled:cursor-not-allowed disabled:opacity-40", colorClass), style: isRecording && !isDisabled ? { color: props.agentColor } : undefined, children: _jsx(Icon, { className: cn("h-4 w-4", isTranscribing && "animate-spin"), strokeWidth: 1.5 }) }) }), _jsx(TooltipContent, { children: needsHttps ? (_jsxs(_Fragment, { children: ["Voice input requires a secure connection.", _jsx("br", {}), "Use HTTPS or access via localhost."] })) : providerDisabled ? (_jsxs(_Fragment, { children: ["Voice input is disabled because OpenAI provider is turned off.", _jsx("br", {}), "Enable OpenAI in Settings \u2192 Providers."] })) : needsApiKey ? (_jsxs(_Fragment, { children: ["Voice input requires OpenAI API key.", _jsx("br", {}), "Configure in Settings \u2192 Providers."] })) : (_jsxs(_Fragment, { children: [_jsx("strong", { children: "Voice input" }), " \u2014", " ", _jsx("span", { className: "mobile-hide-shortcut-hints", children: "press space on empty input" }), _jsx("br", {}), _jsxs("span", { className: "mobile-hide-shortcut-hints", children: ["or ", formatKeybind(KEYBINDS.TOGGLE_VOICE_INPUT), " anytime"] }), _jsx("br", {}), _jsx("br", {}), _jsx("span", { className: "mobile-hide-shortcut-hints", children: "While recording: space sends, esc cancels" })] })) })] }));
};
//# sourceMappingURL=VoiceInputButton.js.map