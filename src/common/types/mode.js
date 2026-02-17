import { z } from "zod";
/**
 * UI Mode types
 */
export const UI_MODE_VALUES = ["plan", "exec"];
export const UIModeSchema = z.enum(UI_MODE_VALUES);
/**
 * Agent mode types
 *
 * Includes non-UI modes like "compact" used for history compaction.
 */
export const AGENT_MODE_VALUES = [...UI_MODE_VALUES, "compact"];
export const AgentModeSchema = z.enum(AGENT_MODE_VALUES);
//# sourceMappingURL=mode.js.map