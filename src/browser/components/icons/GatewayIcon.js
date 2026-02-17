import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React from "react";
/**
 * Gateway icon - represents routing through Mux Gateway.
 * Circle with M logo. Active state adds outer ring.
 */
export const GatewayIcon = React.forwardRef(function GatewayIcon(props, ref) {
    const { active, ...svgProps } = props;
    return (_jsxs("svg", { ref: ref, xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", ...svgProps, children: [active && _jsx("circle", { cx: "12", cy: "12", r: "11", strokeWidth: "1", opacity: "0.5" }), _jsx("circle", { cx: "12", cy: "12", r: "8" }), _jsx("path", { d: "M8 16V8l4 5 4-5v8" })] }));
});
GatewayIcon.displayName = "GatewayIcon";
//# sourceMappingURL=GatewayIcon.js.map