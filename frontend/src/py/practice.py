"""Practice harness for LeetCode-style problems.

A student submits a ``class Solution``. CodeLens runs it on an input, either
traced (to visualize it next to a reference solution) or untraced (to check
the answer quickly, e.g. while searching for a counterexample).

- ``shared/practice/problems.json``: per problem, the method name, parameter
  names, examples (our own) and how answers are compared.
- ``shared/practice/<slug>.py``: a correct reference solution.
- ``PRELUDE``: what LeetCode provides without imports (typing names, deque,
  TreeNode and a level-order tree builder). It runs untraced and its names
  are hidden from the trace.
- ``program()``: the student's code plus a short, visible driver that builds
  the inputs and calls the method, so the call shows in the trace.

Plain Python: runs under CPython (pytest, gen_fixtures) and under Pyodide (the
worker sets ``DATA_DIR`` to where it wrote the data files).
"""

from __future__ import annotations

import builtins
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import tracer  # noqa: E402

_HERE = Path(__file__).resolve()
# In the repo the data lives in shared/practice; the worker writes it to a
# "practice" folder next to this file.
DATA_DIR = _HERE.parents[3] / "shared" / "practice" if len(_HERE.parents) > 3 else _HERE.parent / "practice"

# Untraced line budget for one run(): far more than any correct solution needs
# on a small input, small enough that a runaway loop stops quickly.
RUN_MAX_LINES = 20_000

PRELUDE = '''from typing import Dict, List, Optional, Set, Tuple
from collections import Counter, defaultdict, deque


class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right


def build_tree(values):
    if not values or values[0] is None:
        return None
    root = TreeNode(values[0])
    queue = deque([root])
    i = 1
    while queue and i < len(values):
        node = queue.popleft()
        if i < len(values) and values[i] is not None:
            node.left = TreeNode(values[i])
            queue.append(node.left)
        i += 1
        if i < len(values) and values[i] is not None:
            node.right = TreeNode(values[i])
            queue.append(node.right)
        i += 1
    return root
'''

_cache: dict = {}


def load_problems() -> dict:
    """Problem data keyed by slug, in the order of problems.json."""
    if "problems" not in _cache:
        path = Path(DATA_DIR) / "problems.json"
        _cache["problems"] = json.loads(path.read_text(encoding="utf-8"))
    return _cache["problems"]


def reference_source(slug: str) -> str:
    return (Path(DATA_DIR) / f"{slug}.py").read_text(encoding="utf-8")


def program(slug: str, source: str, args: list) -> str:
    """The student's code plus a visible driver that calls the method on ``args``."""
    p = load_problems()[slug]
    trees = set(p.get("tree_params", []))
    lines = ["", "# CodeLens runs your solution on this input:"]
    for name, value in zip(p["params"], args):
        lines.append(f"{name} = build_tree({value!r})" if name in trees else f"{name} = {value!r}")
    lines.append(f"result = Solution().{p['method']}({', '.join(p['params'])})")
    lines.append("print(result)")
    return source.rstrip("\n") + "\n" + "\n".join(lines) + "\n"


def trace_example(slug: str, source: str, args: list) -> dict:
    """Trace the student's code on ``args`` (a TraceResult dict)."""
    return tracer.trace(program(slug, source, args), prelude=PRELUDE)


def trace_example_json(slug: str, source: str | None, args_json: str) -> str:
    """JSON in and out, for the worker. A non-string ``source`` (None in CPython,
    JsNull when JavaScript passes null through Pyodide) traces the reference."""
    src = source if type(source) is str else reference_source(slug)
    args = json.loads(args_json)
    return _dumps({"program": program(slug, src, args), "trace": trace_example(slug, src, args)})


def _dumps(obj) -> str:
    return json.dumps(obj, separators=(",", ":"), ensure_ascii=False)


def check(slug: str, source: str, args: list) -> dict:
    """Run the student's solution and the reference on ``args`` and compare.

    Returns ``{"correct", "got", "expected", "error"}`` with JSON-safe values
    (an answer that is not plain data, e.g. a set, is shown in the contract's
    value forms).
    """
    expected = run(slug, reference_source(slug), args)
    mine = run(slug, source, args)
    exp_value = expected["value"] if expected["ok"] else None
    if not mine["ok"]:
        return {"correct": False, "got": None, "expected": _json_value(exp_value), "error": mine["error"]}
    return {
        "correct": expected["ok"] and same_answer(slug, mine["value"], exp_value),
        "got": _json_value(mine["value"]),
        "expected": _json_value(exp_value),
        "error": None,
    }


def check_json(slug: str, source: str, args_json: str) -> str:
    return _dumps(check(slug, source, json.loads(args_json)))


def _json_value(v):
    jv, _cut = tracer.snapshot(v)
    return jv


def _error(exc) -> dict:
    if type(exc) is tracer.StepLimit:
        return {"type": "StepLimit", "message": f"Stopped after {RUN_MAX_LINES} lines. Is there a loop that never ends?"}
    return {"type": tracer._type_name(exc), "message": tracer._exception_message(exc)}


def run(slug: str, source: str, args: list, max_lines: int = RUN_MAX_LINES) -> dict:
    """Run the student's method on ``args`` without tracing.

    Returns ``{"ok": True, "value": v}`` or ``{"ok": False, "error": {type, message}}``.
    Printing is discarded, ``input()`` is stubbed, and a line budget stops
    runaway loops (sticky, so a bare ``except:`` cannot swallow it).
    """
    p = load_problems()[slug]
    count = 0
    limited = False

    def tf(frame, event, arg):
        nonlocal count, limited
        if frame.f_code.co_filename != tracer.USER_FILENAME:
            return None
        if limited:
            raise tracer.StepLimit()
        if event == "line":
            count += 1
            if count > max_lines:
                limited = True
                raise tracer.StepLimit()
        return tf

    saved = (sys.stdout, builtins.input, sys.gettrace())
    try:
        code = compile(source, tracer.USER_FILENAME, "exec")
    except Exception as err:  # noqa: BLE001 - SyntaxError and friends
        return {"ok": False, "error": _error(err)}
    try:
        sys.stdout = tracer._CappedWriter()
        builtins.input = tracer._input_stub
        ns = {"__name__": "__main__", "__builtins__": builtins}
        exec(compile(PRELUDE, tracer.PRELUDE_FILENAME, "exec"), ns)
        trees = set(p.get("tree_params", []))
        call_args = [ns["build_tree"](a) if name in trees else _fresh(a) for name, a in zip(p["params"], args)]
        sys.settrace(tf)
        try:
            exec(code, ns)
            if "Solution" not in ns:
                raise NameError("name 'Solution' is not defined")
            solution = ns["Solution"]()
            value = getattr(solution, p["method"])(*call_args)
        finally:
            sys.settrace(saved[2])
        return {"ok": True, "value": value}
    except BaseException as exc:  # noqa: BLE001 - every failure is a result
        if limited:
            return {"ok": False, "error": _error(tracer.StepLimit())}
        return {"ok": False, "error": _error(exc)}
    finally:
        sys.stdout, builtins.input = saved[0], saved[1]


def _fresh(value):
    """A deep copy of a JSON value, so a solution that mutates its input can't change our examples."""
    return json.loads(json.dumps(value))


def _plain(v):
    """``v`` as plain JSON-like data, or a sentinel if it holds anything else.

    Only exact types qualify (no subclasses, no student objects), so comparing
    never calls a student's ``__eq__``. Tuples count as lists, as LeetCode does.
    """
    t = type(v)
    if v is None or t is bool or t is int or t is str:
        return (t.__name__, v)
    if t is float:
        return ("float", v)
    if t is list or t is tuple:
        items = [_plain(x) for x in v]
        return _NOT_PLAIN if _NOT_PLAIN in items else ("list", tuple(items))
    return _NOT_PLAIN


_NOT_PLAIN = ("<not plain>",)


def same_answer(slug: str, got, expected) -> bool:
    """Whether ``got`` is a correct answer, given the reference's ``expected``."""
    rule = load_problems()[slug].get("compare", "exact")
    g, e = _plain(got), _plain(expected)
    if g is _NOT_PLAIN or e is _NOT_PLAIN:
        return False
    if rule == "same-items" and g[0] == "list" and e[0] == "list":
        return sorted(g[1]) == sorted(e[1])
    return g == e


# ---- Counterexample search ------------------------------------------------
#
# When a solution is wrong, find the smallest input that proves it: run it
# next to the reference on small valid inputs (within LeetCode's rules, e.g.
# Two Sum always has exactly one answer), smallest first, and stop at the
# first disagreement, crash, or runaway loop.

import itertools  # noqa: E402
import time  # noqa: E402

SEARCH_SECONDS = 1.5  # well inside the worker's 3 s timeout


def _abs_sum(xs) -> int:
    return sum(abs(x) for x in xs)


def _tree_nodes(values) -> int:
    return sum(1 for v in values if v is not None)


_SIZE = {
    "two-sum": lambda a: (len(a[0]), _abs_sum(a[0]), abs(a[1])),
    "contains-duplicate": lambda a: (len(a[0]), _abs_sum(a[0])),
    "two-sum-ii-input-array-is-sorted": lambda a: (len(a[0]), _abs_sum(a[0]), abs(a[1])),
    "find-if-path-exists-in-graph": lambda a: (a[0] + len(a[1]), len(a[1]), a[2], a[3]),
    "maximum-depth-of-binary-tree": lambda a: (_tree_nodes(a[0]), len(a[0])),
    "climbing-stairs": lambda a: (a[0],),
}


def input_size(slug: str, args: list) -> tuple:
    """How big an input is, for "smallest first" (compared as a tuple)."""
    return _SIZE[slug](args)


def _unique_pair_targets(nums, ordered_pairs):
    """Targets reached by exactly one pair of positions (LeetCode's guarantee)."""
    counts: dict = {}
    for i, j in ordered_pairs(len(nums)):
        s = nums[i] + nums[j]
        counts[s] = counts.get(s, 0) + 1
    return sorted(t for t, c in counts.items() if c == 1)


def _pairs(n):
    return itertools.combinations(range(n), 2)


def _gen_two_sum():
    for length in (2, 3, 4):
        values = range(-2, 3)
        arrays = itertools.product(values, repeat=length)
        for k, nums in enumerate(arrays):
            if length == 4 and k % 9:  # sample the larger arrays
                continue
            for target in _unique_pair_targets(nums, _pairs):
                yield [list(nums), target]


def _gen_contains_duplicate():
    for length in (1, 2, 3, 4):
        for nums in itertools.product(range(3), repeat=length):
            yield [list(nums)]


def _gen_two_sum_ii():
    for length in (2, 3, 4):
        for nums in itertools.combinations_with_replacement(range(-2, 4), length):
            for target in _unique_pair_targets(nums, _pairs):
                yield [list(nums), target]


def _gen_valid_path():
    for n in (1, 2, 3, 4):
        all_edges = list(itertools.combinations(range(n), 2))
        max_edges = 3 if n <= 3 else 2
        sources = range(n) if n <= 3 else (0,)
        for count in range(0, min(max_edges, len(all_edges)) + 1):
            for edges in itertools.combinations(all_edges, count):
                for s in sources:
                    for d in range(n):
                        yield [n, [list(e) for e in edges], s, d]


def _shapes(n):
    """Every binary tree shape with n nodes, as nested (left, right) tuples."""
    if n == 0:
        yield None
        return
    for left in range(n):
        for lt in _shapes(left):
            for rt in _shapes(n - 1 - left):
                yield (lt, rt)


def _level_order(shape):
    """A shape as LeetCode's level-order list, values 1, 2, ... in BFS order."""
    if shape is None:
        return []
    out, queue, label = [], [shape], 1
    while queue:
        node = queue.pop(0)
        if node is None:
            out.append(None)
            continue
        out.append(label)
        label += 1
        queue.extend([node[0], node[1]])
    while out and out[-1] is None:
        out.pop()
    return out


def _gen_max_depth():
    for n in range(0, 5):
        for shape in _shapes(n):
            yield [_level_order(shape)]


def _gen_climbing_stairs():
    for n in range(1, 21):
        yield [n]


_GENERATORS = {
    "two-sum": _gen_two_sum,
    "contains-duplicate": _gen_contains_duplicate,
    "two-sum-ii-input-array-is-sorted": _gen_two_sum_ii,
    "find-if-path-exists-in-graph": _gen_valid_path,
    "maximum-depth-of-binary-tree": _gen_max_depth,
    "climbing-stairs": _gen_climbing_stairs,
}


def candidates(slug: str) -> list:
    """Small valid inputs for ``slug``, smallest first (deterministic)."""
    key = ("candidates", slug)
    if key not in _cache:
        seen, out = set(), []
        for args in _GENERATORS[slug]():
            fingerprint = json.dumps(args)
            if fingerprint not in seen:
                seen.add(fingerprint)
                out.append(args)
        out.sort(key=lambda a: input_size(slug, a))  # stable: generator order breaks ties
        _cache[key] = out
    return _cache[key]


def find_counterexample(slug: str, source: str, seconds: float = SEARCH_SECONDS) -> dict:
    """The smallest input where ``source`` disagrees with the reference.

    Returns ``{"found": True, "args", "got", "expected", "error", "tried"}`` or
    ``{"found": False, "tried", "complete"}``; ``complete`` is False when the
    time budget ran out before every candidate was checked.
    """
    start = time.perf_counter()
    tried = 0
    for args in candidates(slug):
        if tried and time.perf_counter() - start > seconds:
            return {"found": False, "tried": tried, "complete": False}
        tried += 1
        res = check(slug, source, args)
        if not res["correct"]:
            return {"found": True, "args": args, "got": res["got"], "expected": res["expected"], "error": res["error"], "tried": tried}
    return {"found": False, "tried": tried, "complete": True}


def find_counterexample_json(slug: str, source: str) -> str:
    return _dumps(find_counterexample(slug, source))
