import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Bot, X } from "lucide-react";
/**
 * Banner prompting the user to run /init to create an AGENTS.md.
 * Shown on the project creation screen for newly added projects.
 */
export function AgentsInitBanner(props) {
    return (_jsxs("div", { className: "bg-bg-dark border-border-medium flex items-center gap-3 rounded-lg border px-4 py-3", "data-testid": "agents-init-banner", children: [_jsx(Bot, { className: "text-muted-foreground h-5 w-5 shrink-0" }), _jsxs("div", { className: "flex flex-1 flex-col gap-0.5", children: [_jsx("span", { className: "text-foreground text-sm font-medium", children: "Initialize this repo for better results" }), _jsxs("span", { className: "text-muted-foreground text-xs", children: ["Add or improve an", " ", _jsx("code", { className: "bg-bg-dark-hover rounded px-1 font-mono", children: "AGENTS.md" }), "so Mux learns your repo\u2019s commands, conventions, and constraints."] })] }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("button", { type: "button", onClick: () => void props.onRunInit(), className: "bg-accent hover:bg-accent/80 text-accent-foreground inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors", "data-testid": "agents-init-run", children: "Run /init" }), _jsx("button", { type: "button", onClick: props.onDismiss, "aria-label": "Dismiss", className: "text-muted-foreground hover:text-foreground inline-flex items-center rounded p-1 transition-colors", "data-testid": "agents-init-dismiss", children: _jsx(X, { className: "h-4 w-4" }) })] })] }));
}
//# sourceMappingURL=AgentsInitBanner.js.map