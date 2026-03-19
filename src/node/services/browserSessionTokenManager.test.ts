import { afterEach, describe, expect, it, setSystemTime, vi } from "bun:test";
import { BROWSER_SESSION_DEFAULTS } from "@/common/constants/browser";
import { AssertionError } from "@/common/utils/assert";
import { BrowserSessionTokenManager } from "./browserSessionTokenManager";

describe("BrowserSessionTokenManager", () => {
  afterEach(() => {
    setSystemTime();
    vi.useRealTimers();
  });

  it("mints a 64-character hex token", () => {
    const manager = new BrowserSessionTokenManager();

    try {
      const token = manager.mint("workspace-1", "session-1");

      expect(token).toMatch(/^[0-9a-f]{64}$/);
    } finally {
      manager.dispose();
    }
  });

  it("mints unique tokens for successive calls", () => {
    const manager = new BrowserSessionTokenManager();

    try {
      const firstToken = manager.mint("workspace-1", "session-1");
      const secondToken = manager.mint("workspace-1", "session-1");

      expect(firstToken).not.toBe(secondToken);
    } finally {
      manager.dispose();
    }
  });

  it("asserts when mint arguments are empty", () => {
    const manager = new BrowserSessionTokenManager();

    try {
      expect(() => manager.mint("", "session-1")).toThrow(AssertionError);
      expect(() => manager.mint("workspace-1", "")).toThrow(AssertionError);
    } finally {
      manager.dispose();
    }
  });

  it("validates a freshly minted token and returns the bound identifiers", () => {
    const manager = new BrowserSessionTokenManager();

    try {
      const token = manager.mint("workspace-1", "session-1");

      expect(manager.validate(token)).toEqual({
        workspaceId: "workspace-1",
        sessionId: "session-1",
      });
    } finally {
      manager.dispose();
    }
  });

  it("consumes a token after validation", () => {
    const manager = new BrowserSessionTokenManager();

    try {
      const token = manager.mint("workspace-1", "session-1");

      expect(manager.validate(token)).toEqual({
        workspaceId: "workspace-1",
        sessionId: "session-1",
      });
      expect(manager.validate(token)).toBeNull();
    } finally {
      manager.dispose();
    }
  });

  it("returns null for unknown tokens", () => {
    const manager = new BrowserSessionTokenManager();

    try {
      expect(manager.validate("unknown-token")).toBeNull();
    } finally {
      manager.dispose();
    }
  });

  it("returns null for expired tokens", () => {
    setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

    const manager = new BrowserSessionTokenManager();

    try {
      const token = manager.mint("workspace-1", "session-1");

      setSystemTime(Date.now() + BROWSER_SESSION_DEFAULTS.TOKEN_TTL_MS + 1);

      expect(manager.validate(token)).toBeNull();
      expect(manager.validate(token)).toBeNull();
    } finally {
      manager.dispose();
    }
  });

  it("dispose clears tokens and stops the cleanup timer", () => {
    const manager = new BrowserSessionTokenManager();
    const token = manager.mint("workspace-1", "session-1");
    const internalManager = manager as unknown as {
      cleanupTimer: ReturnType<typeof setInterval> | null;
    };

    expect(internalManager.cleanupTimer).not.toBeNull();

    manager.dispose();

    expect(internalManager.cleanupTimer).toBeNull();
    expect(manager.validate(token)).toBeNull();
  });
});
