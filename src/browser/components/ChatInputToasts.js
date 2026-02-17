import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { SolutionLabel } from "./ChatInputToast";
import { DocsLink } from "./DocsLink";
import { formatSendMessageError } from "@/common/utils/errors/formatSendError";
export function createInvalidCompactModelToast(model) {
    return {
        id: Date.now().toString(),
        type: "error",
        title: "Invalid Model",
        message: `Invalid model format: "${model}". Use an alias or provider:model-id.`,
        solution: (_jsxs(_Fragment, { children: [_jsx(SolutionLabel, { children: "Try an alias:" }), "/compact -m sonnet", _jsx("br", {}), "/compact -m gpt", _jsx("br", {}), _jsx("br", {}), _jsx(SolutionLabel, { children: "Supported models:" }), _jsx(DocsLink, { path: "/config/models", children: "mux.coder.com/models" })] })),
    };
}
/**
 * Creates a toast message for command-related errors and help messages
 */
export const createCommandToast = (parsed) => {
    if (!parsed)
        return null;
    switch (parsed.type) {
        case "model-help":
            return {
                id: Date.now().toString(),
                type: "error",
                title: "Model Command",
                message: "Select AI model for this session or send a one-shot message",
                solution: (_jsxs(_Fragment, { children: [_jsx(SolutionLabel, { children: "Set model for session:" }), "/model sonnet", _jsx("br", {}), "/model anthropic:claude-sonnet-4-5", _jsx("br", {}), _jsx("br", {}), _jsx(SolutionLabel, { children: "One-shot (single message):" }), "/haiku explain this code", _jsx("br", {}), "/opus review my changes", _jsx("br", {}), _jsx("br", {}), _jsx(SolutionLabel, { children: "With thinking override:" }), "/opus+high deep review", _jsx("br", {}), "/haiku+0 quick answer (0=lowest for model)", _jsx("br", {}), "/+2 use current model, thinking level 2"] })),
            };
        case "fork-help":
            return {
                id: Date.now().toString(),
                type: "error",
                title: "Fork Command",
                message: "Fork current workspace with a new name",
                solution: (_jsxs(_Fragment, { children: [_jsx(SolutionLabel, { children: "Usage:" }), "/fork <new-name> [optional start message]", _jsx("br", {}), _jsx("br", {}), _jsx(SolutionLabel, { children: "Examples:" }), "/fork experiment-branch", _jsx("br", {}), "/fork refactor Continue with refactoring approach"] })),
            };
        case "command-missing-args":
            return {
                id: Date.now().toString(),
                type: "error",
                title: "Missing Arguments",
                message: `/${parsed.command} requires arguments`,
                solution: (_jsxs(_Fragment, { children: [_jsx(SolutionLabel, { children: "Usage:" }), parsed.usage] })),
            };
        case "command-invalid-args":
            return {
                id: Date.now().toString(),
                type: "error",
                title: "Invalid Argument",
                message: `'${parsed.input}' is not valid for /${parsed.command}`,
                solution: (_jsxs(_Fragment, { children: [_jsx(SolutionLabel, { children: "Usage:" }), parsed.usage] })),
            };
        case "unknown-command": {
            const cmd = "/" + parsed.command + (parsed.subcommand ? " " + parsed.subcommand : "");
            return {
                id: Date.now().toString(),
                type: "error",
                message: `Unknown command: ${cmd}`,
            };
        }
        default:
            return null;
    }
};
/**
 * Converts a SendMessageError to a Toast for display
 */
export const createErrorToast = (error) => {
    switch (error.type) {
        case "api_key_not_found": {
            const formatted = formatSendMessageError(error);
            return {
                id: Date.now().toString(),
                type: "error",
                title: "API Key Not Found",
                message: `The ${error.provider} provider requires an API key to function.`,
                solution: (_jsxs(_Fragment, { children: [_jsx(SolutionLabel, { children: "Fix:" }), formatted.resolutionHint ?? "Open Settings → Providers and add an API key.", _jsx("br", {}), _jsx(DocsLink, { path: "/config/providers", children: "mux.coder.com/providers" })] })),
            };
        }
        case "oauth_not_connected": {
            const formatted = formatSendMessageError(error);
            return {
                id: Date.now().toString(),
                type: "error",
                title: "OAuth Not Connected",
                message: `The ${error.provider} provider requires an OAuth connection to function.`,
                solution: (_jsxs(_Fragment, { children: [_jsx(SolutionLabel, { children: "Fix:" }), formatted.resolutionHint ?? "Open Settings → Providers and connect your account.", _jsx("br", {}), _jsx(DocsLink, { path: "/config/providers", children: "mux.coder.com/providers" })] })),
            };
        }
        case "provider_disabled": {
            const formatted = formatSendMessageError(error);
            return {
                id: Date.now().toString(),
                type: "error",
                title: "Provider Disabled",
                message: formatted.message,
                solution: (_jsxs(_Fragment, { children: [_jsx(SolutionLabel, { children: "Fix:" }), formatted.resolutionHint ?? "Open Settings → Providers and enable this provider.", _jsx("br", {}), _jsx(DocsLink, { path: "/config/providers", children: "mux.coder.com/providers" })] })),
            };
        }
        case "provider_not_supported": {
            const formatted = formatSendMessageError(error);
            return {
                id: Date.now().toString(),
                type: "error",
                title: "Provider Not Supported",
                message: formatted.message,
                solution: (_jsxs(_Fragment, { children: [_jsx(SolutionLabel, { children: "Try This:" }), "Choose a supported provider in Settings \u2192 Providers.", _jsx("br", {}), _jsx(DocsLink, { path: "/config/providers", children: "mux.coder.com/providers" })] })),
            };
        }
        case "invalid_model_string": {
            const formatted = formatSendMessageError(error);
            return {
                id: Date.now().toString(),
                type: "error",
                title: "Invalid Model Format",
                message: formatted.message,
                solution: (_jsxs(_Fragment, { children: [_jsx(SolutionLabel, { children: "Expected Format:" }), "provider:model-name (e.g., anthropic:claude-opus-4-1)"] })),
            };
        }
        case "incompatible_workspace": {
            return {
                id: Date.now().toString(),
                type: "error",
                title: "Incompatible Workspace",
                message: error.message,
                solution: (_jsxs(_Fragment, { children: [_jsx(SolutionLabel, { children: "Solution:" }), "Upgrade mux to use this workspace, or delete it and create a new one."] })),
            };
        }
        case "unknown":
        default: {
            const formatted = formatSendMessageError(error);
            return {
                id: Date.now().toString(),
                type: "error",
                title: "Message Send Failed",
                message: formatted.message,
            };
        }
    }
};
//# sourceMappingURL=ChatInputToasts.js.map