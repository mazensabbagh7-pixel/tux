import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export function PolicyBlockedScreen(props) {
    return (_jsx("div", { className: "bg-bg-dark flex h-full items-center justify-center p-6", children: _jsxs("div", { className: "bg-separator border-border-light w-full max-w-xl rounded-lg border p-6 shadow-lg", children: [_jsx("h1", { className: "text-foreground text-base font-semibold", children: "Mux is blocked by policy" }), _jsx("p", { className: "text-muted mt-2 text-sm", children: props.reason ?? "This Mux client is blocked by an admin policy." }), _jsx("p", { className: "text-muted mt-4 text-xs", children: "Contact your administrator for help." })] }) }));
}
//# sourceMappingURL=PolicyBlockedScreen.js.map