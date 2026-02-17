import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Button } from "@/browser/components/ui/button";
export function StartupConnectionError(props) {
    return (_jsx("div", { className: "boot-loader", role: "alert", "aria-live": "polite", children: _jsxs("div", { className: "boot-loader__inner", children: [_jsx("p", { className: "boot-loader__text", children: "Unable to connect to the Mux backend." }), _jsxs("p", { className: "boot-loader__text max-w-[720px] text-center", children: [_jsx("span", { className: "font-medium", children: "Details:" }), " ", props.error] }), _jsxs("p", { className: "boot-loader__text max-w-[720px] text-center", children: ["If you're using a reverse proxy, ensure it supports WebSocket upgrades to", " ", _jsx("code", { children: "/orpc/ws" }), "."] }), _jsx(Button, { onClick: props.onRetry, children: "Retry" })] }) }));
}
//# sourceMappingURL=StartupConnectionError.js.map