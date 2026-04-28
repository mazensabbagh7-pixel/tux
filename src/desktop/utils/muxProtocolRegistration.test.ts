import { describe, expect, test } from "bun:test";
import * as path from "path";
import {
  getMuxDeepLinksFromArgv,
  getMuxProtocolClientRegistration,
} from "./muxProtocolRegistration";

describe("getMuxProtocolClientRegistration", () => {
  test("adds -- before the app entry path for Windows defaultApp registration", () => {
    expect(
      getMuxProtocolClientRegistration({
        platform: "win32",
        isPackaged: false,
        defaultApp: true,
        argv: ["electron", "./src/cli/index.ts"],
        execPath: "/tmp/electron",
      })
    ).toEqual({
      executable: "/tmp/electron",
      args: ["--", path.resolve("./src/cli/index.ts")],
    });
  });

  test("keeps non-Windows defaultApp registration unchanged", () => {
    expect(
      getMuxProtocolClientRegistration({
        platform: "linux",
        isPackaged: false,
        defaultApp: true,
        argv: ["electron", "./src/cli/index.ts"],
        execPath: "/tmp/electron",
      })
    ).toEqual({
      executable: "/tmp/electron",
      args: [path.resolve("./src/cli/index.ts")],
    });
  });

  test("falls back to packaged/default protocol registration when no defaultApp command is needed", () => {
    expect(
      getMuxProtocolClientRegistration({
        platform: "win32",
        isPackaged: true,
        defaultApp: undefined,
        argv: ["/Applications/Tux.app/Contents/MacOS/Tux"],
        execPath: "/Applications/Tux.app/Contents/MacOS/Tux",
      })
    ).toBeNull();
  });
});

describe("getMuxDeepLinksFromArgv", () => {
  test("finds tux:// argv entries even when a -- separator is present", () => {
    expect(
      getMuxDeepLinksFromArgv([
        "electron",
        ".",
        "--",
        "./src/cli/index.ts",
        "tux://chat/new?project=tux",
      ])
    ).toEqual(["tux://chat/new?project=tux"]);
  });

  test("ignores non-tux arguments", () => {
    expect(
      getMuxDeepLinksFromArgv(["electron", ".", "--", "./src/cli/index.ts", "--help"])
    ).toEqual([]);
  });
});
