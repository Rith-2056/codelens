// Navigation between the pages: home, the LeetCode problem list, one problem,
// and the playground for your own code.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import axe from "axe-core";

vi.mock("./worker/traceClient", () => ({
  TRACE_TIMEOUT_MS: 3000,
  preloadTracer: () => Promise.resolve(),
  onTracerStatus: (listener: (s: "loading" | "ready" | "error") => void) => {
    listener("ready");
    return () => {};
  },
  runTrace: () => Promise.reject(new Error("not used here")),
}));

import App from "./App";

beforeEach(() => {
  // replaceState changes the URL without firing a late hashchange into the next test.
  window.history.replaceState(null, "", "#/");
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const nav = () => screen.getByRole("navigation", { name: "Main" });
async function go(linkName: string | RegExp) {
  await act(async () => {
    fireEvent.click(screen.getByRole("link", { name: linkName }));
    // The browser updates the hash and fires hashchange a moment after the click.
    await new Promise((resolve) => window.addEventListener("hashchange", resolve, { once: true }));
  });
}
async function noAxeViolations() {
  const result = await axe.run(document.body, { rules: { "color-contrast": { enabled: false } } });
  expect(result.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
}

describe("app shell", () => {
  it("opens on the home page with links to the problems and the playground", async () => {
    render(<App />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/CodeLens/);
    const links = nav().querySelectorAll("a");
    expect([...links].map((a) => a.textContent)).toEqual(["Home", "Problems", "Your code", "My sessions"]);
    expect(nav().querySelector('[aria-current="page"]')?.textContent).toBe("Home");
    await noAxeViolations();
  });

  it("lists the six LeetCode problems with numbers, names and difficulty", async () => {
    render(<App />);
    await go("Problems");
    expect(document.title).toBe("Problems · CodeLens");
    expect(nav().querySelector('[aria-current="page"]')?.textContent).toBe("Problems");
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading.textContent).toBe("Problems");
    expect(document.activeElement).toBe(heading); // focus moves to the new page
    const list = screen.getByRole("list", { name: "LeetCode problems" });
    const items = [...list.querySelectorAll(":scope > li")].map((li) => li.textContent ?? "");
    expect(items).toHaveLength(6);
    expect(items[0]).toMatch(/1\. Two Sum.*Easy.*Hash map/);
    expect(items[2]).toMatch(/167\. Two Sum II - Input Array Is Sorted.*Medium/);
    await noAxeViolations();
  });

  it("opens a problem page with its statement and the class Solution signature", async () => {
    render(<App />);
    await go("Problems");
    await go(/^1\. Two Sum/);
    expect(window.location.hash).toBe("#/problems/two-sum");
    expect(document.title).toBe("Two Sum · CodeLens");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("1. Two Sum");
    expect(document.body.textContent).toMatch(/return the indices of the two/i);
    expect(document.body.textContent).toMatch(/class Solution:\s*def twoSum\(self, nums: List\[int\], target: int\) -> List\[int\]:/);
    await noAxeViolations();
  });

  it("lets the keyboard reach the signature box, which scrolls sideways on a phone (found by axe)", async () => {
    render(<App />);
    await go("Problems");
    await go(/^1971\. Find if Path Exists/);
    const box = document.querySelector("pre.signature")!;
    expect(box.getAttribute("tabindex")).toBe("0");
    expect(box.getAttribute("role")).toBe("group");
    expect(box.getAttribute("aria-label")).toMatch(/solution/i);
  });

  it("shows a friendly not-found page for an unknown problem", async () => {
    window.history.replaceState(null, "", "#/problems/not-a-problem");
    render(<App />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Problem not found");
    expect(screen.getByRole("link", { name: /back to the problems/i }).getAttribute("href")).toBe("#/problems");
  });

  it("the playground offers the three Level 1 examples only; interview problems live on the problem pages", async () => {
    window.history.replaceState(null, "", "#/playground");
    render(<App />);
    const picker = screen.getAllByRole("group").find((g) => /Level 1/.test(g.textContent ?? ""))!;
    expect([...picker.querySelectorAll("button")].map((b) => b.textContent?.replace("✓", "").trim())).toEqual(["Loop", "Branch", "Function"]);
    expect(document.body.textContent).not.toMatch(/Level 2|Pair that adds up|Hops through a network/);
  });

  it("keeps the visualizer for your own code on the playground page", async () => {
    render(<App />);
    await go("Your code");
    expect(window.location.hash).toBe("#/playground");
    expect(document.title).toBe("Your code · CodeLens");
    expect(screen.getByRole("button", { name: /visualize/i })).toBeTruthy();
    expect(screen.getByRole("slider")).toBeTruthy();
  });
});
