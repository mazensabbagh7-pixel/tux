import { describe, expect, test } from "bun:test";
import { parseMuxDeepLink, resolveProjectPathFromProjectQuery } from "./deepLink";

describe("parseMuxDeepLink", () => {
  test("parses tux://chat/new", () => {
    const payload = parseMuxDeepLink(
      "tux://chat/new/?project=tux&projectPath=%2Ftmp%2Frepo&projectId=proj_123&prompt=hello%20world&sectionId=sec_456"
    );

    expect(payload).toEqual({
      type: "new_chat",
      project: "tux",
      projectPath: "/tmp/repo",
      projectId: "proj_123",
      prompt: "hello world",
      sectionId: "sec_456",
    });
  });

  test("returns null for invalid scheme", () => {
    expect(parseMuxDeepLink("http://chat/new?prompt=hi")).toBeNull();
  });

  test("returns null for unknown route", () => {
    expect(parseMuxDeepLink("tux://chat/old?prompt=hi")).toBeNull();
  });

  test("resolves deep-link project query by final path segment", () => {
    const resolved = resolveProjectPathFromProjectQuery(
      ["/Users/mike/repos/tux", "/Users/mike/repos/ctux"],
      "tux"
    );

    expect(resolved).toBe("/Users/mike/repos/tux");
  });

  test("falls back to substring match when no exact match exists", () => {
    const resolved = resolveProjectPathFromProjectQuery(
      ["/Users/mike/repos/coder", "/Users/mike/repos/ctux"],
      "tux"
    );

    expect(resolved).toBe("/Users/mike/repos/ctux");
  });

  test("returns null when no project matches", () => {
    expect(resolveProjectPathFromProjectQuery(["/Users/mike/repos/coder"], "tux")).toBeNull();
  });
});
