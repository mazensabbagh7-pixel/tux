import { getFlowPromptFileHint } from "./flowPrompting";

describe("getFlowPromptFileHint", () => {
  it("returns null when the flow prompt file does not exist", () => {
    expect(getFlowPromptFileHint("/tmp/flow.md", false)).toBeNull();
  });

  it("returns an exact-path hint when the file exists", () => {
    const hint = getFlowPromptFileHint("/tmp/workspace/.mux/prompts/feature-branch.md", true);

    expect(hint).not.toBeNull();
    expect(hint).toContain("Flow prompt file path:");
    expect(hint).toContain("/tmp/workspace/.mux/prompts/feature-branch.md");
    expect(hint).toContain("do NOT re-read the file");
  });
});
