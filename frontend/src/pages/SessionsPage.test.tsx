// "My sessions": every Submit, saved in this browser, with mistake counts.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import axe from "axe-core";

vi.mock("../worker/traceClient", () => ({
  TRACE_TIMEOUT_MS: 3000,
  preloadTracer: () => Promise.resolve(),
  onTracerStatus: (l: (s: string) => void) => {
    l("ready");
    return () => {};
  },
  runTrace: () => Promise.reject(new Error("unused")),
  tracePractice: () => Promise.reject(new Error("unused")),
  checkPractice: () => Promise.reject(new Error("unused")),
  findCounterexample: () => Promise.reject(new Error("unused")),
}));

import App from "../App";
import { addSession } from "../sessions";

const wrong = (over = {}) => ({
  slug: "climbing-stairs",
  title: "Climbing Stairs",
  code: "class Solution:\n    def climbStairs(self, n):\n        return n\n",
  outcome: "wrong" as const,
  input: "n = 2",
  got: "0",
  expected: "2",
  error: null,
  category: "off-by-one" as const,
  ...over,
});

beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState(null, "", "#/sessions");
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("My sessions page", () => {
  it("explains that nothing is saved yet, and that sessions stay in this browser", () => {
    render(<App />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("My sessions");
    expect(document.body.textContent).toMatch(/No sessions yet/);
    expect(document.body.textContent).toMatch(/only in this browser/i);
  });

  it("lists sessions newest first and counts mistakes by kind", () => {
    addSession(wrong({ category: "pointer", slug: "two-sum", title: "Two Sum", input: "nums = [0, 0], target = 0" }));
    addSession(wrong());
    addSession(wrong({ input: "n = 3" }));
    addSession({ ...wrong(), outcome: "accepted", category: null, input: "all inputs", got: null, expected: null });
    render(<App />);
    const summary = screen.getByRole("list", { name: "Mistakes by kind" });
    expect([...summary.querySelectorAll("li")].map((li) => li.textContent)).toEqual(["Off-by-one error: 2", "Incorrect pointer variables: 1"]);
    const list = screen.getByRole("list", { name: "Saved sessions" });
    const rows = [...list.querySelectorAll(":scope > li")].map((li) => li.textContent ?? "");
    expect(rows).toHaveLength(4);
    expect(rows[0]).toMatch(/Climbing Stairs.*Accepted/);
    expect(rows[1]).toMatch(/Climbing Stairs.*Off-by-one error.*n = 3/);
    expect(rows[3]).toMatch(/Two Sum.*Incorrect pointer variables.*nums = \[0, 0\], target = 0/);
  });

  it("opens a saved attempt's code in the problem's editor", async () => {
    addSession(wrong());
    render(<App />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /open in editor/i }));
      await new Promise((r) => window.addEventListener("hashchange", r, { once: true }));
    });
    expect(window.location.hash).toBe("#/problems/climbing-stairs");
    const editor = screen.getByRole("textbox", { name: /your solution/i }) as HTMLTextAreaElement;
    expect(editor.value).toBe(wrong().code);
  });

  it("clears everything after confirming", () => {
    addSession(wrong());
    vi.stubGlobal("confirm", () => true);
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Clear all sessions" }));
    expect(document.body.textContent).toMatch(/No sessions yet/);
    expect(window.localStorage.getItem("codelens.sessions.v1")).toBeNull();
  });

  it("has no accessibility violations", async () => {
    addSession(wrong());
    render(<App />);
    const result = await axe.run(document.body, { rules: { "color-contrast": { enabled: false } } });
    expect(result.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    expect(within(screen.getByRole("navigation", { name: "Main" })).getByRole("link", { name: "My sessions" }).getAttribute("aria-current")).toBe("page");
  });
});
