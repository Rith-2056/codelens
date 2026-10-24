// What the Code Visualizer shows for each step: which algorithm the run uses,
// where the run is in the code, what changed, which variables matter, and
// which list cells the line touched. Pure logic, checked on real traces.
import { describe, expect, it } from "vitest";
import type { JsonValue, TraceResult, TraceStep } from "../types/trace";
import { hideSolutionSelf } from "../components/practiceView";
import { accessedCells, codeContext, detectPattern, evalIndex, variableGroups } from "./focus";

const raw = import.meta.glob("../../../shared/fixtures/practice/*.json", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
function run(slug: string) {
  const data = JSON.parse(raw[`../../../shared/fixtures/practice/${slug}.json`]!) as { program: string; trace: TraceResult };
  return { program: data.program, steps: data.trace.steps.map(hideSolutionSelf) };
}
const firstIndex = (steps: TraceStep[], f: (s: TraceStep) => boolean) => steps.findIndex(f);

describe("detectPattern", () => {
  it.each([
    ["binary-search", { kind: "binary-search", array: "nums", pointers: ["left", "mid", "right"] }],
    ["maximum-average-subarray-i", { kind: "sliding-window", array: "nums", pointers: ["left", "right"], windowSize: "k", windowValue: "window" }],
    ["two-sum-ii-input-array-is-sorted", { kind: "two-pointers", array: "numbers", pointers: ["left", "right"] }],
    ["climbing-stairs", { kind: "dp", table: "ways", pointers: ["i"] }],
    ["two-sum", { kind: "hash-map", array: "nums", pointers: ["i"] }],
    ["contains-duplicate", { kind: "hash-map", array: "nums" }],
    ["find-if-path-exists-in-graph", { kind: "graph" }],
    ["maximum-depth-of-binary-tree", { kind: "tree", recursive: true }],
  ])("%s", (slug, expected) => {
    const { program, steps } = run(slug);
    expect(detectPattern(steps, program)).toMatchObject(expected);
  });

  it("a plain loop over a list is an array run; no list at all is general", () => {
    const step = (locals: Record<string, JsonValue>) => ({ locals, stack: [], heap: {}, functionName: "<module>", frameId: "m" }) as unknown as TraceStep;
    expect(detectPattern([step({ numbers: [3, 1, 2], total: 0 })], "for n in numbers:\n    total += n\n")).toMatchObject({ kind: "array", array: "numbers" });
    expect(detectPattern([step({ x: 1 })], "x = 1\n")).toMatchObject({ kind: "general" });
  });
});

describe("evalIndex and accessedCells", () => {
  const locals = { i: 3, k: 2, nums: [5, 6, 7, 8, 9], mid: 1, ways: [1, 1, 2, 0], name: "x" };

  it("evaluates simple index expressions with the step's integers", () => {
    expect(evalIndex("i - 1", locals)).toBe(2);
    expect(evalIndex("(i + k) // 2", locals)).toBe(2);
    expect(evalIndex("-1", locals)).toBe(-1);
    expect(evalIndex("i * 2 % 4", locals)).toBe(2);
    expect(evalIndex("len(nums)", locals)).toBeNull(); // calls are not evaluated
    expect(evalIndex("name", locals)).toBeNull(); // not an int
    expect(evalIndex("unknown + 1", locals)).toBeNull();
  });

  it("finds the cells a line reads or writes, including negative indexes and slices", () => {
    expect(accessedCells("ways[i] = ways[i - 1] + ways[i - 2]", locals)).toEqual({ ways: [1, 2, 3] });
    expect(accessedCells("if nums[mid] == target:", locals)).toEqual({ nums: [1] });
    expect(accessedCells("last = nums[-1]", locals)).toEqual({ nums: [4] });
    expect(accessedCells("window = sum(nums[:k])", locals)).toEqual({ nums: [0, 1] });
    expect(accessedCells("x = nums[i - k + 1:i + 1]", locals)).toEqual({ nums: [2, 3] });
    expect(accessedCells("x = nums[99]", locals)).toEqual({}); // out of range: nothing to mark
    expect(accessedCells("total += n", locals)).toEqual({});
  });
});

describe("codeContext", () => {
  it("names the function, the enclosing loop and how many passes it has started", () => {
    const { program, steps } = run("climbing-stairs");
    // The 3rd time line 7 (the loop body) is next: the loop on line 6 has started 3 passes.
    let seen = 0;
    const i = firstIndex(steps, (s) => s.line === 7 && ++seen === 3);
    const ctx = codeContext(steps, i, program);
    expect(ctx).toMatchObject({ functionName: "climbStairs", defLine: 2, loopLine: 6, loopKind: "for", loopPass: 3, depth: 1, recursive: false });
  });

  it("counts recursive calls of the same function", () => {
    const { program, steps } = run("maximum-depth-of-binary-tree");
    const i = steps.reduce((best, s, k) => (s.stack.length > steps[best]!.stack.length ? k : best), 0);
    const ctx = codeContext(steps, i, program);
    expect(ctx.functionName).toBe("maxDepth");
    expect(ctx.recursive).toBe(true);
    expect(ctx.depth).toBeGreaterThanOrEqual(4);
  });

  it("outside any function: the main program, no loop", () => {
    const { program, steps } = run("two-sum");
    expect(codeContext(steps, 0, program)).toMatchObject({ functionName: "<module>", defLine: null, loopLine: null, depth: 0 });
  });
});

describe("variableGroups", () => {
  const { program, steps } = run("two-sum-ii-input-array-is-sorted");
  // A step inside the while loop right after `left += 1` (line 10) ran.
  const i = firstIndex(steps, (s) => s.functionName === "twoSum" && steps[s.index - 1]?.line === 10);

  it("groups parameters, loop counters, pointers and other locals, and marks what just changed", () => {
    const g = variableGroups(steps, i, program);
    expect(g.parameters.map((v) => v.name)).toEqual(["numbers", "target"]);
    expect(g.pointers.map((v) => v.name)).toEqual(["left", "right"]);
    expect(g.other.map((v) => v.name)).toEqual(["total"]);
    expect(g.pointers.find((v) => v.name === "left")).toMatchObject({ changed: true, relevant: true });
    expect(g.pointers.find((v) => v.name === "right")).toMatchObject({ changed: false });
  });

  it("relevant = used by the line that just ran or the next line, or changed", () => {
    const g = variableGroups(steps, i, program);
    const relevant = [...g.parameters, ...g.loopCounters, ...g.pointers, ...g.other].filter((v) => v.relevant).map((v) => v.name);
    expect(relevant).toContain("left");
    expect(relevant).toContain("right"); // the next line is `while left < right:`
    expect(relevant).not.toContain("target");
  });

  it("puts for-loop variables under loop counters and hides functions and classes", () => {
    const two = run("two-sum");
    const k = firstIndex(two.steps, (s) => s.functionName === "twoSum" && "n" in s.locals);
    const g = variableGroups(two.steps, k, two.program);
    expect(g.loopCounters.map((v) => v.name)).toEqual(["i", "n"]);
    const all = [...g.parameters, ...g.loopCounters, ...g.pointers, ...g.other].map((v) => v.name);
    expect(all).not.toContain("Solution");
    const mod = variableGroups(two.steps, two.steps.length - 1, two.program);
    expect([...mod.other, ...mod.parameters].map((v) => v.name)).not.toContain("Solution");
  });
});
