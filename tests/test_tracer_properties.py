"""Hypothesis property tests for the tracer (Requirement 6.1, task 4).

Properties:
  (a) ok + untruncated runs: the final step's locals equal a snapshot of the
      same program's namespace run without tracing;
  (b) indices count up from 0 and len(steps) <= MAX_STEPS;
  (c) every line is within the program and depth >= 0;
  (d) every step fits STEP_BYTE_CAP, and truncated is set exactly when a cap
      dropped data;
  (e) tracing the same program twice gives identical results.
"""

import builtins
import contextlib
import io
import json

from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

import tracer
from tracer import MAX_ITEMS, MAX_STEPS, MAX_STR_LEN, STDOUT_BYTE_CAP, STEP_BYTE_CAP

SETTINGS = settings(
    max_examples=80,
    deadline=None,
    suppress_health_check=[HealthCheck.too_slow, HealthCheck.data_too_large],
)

NAMES = ("a", "b", "c", "d")
SMALL_INT = st.integers(-9, 9)


# --- reference + shared checks ----------------------------------------------


def untraced_locals(source: str) -> dict:
    """The reference for (a): run without tracing, then snapshot + `__` filter."""
    ns = {"__name__": "__main__", "__builtins__": builtins}
    with contextlib.redirect_stdout(io.StringIO()):
        exec(compile(source, tracer.USER_FILENAME, "exec"), ns)
    return {k: tracer.snapshot(v)[0] for k, v in ns.items() if not k.startswith("__")}


def step_size(step: dict) -> int:
    return len(json.dumps(step, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))


def check_common(source: str) -> dict:
    """Properties (b), (c), (d: fits the cap), (e) and (a). Returns the result."""
    result = tracer.trace(source)
    steps = result["steps"]

    # (e) deterministic.
    assert tracer.trace(source) == result

    # (b) contiguous indices, bounded length.
    assert [s["index"] for s in steps] == list(range(len(steps)))
    assert 1 <= len(steps) <= MAX_STEPS

    # (c) lines in range, depth never negative.
    n_lines = max(1, len(source.splitlines()))
    for s in steps:
        assert 1 <= s["line"] <= n_lines
        assert s["depth"] >= 0

    # (d) every step fits the byte cap.
    for s in steps:
        assert step_size(s) <= STEP_BYTE_CAP

    assert result["status"] in {"ok", "error", "limit"}
    if result["status"] == "limit":
        assert len(steps) == MAX_STEPS - 1 and result["truncated"] is True
    if result["status"] == "error":
        assert steps[-1]["event"] == "exception" and "error" in steps[-1]
        assert result["message"] == steps[-1]["error"]["message"]

    # (a) final locals match the untraced run.
    if result["status"] == "ok" and not result["truncated"]:
        assert steps[-1]["event"] == "return" and steps[-1]["frameId"] == "module"
        assert steps[-1]["locals"] == untraced_locals(source)

    # The JSON the worker sends parses back to the same result.
    assert json.loads(tracer.trace_json(source)) == result
    return result


# --- strategy 1: small beginner programs ------------------------------------


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


def _block(draw, defined, indent, depth, has_func):
    lines = []
    for _ in range(draw(st.integers(1, 3 if depth else 5))):
        lines += _stmt(draw, defined, indent, depth, has_func)
    return lines


def _stmt(draw, defined, indent, depth, has_func):
    pad = "    " * indent
    kinds = ["assign", "assign", "print"]
    if defined:
        kinds.append("aug")
    if depth < 2:
        kinds += ["for", "if"]
    if has_func:
        kinds.append("call")
    kind = draw(st.sampled_from(kinds))

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
        return [head] + _block(draw, defined, indent + 1, depth + 1, has_func)
    # if / else: only names assigned in both branches stay defined.
    cond = f"{pad}if {_expr(draw, defined)} > {draw(SMALL_INT)}:"
    then_defined, else_defined = set(defined), set(defined)
    then_body = _block(draw, then_defined, indent + 1, depth + 1, has_func)
    else_body = _block(draw, else_defined, indent + 1, depth + 1, has_func)
    defined |= then_defined & else_defined
    return [cond] + then_body + [f"{pad}else:"] + else_body


@st.composite
def programs(draw):
    lines = []
    has_func = draw(st.booleans())
    if has_func:
        k1, k2, k3 = draw(SMALL_INT), draw(SMALL_INT), draw(SMALL_INT)
        lines += [
            "def f(x):",
            f"    if x > {k1}:",
            f"        y = x * {k2}",
            "        return y",
            f"    return x - {k3}",
        ]
    lines += _block(draw, set(), 0, 0, has_func)
    return "\n".join(lines) + "\n"


@SETTINGS
@given(programs())
def test_generated_programs(source):
    result = check_common(source)
    # Nothing in these programs can be cut (short ints, no strings, tiny
    # output), so truncated must be true exactly when the step limit hit.
    assert result["truncated"] is (result["status"] == "limit")


# --- strategy 2: cap stress -------------------------------------------------


@st.composite
def stress_programs(draw):
    """Programs whose dropped data is known in advance: (source, dropped)."""
    lines = []
    dropped = False
    printed = 0
    for i in range(draw(st.integers(1, 8))):
        kind = draw(st.sampled_from(["str", "list", "tuple", "dict", "nested", "print", "print", "int"]))
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
            lines.append(f"d{i} = dict(zip(map(str, range({n})), range({n})))")
            dropped |= n > MAX_ITEMS
        elif kind == "nested":
            n = draw(st.integers(0, 2 * MAX_STR_LEN))
            lines.append(f"n{i} = ['y' * {n}, {i}]")
            dropped |= n > MAX_STR_LEN
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
    result = check_common(source)
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


# --- strategy 3: arbitrary text (escapes, emoji, control characters) --------


@st.composite
def text_programs(draw):
    """(source, must_truncate) for programs that store and print arbitrary text."""
    lines = []
    must_truncate = False
    printed = 0
    for i in range(draw(st.integers(1, 6))):
        n = draw(st.integers(0, 300))
        text = draw(st.text(min_size=n, max_size=n))
        if draw(st.booleans()):
            lines.append(f"u{i} = {text!r}")
            must_truncate |= len(text) > MAX_STR_LEN
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
    result = check_common(source)
    assert result["status"] == "ok"
    if must_truncate:
        assert result["truncated"] is True
