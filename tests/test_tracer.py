"""Example tests for the tracer (tasks 1-3 of .kiro/specs/trace-engine).

Hostile-loop programs that a regression could turn into a hang run in a
subprocess with a timeout, so a bug fails the suite instead of freezing it.
"""

import builtins
import json
import math
import subprocess
import sys
import textwrap
import time
from pathlib import Path

import pytest

import tracer
from tracer import MAX_ITEMS, MAX_STEPS, MAX_STR_LEN, STDOUT_BYTE_CAP, STEP_BYTE_CAP

FIXTURES = Path(__file__).resolve().parent.parent / "shared" / "fixtures"
PY_DIR = Path(__file__).resolve().parent.parent / "frontend" / "src" / "py"

LOOP_LESSON = "numbers = [3, 1, 2]\ntotal = 0\nfor n in numbers:\n    total += n\n"


def src(text: str) -> str:
    return textwrap.dedent(text).lstrip("\n")


def step_size(step: dict) -> int:
    """Byte size of a step exactly as trace_json serializes it."""
    return len(json.dumps(step, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))


def assert_well_formed(result: dict, source: str):
    steps = result["steps"]
    assert [s["index"] for s in steps] == list(range(len(steps)))
    assert len(steps) <= MAX_STEPS
    n_lines = max(1, len(source.splitlines()))
    for s in steps:
        assert 1 <= s["line"] <= n_lines
        assert s["depth"] >= 0
        assert step_size(s) <= STEP_BYTE_CAP
    assert result["codeHash"] == tracer.code_hash(source)


def run(source: str) -> dict:
    result = tracer.trace(source)
    assert_well_formed(result, source)
    return result


def steps_for(result: dict, frame_id: str) -> list:
    return [s for s in result["steps"] if s["frameId"] == frame_id]


def boom(*args, **kwargs):
    raise AssertionError("the tracer called a student-overridable method")


# --- scaffold / contract helpers ---------------------------------------------


def test_max_steps_is_the_loop_guard():
    assert tracer.MAX_STEPS == 300


def test_code_hash_is_stable_and_sha256_hex():
    source = "numbers = [3, 1, 2]\n"
    h1 = tracer.code_hash(source)
    h2 = tracer.code_hash(source)
    assert h1 == h2
    assert len(h1) == 64
    assert all(c in "0123456789abcdef" for c in h1)


def test_empty_result_matches_contract_shape():
    result = tracer.empty_result("x = 1\n")
    assert result["steps"] == []
    assert result["status"] == "ok"
    assert result["truncated"] is False
    assert result["codeHash"] == tracer.code_hash("x = 1\n")


def test_loop_fixture_is_valid_trace_result():
    data = json.loads((FIXTURES / "loop.json").read_text())

    assert data["status"] == "ok"
    assert data["truncated"] is False
    assert isinstance(data["codeHash"], str) and len(data["codeHash"]) == 64

    steps = data["steps"]
    assert len(steps) >= 1
    assert len(steps) <= tracer.MAX_STEPS

    # Indices contiguous from 0.
    assert [s["index"] for s in steps] == list(range(len(steps)))

    # Depth never negative; required fields present and typed.
    for s in steps:
        assert s["depth"] >= 0
        assert s["event"] in {"call", "line", "return", "exception"}
        assert isinstance(s["line"], int)
        assert isinstance(s["locals"], dict)
        assert isinstance(s["stdout"], str)

    # The loop lesson's teaching sequence: total goes 0 -> 3 -> 4 -> 6.
    totals = [s["locals"]["total"] for s in steps if "total" in s["locals"]]
    assert totals[0] == 0
    assert 3 in totals and 4 in totals
    assert totals[-1] == 6


# --- Task 1: snapshot table ---------------------------------------------------


class HostileInt(int):
    __repr__ = __str__ = __format__ = __eq__ = __hash__ = boom


class HostileStr(str):
    __repr__ = __str__ = __format__ = __eq__ = __hash__ = __len__ = boom
    encode = startswith = boom


class HostileMeta(type):
    __eq__ = __ne__ = __hash__ = __getattribute__ = boom


class HostileObject(metaclass=HostileMeta):
    pass


class Plain:
    pass


@pytest.mark.parametrize(
    "value, expected, cut",
    [
        # Primitives.
        (None, None, False),
        (True, True, False),
        (False, False, False),
        (0, 0, False),
        (-7, -7, False),
        (2**53, 2**53, False),
        (-(2**53), -(2**53), False),
        (2**53 + 1, {"__type__": "int"}, False),
        (-(10**400), {"__type__": "int"}, False),
        (1.5, 1.5, False),
        (-0.0, -0.0, False),
        (math.nan, {"__type__": "float"}, False),
        (math.inf, {"__type__": "float"}, False),
        (-math.inf, {"__type__": "float"}, False),
        # Strings.
        ("", "", False),
        ("abc", "abc", False),
        ("x" * MAX_STR_LEN, "x" * MAX_STR_LEN, False),
        ("x" * (MAX_STR_LEN + 1), "x" * MAX_STR_LEN, True),
        # Lists and tuples of primitives become JSON arrays.
        ([], [], False),
        ((), [], False),
        ([1, "a", None, 2.5, True], [1, "a", None, 2.5, True], False),
        ((1, 2), [1, 2], False),
        (list(range(MAX_ITEMS)), list(range(MAX_ITEMS)), False),
        (["y" * 300, 1], ["y" * MAX_STR_LEN, 1], True),
        # Over-length containers become placeholders with their length.
        (list(range(MAX_ITEMS + 1)), {"__type__": "list", "__len__": MAX_ITEMS + 1}, True),
        (tuple(range(MAX_ITEMS + 5)), {"__type__": "tuple", "__len__": MAX_ITEMS + 5}, True),
        # Nested containers, big numbers and objects inside a list.
        ([[1]], {"__type__": "list"}, False),
        ((1, (2,)), {"__type__": "tuple"}, False),
        ([2**60], {"__type__": "list"}, False),
        ([math.nan], {"__type__": "list"}, False),
        ([Plain()], {"__type__": "list"}, False),
        # Dicts.
        ({}, {}, False),
        ({"a": 1, "b": "two", "c": None}, {"a": 1, "b": "two", "c": None}, False),
        ({"a": "z" * 300}, {"a": "z" * MAX_STR_LEN}, True),
        ({str(i): i for i in range(MAX_ITEMS + 1)}, {"__type__": "dict", "__len__": MAX_ITEMS + 1}, True),
        ({"__type__": "int"}, {"__type__": "dict"}, False),
        ({1: 2}, {"__type__": "dict"}, False),
        ({"a": [1]}, {"__type__": "dict"}, False),
        ({"k" * (MAX_STR_LEN + 1): 1}, {"__type__": "dict", "__len__": 1}, True),
        # Anything else: type-only placeholder.
        (len, {"__type__": "builtin_function_or_method"}, False),
        (boom, {"__type__": "function"}, False),
        (sys, {"__type__": "module"}, False),
        (Plain, {"__type__": "type"}, False),
        (Plain(), {"__type__": "Plain"}, False),
        ({1, 2}, {"__type__": "set"}, False),
        (b"abc", {"__type__": "bytes"}, False),
        (range(3), {"__type__": "range"}, False),
    ],
)
def test_snapshot_table(value, expected, cut):
    jv, was_cut = tracer.snapshot(value)
    assert jv == expected
    assert type(jv) is type(expected)
    assert was_cut is cut
    json.dumps(jv, allow_nan=False)  # always JSON-safe


def test_snapshot_subclasses_never_qualify_and_methods_never_run():
    assert tracer.snapshot(HostileInt(5)) == ({"__type__": "HostileInt"}, False)
    assert tracer.snapshot(HostileStr("hi")) == ({"__type__": "HostileStr"}, False)
    assert tracer.snapshot([HostileInt(5)]) == ({"__type__": "list"}, False)
    assert tracer.snapshot({"k": HostileStr("v")}) == ({"__type__": "dict"}, False)
    # A metaclass that overrides __eq__ / __hash__ / __getattribute__ can't
    # intercept the type checks or the type name.
    assert tracer.snapshot(HostileObject()) == ({"__type__": "HostileObject"}, False)


def test_snapshot_dict_never_hashes_or_compares_student_keys():
    calls = []

    class HostileKey:
        def __hash__(self):
            calls.append("hash")
            return hash("__type__")  # collides with the placeholder key

        def __eq__(self, other):
            calls.append("eq")
            raise AssertionError("student __eq__ called")

    value = {HostileKey(): 1, "a": 2}
    calls.clear()
    assert tracer.snapshot(value) == ({"__type__": "dict"}, False)
    assert calls == []
    # A str-subclass key is not an exact str either.
    class KeyStr(str):
        __hash__ = str.__hash__  # needed to build the dict below
        __eq__ = __ne__ = __repr__ = __len__ = startswith = boom

    assert tracer.snapshot({KeyStr("a"): 1, "b": 2}) == ({"__type__": "dict"}, False)


def test_snapshot_handles_huge_ints_quickly():
    start = time.perf_counter()
    assert tracer.snapshot(10**100000) == ({"__type__": "int"}, False)
    assert time.perf_counter() - start < 0.5


# --- Task 1: stdout writer ----------------------------------------------------


def test_capped_writer_keeps_exactly_the_cap():
    w = tracer._CappedWriter()
    w.write("a" * STDOUT_BYTE_CAP)
    assert w.getvalue() == "a" * STDOUT_BYTE_CAP and not w.truncated
    w.write("")  # nothing dropped, so still not truncated
    assert not w.truncated
    w.write("b")
    assert w.truncated and w.getvalue() == "a" * STDOUT_BYTE_CAP


def test_capped_writer_counts_utf8_bytes_and_keeps_whole_chars():
    w = tracer._CappedWriter()
    w.write("é" * (STDOUT_BYTE_CAP // 2 + 1))  # 2 bytes each
    assert w.getvalue() == "é" * (STDOUT_BYTE_CAP // 2)
    assert w.truncated


def test_capped_writer_output_stays_a_prefix_after_truncation():
    w = tracer._CappedWriter()
    w.write("a" * (STDOUT_BYTE_CAP - 2))
    w.write("€")  # 3 bytes: doesn't fit in the last 2
    w.write("b")  # fits, but would leave a gap: dropped too
    assert w.getvalue() == "a" * (STDOUT_BYTE_CAP - 2)
    assert w.truncated


def test_capped_writer_accepts_str_subclass_without_calling_it():
    w = tracer._CappedWriter()
    w.write(HostileStr("hi"))
    assert w.getvalue() == "hi" and type(w.getvalue()) is str


def test_capped_writer_rejects_non_str_like_real_stdout():
    with pytest.raises(TypeError, match="must be str, not int"):
        tracer._CappedWriter().write(5)


# --- Task 2: core trace -------------------------------------------------------


def test_loop_lesson_equals_fixture():
    expected = json.loads((FIXTURES / "loop.json").read_text())
    assert run(LOOP_LESSON) == expected
    assert json.loads(tracer.trace_json(LOOP_LESSON)) == expected


def test_line_event_is_recorded_before_the_line_runs():
    result = run("x = 1\nx = 2\n")
    line2 = [s for s in result["steps"] if s["event"] == "line" and s["line"] == 2]
    assert line2[0]["locals"] == {"x": 1}
    assert result["steps"][-1]["locals"] == {"x": 2}


def test_module_call_event_uses_line_1():
    result = run("\n\nx = 1\n")
    first = result["steps"][0]
    assert first["event"] == "call" and first["line"] == 1
    assert first["frameId"] == "module" and first["functionName"] == "<module>"
    assert first["depth"] == 0


def test_function_call_has_depth_1_and_return_value():
    result = run(src("""
        def double(x):
            return x * 2
        y = double(4)
        z = double(5)
    """))
    assert result["status"] == "ok"
    first = steps_for(result, "double-1")
    assert [s["event"] for s in first] == ["call", "line", "return"]
    assert all(s["depth"] == 1 and s["functionName"] == "double" for s in first)
    assert first[0]["line"] == 1 and first[0]["locals"] == {"x": 4}
    assert first[-1]["returnValue"] == 8
    assert steps_for(result, "double-2")[-1]["returnValue"] == 10
    module = steps_for(result, "module")
    assert all(s["depth"] == 0 for s in module)
    assert module[-1]["locals"] == {"double": {"__type__": "function"}, "y": 8, "z": 10}
    assert module[-1]["returnValue"] is None


def test_nested_calls_increase_depth():
    result = run(src("""
        def inner(a):
            return a + 1
        def outer(b):
            return inner(b) * 2
        r = outer(1)
    """))
    assert {s["depth"] for s in steps_for(result, "outer-1")} == {1}
    assert {s["depth"] for s in steps_for(result, "inner-1")} == {2}
    assert result["steps"][-1]["locals"]["r"] == 4


def test_stdout_is_cumulative():
    result = run('print("a")\nprint("b")\nx = 1\n')
    by_line = {s["line"]: s["stdout"] for s in result["steps"] if s["event"] == "line"}
    assert by_line == {1: "", 2: "a\n", 3: "a\nb\n"}
    assert result["steps"][-1]["stdout"] == "a\nb\n"


def test_dunder_and_hidden_names_are_excluded():
    result = run("__secret = 1\nvisible = sum(v for v in [1, 2])\n")
    assert result["steps"][-1]["locals"] == {"visible": 3}
    gen_steps = steps_for(result, "<genexpr>-1")
    assert gen_steps and all(".0" not in s["locals"] for s in gen_steps)


def test_generator_keeps_one_frame_id_across_resumes():
    result = run("s = sum(x for x in [1, 2, 3])\n")
    frame_ids = {s["frameId"] for s in result["steps"] if s["functionName"] == "<genexpr>"}
    assert frame_ids == {"<genexpr>-1"}
    yielded = [s["returnValue"] for s in steps_for(result, "<genexpr>-1") if s["event"] == "return"]
    assert yielded == [1, 2, 3, None]


def test_for_over_generator_as_last_statement_still_returns():
    result = run(src("""
        def gen():
            yield 1
            yield 2
        for v in gen():
            pass
    """))
    assert result["status"] == "ok"
    last = result["steps"][-1]
    assert last["event"] == "return" and last["frameId"] == "module"
    assert last["locals"]["v"] == 2


def test_input_is_stubbed_with_a_friendly_error():
    original = builtins.input
    result = run('name = input("Name? ")\n')
    assert builtins.input is original
    assert result["status"] == "error"
    last = result["steps"][-1]
    assert last["event"] == "exception" and last["line"] == 1
    assert last["error"]["type"] == "RuntimeError"
    assert "input() isn't available" in last["error"]["message"]
    assert result["message"] == last["error"]["message"]


@pytest.mark.parametrize(
    "source",
    [
        LOOP_LESSON,
        "print(x)\n",
        "while True:\n    pass\n",
        "x = (\n",
        'input("?")\n',
        "import sys\nsys.stdout = None\nprint('lost')\n",
        "import builtins\nbuiltins.input = len\n",
    ],
)
def test_global_state_is_restored_after_every_run(source):
    saved = (sys.gettrace(), sys.stdout, builtins.input)
    tracer.trace(source)
    assert (sys.gettrace(), sys.stdout, builtins.input) == saved


def test_existing_trace_function_is_restored():
    def other_tracer(frame, event, arg):
        return None

    sys.settrace(other_tracer)
    try:
        tracer.trace(LOOP_LESSON)
        tracer.trace("while True:\n    pass\n")
        assert sys.gettrace() is other_tracer
    finally:
        sys.settrace(None)


def test_student_stdout_write_with_non_str_is_a_type_error():
    result = run("import sys\nsys.stdout.write(5)\n")
    last = result["steps"][-1]
    assert last["error"] == {"type": "TypeError", "message": "write() argument must be str, not int"}


def test_trace_json_round_trips_and_is_strict_json():
    for source in [LOOP_LESSON, "print(x)\n", "x = (\n", 'e = "🎉ñ\\x01"\nprint(e)\n']:
        text = tracer.trace_json(source)

        def no_constants(name):
            raise AssertionError("non-standard JSON constant: " + name)

        assert json.loads(text, parse_constant=no_constants) == tracer.trace(source)


# --- Task 2: size caps --------------------------------------------------------


def test_stdout_cap_truncates_and_sets_flag():
    result = run('print("x" * 5000)\n')
    assert result["status"] == "ok" and result["truncated"] is True
    assert result["steps"][-1]["stdout"] == "x" * STDOUT_BYTE_CAP


def test_stdout_exactly_at_cap_is_not_truncated():
    result = run(f'print("x" * {STDOUT_BYTE_CAP - 1})\n')  # plus "\n" = the cap
    assert result["truncated"] is False
    assert len(result["steps"][-1]["stdout"]) == STDOUT_BYTE_CAP


def test_emoji_output_does_not_inflate_steps():
    result = run('print("🎉" * 999)\nx = 1\n')  # 3997 UTF-8 bytes
    assert result["truncated"] is False
    assert result["steps"][-1]["stdout"] == "🎉" * 999 + "\n"


def test_untruncated_trace_reports_false():
    assert run(LOOP_LESSON)["truncated"] is False
    assert run("s = 'x' * 200\nl = list(range(10))\n")["truncated"] is False


def test_long_string_and_long_list_set_truncated():
    result = run("s = 'x' * 500\n")
    assert result["truncated"] is True
    assert result["steps"][-1]["locals"]["s"] == "x" * MAX_STR_LEN
    result = run("l = list(range(50))\n")
    assert result["truncated"] is True
    assert result["steps"][-1]["locals"]["l"] == {"__type__": "list", "__len__": 50}


def test_step_byte_cap_replaces_locals_with_placeholders():
    lines = [f"v{i} = ['y' * 200] * 10" for i in range(9)]  # ~2 KB each
    lines.append("t = ('z' * 200,) * 10")
    lines.append("done = 1")
    result = run("\n".join(lines) + "\n")
    assert result["status"] == "ok" and result["truncated"] is True
    last = result["steps"][-1]
    assert last["locals"]["v0"] == {"__type__": "list"}
    assert last["locals"]["t"] == {"__type__": "tuple"}
    assert last["locals"]["done"] == {"__type__": "int"}
    # Early steps that fit are left untouched.
    assert result["steps"][2]["locals"]["v0"] == ["y" * 200] * 10


def test_step_byte_cap_drops_locals_when_there_are_too_many():
    # Built at C level: a comprehension would fire a line event per item.
    result = run('globals().update(zip(map("v{}".format, range(3000)), range(3000)))\nx = 1\n')
    assert result["status"] == "ok" and result["truncated"] is True
    assert result["steps"][-1]["locals"] == {}


def test_step_byte_cap_trims_stdout_inflated_by_escapes():
    result = run('print("\\x01" * 3999)\nx = 1\n')  # 4000 bytes, ~24 KB as JSON
    assert result["status"] == "ok" and result["truncated"] is True
    assert result["steps"][-1]["stdout"].startswith("\x01" * 100)


def test_overlong_function_name_is_shortened():
    name = "f" * 20000
    result = run(f"def {name}():\n    return 1\n{name}()\n")
    assert result["truncated"] is True
    names = {s["functionName"] for s in result["steps"]}
    assert names == {"<module>", "f" * MAX_STR_LEN}
    assert {s["frameId"] for s in result["steps"]} == {"module", "f" * MAX_STR_LEN + "-1"}


def test_long_error_message_is_capped_in_step_and_result():
    result = run('raise ValueError("e" * 1000)\n')
    assert result["status"] == "error" and result["truncated"] is True
    assert result["message"] == "e" * MAX_STR_LEN
    assert result["steps"][-1]["error"] == {"type": "ValueError", "message": "e" * MAX_STR_LEN}


def test_terminal_exception_step_also_fits_the_byte_cap():
    lines = [f"v{i} = ['y' * 200] * 10" for i in range(9)] + ["1 / 0"]
    result = run("\n".join(lines) + "\n")
    last = result["steps"][-1]
    assert last["event"] == "exception" and last["error"]["type"] == "ZeroDivisionError"
    assert step_size(last) <= STEP_BYTE_CAP
    assert result["truncated"] is True


# --- Task 3: guards -----------------------------------------------------------


def test_step_limit_is_a_base_exception():
    assert issubclass(tracer.StepLimit, BaseException)
    assert not issubclass(tracer.StepLimit, Exception)


def test_infinite_loop_ends_with_limit_quickly():
    start = time.perf_counter()
    result = run("while True:\n    pass\n")
    assert time.perf_counter() - start < 2
    assert result["status"] == "limit"
    assert result["truncated"] is True
    assert result["message"] == tracer.LIMIT_MESSAGE
    assert len(result["steps"]) == MAX_STEPS - 1


def test_except_exception_cannot_swallow_the_limit():
    start = time.perf_counter()
    result = run(src("""
        while True:
            try:
                x = 1
            except Exception:
                pass
    """))
    assert time.perf_counter() - start < 2
    assert result["status"] == "limit"


def test_runaway_recursion_hits_the_step_limit():
    result = run("def f(n):\n    return f(n + 1)\nf(0)\n")
    assert result["status"] == "limit"


def test_error_step_always_fits_within_max_steps():
    seen_full = False
    for n in range(135, 155):
        result = run(f"for i in range({n}):\n    pass\n1 / 0\n")
        assert len(result["steps"]) <= MAX_STEPS
        if result["status"] == "error":
            assert result["steps"][-1]["event"] == "exception"
            seen_full = seen_full or len(result["steps"]) == MAX_STEPS
    assert seen_full, "expected one run that uses the reserved last slot"


CATCHING_LOOPS = [
    # Bare except, with the step limit landing on every line of the loop.
    *["x = 0\n" * k + "while True:\n    try:\n        x = 1\n    except:\n        pass\n" for k in range(5)],
    "while True:\n    try:\n        pass\n    except BaseException:\n        pass\n",
    "while True:\n    try: x = 1\n    except: pass\n",
    # Nested catchers.
    "while True:\n    try:\n        try:\n            pass\n        except:\n            pass\n    except:\n        pass\n",
    # A catcher that retries by recursing.
    "def f():\n    try:\n        f()\n    except:\n        f()\nf()\n",
    # finally + continue swallows the in-flight exception.
    "while True:\n    try:\n        x = 1\n    finally:\n        continue\n",
    # Catching inside a function called from a loop.
    "def g():\n    try:\n        return 1\n    except:\n        return 2\nwhile True:\n    g()\n",
]


def test_catching_the_limit_still_ends_with_limit():
    """Bare except / except BaseException can't keep a runaway loop alive.

    Runs in a subprocess: if the guard regresses, this fails on the timeout
    instead of hanging the whole suite.
    """
    child = textwrap.dedent("""
        import json, sys, time
        import tracer
        out = []
        for source in json.load(sys.stdin):
            start = time.perf_counter()
            result = tracer.trace(source)
            out.append([result["status"], len(result["steps"]), time.perf_counter() - start])
        print(json.dumps(out))
    """)
    proc = subprocess.run(
        [sys.executable, "-c", child],
        input=json.dumps(CATCHING_LOOPS),
        capture_output=True,
        text=True,
        timeout=60,
        cwd=PY_DIR,
    )
    assert proc.returncode == 0, proc.stderr
    for source, (status, n_steps, elapsed) in zip(CATCHING_LOOPS, json.loads(proc.stdout)):
        assert status == "limit", source
        assert n_steps <= MAX_STEPS, source
        assert elapsed < 2, source


# --- Task 3: errors -----------------------------------------------------------


def test_name_error_on_line_1():
    result = run("print(x)\n")
    assert result["status"] == "error"
    last = result["steps"][-1]
    assert last["event"] == "exception" and last["line"] == 1
    assert last["error"] == {"type": "NameError", "message": "name 'x' is not defined"}
    assert result["message"] == "name 'x' is not defined"
    assert [s["event"] for s in result["steps"]].count("exception") == 1


def test_syntax_error_gives_exactly_one_step():
    source = "x = 1\ny = (\n"
    result = run(source)
    assert result["status"] == "error"
    assert result["truncated"] is False
    assert result["steps"] == [
        {
            "index": 0,
            "line": 2,
            "event": "exception",
            "functionName": "<module>",
            "frameId": "module",
            "depth": 0,
            "locals": {},
            "stdout": "",
            "error": {"type": "SyntaxError", "message": "'(' was never closed"},
        }
    ]
    assert result["message"] == "'(' was never closed"


def test_indentation_error_keeps_its_real_type():
    result = run("for i in range(3):\nprint(i)\n")
    assert len(result["steps"]) == 1
    assert result["steps"][0]["error"]["type"] == "IndentationError"
    assert result["status"] == "error"


@pytest.mark.parametrize("source", ["a\x00b\n", "-" * 200000 + "1\n"])
def test_other_compile_failures_give_one_error_step(source):
    result = run(source)
    assert result["status"] == "error"
    assert len(result["steps"]) == 1 and result["steps"][0]["event"] == "exception"


def test_caught_zero_division_continues():
    result = run(src("""
        try:
            x = 1 / 0
        except ZeroDivisionError:
            x = 0
        y = x + 1
    """))
    assert result["status"] == "ok" and "message" not in result
    assert "exception" not in {s["event"] for s in result["steps"]}
    assert result["steps"][-1]["locals"] == {"x": 0, "y": 1}


def test_exception_caught_in_caller_after_unwinding_callee():
    result = run(src("""
        def g():
            a = 1
            return a / 0
        def f():
            try:
                g()
            except ZeroDivisionError:
                return 5
        r = f()
    """))
    assert result["status"] == "ok"
    # g never returned normally, so it has no return step.
    assert [s["event"] for s in steps_for(result, "g-1")] == ["call", "line", "line"]
    f_steps = steps_for(result, "f-1")
    assert f_steps[-1]["event"] == "return" and f_steps[-1]["returnValue"] == 5
    assert result["steps"][-1]["locals"]["r"] == 5


def test_uncaught_exception_points_at_innermost_frame():
    result = run(src("""
        def g(a):
            b = a * 2
            return b / 0
        def f():
            return g(3)
        f()
    """))
    assert result["status"] == "error"
    last = result["steps"][-1]
    assert last["event"] == "exception"
    assert (last["line"], last["functionName"], last["frameId"], last["depth"]) == (3, "g", "g-1", 2)
    assert last["locals"] == {"a": 3, "b": 6}
    assert last["error"] == {"type": "ZeroDivisionError", "message": "division by zero"}
    # Frames the exception passed through record no return step.
    assert "return" not in {s["event"] for s in result["steps"]}


def test_regression_uncaught_exception_in_function_is_reported_in_that_function():
    # Explainer repro: the terminal step used to land at module line 3, depth 0.
    result = run("def f(a):\n    return a / 0\nf(3)\n")
    last = result["steps"][-1]
    assert (last["event"], last["line"], last["frameId"], last["depth"]) == ("exception", 2, "f-1", 1)
    assert last["functionName"] == "f"
    assert last["locals"] == {"a": 3}
    assert result["message"] == "division by zero"


def test_regression_caught_outside_then_different_exception_later():
    # The first exception is caught in an outer frame; a later, different one
    # must be reported where *it* happened, not where the first one did.
    result = run(src("""
        def f(a):
            return a / 0
        def g(items):
            return items[5]
        try:
            f(3)
        except ZeroDivisionError:
            pass
        g([1, 2])
    """))
    last = result["steps"][-1]
    assert (last["line"], last["frameId"], last["depth"]) == (4, "g-1", 1)
    assert last["locals"] == {"items": [1, 2]}
    assert last["error"] == {"type": "IndexError", "message": "list index out of range"}


def test_regression_same_exception_reraised_after_being_caught_outside():
    # Caught in the module, then the same object is raised again from h():
    # the failing line is the new raise, not the original division.
    result = run(src("""
        def f(a):
            return a / 0
        try:
            f(3)
        except ZeroDivisionError as e:
            saved = e
        def h():
            raise saved
        h()
    """))
    last = result["steps"][-1]
    assert (last["line"], last["frameId"]) == (8, "h-1")


@pytest.mark.parametrize(
    "source, line, message",
    [
        ("if True\n    pass\n", 1, "expected ':'"),
        ("x = 1\ny = (\n", 2, "'(' was never closed"),
        ("x = = 2\n", 1, "invalid syntax"),
        ("print('hi'\n", 1, "'(' was never closed"),
    ],
)
def test_regression_syntax_error_keeps_the_real_message(source, line, message):
    # Explainer report: SyntaxError.args is (msg, details), so the message used
    # to come out as "invalid syntax" every time.
    result = run(source)
    assert len(result["steps"]) == 1
    step = result["steps"][0]
    assert step["line"] == line
    assert step["error"] == {"type": "SyntaxError", "message": message}
    assert result["message"] == message


def test_finally_reraise_records_no_return_and_keeps_innermost_line():
    result = run(src("""
        def g():
            return 1 / 0
        def f():
            try:
                g()
            finally:
                cleanup = True
        f()
    """))
    assert result["status"] == "error"
    assert "return" not in {s["event"] for s in result["steps"]}
    assert any(s["line"] == 7 and s["frameId"] == "f-1" for s in result["steps"])
    last = result["steps"][-1]
    assert (last["line"], last["frameId"]) == (2, "g-1")


def test_reraise_with_raise_e_points_at_the_raise():
    result = run(src("""
        try:
            1 / 0
        except ZeroDivisionError as e:
            raise e
    """))
    assert result["steps"][-1]["line"] == 4


def test_with_suppress_at_end_of_function_still_returns():
    result = run(src("""
        from contextlib import suppress
        def f():
            with suppress(ZeroDivisionError):
                1 / 0
        f()
    """))
    assert result["status"] == "ok"
    assert steps_for(result, "f-1")[-1]["event"] == "return"


def test_key_error_message_is_the_key():
    result = run('d = {}\nd["k"]\n')
    assert result["steps"][-1]["error"] == {"type": "KeyError", "message": "k"}


def test_student_exception_methods_are_never_called():
    result = run(src("""
        class Oops(Exception):
            def __str__(self):
                raise RuntimeError("student __str__ called")
            @property
            def args(self):
                raise RuntimeError("student args called")
        raise Oops("boom")
    """))
    assert result["status"] == "error"
    assert result["steps"][-1]["error"] == {"type": "Oops", "message": "boom"}


def test_hostile_values_in_student_code_are_placeholders():
    result = run(src("""
        class Meta(type):
            def __eq__(cls, other):
                raise RuntimeError("metaclass __eq__ called")
            __hash__ = type.__hash__
        class Thing(metaclass=Meta):
            def __repr__(self):
                raise RuntimeError("__repr__ called")
        t = Thing()
        done = True
    """))
    assert result["status"] == "ok"
    assert result["steps"][-1]["locals"]["t"] == {"__type__": "Thing"}
    assert result["steps"][-1]["locals"]["done"] is True


# -- lesson fixtures (branch, function) ------------------------------------
# The sources live in gen_fixtures.py and must match frontend/src/lessons.ts
# byte for byte; regenerate with `.venv/bin/python frontend/src/py/gen_fixtures.py`.

import gen_fixtures  # noqa: E402  (frontend/src/py is on sys.path via conftest)


def test_generator_loop_source_matches_loop_lesson():
    assert gen_fixtures.LESSONS["loop"] == LOOP_LESSON


@pytest.mark.parametrize("name", ["loop", "branch", "function"])
def test_lesson_equals_fixture(name):
    source = gen_fixtures.LESSONS[name]
    expected = json.loads((FIXTURES / f"{name}.json").read_text(encoding="utf-8"))
    assert run(source) == expected
    assert json.loads(tracer.trace_json(source)) == expected
    assert expected["codeHash"] == tracer.code_hash(source)


def test_branch_fixture_takes_the_if_side():
    data = json.loads((FIXTURES / "branch.json").read_text(encoding="utf-8"))
    lines = [s["line"] for s in data["steps"] if s["event"] == "line"]
    assert 5 not in lines  # the else body never runs
    assert data["steps"][-1]["stdout"] == "Wear a T-shirt\n"


def test_function_fixture_has_call_and_return_value():
    data = json.loads((FIXTURES / "function.json").read_text(encoding="utf-8"))
    add_steps = [s for s in data["steps"] if s["functionName"] == "add"]
    assert add_steps[0]["event"] == "call" and add_steps[0]["depth"] == 1
    assert add_steps[-1]["event"] == "return" and add_steps[-1]["returnValue"] == 5
    assert data["steps"][-1]["stdout"] == "5\n"


# -- generator close() (CPython / Pyodide parity) ---------------------------


def test_closing_a_suspended_generator_leaves_no_orphan_call_step():
    # CPython 3.13.15 throws GeneratorExit into g (call/exception/return
    # events); Pyodide's 3.13.2 fires none. Both must give this trace.
    result = run(src("""
        def g():
            yield 1
            yield 2

        it = g()
        print(next(it))
        it.close()
    """))
    assert result["status"] == "ok"
    g_steps = steps_for(result, "g-1")
    assert [s["event"] for s in g_steps] == ["call", "line", "return"]
    assert result["steps"][-1]["event"] == "return"
    assert result["steps"][-1]["frameId"] == "module"


def test_abandoned_generator_in_for_break_leaves_no_orphan_call_step():
    result = run(src("""
        def g():
            yield 1
            yield 2

        for v in g():
            break
        print(v)
    """))
    assert result["status"] == "ok"
    assert [s["event"] for s in steps_for(result, "g-1")] == ["call", "line", "return"]
    assert result["steps"][-1]["stdout"] == "1\n"


def test_closing_generator_with_finally_keeps_its_steps():
    result = run(src("""
        def g():
            try:
                yield 1
            finally:
                print("bye")

        it = g()
        next(it)
        it.close()
    """))
    assert result["status"] == "ok"
    g_steps = steps_for(result, "g-1")
    assert [s["event"] for s in g_steps][-2:] == ["call", "line"]
    assert g_steps[-1]["line"] == 5
    assert result["steps"][-1]["stdout"] == "bye\n"
