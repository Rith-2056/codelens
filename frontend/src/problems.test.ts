import { describe, expect, it } from "vitest";
import { problemBySlug, problems } from "./problems";

describe("the LeetCode problem set", () => {
  it("uses the real LeetCode names, numbers, slugs and difficulties, in path order", () => {
    expect(problems.map((p) => [p.number, p.title, p.slug, p.difficulty])).toEqual([
      [1, "Two Sum", "two-sum", "Easy"],
      [217, "Contains Duplicate", "contains-duplicate", "Easy"],
      [167, "Two Sum II - Input Array Is Sorted", "two-sum-ii-input-array-is-sorted", "Medium"],
      [1971, "Find if Path Exists in Graph", "find-if-path-exists-in-graph", "Easy"],
      [104, "Maximum Depth of Binary Tree", "maximum-depth-of-binary-tree", "Easy"],
      [70, "Climbing Stairs", "climbing-stairs", "Easy"],
    ]);
  });

  it("gives each problem a LeetCode-style class Solution signature", () => {
    const methods = problems.map((p) => p.method);
    expect(methods).toEqual(["twoSum", "containsDuplicate", "twoSum", "validPath", "maxDepth", "climbStairs"]);
    for (const p of problems) {
      expect(p.signature).toMatch(new RegExp(`^def ${p.method}\\(self, `));
      expect(p.signature.endsWith(":")).toBe(true);
    }
  });

  it("has a pattern and a problem statement in English and Spanish for every problem", () => {
    for (const p of problems) {
      expect(p.pattern.length).toBeGreaterThan(2);
      expect(p.statement.en.length).toBeGreaterThan(40);
      expect(p.statement.es.length).toBeGreaterThan(40);
      expect(p.statement.es).not.toBe(p.statement.en);
    }
  });

  it("finds a problem by slug", () => {
    expect(problemBySlug("climbing-stairs")?.number).toBe(70);
    expect(problemBySlug("nope")).toBeUndefined();
  });
});
