// Acceptance tests from docs/plan.md, run against the whole App with the
// lesson fixtures. The Pyodide worker is replaced by a mock; programs that
// need a real run (print(x), while True) are traced by the real CPython
// tracer in test/acceptance-traces.mjs.
import { afterEach, beforeEach, describe, expect, inject, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import axe from "axe-core";
import type { TraceResult } from "./types/trace";
import { lessons } from "./lessons";

declare module "vitest" {
  export interface ProvidedContext {
    traces: Record<"nameError" | "forever", TraceResult & { _seconds: number }>;
    programs: Record<"nameError" | "forever", string>;
  }
}

const runTrace = vi.fn<(code: string) => Promise<TraceResult>>();
vi.mock("./worker/traceClient", () => ({
  TRACE_TIMEOUT_MS: 3000,
  preloadTracer: () => Promise.resolve(),
  onTracerStatus: (listener: (s: "loading" | "ready" | "error") => void) => {
    listener("ready");
    return () => {};
  },
  runTrace: (code: string) => runTrace(code),
}));

import App from "./App";

beforeEach(() => {
  // The visualizer now lives on its own page (#/playground) since pages were added.
  window.history.replaceState(null, "", "#/playground");
  runTrace.mockReset();
  // /api/explain is offline: every explanation must come from the templates.
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
  vi.stubGlobal("confirm", () => true);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// ---- helpers -----------------------------------------------------------------

const stepInfo = () => {
  const text = screen.getByRole("slider").getAttribute("aria-valuetext") ?? "";
  const m = /^Step (\d+) of (\d+), line (\d+)$/.exec(text);
  if (!m) throw new Error(`unexpected slider text: ${text}`);
  return { step: Number(m[1]), total: Number(m[2]), line: Number(m[3]) };
};
const next = () => fireEvent.click(screen.getByRole("button", { name: "Next" }));
const previous = () => fireEvent.click(screen.getByRole("button", { name: "Previous" }));
const pick = (title: RegExp) => fireEvent.click(screen.getByRole("button", { name: title }));

/** The value cell text of a variable in the Variables table, or undefined. */
function variable(name: string): string | undefined {
  const table = document.querySelector("table.vars");
  if (!table) return undefined;
  for (const row of table.querySelectorAll("tbody tr")) {
    const cells = row.querySelectorAll("th, td");
    if (cells[0]?.textContent?.trim() === name) return cells[1]?.textContent?.trim();
  }
  return undefined;
}
const explanation = () => document.querySelector(".explanation-text")?.textContent?.trim() ?? "";
const output = () => document.querySelector("pre.output")?.textContent ?? "";
const currentLineLabel = () => document.querySelector(".code-line.current .line-label")?.textContent?.trim();
/** Pointer names under each cell of the array labeled `name`. */
function pointers(name: string): string[][] {
  const list = screen.getByRole("list", { name: new RegExp(`^${name}: list`) });
  return [...list.querySelectorAll(":scope > li")].map((li) =>
    [...li.querySelectorAll(".pointer code")].map((c) => c.textContent ?? ""),
  );
}
function toEnd(each?: () => void) {
  each?.();
  while (stepInfo().step < stepInfo().total) {
    next();
    each?.();
  }
}
async function expectNoAxeViolations() {
  // jsdom has no layout, so color contrast is checked in a real browser instead.
  const result = await axe.run(document.body, { rules: { "color-contrast": { enabled: false } } });
  expect(result.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`)).toEqual([]);
}
async function visualize(code: string, result: TraceResult) {
  runTrace.mockResolvedValueOnce(result);
  fireEvent.click(screen.getByRole("button", { name: /edit code/i }));
  fireEvent.change(screen.getByRole("textbox"), { target: { value: code } });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /visualize/i }));
  });
}

// ---- Level 1 -------------------------------------------------------------------

describe("loop lesson (plan.md acceptance)", () => {
  it("shows total 0 → 3 → 4 → 6, with the next line labeled at every line step", () => {
    render(<App />);
    const totals: string[] = [];
    toEnd(() => {
      const t = variable("total");
      if (t !== undefined && totals[totals.length - 1] !== t) totals.push(t);
      const label = currentLineLabel();
      expect(label).toBeTruthy();
    });
    expect(totals).toEqual(["0", "3", "4", "6"]);
  });

  it("steps backward through the stored trace without running Python again", () => {
    render(<App />);
    for (let i = 0; i < 6; i++) next();
    const at = stepInfo().step;
    const total = variable("total");
    next();
    previous();
    expect(stepInfo().step).toBe(at);
    expect(variable("total")).toBe(total);
    expect(runTrace).not.toHaveBeenCalled();
  });

  it("steps with the arrow keys, but not while typing in the editor", () => {
    render(<App />);
    fireEvent.keyDown(document.body, { key: "ArrowRight" });
    expect(stepInfo().step).toBe(2);
    fireEvent.keyDown(document.body, { key: "ArrowLeft" });
    expect(stepInfo().step).toBe(1);
    fireEvent.click(screen.getByRole("button", { name: /edit code/i }));
    const editor = screen.getByRole("textbox");
    editor.focus();
    fireEvent.keyDown(editor, { key: "ArrowRight" });
    expect(screen.getByRole("textbox")).toBeTruthy(); // still editing, no step change
  });
});

describe("explanations with /api/explain offline", () => {
  it("every step of every lesson has a template explanation in plain text", () => {
    render(<App />);
    for (const lesson of lessons) {
      fireEvent.click(screen.getByRole("button", { name: lesson.short }));
      toEnd(() => {
        const text = explanation();
        expect(text.length, `${lesson.id} step ${stepInfo().step}`).toBeGreaterThan(10);
        expect(text).not.toMatch(/__(dict|set|deque|ref|type)/);
      });
    }
  });

  it("switches the explanation to Spanish", () => {
    render(<App />);
    next();
    fireEvent.click(screen.getByRole("button", { name: "Español" }));
    expect(explanation()).toMatch(/línea/);
  });
});

describe("errors and runaway loops (real tracer output)", () => {
  it("print(x) ends on the failing line with a NameError explanation", async () => {
    const { nameError } = inject("traces");
    render(<App />);
    await visualize(inject("programs").nameError, nameError);
    expect(screen.getAllByRole("status").some((s) => /NameError on line 1/.test(s.textContent ?? ""))).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /go to the error/i }));
    expect(stepInfo().line).toBe(1);
    expect(currentLineLabel()).toMatch(/error/i);
    expect(explanation()).toMatch(/x/);
  });

  it("while True: pass ends as limit in under 2 s and the editor stays usable", async () => {
    const { forever } = inject("traces");
    expect(forever.status).toBe("limit");
    expect(forever._seconds).toBeLessThan(2);
    render(<App />);
    await visualize(inject("programs").forever, forever);
    expect(screen.getAllByRole("status").some((s) => /Stopped after \d+ steps/.test(s.textContent ?? ""))).toBe(true);
    next();
    expect(stepInfo().step).toBe(2);
    fireEvent.click(screen.getByRole("button", { name: /edit code/i }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "x = 1\n" } });
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("x = 1\n");
  });
});

// ---- Level 2 -------------------------------------------------------------------

describe("Level 2 lessons (plan.md acceptance)", () => {
  it("Pair that adds up: the hash map grows {4: 0} then {4: 0, 9: 1}, and prints [1, 2]", () => {
    render(<App />);
    pick(/Pair that adds up/);
    const seen: string[] = [];
    toEnd(() => {
      const v = variable("seen");
      if (v !== undefined && seen[seen.length - 1] !== v) seen.push(v);
    });
    expect(seen).toEqual(["{}", "{4: 0}", "{4: 0, 9: 1}"]);
    expect(output()).toBe("[1, 2]\n");
  });

  it("Pair in a sorted list: left and right move inward under the cells, and it prints [4, 6]", () => {
    render(<App />);
    pick(/Pair in a sorted list/);
    const moves: string[] = [];
    toEnd(() => {
      if (!screen.queryByRole("list", { name: /^nums: list/ })) return;
      const cells = pointers("nums");
      const at = (p: string) => cells.findIndex((names) => names.includes(p));
      const pos = `${at("left")},${at("right")}`;
      if (at("left") >= 0 && at("right") >= 0 && moves[moves.length - 1] !== pos) moves.push(pos);
    });
    expect(moves).toEqual(["0,5", "0,4", "1,4", "1,3", "2,3"]);
    expect(output()).toBe("[4, 6]\n");
  });

  it("Hops through a network: graph, queue front/back and visited update, ending with every hop count", () => {
    render(<App />);
    pick(/Hops through a network/);
    let sawGraph = false;
    let sawQueueEnds = false;
    let sawVisitedBadge = false;
    toEnd(() => {
      sawGraph ||= !!screen.queryByRole("img", { name: /graph graph/i });
      const q = screen.queryByRole("list", { name: /^queue: queue/ });
      sawQueueEnds ||= !!q && /front/.test(q.textContent ?? "") && /back/.test(q.textContent ?? "");
      const g = screen.queryByRole("list", { name: "graph as text" });
      sawVisitedBadge ||= !!g && /in visited/.test(g.textContent ?? "");
    });
    expect([sawGraph, sawQueueEnds, sawVisitedBadge]).toEqual([true, true, true]);
    expect(output()).toBe("{'A': 0, 'B': 1, 'C': 1, 'D': 2, 'E': 3}\n");
  });

  it("How tall is the tree?: the tree is drawn, the call stack grows and shrinks, and it prints 4", () => {
    render(<App />);
    pick(/How tall is the tree/);
    const depths: number[] = [];
    let sawTree = false;
    toEnd(() => {
      sawTree ||= !!screen.queryByRole("img", { name: /tree from root.*6 nodes/i });
      const stack = screen.getByRole("list", { name: /call stack/i });
      // One card per frame: count only the list's own items, not lists inside the cards.
      depths.push(stack.querySelectorAll(":scope > li").length);
    });
    expect(sawTree).toBe(true);
    expect(Math.max(...depths)).toBe(6);
    expect(depths[depths.length - 1]).toBe(1);
    expect(output()).toBe("4\n");
  });
});

// ---- Accessibility ---------------------------------------------------------------

describe("accessibility", () => {
  it("has no axe violations at the first, middle and last step of every lesson", async () => {
    render(<App />);
    for (const lesson of lessons) {
      fireEvent.click(screen.getByRole("button", { name: lesson.short }));
      const { total } = stepInfo();
      await expectNoAxeViolations();
      while (stepInfo().step < Math.ceil(total / 2)) next();
      await expectNoAxeViolations();
      toEnd();
      await expectNoAxeViolations();
    }
  }, 60_000);

  it("lets the keyboard reach every box that can scroll sideways (found by axe at 375 px)", () => {
    render(<App />);
    const seen = new Set<string>();
    for (const lesson of lessons) {
      fireEvent.click(screen.getByRole("button", { name: lesson.short }));
      toEnd(() => {
        for (const box of document.querySelectorAll(".code-view, .scroll-x")) {
          const where = `${lesson.id}: ${box.className}`;
          seen.add(box.className);
          expect(box.getAttribute("tabindex"), where).toBe("0");
          // A labeled group, not a landmark: two side-by-side runs would duplicate landmarks.
          expect(box.getAttribute("role"), where).toBe("group");
          expect(box.getAttribute("aria-label") ?? "", where).not.toBe("");
        }
      });
    }
    expect(seen.size).toBeGreaterThan(1); // the code view and at least one structure box were checked
  });

  it("announces each step in a polite live region", () => {
    render(<App />);
    const live = () =>
      [...document.querySelectorAll('[aria-live="polite"]')].map((e) => e.textContent ?? "").join(" | ");
    const before = live();
    next();
    expect(live()).not.toBe(before);
    expect(live()).toMatch(/Step 2 of 11/);
  });
});
