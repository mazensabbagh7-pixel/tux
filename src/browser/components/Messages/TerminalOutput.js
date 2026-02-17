import { jsx as _jsx } from "react/jsx-runtime";
import { cn } from "@/common/lib/utils";
export const TerminalOutput = ({ output, isError = false, className, }) => {
    return (_jsx("pre", { className: cn("m-0 p-2 bg-black/30 rounded-sm font-mono text-[11px] leading-relaxed", "overflow-x-auto max-h-[300px] overflow-y-auto whitespace-pre-wrap break-all", isError ? "text-danger-soft" : "text-light", className), children: output }));
};
//# sourceMappingURL=TerminalOutput.js.map