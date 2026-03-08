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

  test("restores dequeued Flow Prompting saves when dispatch fails", async () => {
    const state = {
      disposed: false,
      turnPhase: "idle",
      flowPromptUpdate: {
        message: "pending flow prompt",
        options: undefined,
        internal: undefined,
      },
      messageQueue: {
        isEmpty: () => true,
        getQueueDispatchMode: () => null,
      },
      setTurnPhase(phase: string) {
        this.turnPhase = phase;
      },
      syncQueuedMessageFlag() {
        // No-op for this focused dispatch test.
      },
      sendMessage: () => Promise.resolve({ success: false }),
    };

    (
      AgentSession.prototype as unknown as {
        sendQueuedMessages(this: typeof state): void;
      }
    ).sendQueuedMessages.call(state);

    await Promise.resolve();
    await Promise.resolve();

    expect(state.flowPromptUpdate).toBeTruthy();
    expect(state.turnPhase).toBe("idle");
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
