"""Make frontend/src/py importable from the tests, so pytest can import the
tracer module the same way the plan describes (plain Python under CPython)."""

import builtins
import sys
from pathlib import Path

import pytest

PY_DIR = Path(__file__).resolve().parent.parent / "frontend" / "src" / "py"
sys.path.insert(0, str(PY_DIR))


@pytest.fixture(autouse=True)
def _tracer_leaves_global_state_alone():
    """Every test must leave sys.settrace, sys.stdout, builtins.input and
    sys.monitoring exactly as it found them (Req 3.5)."""
    before = (sys.gettrace(), sys.stdout, builtins.input)
    yield
    after = (sys.gettrace(), sys.stdout, builtins.input)
    assert all(a is b for a, b in zip(before, after)), (before, after)
    monitoring = getattr(sys, "monitoring", None)
    if monitoring is not None:
        for tool_id in range(6):
            assert monitoring.get_tool(tool_id) != "codelens-step-limit"
