"""Scaffold tests for the tracer module. No tracing features yet; these assert
the frozen-contract helpers and keep `pytest` green."""

import json
from pathlib import Path

import tracer

FIXTURES = Path(__file__).resolve().parent.parent / "shared" / "fixtures"


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
