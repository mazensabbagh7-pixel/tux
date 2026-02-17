import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export function LoadingScreen(props) {
    // Keep the markup/classes in sync with index.html's boot loader so the inline styles
    // apply immediately and we avoid a flash of unstyled / missing spinner before Tailwind/globals.css loads.
    return (_jsx("div", { className: "boot-loader", role: "status", "aria-live": "polite", "aria-busy": "true", children: _jsxs("div", { className: "boot-loader__inner", children: [_jsx("div", { className: "boot-loader__spinner", "aria-hidden": "true" }), _jsx("p", { className: "boot-loader__text", children: props.statusText ?? "Loading workspaces..." })] }) }));
}
//# sourceMappingURL=LoadingScreen.js.map