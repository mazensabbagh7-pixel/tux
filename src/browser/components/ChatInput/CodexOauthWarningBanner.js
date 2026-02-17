import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/browser/components/ui/button";
import { KNOWN_MODELS } from "@/common/constants/knownModels";
// GPT-5.3 Codex is the only model that currently requires ChatGPT OAuth.
// Show this early warning before send so users don't hit confusing access errors.
const CODEX_OAUTH_WARNING_MODEL = KNOWN_MODELS.GPT_53_CODEX.id;
export function CodexOauthWarningBanner(props) {
    const shouldShowWarning = props.activeModel === CODEX_OAUTH_WARNING_MODEL && props.codexOauthSet === false;
    if (!shouldShowWarning) {
        return null;
    }
    return (_jsxs("div", { "data-testid": "codex-oauth-warning-banner", className: "bg-warning/10 border-warning/30 text-warning mt-1 mb-2 flex items-start justify-between gap-3 rounded-md border px-3 py-2 text-xs", children: [_jsxs("div", { className: "flex min-w-0 items-start gap-2", children: [_jsx(AlertTriangle, { "aria-hidden": "true", className: "mt-0.5 h-3.5 w-3.5 shrink-0" }), _jsxs("p", { className: "leading-relaxed", children: [_jsx("span", { className: "font-medium", children: "GPT-5.3 Codex OAuth is not connected." }), " Open Settings \u2192 Providers to connect OpenAI before sending."] })] }), _jsx(Button, { type: "button", variant: "outline", size: "xs", onClick: props.onOpenProviders, className: "border-warning/40 text-warning hover:bg-warning/15 hover:text-warning shrink-0", children: "Providers" })] }));
}
//# sourceMappingURL=CodexOauthWarningBanner.js.map