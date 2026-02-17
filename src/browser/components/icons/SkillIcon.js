import { jsx as _jsx } from "react/jsx-runtime";
import { GraduationCap } from "lucide-react";
import { cn } from "@/common/lib/utils";
/**
 * Icon representing agent skills.
 * Used in skill tool call displays and the skill indicator in WorkspaceHeader.
 */
export const SkillIcon = (props) => {
    return _jsx(GraduationCap, { "aria-hidden": "true", className: cn("h-4 w-4", props.className) });
};
//# sourceMappingURL=SkillIcon.js.map