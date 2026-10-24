// Mistake categories, from the failing input, the two answers, and a diff of
// the student's code against the reference. The cases are the planted bugs
// from tests/test_counterexample.py with the counterexamples CodeLens finds.
import { describe, expect, it } from "vitest";
import { classifyMistake, MISTAKES, referenceSource, type MistakeInput } from "./mistakes";

const base = { got: null, expected: null, error: null } as const;
const c = (m: Partial<MistakeInput> & Pick<MistakeInput, "slug" | "args">): MistakeInput => ({ ...base, code: "", ...m });

describe("classifyMistake", () => {
  it("Climbing Stairs with range(2, n) instead of range(2, n + 1): off-by-one", () => {
    const code = "class Solution:\n    def climbStairs(self, n):\n        ways = [1, 1] + [0] * n\n        for i in range(2, n):\n            ways[i] = ways[i - 1] + ways[i - 2]\n        return ways[n]\n";
    expect(classifyMistake(c({ slug: "climbing-stairs", args: [2], got: 0, expected: 2, code }))).toBe("off-by-one");
  });

  it("Two Sum II returning 0-based positions: off-by-one", () => {
    expect(classifyMistake(c({ slug: "two-sum-ii-input-array-is-sorted", args: [[-2, -1], -3], got: [0, 1], expected: [1, 2] }))).toBe("off-by-one");
  });

  it("Maximum Depth counting edges instead of nodes: off-by-one", () => {
    expect(classifyMistake(c({ slug: "maximum-depth-of-binary-tree", args: [[1]], got: 0, expected: 1 }))).toBe("off-by-one");
  });

  it("Two Sum using one element twice (returns [0, 0]): incorrect pointer variables", () => {
    expect(classifyMistake(c({ slug: "two-sum", args: [[0, 0], 0], got: [0, 0], expected: [0, 1] }))).toBe("pointer");
  });

  it("a crash on a one-item list: missed edge case", () => {
    const err = { type: "IndexError", message: "list index out of range" };
    expect(classifyMistake(c({ slug: "contains-duplicate", args: [[0]], error: err }))).toBe("edge-case");
    expect(classifyMistake(c({ slug: "maximum-depth-of-binary-tree", args: [[]], error: { type: "AttributeError", message: "'NoneType' object has no attribute 'left'" } }))).toBe(
      "edge-case",
    );
  });

  it("an IndexError on a normal input: off-by-one", () => {
    expect(classifyMistake(c({ slug: "two-sum", args: [[0, 1], 1], error: { type: "IndexError", message: "list index out of range" } }))).toBe(
      "off-by-one",
    );
  });

  it("a loop that never ends: runaway", () => {
    expect(classifyMistake(c({ slug: "climbing-stairs", args: [1], error: { type: "StepLimit", message: "" } }))).toBe("runaway");
    expect(classifyMistake(c({ slug: "climbing-stairs", args: [1], error: { type: "Timeout", message: "" } }))).toBe("runaway");
  });

  it("anything else is a logic mistake (e.g. checking only neighbours, one-way edges)", () => {
    expect(classifyMistake(c({ slug: "contains-duplicate", args: [[0, 1, 0]], got: false, expected: true }))).toBe("logic");
    expect(classifyMistake(c({ slug: "find-if-path-exists-in-graph", args: [2, [[0, 1]], 1, 0], got: false, expected: true }))).toBe("logic");
  });

  it("finds off-by-one from < versus <= in a loop condition, compared with the reference", () => {
    const code = "class Solution:\n    def twoSum(self, numbers, target):\n        left, right = 0, len(numbers) - 1\n        while left <= right:\n            s = numbers[left] + numbers[right]\n            if s == target:\n                return [left + 1, right + 1]\n            if s < target:\n                left += 1\n            else:\n                right -= 1\n";
    // A wrong answer the other rules don't explain, on a normal input.
    expect(classifyMistake(c({ slug: "two-sum-ii-input-array-is-sorted", args: [[0, 1, 3], 2], got: [2, 2], expected: [1, 2], code }))).toBe("pointer");
    expect(classifyMistake(c({ slug: "two-sum-ii-input-array-is-sorted", args: [[0, 1, 3], 2], got: [], expected: [1, 2], code }))).toBe("off-by-one");
  });
});

describe("categories", () => {
  it("every category has a label and a short tip", () => {
    expect(Object.keys(MISTAKES)).toEqual(["off-by-one", "edge-case", "pointer", "runaway", "logic"]);
    expect(MISTAKES["off-by-one"].label).toBe("Off-by-one error");
    expect(MISTAKES["edge-case"].label).toBe("Missed edge case");
    expect(MISTAKES.pointer.label).toBe("Incorrect pointer variables");
    for (const m of Object.values(MISTAKES)) expect(m.tip.length).toBeGreaterThan(20);
  });

  it("knows every reference solution, to compare loop bounds", () => {
    expect(referenceSource("climbing-stairs")).toMatch(/range\(2, n \+ 1\)/);
    expect(referenceSource("nope")).toBe("");
  });
});
