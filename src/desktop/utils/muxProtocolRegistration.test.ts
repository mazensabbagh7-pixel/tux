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
        argv: ["/Applications/Nux.app/Contents/MacOS/Nux"],
        execPath: "/Applications/Nux.app/Contents/MacOS/Nux",
      })
    ).toBeNull();
  });
});

describe("getMuxDeepLinksFromArgv", () => {
  test("finds nux:// argv entries even when a -- separator is present", () => {
    expect(
      getMuxDeepLinksFromArgv([
        "electron",
        ".",
        "--",
        "./src/cli/index.ts",
        "nux://chat/new?project=tux",
      ])
    ).toEqual(["nux://chat/new?project=tux"]);
  });

  test("ignores non-nux arguments", () => {
    expect(
      getMuxDeepLinksFromArgv(["electron", ".", "--", "./src/cli/index.ts", "--help"])
    ).toEqual([]);
  });
});
