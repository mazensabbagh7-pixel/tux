export const FLOW_PROMPTS_DIR = ".mux/prompts";

export function getFlowPromptRelativePath(workspaceName: string): string {
  return `${FLOW_PROMPTS_DIR}/${workspaceName}.md`;
}

export function getFlowPromptPathMarkerLine(flowPromptPath: string): string {
  return `Flow prompt file path: ${flowPromptPath} (MUST use this exact path string for tool calls; do NOT rewrite it into another form, even if it resolves to the same file)`;
}
