import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
// Use CSS variables from globals.css
const levelStyles = {
    log: { color: "var(--color-muted-foreground)" },
    warn: { color: "var(--color-warning, #f59e0b)" },
    error: { color: "var(--color-error, #ef4444)" },
};
export const ConsoleOutputDisplay = ({ output }) => {
    return (_jsx("div", { className: "space-y-0.5 font-mono text-[11px]", children: output.map((record, i) => (_jsxs("div", { className: "flex gap-2", style: levelStyles[record.level], children: [_jsxs("span", { className: "opacity-60", children: ["[", record.level, "]"] }), _jsx("span", { children: record.args.map((arg, j) => {
                        // Handle all types to avoid Object.toString() issues
                        let display;
                        if (arg === null) {
                            display = "null";
                        }
                        else if (arg === undefined) {
                            display = "undefined";
                        }
                        else if (typeof arg === "string") {
                            display = arg;
                        }
                        else if (typeof arg === "number" || typeof arg === "boolean") {
                            display = String(arg);
                        }
                        else {
                            // objects, arrays, symbols, functions - JSON.stringify handles them all
                            display = JSON.stringify(arg);
                        }
                        return (_jsxs("span", { children: [display, j < record.args.length - 1 ? " " : ""] }, j));
                    }) })] }, i))) }));
};
//# sourceMappingURL=ConsoleOutput.js.map