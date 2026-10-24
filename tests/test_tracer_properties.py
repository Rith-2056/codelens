"""Hypothesis property tests for the tracer (trace-engine task 4, ds-visualizers task 2).

Properties:
  (a) ok + untruncated runs: the final step's locals and heap equal a snapshot
      of the same program's namespace run without tracing (same value rules;
      heap ids renamed canonically on both sides);
  (b) indices count up from 0 and len(steps) <= MAX_STEPS;
  (c) every line is within the program and depth >= 0;
  (d) every step fits STEP_BYTE_CAP, and truncated is set exactly when a cap
      dropped data;
  (e) tracing the same program twice gives identical results.
New for the 2026-10-24 contract:
  (i)   every {"__ref": id} anywhere in a step (locals, returnValue, stack
        locals, heap fields) resolves in that step's heap, and
        heap[id]["id"] == id;
  (ii)  len(stack) == depth + 1 == the number of active user frames, checked
        against an independent sys.settrace oracle; the last frame is the
        current frame (frameId, functionName, line, locals);
  (iii) trace_json output is byte-identical across runs and across
        PYTHONHASHSEED values (subprocesses).
"""

import builtins
import contextlib
import io
import json
import os
import subprocess
import sys
import textwrap
from pathlib import Path

from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

import gen_fixtures
import tracer
from tracer import MAX_ITEMS, MAX_STEPS, MAX_STR_LEN, STDOUT_BYTE_CAP, STEP_BYTE_CAP

PY_DIR = Path(__file__).resolve().parent.parent / "frontend" / "src" / "py"

SETTINGS = settings(
    max_examples=60,
    deadline=None,
    suppress_health_check=[HealthCheck.too_slow, HealthCheck.data_too_large],
)

NAMES = ("a", "b", "c", "d")
SMALL_INT = st.integers(-9, 9)
STEP_LIMIT_MESSAGE = tracer.limit_message(MAX_STEPS - 1)


# --- reference + shared checks ----------------------------------------------


def canonical(values: dict, heap: dict):
    """Rename heap ids to c1, c2, ... in first-seen order from ``values``.

    Two snapshots that differ only in heap id numbering become equal.
    """
    names: dict = {}
    order: list = []

    def walk(jv):
        if isinstance(jv, list):
            return [walk(x) for x in jv]
        if isinstance(jv, dict):
            if set(jv) == {"__ref"}:
                rid = jv["__ref"]
                if rid not in names:
                    names[rid] = f"c{len(names) + 1}"
                    order.append(rid)
                return {"__ref": names[rid]}
            return {k: walk(v) for k, v in jv.items()}
        return jv

    out = {k: walk(v) for k, v in values.items()}
    new_heap = {}
    i = 0
    while i < len(order):
        rid = order[i]
        i += 1
        obj = heap[rid]
        new_heap[names[rid]] = {
            "id": names[rid],
            "type": obj["type"],
            "fields": {k: walk(v) for k, v in obj["fields"].items()},
        }
    return out, new_heap


def untraced_snapshot(source: str):
    """The reference for (a): run without tracing, then snapshot + `__` filter."""
    ns = {"__name__": "__main__", "__builtins__": builtins}
    with contextlib.redirect_stdout(io.StringIO()):
        exec(compile(source, tracer.USER_FILENAME, "exec"), ns)
    values = {k: v for k, v in ns.items() if not k.startswith("__")}
    loc, heap, _ = tracer.snapshot_with_heap(values)
    return canonical(loc, heap)


def oracle_line_stacks(source: str) -> list:
    """Independent oracle for (ii): for every line event in user code, the
    line number and the names of the active user frames, outermost first."""
    seen = []

    def count(frame, event, arg):
        if frame.f_code.co_filename != tracer.USER_FILENAME:
            return None
        if event == "line":
            names = []
            f = frame
            while f is not None:
                if f.f_code.co_filename == tracer.USER_FILENAME:
                    names.append(f.f_code.co_name)
                f = f.f_back
            seen.append((frame.f_lineno, names[::-1]))
            if len(seen) > MAX_STEPS:
                raise KeyboardInterrupt  # far enough: stop the run
        return count

    ns = {"__name__": "__main__", "__builtins__": builtins}
    code = compile(source, tracer.USER_FILENAME, "exec")
    saved = sys.gettrace()
    try:
        with contextlib.redirect_stdout(io.StringIO()):
            sys.settrace(count)
            try:
                exec(code, ns)
            except BaseException:  # noqa: BLE001 - student errors and the stop
                pass
            finally:
                sys.settrace(saved)
    finally:
        sys.settrace(saved)
    return seen


def step_size(step: dict) -> int:
    return len(json.dumps(step, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))


def refs_in(jv, out: list):
    if isinstance(jv, list):
        for x in jv:
            refs_in(x, out)
    elif isinstance(jv, dict):
        if "__ref" in jv:
            assert set(jv) == {"__ref"} and isinstance(jv["__ref"], str)
            out.append(jv["__ref"])
        for v in jv.values():
            refs_in(v, out)
    return out


def check_refs_resolve(step: dict):
    """(i) every ref in the step resolves in its heap."""
    heap = step["heap"]
    for hid, obj in heap.items():
        assert obj["id"] == hid
        assert set(obj) == {"id", "type", "fields"}
        assert isinstance(obj["type"], str) and isinstance(obj["fields"], dict)
    refs = refs_in(step["locals"], [])
    if "returnValue" in step:
        refs_in(step["returnValue"], refs)
    for fr in step["stack"]:
        refs_in(fr["locals"], refs)
    for obj in heap.values():
        refs_in(obj["fields"], refs)
    for ref in refs:
        assert ref in heap, (ref, sorted(heap))
        assert heap[ref]["id"] == ref


def check_stack_shape(step: dict):
    """(ii) without the oracle: depth, current frame last, module first."""
    stack = step["stack"]
    assert len(stack) == step["depth"] + 1
    assert stack[0]["frameId"] == "module" and stack[0]["functionName"] == "<module>"
    top = stack[-1]
    assert top["frameId"] == step["frameId"]
    assert top["functionName"] == step["functionName"]
    assert top["line"] == step["line"]
    assert top["locals"] == step["locals"]
    assert len({fr["frameId"] for fr in stack}) == len(stack)
    for fr in stack:
        assert set(fr) == {"functionName", "frameId", "line", "locals"}


def check_stack_against_oracle(source: str, steps: list):
    """(ii) with the oracle: line steps match the oracle's frame chains."""
    n_lines = max(1, len(source.splitlines()))
    mine = [
        (s["line"], [fr["functionName"] for fr in s["stack"]])
        for s in steps
        if s["event"] == "line"
    ]
    theirs = [(min(line or 1, n_lines), names) for line, names in oracle_line_stacks(source)]
    assert mine == theirs[: len(mine)]


def check_common(source: str, oracle: bool = True) -> dict:
    """Properties (a)-(e) and (i)-(iii, in process). Returns the result."""
    result = tracer.trace(source)
    steps = result["steps"]

    # (e) / (iii) deterministic, and the worker's JSON is byte-identical
    # between runs and parses back to the same result.
    text = tracer.trace_json(source)
    assert tracer.trace_json(source) == text
    assert json.loads(text) == result

    # (b) contiguous indices, bounded length.
    assert [s["index"] for s in steps] == list(range(len(steps)))
    assert 1 <= len(steps) <= MAX_STEPS

    # (c) lines in range, depth never negative.
    n_lines = max(1, len(source.splitlines()))
    for s in steps:
        assert 1 <= s["line"] <= n_lines
        assert s["depth"] >= 0

    # (d) every step fits the byte cap; the whole trace fits its cap.
    for s in steps:
        assert step_size(s) <= STEP_BYTE_CAP
    assert len(text.encode("utf-8")) <= tracer.TRACE_BYTE_CAP

    # (i) refs resolve; (ii) stack shape on every step.
    for s in steps:
        check_refs_resolve(s)
        check_stack_shape(s)
    if oracle:
        check_stack_against_oracle(source, steps)

    assert result["status"] in {"ok", "error", "limit"}
    if result["status"] == "limit":
        assert result["truncated"] is True
        if result["message"] == STEP_LIMIT_MESSAGE:
            assert len(steps) == MAX_STEPS - 1
        else:
            assert result["message"] == tracer.DATA_LIMIT_MESSAGE
    if result["status"] == "error":
        assert steps[-1]["event"] == "exception" and "error" in steps[-1]
        assert result["message"] == steps[-1]["error"]["message"]

    # (a) final locals (and the heap behind them) match the untraced run.
    if result["status"] == "ok" and not result["truncated"]:
        last = steps[-1]
        assert last["event"] == "return" and last["frameId"] == "module"
        assert canonical(last["locals"], last["heap"]) == untraced_snapshot(source)
    return result


# --- strategy 1: small beginner programs, with data structures --------------

# Always defined when a program uses data structures. `rr` is a small tree,
# `size` a recursive function over it; container growth is guarded so no cap
# is ever hit and `truncated` stays tied to the step limit.
DS_PRELUDE = [
    "from collections import deque",
    "class Node:",
    "    def __init__(self, val, left=None, right=None):",
    "        self.val = val",
    "        self.left = left",
    "        self.right = right",
    "def size(node):",
    "    if node is None:",
    "        return 0",
    "    return 1 + size(node.left) + size(node.right)",
    "dd = {}",
    "ss = set()",
    "qq = deque()",
    "ll = []",
    "tt = (1, 2)",
    "rr = Node(1, Node(2), None)",
]


def _expr(draw, defined, depth=0):
    kinds = ["int"]
    if defined:
        kinds += ["var", "var"]
    if depth < 2:
        kinds += ["bin", "bin"]
    kind = draw(st.sampled_from(kinds))
    if kind == "int":
        return str(draw(SMALL_INT))
    if kind == "var":
        return draw(st.sampled_from(sorted(defined)))
    op = draw(st.sampled_from(["+", "-", "*", "//", "%"]))
    left = _expr(draw, defined, depth + 1)
    if op == "*":
        right = str(draw(SMALL_INT))  # keep growth bounded: never var * var
    else:
        right = _expr(draw, defined, depth + 1)  # may be 0: ZeroDivisionError
    return f"({left} {op} {right})"


def _block(draw, defined, indent, depth, ctx):
    lines = []
    for _ in range(draw(st.integers(1, 3 if depth else 5))):
        lines += _stmt(draw, defined, indent, depth, ctx)
    return lines


def _ds_stmt(draw, defined, pad, indent):
    """One data-structure statement; may define an int name."""
    e = lambda: _expr(draw, defined)  # noqa: E731
    kinds = [
        "dict_set", "dict_get", "set_add", "set_discard", "deque_push",
        "deque_pop", "list_append", "list_item", "tuple", "len", "tree_size",
    ]
    if indent == 0:
        kinds.append("tree_grow")  # top level only: the tree stays small
    kind = draw(st.sampled_from(kinds))
    name = draw(st.sampled_from(NAMES))
    if kind == "dict_set":
        return [f"{pad}dd[{draw(SMALL_INT)}] = {e()}"]
    if kind == "set_add":
        return [f"{pad}if len(ss) < 8:", f"{pad}    ss.add({e()})"]
    if kind == "set_discard":
        return [f"{pad}ss.discard({e()})"]
    if kind == "deque_push":
        side = draw(st.sampled_from(["append", "appendleft"]))
        return [f"{pad}if len(qq) < 6:", f"{pad}    qq.{side}({e()})"]
    if kind == "list_append":
        return [f"{pad}if len(ll) < 6:", f"{pad}    ll.append({e()})"]
    if kind == "tuple":
        return [f"{pad}tt = ({e()}, {e()})"]
    if kind == "tree_grow":
        return [f"{pad}rr.left = Node({e()}, rr.left)"]
    # The rest assign an int name.
    if kind == "dict_get":
        line = f"{pad}{name} = dd.get({e()}, 0)"
    elif kind == "deque_pop":
        side = draw(st.sampled_from(["popleft", "pop"]))
        line = f"{pad}{name} = qq.{side}() if qq else 0"
    elif kind == "list_item":
        line = f"{pad}{name} = ll[-1] if ll else tt[0]"
    elif kind == "len":
        line = f"{pad}{name} = len(dd) + len(ss) + len(qq)"
    else:
        line = f"{pad}{name} = size(rr)"
    defined.add(name)
    return [line]


def _stmt(draw, defined, indent, depth, ctx):
    pad = "    " * indent
    kinds = ["assign", "assign", "print"]
    if defined:
        kinds.append("aug")
    if depth < 2:
        kinds += ["for", "if"]
    if ctx["func"]:
        kinds.append("call")
    if ctx["ds"]:
        kinds += ["ds", "ds"]
    kind = draw(st.sampled_from(kinds))

    if kind == "ds":
        return _ds_stmt(draw, defined, pad, indent)
    if kind == "assign":
        expr = _expr(draw, defined)
        name = draw(st.sampled_from(NAMES))
        defined.add(name)
        return [f"{pad}{name} = {expr}"]
    if kind == "aug":
        name = draw(st.sampled_from(sorted(defined)))
        op = draw(st.sampled_from(["+=", "-="]))
        return [f"{pad}{name} {op} {_expr(draw, defined)}"]
    if kind == "print":
        return [f"{pad}print({_expr(draw, defined)})"]
    if kind == "call":
        expr = _expr(draw, defined)
        name = draw(st.sampled_from(NAMES))
        defined.add(name)
        return [f"{pad}{name} = f({expr})"]
    if kind == "for":
        items = draw(st.lists(SMALL_INT, min_size=1, max_size=8))  # nested: can hit the limit
        var = draw(st.sampled_from(NAMES))
        defined.add(var)  # non-empty list: the body always runs
        head = f"{pad}for {var} in {items!r}:"
        return [head] + _block(draw, defined, indent + 1, depth + 1, ctx)
    # if / else: only names assigned in both branches stay defined.
    cond = f"{pad}if {_expr(draw, defined)} > {draw(SMALL_INT)}:"
    then_defined, else_defined = set(defined), set(defined)
    then_body = _block(draw, then_defined, indent + 1, depth + 1, ctx)
    else_body = _block(draw, else_defined, indent + 1, depth + 1, ctx)
    defined |= then_defined & else_defined
    return [cond] + then_body + [f"{pad}else:"] + else_body


@st.composite
def programs(draw):
    lines = []
    ctx = {"func": draw(st.booleans()), "ds": draw(st.booleans())}
    if ctx["func"]:
        k1, k2, k3 = draw(SMALL_INT), draw(SMALL_INT), draw(SMALL_INT)
        lines += [
            "def f(x):",
            f"    if x > {k1}:",
            f"        y = x * {k2}",
            "        return y",
            f"    return x - {k3}",
        ]
    if ctx["ds"]:
        lines += DS_PRELUDE
    lines += _block(draw, set(), 0, 0, ctx)
    return "\n".join(lines) + "\n"


@SETTINGS
@given(programs())
def test_generated_programs(source):
    result = check_common(source)
    # Nothing in these programs can be cut (short ints, no strings, tiny
    # output, guarded container growth), so truncated must be true exactly
    # when a limit stopped the run.
    assert result["truncated"] is (result["status"] == "limit")


# --- strategy 2: recursion with known nesting -------------------------------


@st.composite
def recursion_programs(draw):
    """(source, n): f recurses n levels below the module, through g."""
    n = draw(st.integers(0, 12))
    via = draw(st.booleans())
    lines = [
        "def g(k):",
        "    return f(k)",
        "def f(k):",
        "    if k == 0:",
        "        here = 'bottom'",
        "        return 0",
        f"    return 1 + {'g' if via else 'f'}(k - 1)",
        f"total = f({n})",
    ]
    return "\n".join(lines) + "\n", n, via


@SETTINGS
@given(recursion_programs())
def test_stack_depth_matches_known_nesting(case):
    source, n, via = case
    result = check_common(source)
    assert result["status"] == "ok"
    bottom = [s for s in result["steps"] if s["event"] == "line" and s["line"] == 5]
    assert len(bottom) == 1
    stack = bottom[0]["stack"]
    # module + f(n) + ... + f(0), with a g frame between each pair of f's.
    expected = ["<module>"] + (["f", "g"] * n if via else ["f"] * n) + ["f"]
    assert [fr["functionName"] for fr in stack] == expected
    assert bottom[0]["depth"] == len(expected) - 1
    # Outer f frames show the line of the pending call, and their own k.
    f_frames = [fr for fr in stack if fr["functionName"] == "f"]
    assert [fr["locals"]["k"] for fr in f_frames] == list(range(n, -1, -1))
    assert all(fr["line"] == 7 for fr in f_frames[:-1])
    assert result["steps"][-1]["locals"]["total"] == n


# --- strategy 3: cap stress -------------------------------------------------


@st.composite
def stress_programs(draw):
    """Programs whose dropped data is known in advance: (source, dropped)."""
    lines = []
    dropped = False
    printed = 0
    for i in range(draw(st.integers(1, 8))):
        kind = draw(st.sampled_from(
            ["str", "list", "tuple", "dict", "set", "deque", "nested", "deep", "print", "print", "int"]
        ))
        if kind == "str":
            n = draw(st.integers(0, 2 * MAX_STR_LEN))
            lines.append(f"s{i} = 'x' * {n}")
            dropped |= n > MAX_STR_LEN
        elif kind == "list":
            n = draw(st.integers(0, 2 * MAX_ITEMS))
            lines.append(f"l{i} = list(range({n}))")
            dropped |= n > MAX_ITEMS
        elif kind == "tuple":
            n = draw(st.integers(0, 2 * MAX_ITEMS))
            lines.append(f"t{i} = tuple(range({n}))")
            dropped |= n > MAX_ITEMS
        elif kind == "dict":
            n = draw(st.integers(0, 2 * MAX_ITEMS))
            lines.append(f"d{i} = dict(zip(range({n}), map(str, range({n}))))")
            dropped |= n > MAX_ITEMS
        elif kind == "set":
            n = draw(st.integers(0, 2 * MAX_ITEMS))
            lines.append(f"z{i} = set(map(str, range({n})))")
            dropped |= n > MAX_ITEMS
        elif kind == "deque":
            n = draw(st.integers(0, 2 * MAX_ITEMS))
            lines.append(f"import collections\nq{i} = collections.deque(range({n}))")
            dropped |= n > MAX_ITEMS
        elif kind == "nested":
            n = draw(st.integers(0, 2 * MAX_STR_LEN))
            lines.append(f"n{i} = ['y' * {n}, {i}]")
            dropped |= n > MAX_STR_LEN
        elif kind == "deep":
            k = draw(st.integers(1, tracer.MAX_NEST_DEPTH + 2))
            lines.append(f"w{i} = " + "[" * k + "]" * k)
            dropped |= k > tracer.MAX_NEST_DEPTH
        elif kind == "print":
            n = draw(st.integers(0, 3000))
            lines.append(f"print('p' * {n})")
            printed += n + 1  # print adds "\n"
        else:
            lines.append(f"v{i} = {draw(SMALL_INT)}")
    dropped |= printed > STDOUT_BYTE_CAP
    return "\n".join(lines) + "\n", dropped


@SETTINGS
@given(stress_programs())
def test_cap_stress(case):
    source, dropped = case
    result = check_common(source, oracle=False)
    assert result["status"] == "ok"
    # (d) truncated iff a cap dropped data. Each value is snapshotted at the
    # step after its assignment, and every step here stays under the byte cap.
    assert result["truncated"] is dropped
    stdout = result["steps"][-1]["stdout"]
    assert len(stdout.encode("utf-8")) <= STDOUT_BYTE_CAP
    for s in result["steps"]:
        for v in s["locals"].values():
            if isinstance(v, str):
                assert len(v) <= MAX_STR_LEN
            if isinstance(v, list):
                assert len(v) <= MAX_ITEMS
            if isinstance(v, dict) and "__dict" in v:
                assert len(v["__dict"]) <= MAX_ITEMS


# --- strategy 4: arbitrary text (escapes, emoji, control characters) --------


@st.composite
def text_programs(draw):
    """(source, must_truncate) for programs that store and print arbitrary text."""
    lines = []
    must_truncate = False
    printed = 0
    for i in range(draw(st.integers(1, 6))):
        n = draw(st.integers(0, 300))
        text = draw(st.text(min_size=n, max_size=n))
        kind = draw(st.sampled_from(["var", "print", "set"]))
        if kind == "var":
            lines.append(f"u{i} = {text!r}")
            must_truncate |= len(text) > MAX_STR_LEN
        elif kind == "set":
            # Set of strings: order must not depend on the hash seed.
            lines.append(f"k{i} = set({text[:20]!r})")
        else:
            times = draw(st.integers(1, 40))
            lines.append(f"print({text!r} * {times})")
            printed += len((text * times).encode("utf-8")) + 1
    must_truncate |= printed > STDOUT_BYTE_CAP
    return "\n".join(lines) + "\n", must_truncate


@SETTINGS
@given(text_programs())
def test_arbitrary_text(case):
    source, must_truncate = case
    result = check_common(source, oracle=False)
    assert result["status"] == "ok"
    if must_truncate:
        assert result["truncated"] is True


# --- (iii) across hash seeds --------------------------------------------------

HASH_SEED_CORPUS = [
    *gen_fixtures.LESSONS.values(),
    "s = {'pear', 'fig', 'apple', 'kiwi', 'plum'}\nt = frozenset(s)\ns.discard('fig')\nn = len(s)\n",
    "s = {('b', 1), ('a', 2), ('a', 1), (None, 'z')}\nm = {3, 'x', None, False, 2.5}\n",
    "d = {}\nfor w in ['b', 'a', 'c']:\n    d[w] = len(w)\nk = set(d)\n",
    "class P:\n    pass\np = P()\np.tags = {'x', 'y', 'z'}\nq = {p}\n",
    "nested = {frozenset({'a', 'b'}): {'c', 'd'}}\n",
]


def test_trace_json_is_identical_across_hash_seeds():
    child = textwrap.dedent("""
        import json, sys
        import tracer
        print(json.dumps([tracer.trace_json(s) for s in json.load(sys.stdin)]))
    """)
    outputs = []
    for seed in ("0", "1", "4242", "random"):
        env = dict(os.environ, PYTHONHASHSEED=seed)
        proc = subprocess.run(
            [sys.executable, "-c", child],
            input=json.dumps(HASH_SEED_CORPUS),
            capture_output=True,
            text=True,
            timeout=60,
            cwd=PY_DIR,
            env=env,
        )
        assert proc.returncode == 0, proc.stderr
        outputs.append(json.loads(proc.stdout))
    for other in outputs[1:]:
        for source, a, b in zip(HASH_SEED_CORPUS, outputs[0], other):
            assert a == b, source
    # And the in-process result agrees with the subprocesses.
    assert [tracer.trace_json(s) for s in HASH_SEED_CORPUS] == outputs[0]
