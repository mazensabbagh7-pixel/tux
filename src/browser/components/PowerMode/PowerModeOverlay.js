import { jsx as _jsx } from "react/jsx-runtime";
import { useEffect, useRef } from "react";
export function PowerModeOverlay(props) {
    const canvasRef = useRef(null);
    useEffect(() => {
        const canvas = canvasRef.current;
        props.engine.setCanvas(canvas);
        props.engine.setShakeElement(document.getElementById("root"));
        return () => {
            props.engine.setCanvas(null);
            props.engine.setShakeElement(null);
        };
    }, [props.engine]);
    return (_jsx("canvas", { ref: canvasRef, className: "pointer-events-none fixed inset-0 z-[9999] h-full w-full", "data-component": "PowerModeOverlay" }));
}
//# sourceMappingURL=PowerModeOverlay.js.map