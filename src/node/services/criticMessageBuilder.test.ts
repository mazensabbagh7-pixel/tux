import { describe, expect, test } from "bun:test";

import { isCriticDoneResponse } from "./criticMessageBuilder";
import type { CompletedMessagePart } from "@/common/types/stream";

function textPart(text: string): CompletedMessagePart {
  return { type: "text", text };
}

function reasoningPart(text: string): CompletedMessagePart {
  return { type: "reasoning", text };
}

describe("isCriticDoneResponse", () => {
  test("returns true when visible text is exactly /done", () => {
    expect(isCriticDoneResponse([textPart("/done")])).toBe(true);
  });

  test("returns true when reasoning is present but text is exactly /done", () => {
    expect(isCriticDoneResponse([reasoningPart("thinking"), textPart("/done")])).toBe(true);
  });

  test("returns false when text is not exactly /done", () => {
    expect(isCriticDoneResponse([reasoningPart("thinking"), textPart("/done later")])).toBe(false);
  });

  test("returns false when no text part is present", () => {
    expect(isCriticDoneResponse([reasoningPart("/done")])).toBe(false);
  });
});
