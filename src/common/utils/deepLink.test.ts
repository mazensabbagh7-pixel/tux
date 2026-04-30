import { describe, expect, test } from "bun:test";
import { parseMuxDeepLink, resolveProjectPathFromProjectQuery } from "./deepLink";

describe("parseMuxDeepLink", () => {
  test("parses nux://chat/new", () => {
    const payload = parseMuxDeepLink(
      "nux://chat/new/?project=tux&projectPath=%2Ftmp%2Frepo&projectId=proj_123&prompt=hello%20world&sectionId=sec_456"
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
    expect(parseMuxDeepLink("nux://chat/old?prompt=hi")).toBeNull();
  });

  test("resolves deep-link project query by final path segment", () => {
    const resolved = resolveProjectPathFromProjectQuery(
      ["/Users/mike/repos/nux", "/Users/mike/repos/cnux"],
      "nux"
    );

    expect(resolved).toBe("/Users/mike/repos/nux");
  });

  test("falls back to substring match when no exact match exists", () => {
    const resolved = resolveProjectPathFromProjectQuery(
      ["/Users/mike/repos/coder", "/Users/mike/repos/cnux"],
      "nux"
    );

    expect(resolved).toBe("/Users/mike/repos/cnux");
  });

  test("returns null when no project matches", () => {
    expect(resolveProjectPathFromProjectQuery(["/Users/mike/repos/coder"], "nux")).toBeNull();
  });
});
