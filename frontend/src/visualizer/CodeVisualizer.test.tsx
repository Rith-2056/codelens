// The Code Visualizer: a full-screen view with the code on the left, a large
// visualization chosen for the algorithm on the right, and a control bar.
// Every step answers: where am I in the code, what is happening, what changed.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { useState } from "react";
import type { TraceResult, TraceStep } from "../types/trace";
import { hideSolutionSelf } from "../components/practiceView";
import CodeVisualizer from "./CodeVisualizer";

const raw = import.meta.glob("../../../shared/fixtures/practice/*.json", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
function load(slug: string) {
  const data = JSON.parse(raw[`../../../shared/fixtures/practice/${slug}.json`]!) as { program: string; trace: TraceResult };
  return { program: data.program, steps: data.trace.steps.map(hideSolutionSelf), codeHash: data.trace.codeHash };
}

function Harness({ slug, start = 0, onClose = () => {} }: { slug: string; start?: number; onClose?: () => void }) {
  const run = load(slug);
  const [i, setI] = useState(start);
  return (
    <CodeVisualizer
      title="Test problem"
      runLabel="Your solution"
      program={run.program}
      steps={run.steps}
      codeHash={run.codeHash}
      traceId={`t-${slug}`}
      index={i}
      onIndexChange={setI}
      lang="en"
      onClose={onClose}
    />
  );
}

const afterLine = (steps: TraceStep[], line: number, pred: (s: TraceStep) => boolean = () => true) =>
  steps.findIndex((s, k) => k > 0 && steps[k - 1]!.line === line && steps[k - 1]!.frameId === s.frameId && pred(s));
const dialog = () => screen.getByRole("dialog", { name: /Code Visualizer/ });
const viz = () => screen.getByRole("region", { name: "Visualization" });
const code = () => screen.getByRole("region", { name: "Code" });
/** A list cell's text, for the list named `name`. */
const cells = (name: string) => within(viz()).getByRole("list", { name: new RegExp(`^${name}:`) }).querySelectorAll(":scope > li");

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Code Visualizer", () => {
  it("is a full-screen dialog with the code, the visualization and the controls; Exit and Esc close it", () => {
    const onClose = vi.fn();
    render(<Harness slug="two-sum" onClose={onClose} />);
    expect(dialog().getAttribute("aria-modal")).toBe("true");
    expect(document.activeElement).toBe(screen.getByRole("heading", { level: 2, name: /Code Visualizer/ }));
    expect(code()).toBeTruthy();
    expect(viz()).toBeTruthy();
    expect(screen.getByRole("group", { name: "Execution controls" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Exit visualizer" }));
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("binary search: boundaries and the midpoint above their cells, ruled-out cells marked, and what changed", () => {
    const { steps } = load("binary-search");
    render(<Harness slug="binary-search" start={afterLine(steps, 10)} />); // just ran `left = mid + 1`
    const c = cells("nums");
    expect(c[3]!.textContent).toMatch(/pointer left = 3/);
    expect(c[5]!.textContent).toMatch(/pointer right = 5/);
    expect(c[2]!.textContent).toMatch(/pointer mid = 2/);
    expect([...c].map((li) => /ruled out/.test(li.textContent ?? ""))).toEqual([true, true, true, false, false, false]);
    expect(within(viz()).getByRole("list", { name: "What changed" }).textContent).toMatch(/left: 0 → 3/);
  });

  it("notes when pointers land on the same cell", () => {
    const { steps } = load("binary-search");
    const k = steps.findIndex((s) => s.locals.left === 3 && s.locals.right === 3 && s.locals.mid === 3);
    render(<Harness slug="binary-search" start={k} />);
    expect(within(viz()).getByRole("list", { name: "What changed" }).textContent).toMatch(/left, mid and right all point at index 3/);
  });

  it("All variables: jump to the previous or next change of any variable", () => {
    const { steps } = load("two-sum-ii-input-array-is-sorted");
    const start = steps.findIndex((s) => s.functionName === "twoSum" && "right" in s.locals);
    render(<Harness slug="two-sum-ii-input-array-is-sorted" start={start} />);
    const stepNow = () => Number(/^Step (\d+)/.exec(screen.getByRole("slider", { name: "Step" }).getAttribute("aria-valuetext")!)![1]) - 1;
    const left0 = steps[start]!.locals.left;
    fireEvent.click(screen.getByRole("button", { name: "Next change of left" }));
    expect(stepNow()).toBeGreaterThan(start);
    expect(steps[stepNow()]!.locals.left).not.toBe(left0);
    expect(steps[stepNow() - 1]!.locals.left).toBe(left0);
    fireEvent.click(screen.getByRole("button", { name: "Previous change of left" }));
    expect(steps[stepNow()]!.locals.left).toBe(left0);
    // A button with nowhere to go stays focusable and says so: numbers never changes.
    expect(screen.getByRole("button", { name: "Next change of numbers" }).getAttribute("aria-disabled")).toBe("true");
  });

  it("sliding window: the window covers k cells and shows its running value", () => {
    const { steps } = load("maximum-average-subarray-i");
    render(<Harness slug="maximum-average-subarray-i" start={afterLine(steps, 7, (s) => s.locals.right === 4)} />);
    const c = cells("nums");
    expect([...c].map((li) => /in window/.test(li.textContent ?? ""))).toEqual([false, false, true, true, true, false]);
    expect(within(viz()).getByText(/window = 11/)).toBeTruthy();
    expect(within(viz()).getByText(/k = 3/)).toBeTruthy();
  });

  it("sliding window without a fixed k: the band spans left to right as it grows and shrinks", () => {
    const { steps } = load("minimum-size-subarray-sum");
    render(<Harness slug="minimum-size-subarray-sum" start={afterLine(steps, 7, (s) => s.locals.right === 2)} />);
    const c = cells("nums");
    expect([...c].map((li) => /in window/.test(li.textContent ?? ""))).toEqual([true, true, true, false, false]);
    expect(within(viz()).getByText(/window: left to right · window = 7/)).toBeTruthy();
  });

  it("dynamic programming: the cell just written and the cells it read", () => {
    const { steps } = load("climbing-stairs");
    render(<Harness slug="climbing-stairs" start={afterLine(steps, 7, (s) => s.locals.i === 4)} />);
    const c = cells("ways");
    expect(c[4]!.textContent).toMatch(/just written, changed from 0 to 5/);
    expect(c[3]!.textContent).toMatch(/read/);
    expect(c[2]!.textContent).toMatch(/read/);
    expect(c[1]!.textContent).not.toMatch(/read|written/);
    expect(c[4]!.textContent).toMatch(/pointer i = 4/);
  });

  it("recursion: the tree, and the call stack with the current call marked", () => {
    const { steps } = load("maximum-depth-of-binary-tree");
    const deepest = steps.reduce((best, s, k) => (s.stack.length > steps[best]!.stack.length ? k : best), 0);
    render(<Harness slug="maximum-depth-of-binary-tree" start={deepest} />);
    expect(within(viz()).getByRole("img", { name: /tree/i })).toBeTruthy();
    const stack = within(viz()).getByRole("list", { name: /call stack/i });
    expect(stack.querySelectorAll(":scope > li").length).toBeGreaterThanOrEqual(4);
    expect(within(code()).getByText(/maxDepth\(\) · call \d+ deep \(recursion\)/)).toBeTruthy();
  });

  it("graph: drawn as a graph with the queue next to it", () => {
    const { steps } = load("find-if-path-exists-in-graph");
    render(<Harness slug="find-if-path-exists-in-graph" start={steps.findIndex((s) => "queue" in s.locals)} />);
    expect(within(viz()).getByRole("img", { name: /graph/i })).toBeTruthy();
    expect(within(viz()).getByRole("list", { name: /^queue: queue/ })).toBeTruthy();
  });

  it("the code panel shows where the step is: function and loop pass, with the next line marked", () => {
    const { steps } = load("climbing-stairs");
    let seen = 0;
    render(<Harness slug="climbing-stairs" start={steps.findIndex((s) => s.line === 7 && ++seen === 2)} />);
    expect(within(code()).getByText("In climbStairs() · for loop, pass 2")).toBeTruthy();
    const current = within(code()).getAllByRole("listitem").find((li) => li.getAttribute("aria-current") === "step")!;
    expect(current.textContent).toMatch(/ways\[i\] = ways\[i - 1\] \+ ways\[i - 2\]/);
    expect(current.querySelector(".tok-keyword, .tok-builtin, .tok-number")).toBeTruthy(); // syntax colors
  });

  it("variables: only what matters is shown; all variables are grouped behind a collapsed section", () => {
    const { steps } = load("two-sum-ii-input-array-is-sorted");
    render(<Harness slug="two-sum-ii-input-array-is-sorted" start={afterLine(steps, 6)} />); // just ran `total = ...`
    // In focus: total (just changed) and target (the next line compares them).
    // The list and its pointers are already drawn above, so they are not repeated.
    const watch = within(viz()).getByRole("list", { name: "Variables in focus" });
    expect([...watch.querySelectorAll(":scope > li")].map((li) => li.querySelector("code")?.textContent)).toEqual(["target", "total"]);
    const all = viz().querySelector("details.all-vars") as HTMLDetailsElement;
    expect(all.open).toBe(false);
    expect(all.querySelector("summary")!.textContent).toMatch(/All variables \(5\)/);
    const groups = [...all.querySelectorAll("th[scope='rowgroup']")].map((th) => th.textContent);
    expect(groups).toEqual(["Parameters", "Pointers", "Other"]);
    const totalRow = [...all.querySelectorAll("tbody tr")].find((tr) => tr.querySelector("th[scope='row']")?.textContent === "total")!;
    expect(totalRow.className).toMatch(/var-changed/);
  });

  it("the control bar's sentence is the step's explanation, and it follows the steps", () => {
    render(<Harness slug="two-sum" />);
    const bar = screen.getByRole("group", { name: "Execution controls" });
    expect(bar.textContent).toMatch(/Step 1 of \d+.*about to start/);
    fireEvent.click(within(bar).getByRole("button", { name: "Next step" }));
    expect(bar.textContent).toMatch(/Step 2 of/);
  });

  it("the split between code and visualization can be resized with the keyboard", () => {
    render(<Harness slug="two-sum" />);
    const sep = screen.getByRole("separator", { name: "Resize code and visualization" });
    const before = Number(sep.getAttribute("aria-valuenow"));
    fireEvent.keyDown(sep, { key: "ArrowRight" });
    expect(Number(sep.getAttribute("aria-valuenow"))).toBe(before + 5);
    fireEvent.keyDown(sep, { key: "Home" });
    expect(Number(sep.getAttribute("aria-valuenow"))).toBe(Number(sep.getAttribute("aria-valuemin")));
    // Resizing with arrows does not also step the run.
    expect(screen.getByRole("slider", { name: "Step" }).getAttribute("aria-valuetext")).toMatch(/^Step 1 of/);
  });

  it("remembers the split for the next time it opens", () => {
    window.localStorage.clear();
    const first = render(<Harness slug="two-sum" />);
    const sep = () => screen.getByRole("separator", { name: "Resize code and visualization" });
    fireEvent.keyDown(sep(), { key: "End" });
    const wide = sep().getAttribute("aria-valuenow");
    first.unmount();
    render(<Harness slug="two-sum" />);
    expect(sep().getAttribute("aria-valuenow")).toBe(wide);
  });

  it("makes the page behind it inert and hidden while open", () => {
    const outside = document.createElement("div");
    outside.textContent = "page behind";
    document.body.appendChild(outside);
    const { unmount } = render(<Harness slug="two-sum" />);
    expect(outside.hasAttribute("inert")).toBe(true);
    expect(outside.getAttribute("aria-hidden")).toBe("true");
    unmount();
    expect(outside.hasAttribute("inert")).toBe(false);
    expect(outside.hasAttribute("aria-hidden")).toBe(false);
    outside.remove();
  });

  it("has no accessibility violations", async () => {
    const { steps } = load("binary-search");
    render(<Harness slug="binary-search" start={afterLine(steps, 10)} />);
    const result = await axe.run(dialog(), { rules: { "color-contrast": { enabled: false } } });
    expect(result.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
});
