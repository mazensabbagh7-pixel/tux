import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { ExternalLink } from "lucide-react";
import { cn } from "@/common/lib/utils";
const DOCS_BASE_URL = "https://mux.coder.com";
/**
 * A styled link to mux documentation.
 * Renders as a small badge with an external link icon.
 */
export function DocsLink({ path, children = "docs", className }) {
    return (_jsxs("a", { href: `${DOCS_BASE_URL}${path}`, target: "_blank", rel: "noopener noreferrer", className: cn("text-muted hover:text-accent inline-flex items-center gap-1 text-[10px] transition-colors", className), children: [children, _jsx(ExternalLink, { className: "h-2.5 w-2.5" })] }));
}
//# sourceMappingURL=DocsLink.js.map