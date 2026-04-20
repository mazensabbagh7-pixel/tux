import { afterEach, describe, expect, test } from "bun:test";
import { GlobalWindow } from "happy-dom";
import {
  getAppBasePath,
  joinAppBasePath,
  refreshAppBasePath,
  stripAppBasePath,
} from "./appBasePath";

function installWindow(options: { href: string; baseHref?: string | null }): void {
  const happyWindow = new GlobalWindow({ url: options.href });
  globalThis.window = happyWindow as unknown as Window & typeof globalThis;
  globalThis.document = happyWindow.document as unknown as Document;

  if (options.baseHref !== undefined && options.baseHref !== null) {
    const baseEl = globalThis.document.createElement("base");
    baseEl.setAttribute("href", options.baseHref);
    const head = globalThis.document.head;
    head.insertBefore(baseEl, head.firstChild);
  }

  refreshAppBasePath();
}

function teardownWindow(): void {
  globalThis.window = undefined as unknown as Window & typeof globalThis;
  globalThis.document = undefined as unknown as Document;
  refreshAppBasePath();
}

describe("appBasePath", () => {
  afterEach(teardownWindow);

  test("no proxy prefix: identity behavior", () => {
    installWindow({ href: "https://mux.example.com/settings", baseHref: "./" });
    expect(getAppBasePath()).toBe("/");
    expect(stripAppBasePath("/settings")).toBe("/settings");
    expect(joinAppBasePath("/settings")).toBe("/settings");
  });

  test("Coder app-proxy prefix: strips and re-applies correctly", () => {
    // Coder serves mux at `/@user/ws.main/apps/mux/` and injects `<base href="./">`
    // so `document.baseURI` resolves to the full public prefix.
    installWindow({
      href: "https://coder.example.com/@user/ws.main/apps/mux/settings",
      baseHref: "./",
    });
    expect(getAppBasePath()).toBe("/@user/ws.main/apps/mux/");

    // URL bar → router internal.
    expect(stripAppBasePath("/@user/ws.main/apps/mux/settings")).toBe("/settings");
    expect(stripAppBasePath("/@user/ws.main/apps/mux/")).toBe("/");
    expect(stripAppBasePath("/@user/ws.main/apps/mux")).toBe("/");

    // Router internal → URL bar.
    expect(joinAppBasePath("/settings")).toBe("/@user/ws.main/apps/mux/settings");
    expect(joinAppBasePath("/")).toBe("/@user/ws.main/apps/mux/");
    expect(joinAppBasePath("/workspace/abc?x=1")).toBe("/@user/ws.main/apps/mux/workspace/abc?x=1");
  });

  test("nested request URL with relative-climb <base href>: recovers the public prefix", () => {
    // When the browser hits `/@user/ws.main/apps/mux/settings/general`, the
    // server-injected `<base href="./../">` makes `document.baseURI` resolve
    // to the SPA root (`/@user/ws.main/apps/mux/`).
    installWindow({
      href: "https://coder.example.com/@user/ws.main/apps/mux/settings/general",
      baseHref: "./../",
    });
    expect(getAppBasePath()).toBe("/@user/ws.main/apps/mux/");
  });

  test("stripAppBasePath: paths that don't start with the prefix pass through unchanged", () => {
    installWindow({
      href: "https://coder.example.com/@user/ws.main/apps/mux/",
      baseHref: "./",
    });
    // An unrelated absolute path (shouldn't happen in practice, but guard
    // against it anyway).
    expect(stripAppBasePath("/some/other/path")).toBe("/some/other/path");
  });

  test("Electron file:// protocol: identity behavior", () => {
    // Electron reloads always boot through index.html and restore via
    // localStorage; there's no proxy prefix to manage.
    installWindow({ href: "file:///index.html", baseHref: null });
    expect(getAppBasePath()).toBe("/");
    expect(stripAppBasePath("/workspace/abc")).toBe("/workspace/abc");
    expect(joinAppBasePath("/workspace/abc")).toBe("/workspace/abc");
  });

  test("joinAppBasePath: root path maps to the bare prefix", () => {
    installWindow({
      href: "https://coder.example.com/@user/ws.main/apps/mux/",
      baseHref: "./",
    });
    expect(joinAppBasePath("/")).toBe("/@user/ws.main/apps/mux/");
  });
});
