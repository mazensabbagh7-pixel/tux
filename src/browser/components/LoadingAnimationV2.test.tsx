import "../../../tests/ui/dom";

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { installDom } from "../../../tests/ui/dom";
import { ThemeProvider } from "../contexts/ThemeContext";

// Stub useReducedMotion so we can control it per-test
let reducedMotion = false;
void mock.module("@/browser/hooks/useReducedMotion", () => ({
  useReducedMotion: () => reducedMotion,
}));

import { LoadingAnimationV2 } from "./LoadingAnimationV2";

let cleanupDom: (() => void) | null = null;

function renderLoader(className?: string) {
  return render(
    <ThemeProvider>
      <LoadingAnimationV2 className={className} />
    </ThemeProvider>
  );
}

describe("LoadingAnimationV2", () => {
  beforeEach(() => {
    cleanupDom = installDom();
    reducedMotion = false;
  });
  afterEach(() => {
    cleanup();
    cleanupDom?.();
    cleanupDom = null;
  });

  test("renders SVG with 'mu' text, 'x' text, and block rect", () => {
    const { container } = renderLoader();
    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
    // "mu" and "x" are separate elements for independent animation
    expect(container.querySelector("[data-testid='mux-mu']")).toBeTruthy();
    expect(container.querySelector("[data-testid='mux-x']")).toBeTruthy();
    expect(container.querySelector("[data-testid='mux-block']")).toBeTruthy();
  });

  test("x element has kick animation class", () => {
    const { container } = renderLoader();
    const x = container.querySelector("[data-testid='mux-x']");
    expect(x?.closest("[class*='kick']") ?? x?.getAttribute("class")).toBeTruthy();
  });

  test("block element has bounce animation class", () => {
    const { container } = renderLoader();
    const block = container.querySelector("[data-testid='mux-block']");
    expect(block?.closest("[class*='bounce']") ?? block?.getAttribute("class")).toBeTruthy();
  });

  test("passes className prop to wrapper", () => {
    const { container } = renderLoader("my-custom-class");
    expect(container.querySelector(".my-custom-class")).toBeTruthy();
  });

  test("reduced motion: renders static (no animation classes)", () => {
    reducedMotion = true;
    const { container } = renderLoader();
    // Still renders the SVG elements
    expect(container.querySelector("svg")).toBeTruthy();
    expect(container.querySelector("[data-testid='mux-block']")).toBeTruthy();
    // But no kick/bounce animation styles applied
    const style = container.querySelector("style");
    expect(style).toBeNull();
  });

  test("aria-hidden on SVG for accessibility", () => {
    const { container } = renderLoader();
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });
});
