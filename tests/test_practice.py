"""The practice harness: LeetCode-style `class Solution` submissions run on an
input, next to a reference solution.

- shared/practice/problems.json holds each problem's method, parameter names,
  examples (our own) and how answers are compared.
- shared/practice/<slug>.py holds a correct reference solution.
- A hidden prelude provides what LeetCode provides (typing names, deque,
  TreeNode and a tree builder). It runs untraced and never shows in steps.
- A visible driver is appended to the student's code, so the call shows up
  in the trace.
"""

import json
from pathlib import Path

import pytest

import practice
import tracer

ROOT = Path(__file__).resolve().parent.parent
SLUGS = [
    "two-sum",
    "contains-duplicate",
    "two-sum-ii-input-array-is-sorted",
    "find-if-path-exists-in-graph",
    "maximum-depth-of-binary-tree",
    "climbing-stairs",
]


def test_problem_data_covers_the_six_problems_in_order():
    problems = practice.load_problems()
    assert list(problems) == SLUGS
    for slug, p in problems.items():
        assert p["method"] and p["params"], slug
        assert len(p["examples"]) >= 3, slug
        assert (ROOT / "shared" / "practice" / f"{slug}.py").exists(), slug


def test_slugs_and_methods_match_the_frontend_problem_list():
    ts = (ROOT / "frontend" / "src" / "problems.ts").read_text()
    for slug, p in practice.load_problems().items():
        assert f'slug: "{slug}"' in ts
        block = ts[ts.index(f'slug: "{slug}"'):]
        assert f'method: "{p["method"]}"' in block[: block.index("statement:")]


@pytest.mark.parametrize("slug", SLUGS)
def test_reference_solution_gives_every_expected_answer(slug):
    p = practice.load_problems()[slug]
    ref = practice.reference_source(slug)
    for ex in p["examples"]:
        got = practice.run(slug, ref, ex["args"])
        assert got["ok"], (slug, ex, got)
        assert practice.same_answer(slug, got["value"], ex["expected"]), (slug, ex, got)


def test_program_appends_a_visible_driver_after_the_students_code():
    src = "class Solution:\n    def climbStairs(self, n: int) -> int:\n        return n\n"
    prog = practice.program("climbing-stairs", src, [4])
    assert prog.startswith(src)
    assert prog.endswith(
        "\n# CodeLens runs your solution on this input:\n"
        "n = 4\n"
        "result = Solution().climbStairs(n)\n"
        "print(result)\n"
    )


def test_tree_inputs_are_built_from_level_order_lists():
    prog = practice.program("maximum-depth-of-binary-tree", "x = 1\n", [[1, None, 2]])
    assert "root = build_tree([1, None, 2])\n" in prog


def test_prelude_runs_untraced_and_its_names_stay_hidden():
    src = practice.reference_source("maximum-depth-of-binary-tree")
    result = practice.trace_example("maximum-depth-of-binary-tree", src, [[1, 2, 3, 4, None, None, 5]])
    assert result["status"] == "ok"
    assert result["steps"][-1]["stdout"] == "3\n"
    n_lines = practice.program("maximum-depth-of-binary-tree", src, [[1, 2, 3, 4, None, None, 5]]).count("\n")
    for step in result["steps"]:
        assert 1 <= step["line"] <= n_lines  # never a prelude line
        for hidden in ("List", "Optional", "deque", "TreeNode", "build_tree"):
            assert hidden not in step["locals"], (hidden, step["index"])
    # The TreeNode objects the prelude built are visible in the heap, next to
    # the Solution object itself (it is `self` inside the method).
    types = {obj["type"] for s in result["steps"] for obj in s["heap"].values()}
    assert types == {"TreeNode", "Solution"}


def test_a_solution_method_runs_as_its_own_frame():
    src = practice.reference_source("two-sum")
    result = practice.trace_example("two-sum", src, [[3, 8, 5, 1], 6])
    assert result["status"] == "ok"
    assert result["steps"][-1]["stdout"] == "[2, 3]\n"
    method_steps = [s for s in result["steps"] if s["functionName"] == "twoSum"]
    assert method_steps and all(s["depth"] == 1 for s in method_steps)
    assert all(len(s["stack"]) == 2 for s in method_steps)  # module + twoSum


def test_students_can_use_leetcode_annotations_and_deque_without_imports():
    src = (
        "class Solution:\n"
        "    def containsDuplicate(self, nums: List[int]) -> bool:\n"
        "        q = deque(nums)\n"
        "        return len(set(q)) != len(q)\n"
    )
    got = practice.run("contains-duplicate", src, [[1, 2, 1]])
    assert got == {"ok": True, "value": True}


def test_errors_and_missing_methods_are_reported_not_raised():
    bad = "class Solution:\n    def twoSum(self, nums, target):\n        return nums[99]\n"
    got = practice.run("two-sum", bad, [[1, 2], 3])
    assert got["ok"] is False and got["error"]["type"] == "IndexError"
    missing = "class Solution:\n    pass\n"
    got = practice.run("two-sum", missing, [[1, 2], 3])
    assert got["ok"] is False and got["error"]["type"] == "AttributeError"
    nosol = "x = 1\n"
    got = practice.run("two-sum", nosol, [[1, 2], 3])
    assert got["ok"] is False and got["error"]["type"] == "NameError"


def test_runaway_solutions_stop_at_the_step_limit():
    src = "class Solution:\n    def climbStairs(self, n):\n        while True:\n            pass\n"
    got = practice.run("climbing-stairs", src, [3])
    assert got["ok"] is False and got["error"]["type"] == "StepLimit"


def test_answer_comparison_rules():
    assert practice.same_answer("two-sum", [3, 1], [1, 3])  # any order
    assert not practice.same_answer("two-sum", [1, 1], [1, 3])
    assert practice.same_answer("two-sum-ii-input-array-is-sorted", [1, 3], [1, 3])
    assert not practice.same_answer("two-sum-ii-input-array-is-sorted", [3, 1], [1, 3])  # smaller first
    assert practice.same_answer("contains-duplicate", True, True)
    assert not practice.same_answer("contains-duplicate", 1, True)  # must be a real bool
    assert not practice.same_answer("climbing-stairs", 13.0, 13)  # must be an int


def test_reference_fixtures_match_fresh_traces():
    for slug in SLUGS:
        path = ROOT / "shared" / "fixtures" / "practice" / f"{slug}.json"
        data = json.loads(path.read_text())
        ex = practice.load_problems()[slug]["examples"][0]
        ref = practice.reference_source(slug)
        assert data["program"] == practice.program(slug, ref, ex["args"])
        assert data["trace"] == practice.trace_example(slug, ref, ex["args"])
