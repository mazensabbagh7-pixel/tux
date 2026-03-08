import { getFlowPromptPathMarkerLine } from "@/common/constants/flowPrompting";

export function getFlowPromptFileHint(flowPromptPath: string, exists: boolean): string | null {
  if (!exists) {
    return null;
  }

  const exactPathRule = flowPromptPath.startsWith("~/")
    ? "You must use the flow prompt file path exactly as shown (including the leading `~/`); do not expand `~` or use alternate paths that resolve to the same file."
    : "You must use the flow prompt file path exactly as shown; do not rewrite it or use alternate paths that resolve to the same file.";

  return `${getFlowPromptPathMarkerLine(flowPromptPath)}

A flow prompt file exists at: ${flowPromptPath}. If the full prompt is already included in the chat history, do NOT re-read the file. Otherwise, read it when the current task needs the latest flow prompt context.

${exactPathRule}`;
}
