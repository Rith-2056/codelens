# Design: problem-catalog

## Data
`frontend/src/problems.ts` gains `category: Category`, and
`CATEGORIES: readonly Category[]` fixes the section order. The list is
ordered by category, then easier first within a category, so problem order
is also the learning path.

| Slug | # | Method | Params | Compare | Visualization (from focus.ts) |
|---|---|---|---|---|---|
| valid-anagram | 242 | isAnagram | s, t | exact | hash map of counts |
| product-of-array-except-self | 238 | productExceptSelf | nums | exact | DP-style table `answer` |
| squares-of-a-sorted-array | 977 | sortedSquares | nums | exact | two pointers + result list |
| container-with-most-water | 11 | maxArea | height | exact | two pointers |
| best-time-to-buy-and-sell-stock | 121 | maxProfit | prices | exact | left / right pointers |
| minimum-size-subarray-sum | 209 | minSubArrayLen | target, nums | exact | variable sliding window |
| search-insert-position | 35 | searchInsert | nums, target | exact | binary search |
| find-minimum-in-rotated-sorted-array | 153 | findMin | nums | exact | binary search |
| valid-parentheses | 20 | isValid | s | exact | stack list + pairs dict |
| daily-temperatures | 739 | dailyTemperatures | temperatures | exact | monotonic stack + pointers |
| same-tree | 100 | isSameTree | p, q (trees) | exact | two trees + call stack |
| path-sum | 112 | hasPathSum | root (tree), targetSum | exact | tree + call stack |
| flood-fill | 733 | floodFill | image, sr, sc, color | exact | grid + call stack |
| number-of-islands | 200 | numIslands | grid | exact | grid + call stack |
| min-cost-climbing-stairs | 746 | minCostClimbingStairs | cost | exact | DP table `dp` |
| house-robber | 198 | rob | nums | exact | DP table `dp` |
| maximum-subarray | 53 | maxSubArray | nums | exact | list + pointer `i` |

Reference solutions use the variable names the visualizer recognizes
(`left`, `right`, `mid`, `window`, `dp`, ...), because their runs are what
students compare against.

## Generators (small and valid)
- Lists: lengths 1–4 over small value ranges. The 4-long arrays are sampled
  when the full set would pass about 400 inputs.
- Sorted or distinct lists come from `itertools.combinations`; the rotated
  ones are every rotation of those.
- Strings come from small alphabets: "ab" for anagrams, "()[]" for
  brackets.
- Trees are every shape with up to 3 nodes and values from {1, 2}, written
  as LeetCode level-order lists. Same Tree pairs the trees with up to 2 nodes,
  plus the 3-node trees with all values 1.
- Grids are up to 2x2 for Flood Fill (every start cell, colors 0–2), and up
  to 2x3 or 3x2 for islands.

## Visualizer change
In `CodeVisualizer.tsx`, a sliding window with no `k` draws its band from the
first LOW pointer (`left`, `lo`, ...) to the first HIGH pointer (`right`,
`hi`, ...). The band is not drawn while left > right (just after shrinking).

## UI
`ProblemList.tsx` renders one `<section>` per category, with an `<h2>` and a
`<ul>`. The heading shows the problem count and "N solved".
