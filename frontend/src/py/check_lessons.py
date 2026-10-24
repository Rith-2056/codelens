"""Trace every lesson in frontend/src/lessons.ts and fail if any is unhealthy.

Usage (from the repo root):
    .venv/bin/python frontend/src/py/check_lessons.py [path/to/lessons.ts]

Run by the lesson-check Kiro hook whenever lessons.ts is saved. Each lesson's
`source:` string is read from lessons.ts itself (not from gen_fixtures.py), so
the check covers exactly what was saved. A lesson fails if its trace ends with
a status other than "ok" or records more than LESSON_STEP_LIMIT steps.
"""

from __future__ import annotations

import ast
import re
import signal
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import tracer  # noqa: E402

ROOT = Path(__file__).resolve().parents[3]
LESSONS_TS = ROOT / "frontend" / "src" / "lessons.ts"

LESSON_STEP_LIMIT = 2000
# CPython has no worker timeout, so guard against a lesson that hangs inside a
# slow C-level call (e.g. 10**10**8) where the step limit never fires.
LESSON_SECONDS = 5

_STRING = r"""(?:"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`)"""
_SOURCE = re.compile(rf"\bsource:\s*({_STRING}(?:\s*\+\s*{_STRING})*)", re.S)
_ID = re.compile(rf"\bid:\s*({_STRING})")


def _js_string(literal: str) -> str:
    """Decode one JS string literal; its escapes match Python's for lessons."""
    if literal.startswith("`"):
        if "${" in literal:
            raise ValueError("template literals with ${...} are not supported")
        literal = '"""' + literal[1:-1].replace('"""', '\\"\\"\\"') + '"""'
    return ast.literal_eval(literal)


def lesson_sources(text: str) -> list[tuple[str, str]]:
    """(id, source) for every `source:` in lessons.ts, in file order."""
    out = []
    for m in _SOURCE.finditer(text):
        parts = re.findall(_STRING, m.group(1), re.S)
        source = "".join(_js_string(p) for p in parts)
        ids = list(_ID.finditer(text, 0, m.start()))
        lesson_id = _js_string(ids[-1].group(1)) if ids else f"lesson@{m.start()}"
        out.append((lesson_id, source))
    return out


class _TooSlow(BaseException):
    """Raised by the alarm. The tracer reports any exception escaping student
    code as a student error, so the handler also sets a flag to tell them apart."""


_timed_out = False


def _alarm(signum, frame):
    global _timed_out
    _timed_out = True
    raise _TooSlow


def check(path: Path) -> int:
    global _timed_out
    lessons = lesson_sources(path.read_text(encoding="utf-8"))
    if not lessons:
        print(f"no `source:` strings found in {path}", file=sys.stderr)
        return 1
    failures = 0
    signal.signal(signal.SIGALRM, _alarm)
    for lesson_id, source in lessons:
        _timed_out = False
        signal.alarm(LESSON_SECONDS)
        try:
            result = tracer.trace(source)
        except _TooSlow:
            result = None
        finally:
            signal.alarm(0)
        if _timed_out:
            result = None
        if result is None:
            problem = f"took longer than {LESSON_SECONDS} s"
        else:
            steps = len(result["steps"])
            problem = None
            if result["status"] != "ok":
                detail = result.get("message") or ""
                problem = f'status "{result["status"]}"' + (f": {detail}" if detail else "")
            elif steps > LESSON_STEP_LIMIT:
                problem = f"{steps} steps (limit {LESSON_STEP_LIMIT})"
        if problem:
            failures += 1
            print(f"FAIL {lesson_id}: {problem}")
        else:
            print(f"ok   {lesson_id}: {steps} steps")
    if failures:
        print(f"{failures} of {len(lessons)} lessons failed the lesson check", file=sys.stderr)
        return 1
    print(f"all {len(lessons)} lessons ok")
    return 0


if __name__ == "__main__":
    sys.exit(check(Path(sys.argv[1]) if len(sys.argv) > 1 else LESSONS_TS))
