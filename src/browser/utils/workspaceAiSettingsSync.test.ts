import { describe, expect, test } from "bun:test";

import {
  clearPendingWorkspaceAiSettings,
  markPendingWorkspaceAiSettings,
  shouldApplyWorkspaceAiSettingsFromBackend,
} from "@/browser/utils/workspaceAiSettingsSync";

let workspaceCounter = 0;

function nextWorkspaceId(): string {
  workspaceCounter += 1;
  return `workspace-ai-settings-sync-test-${workspaceCounter}`;
}

describe("workspaceAiSettingsSync", () => {
  test("allows backend metadata when no guard is active", () => {
    const workspaceId = nextWorkspaceId();

    expect(
      shouldApplyWorkspaceAiSettingsFromBackend(workspaceId, "exec", {
        model: "openai:gpt-5.4",
        thinkingLevel: "medium",
      })
    ).toBe(true);
  });

  test("blocks non-matching backend metadata while a guard is active", () => {
    const workspaceId = nextWorkspaceId();

    markPendingWorkspaceAiSettings(workspaceId, "exec", {
      model: "openai:gpt-5.4",
      thinkingLevel: "xhigh",
    });

    expect(
      shouldApplyWorkspaceAiSettingsFromBackend(workspaceId, "exec", {
        model: "openai:gpt-5.4",
        thinkingLevel: "off",
      })
    ).toBe(false);

    clearPendingWorkspaceAiSettings(workspaceId, "exec");
  });

  test("blocks matching backend metadata while a guard is active", () => {
    const workspaceId = nextWorkspaceId();

    markPendingWorkspaceAiSettings(workspaceId, "exec", {
      model: "openai:gpt-5.4",
      thinkingLevel: "xhigh",
    });

    expect(
      shouldApplyWorkspaceAiSettingsFromBackend(workspaceId, "exec", {
        model: "openai:gpt-5.4",
        thinkingLevel: "xhigh",
      })
    ).toBe(false);
    expect(
      shouldApplyWorkspaceAiSettingsFromBackend(workspaceId, "exec", {
        model: "openai:gpt-5.4",
        thinkingLevel: "xhigh",
      })
    ).toBe(false);

    clearPendingWorkspaceAiSettings(workspaceId, "exec");

    expect(
      shouldApplyWorkspaceAiSettingsFromBackend(workspaceId, "exec", {
        model: "openai:gpt-5.4",
        thinkingLevel: "xhigh",
      })
    ).toBe(true);
  });

  test("keeps the guard active across matching then stale backend events", () => {
    const workspaceId = nextWorkspaceId();

    markPendingWorkspaceAiSettings(workspaceId, "exec", {
      model: "openai:gpt-5.4",
      thinkingLevel: "xhigh",
    });

    expect(
      shouldApplyWorkspaceAiSettingsFromBackend(workspaceId, "exec", {
        model: "openai:gpt-5.4",
        thinkingLevel: "xhigh",
      })
    ).toBe(false);
    expect(
      shouldApplyWorkspaceAiSettingsFromBackend(workspaceId, "exec", {
        model: "openai:gpt-5.4",
        thinkingLevel: "off",
      })
    ).toBe(false);

    clearPendingWorkspaceAiSettings(workspaceId, "exec");

    expect(
      shouldApplyWorkspaceAiSettingsFromBackend(workspaceId, "exec", {
        model: "openai:gpt-5.4",
        thinkingLevel: "off",
      })
    ).toBe(true);
  });
});
