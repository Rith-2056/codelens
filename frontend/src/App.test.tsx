// Acceptance tests from docs/plan.md, run against the whole App with the
// lesson fixtures. The Pyodide worker is replaced by a mock; programs that
// need a real run (print(x), while True) are traced by the real CPython
// tracer in test/acceptance-traces.mjs.
import { afterEach, beforeEach, describe, expect, inject, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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
  // The problem pages' Run: report a correct answer and reuse the reference trace for "your" run.
  checkPractice: async () => ({ correct: true, got: null, expected: null, error: null }),
  tracePractice: async (slug: string) => practiceFixture(slug),
}));

import App from "./App";

const practiceRaw = import.meta.glob("../../shared/fixtures/practice/*.json", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;
function practiceFixture(slug: string): { program: string; trace: TraceResult } {
  return JSON.parse(practiceRaw[`../../shared/fixtures/practice/${slug}.json`]!) as { program: string; trace: TraceResult };
}

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
const next = () => fireEvent.click(screen.getByRole("button", { name: "Next step" }));
const previous = () => fireEvent.click(screen.getByRole("button", { name: "Previous step" }));
/** Variables and data structures live in the Code Visualizer. */
const openVisualizer = () => fireEvent.click(screen.getByRole("button", { name: "Open Code Visualizer" }));

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
/** The control bar's sentence about the current step. */
const explanation = () => document.querySelector(".cb-desc > span")?.textContent?.trim() ?? "";
const currentLineLabel = () => document.querySelector(".code-line.current .line-label")?.textContent?.trim();
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
    fireEvent.click(screen.getByRole("button", { name: /^visualize$/i }));
  });
}

// ---- Layout ----------------------------------------------------------------------

describe("Your code page layout", () => {
  const panelNames = () =>
    [...document.querySelectorAll(".workspace > section")].map((s) => document.getElementById(s.getAttribute("aria-labelledby")!)?.textContent);

  it("uses the problem page's four panels: lessons, code, output, step-through", () => {
    render(<App />);
    expect(panelNames()).toEqual(["Your code", "Loop: adding up a list", "Output", "Step through"]);
    const steps = screen.getByRole("region", { name: "Step through" });
    // The step controls sit beside the code, not under it; the details are in the visualizer.
    expect(within(steps).getByRole("slider")).toBeTruthy();
    expect(within(steps).getByRole("button", { name: "Next step" })).toBeTruthy();
    expect(steps.querySelector("table.vars")).toBeNull();
    expect(screen.getByRole("button", { name: "Open Code Visualizer" })).toBeTruthy();
    const code = screen.getByRole("region", { name: "Loop: adding up a list" });
    expect(code.querySelector(".code-line.current")).toBeTruthy();
    expect(within(code).queryByRole("slider")).toBeNull();
    next();
    next();
    const out = screen.getByRole("region", { name: "Output" });
    expect(out.textContent).toMatch(/Nothing printed yet|\d/);
  });
});

// ---- Level 1 -------------------------------------------------------------------

describe("loop lesson (plan.md acceptance)", () => {
  it("shows total 0 → 3 → 4 → 6, with the next line labeled at every line step", () => {
    render(<App />);
    openVisualizer();
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
    openVisualizer();
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

describe("Level 2 problems (plan.md acceptance, on each problem page)", () => {
  /** Open a problem, run (mocked), reveal the correct solution, and open it in the Code Visualizer. */
  async function referenceViewer(slug: string): Promise<HTMLElement> {
    window.history.replaceState(null, "", `#/problems/${slug}`);
    render(<App />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^run$/i }));
    });
    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: /show the correct solution/i }));
    });
    await screen.findByRole("region", { name: "Correct solution's run" });
    openVisualizer();
    const view = screen.getByRole("dialog", { name: /Code Visualizer/ });
    expect(view.textContent).toMatch(/Correct solution/);
    return view;
  }
  const inView = (view: HTMLElement) => ({
    info: () => /^Step (\d+) of (\d+)/.exec(view.querySelector('input[type="range"]')!.getAttribute("aria-valuetext")!)!.slice(1).map(Number),
    next: () => fireEvent.click(within(view).getByRole("button", { name: "Next step" })),
    variable: (name: string) => {
      for (const row of view.querySelectorAll("table.vars tbody tr")) {
        const cells = row.querySelectorAll("th, td");
        if (cells[0]?.textContent?.trim() === name) return cells[1]?.textContent?.trim();
      }
      return undefined;
    },
    output: () => view.querySelector("pre.output")?.textContent ?? "",
  });
  function walk(view: HTMLElement, each: () => void) {
    const v = inView(view);
    each();
    while (v.info()[0]! < v.info()[1]!) {
      v.next();
      each();
    }
  }
  function changes(view: HTMLElement, read: () => string | undefined): string[] {
    const out: string[] = [];
    walk(view, () => {
      const x = read();
      if (x !== undefined && out[out.length - 1] !== x) out.push(x);
    });
    return out;
  }

  it("Two Sum: the hash map grows {} → {3: 0} → {3: 0, 8: 1} → {3: 0, 8: 1, 5: 2}, and the answer is [2, 3]", async () => {
    const view = await referenceViewer("two-sum");
    const v = inView(view);
    expect(changes(view, () => v.variable("seen"))).toEqual(["{}", "{3: 0}", "{3: 0, 8: 1}", "{3: 0, 8: 1, 5: 2}"]);
    expect(v.output()).toBe("[2, 3]\n");
  });

  it("Contains Duplicate: the set grows {5} → {1, 5} → {1, 5, 8}, and the answer is True", async () => {
    const view = await referenceViewer("contains-duplicate");
    const v = inView(view);
    expect(changes(view, () => v.variable("seen"))).toEqual(["set()", "{5}", "{1, 5}", "{1, 5, 8}"]);
    expect(v.output()).toBe("True\n");
  });

  it("Two Sum II: left and right move inward over the cells, and the answer is [3, 4]", async () => {
    const view = await referenceViewer("two-sum-ii-input-array-is-sorted");
    const moves = changes(view, () => {
      const list = within(view).queryByRole("list", { name: /^numbers: list/ });
      if (!list) return undefined;
      const cells = [...list.querySelectorAll(":scope > li")].map((li) => li.textContent ?? "");
      const at = (p: string) => cells.findIndex((text) => text.includes(`pointer ${p} =`));
      return at("left") >= 0 && at("right") >= 0 ? `${at("left")},${at("right")}` : undefined;
    });
    expect(moves).toEqual(["0,5", "0,4", "1,4", "1,3", "2,3"]);
    expect(inView(view).output()).toBe("[3, 4]\n");
  });

  it("Find if Path Exists in Graph: graph, queue front/back and visited badges update, and the answer is True", async () => {
    const view = await referenceViewer("find-if-path-exists-in-graph");
    let sawGraph = false;
    let sawQueueEnds = false;
    let sawVisited = false;
    walk(view, () => {
      sawGraph ||= !!within(view).queryByRole("img", { name: /graph graph: 5 nodes/i });
      const q = within(view).queryByRole("list", { name: /^queue: queue/ });
      sawQueueEnds ||= !!q && /front/.test(q.textContent ?? "") && /back/.test(q.textContent ?? "");
      const g = within(view).queryByRole("list", { name: "graph as text" });
      sawVisited ||= !!g && /in visited/.test(g.textContent ?? "");
    });
    expect([sawGraph, sawQueueEnds, sawVisited]).toEqual([true, true, true]);
    expect(inView(view).output()).toBe("True\n");
  });

  it("Maximum Depth of Binary Tree: the tree is drawn, the call stack grows to 6 and back, and the answer is 4", async () => {
    const view = await referenceViewer("maximum-depth-of-binary-tree");
    const depths: number[] = [];
    let sawTree = false;
    walk(view, () => {
      sawTree ||= !!within(view).queryByRole("img", { name: /tree from root.*6 nodes/i });
      depths.push(within(view).getByRole("list", { name: /call stack/i }).querySelectorAll(":scope > li").length);
    });
    expect(sawTree).toBe(true);
    expect(Math.max(...depths)).toBe(6);
    expect(depths[depths.length - 1]).toBe(1);
    expect(inView(view).output()).toBe("4\n");
  });

  it("Climbing Stairs: the DP list fills to [1, 1, 2, 3, 5, 8, 13] with i over the cell, and the answer is 13", async () => {
    const view = await referenceViewer("climbing-stairs");
    const v = inView(view);
    let sawPointer = false;
    // `ways` lives inside climbStairs, so read its last value while the method is running.
    const values = changes(view, () => {
      const list = within(view).queryByRole("list", { name: /^ways: list/ });
      sawPointer ||= !!list && [...list.querySelectorAll(":scope > li")].some((li) => /pointer i = \d/.test(li.textContent ?? ""));
      return v.variable("ways");
    });
    expect(sawPointer).toBe(true);
    expect(values[values.length - 1]).toBe("[1, 1, 2, 3, 5, 8, 13]");
    expect(v.output()).toBe("13\n");
  });
});

// ---- Accessibility ---------------------------------------------------------------

describe("Code Visualizer accessibility", () => {
  it("has no axe violations on a problem with a pattern view, and on the Your code page", async () => {
    window.history.replaceState(null, "", "#/problems/binary-search");
    render(<App />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^run$/i }));
    });
    openVisualizer();
    for (let k = 0; k < 8; k++) next();
    await expectNoAxeViolations();
    cleanup();
    window.history.replaceState(null, "", "#/playground");
    render(<App />);
    openVisualizer();
    toEnd();
    await expectNoAxeViolations();
  }, 60_000);
});

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
      openVisualizer();
      toEnd(() => {
        for (const box of document.querySelectorAll(".code-view, .scroll-x, .sa-scroll")) {
          const where = `${lesson.id}: ${box.className}`;
          seen.add(box.className);
          expect(box.getAttribute("tabindex"), where).toBe("0");
          // A labeled group, not a landmark: two side-by-side runs would duplicate landmarks.
          expect(box.getAttribute("role"), where).toBe("group");
          expect(box.getAttribute("aria-label") ?? "", where).not.toBe("");
        }
      });
      fireEvent.click(screen.getByRole("button", { name: "Exit visualizer" }));
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
