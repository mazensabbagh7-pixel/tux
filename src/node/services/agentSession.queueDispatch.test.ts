import { describe, expect, test } from "bun:test";

import { AgentSession } from "./agentSession";

describe("AgentSession tool-end queue semantics", () => {
  function hasToolEndQueuedWork(state: {
    messageQueue: {
      isEmpty: () => boolean;
      getQueueDispatchMode: () => "tool-end" | "turn-end" | null;
    };
    flowPromptUpdate?: unknown;
  }): boolean {
    return (
      AgentSession.prototype as unknown as {
        hasToolEndQueuedWork(this: {
          messageQueue: {
            isEmpty: () => boolean;
            getQueueDispatchMode: () => "tool-end" | "turn-end" | null;
          };
          flowPromptUpdate?: unknown;
        }): boolean;
      }
    ).hasToolEndQueuedWork.call(state);
  }

  test("ignores pending Flow Prompting saves while only turn-end user messages are queued", () => {
    expect(
      hasToolEndQueuedWork({
        messageQueue: {
          isEmpty: () => false,
          getQueueDispatchMode: () => "turn-end",
        },
        flowPromptUpdate: { message: "pending flow prompt" },
      })
    ).toBe(false);
  });

  test("still reports tool-end work when Flow Prompting is the only pending queue", () => {
    expect(
      hasToolEndQueuedWork({
        messageQueue: {
          isEmpty: () => true,
          getQueueDispatchMode: () => null,
        },
        flowPromptUpdate: { message: "pending flow prompt" },
      })
    ).toBe(true);
  });
});
