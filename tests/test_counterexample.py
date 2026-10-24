"""Counterexample search: when a solution is wrong, find the smallest input
that proves it, by running it next to the reference on small valid inputs,
smallest first. Each test plants a realistic beginner bug."""

import pytest

import practice

STAIRS_OFF_BY_ONE = """class Solution:
    def climbStairs(self, n):
        ways = [1, 1] + [0] * n
        for i in range(2, n):
            ways[i] = ways[i - 1] + ways[i - 2]
        return ways[n]
"""

BINARY_SEARCH_STRICT_LOOP = """class Solution:
    def search(self, nums, target):
        left, right = 0, len(nums) - 1
        while left < right:
            mid = (left + right) // 2
            if nums[mid] == target:
                return mid
            if nums[mid] < target:
                left = mid + 1
            else:
                right = mid - 1
        return -1
"""

AVERAGE_MISSES_LAST_WINDOW = """class Solution:
    def findMaxAverage(self, nums, k):
        total = sum(nums[:k])
        best = total
        for i in range(k, len(nums) - 1):
            total += nums[i] - nums[i - k]
            best = max(best, total)
        return best / k
"""

TWO_SUM_SAME_ELEMENT = """class Solution:
    def twoSum(self, nums, target):
        for i in range(len(nums)):
            for j in range(len(nums)):
                if nums[i] + nums[j] == target:
                    return [i, j]
        return []
"""

DUPLICATE_ADJACENT_ONLY = """class Solution:
    def containsDuplicate(self, nums):
        for i in range(len(nums) - 1):
            if nums[i] == nums[i + 1]:
                return True
        return False
"""

TWO_SUM_II_ZERO_BASED = """class Solution:
    def twoSum(self, numbers, target):
        left, right = 0, len(numbers) - 1
        while left < right:
            total = numbers[left] + numbers[right]
            if total == target:
                return [left, right]
            if total < target:
                left += 1
            else:
                right -= 1
        return []
"""

PATH_ONE_WAY_EDGES = """class Solution:
    def validPath(self, n, edges, source, destination):
        graph = {i: [] for i in range(n)}
        for u, v in edges:
            graph[u].append(v)
        seen = {source}
        stack = [source]
        while stack:
            node = stack.pop()
            if node == destination:
                return True
            for nxt in graph[node]:
                if nxt not in seen:
                    seen.add(nxt)
                    stack.append(nxt)
        return False
"""

DEPTH_COUNTS_EDGES = """class Solution:
    def maxDepth(self, root):
        if root is None:
            return 0
        if root.left is None and root.right is None:
            return 0
        return 1 + max(self.maxDepth(root.left), self.maxDepth(root.right))
"""

FOREVER = """class Solution:
    def climbStairs(self, n):
        while True:
            n += 1
"""


def size(slug, args):
    return practice.input_size(slug, args)


@pytest.mark.parametrize("slug", list(practice.load_problems()))
def test_the_reference_has_no_counterexample(slug):
    res = practice.find_counterexample(slug, practice.reference_source(slug))
    assert res["found"] is False
    assert res["tried"] >= 20  # it really searched
    assert res["complete"] is True  # and checked every candidate


@pytest.mark.parametrize("slug", list(practice.load_problems()))
def test_every_candidate_input_is_valid_and_sorted_smallest_first(slug):
    cands = list(practice.candidates(slug))
    assert len(cands) >= 20
    sizes = [size(slug, a) for a in cands]
    assert sizes == sorted(sizes)
    ref = practice.reference_source(slug)
    for args in cands[:200]:
        assert practice.run(slug, ref, args)["ok"], (slug, args)


@pytest.mark.parametrize(
    "slug, source, check",
    [
        ("climbing-stairs", STAIRS_OFF_BY_ONE, lambda r: r["args"] == [2] and r["got"] == 0 and r["expected"] == 2),
        ("two-sum", TWO_SUM_SAME_ELEMENT, lambda r: len(r["args"][0]) == 2 and r["got"] == [0, 0]),
        ("contains-duplicate", DUPLICATE_ADJACENT_ONLY, lambda r: len(r["args"][0]) == 3 and r["expected"] is True),
        ("two-sum-ii-input-array-is-sorted", TWO_SUM_II_ZERO_BASED, lambda r: len(r["args"][0]) == 2),
        ("find-if-path-exists-in-graph", PATH_ONE_WAY_EDGES, lambda r: r["args"][0] == 2 and r["expected"] is True),
        ("binary-search", BINARY_SEARCH_STRICT_LOOP, lambda r: len(r["args"][0]) == 1 and r["got"] == -1 and r["expected"] == 0),
        ("maximum-average-subarray-i", AVERAGE_MISSES_LAST_WINDOW, lambda r: len(r["args"][0]) == 2 and r["args"][1] == 1),
        ("maximum-depth-of-binary-tree", DEPTH_COUNTS_EDGES, lambda r: r["args"] == [[1]] and r["got"] == 0),
    ],
)
def test_finds_the_smallest_input_that_breaks_a_real_bug(slug, source, check):
    res = practice.find_counterexample(slug, source)
    assert res["found"] is True, res
    assert res["error"] is None
    assert check(res), res
    # Nothing smaller breaks it: every earlier candidate gives the right answer.
    smaller = [a for a in practice.candidates(slug) if size(slug, a) < size(slug, res["args"])]
    for args in smaller:
        assert practice.check(slug, source, args)["correct"], (args, res)


def test_crashes_and_runaway_loops_are_counterexamples_too():
    crash = "class Solution:\n    def twoSum(self, nums, target):\n        return [nums[5], 0]\n"
    res = practice.find_counterexample("two-sum", crash)
    assert res["found"] and res["error"]["type"] == "IndexError" and len(res["args"][0]) == 2
    res = practice.find_counterexample("climbing-stairs", FOREVER)
    assert res["found"] and res["error"]["type"] == "StepLimit" and res["args"] == [1]


def test_the_search_is_deterministic():
    a = practice.find_counterexample("two-sum", TWO_SUM_SAME_ELEMENT)
    b = practice.find_counterexample("two-sum", TWO_SUM_SAME_ELEMENT)
    assert a == b


def test_a_slow_but_correct_solution_stops_at_the_time_budget():
    slow = (
        "class Solution:\n"
        "    def climbStairs(self, n):\n"
        "        if n <= 1:\n"
        "            return 1\n"
        "        return self.climbStairs(n - 1) + self.climbStairs(n - 2)\n"
    )
    # A tiny budget, so the clock stops the search before the exponential
    # recursion gets big enough to exceed the line budget (around n = 18,
    # which would itself be reported, like LeetCode's "time limit exceeded").
    res = practice.find_counterexample("climbing-stairs", slow, seconds=0.002)
    assert res["found"] is False
    assert res["complete"] is False  # ran out of time before checking everything


def test_json_entry_point_for_the_worker():
    import json

    out = json.loads(practice.find_counterexample_json("climbing-stairs", STAIRS_OFF_BY_ONE))
    assert out["found"] is True and out["args"] == [2]
