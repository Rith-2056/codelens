import { describe, expect, it } from "vitest";
import { CATEGORIES, problemBySlug, problems } from "./problems";

describe("the LeetCode problem set", () => {
  it("uses the real LeetCode names, numbers, slugs and difficulties, grouped by category", () => {
    expect(problems.map((p) => [p.category, p.number, p.title, p.slug, p.difficulty])).toEqual([
      ["Arrays & Hashing", 1, "Two Sum", "two-sum", "Easy"],
      ["Arrays & Hashing", 217, "Contains Duplicate", "contains-duplicate", "Easy"],
      ["Arrays & Hashing", 242, "Valid Anagram", "valid-anagram", "Easy"],
      ["Arrays & Hashing", 238, "Product of Array Except Self", "product-of-array-except-self", "Medium"],
      ["Two Pointers", 977, "Squares of a Sorted Array", "squares-of-a-sorted-array", "Easy"],
      ["Two Pointers", 167, "Two Sum II - Input Array Is Sorted", "two-sum-ii-input-array-is-sorted", "Medium"],
      ["Two Pointers", 11, "Container With Most Water", "container-with-most-water", "Medium"],
      ["Sliding Window", 121, "Best Time to Buy and Sell Stock", "best-time-to-buy-and-sell-stock", "Easy"],
      ["Sliding Window", 643, "Maximum Average Subarray I", "maximum-average-subarray-i", "Easy"],
      ["Sliding Window", 209, "Minimum Size Subarray Sum", "minimum-size-subarray-sum", "Medium"],
      ["Binary Search", 704, "Binary Search", "binary-search", "Easy"],
      ["Binary Search", 35, "Search Insert Position", "search-insert-position", "Easy"],
      ["Binary Search", 153, "Find Minimum in Rotated Sorted Array", "find-minimum-in-rotated-sorted-array", "Medium"],
      ["Stack", 20, "Valid Parentheses", "valid-parentheses", "Easy"],
      ["Stack", 739, "Daily Temperatures", "daily-temperatures", "Medium"],
      ["Trees", 104, "Maximum Depth of Binary Tree", "maximum-depth-of-binary-tree", "Easy"],
      ["Trees", 100, "Same Tree", "same-tree", "Easy"],
      ["Trees", 112, "Path Sum", "path-sum", "Easy"],
      ["Graphs", 733, "Flood Fill", "flood-fill", "Easy"],
      ["Graphs", 1971, "Find if Path Exists in Graph", "find-if-path-exists-in-graph", "Easy"],
      ["Graphs", 200, "Number of Islands", "number-of-islands", "Medium"],
      ["Dynamic Programming", 70, "Climbing Stairs", "climbing-stairs", "Easy"],
      ["Dynamic Programming", 746, "Min Cost Climbing Stairs", "min-cost-climbing-stairs", "Easy"],
      ["Dynamic Programming", 198, "House Robber", "house-robber", "Medium"],
      ["Dynamic Programming", 53, "Maximum Subarray", "maximum-subarray", "Medium"],
    ]);
  });

  it("lists the categories in learning order, each with 2 to 4 problems", () => {
    expect(CATEGORIES).toEqual(["Arrays & Hashing", "Two Pointers", "Sliding Window", "Binary Search", "Stack", "Trees", "Graphs", "Dynamic Programming"]);
    for (const c of CATEGORIES) {
      const n = problems.filter((p) => p.category === c).length;
      expect(n, c).toBeGreaterThanOrEqual(2);
      expect(n, c).toBeLessThanOrEqual(4);
    }
  });

  it("gives each problem a LeetCode-style class Solution signature", () => {
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
