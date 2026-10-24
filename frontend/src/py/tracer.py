"""CodeLens tracer.

Plain Python, runnable in both Pyodide (in the Web Worker) and CPython (under
pytest). This module currently exposes only the frozen-contract scaffolding and
helpers; the real sys.settrace tracing is implemented in a later task.

The public surface is intentionally small so tests and fixtures can rely on it:
- MAX_STEPS: the infinite-loop guard.
- code_hash(source): the canonical TraceResult.codeHash scheme.
- empty_result(source): a well-formed empty TraceResult dict.

Line-number rule: CPython 3.12+ reports f_lineno == 0 for the module-level
"call" event. The tracer must report line 1 instead, so every step's line stays
inside the program's line range (shared/fixtures/loop.json follows this).
"""

from __future__ import annotations

import hashlib

MAX_STEPS = 300

# Trace status values, matching the frozen contract's TraceResult.status.
STATUS_OK = "ok"
STATUS_ERROR = "error"
STATUS_LIMIT = "limit"
STATUS_TIMEOUT = "timeout"

# Trace event values, matching the frozen contract's TraceStep.event.
EVENT_CALL = "call"
EVENT_LINE = "line"
EVENT_RETURN = "return"
EVENT_EXCEPTION = "exception"


def code_hash(source: str) -> str:
    """Canonical codeHash: sha256 hex digest of the UTF-8 source."""
    return hashlib.sha256(source.encode("utf-8")).hexdigest()


def empty_result(source: str) -> dict:
    """A well-formed, empty TraceResult for the given source."""
    return {
        "steps": [],
        "status": STATUS_OK,
        "truncated": False,
        "codeHash": code_hash(source),
    }
