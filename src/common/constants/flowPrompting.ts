export const FLOW_PROMPTS_DIR = ".mux/prompts";
export const FLOW_PROMPT_AUTO_SEND_MODES = ["off", "end-of-turn"] as const;

export type FlowPromptAutoSendMode = (typeof FLOW_PROMPT_AUTO_SEND_MODES)[number];

export function getFlowPromptRelativePath(workspaceName: string): string {
  return `${FLOW_PROMPTS_DIR}/${workspaceName}.md`;
}

export function getFlowPromptPathMarkerLine(flowPromptPath: string): string {
  return `Flow prompt file path: ${flowPromptPath} (MUST use this exact path string for tool calls; do NOT rewrite it into another form, even if it resolves to the same file)`;
}
