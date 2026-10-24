"""Regenerate the precomputed lesson traces in shared/fixtures/.

Usage (from the repo root):
    .venv/bin/python frontend/src/py/gen_fixtures.py          # write branch + function
    .venv/bin/python frontend/src/py/gen_fixtures.py --check  # verify all three, write nothing
    .venv/bin/python frontend/src/py/gen_fixtures.py --all    # rewrite every fixture

The lesson sources below must stay byte-for-byte identical to the strings in
frontend/src/lessons.ts (trailing newline included), or the codeHash will not
match. By default loop.json is hand-formatted and only checked, never
rewritten. --all (run by the contract hooks when trace.ts changes) rewrites
every fixture, loop.json included, but only after checking that every trace
has the fields trace.ts requires; if any is missing it writes nothing.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import tracer  # noqa: E402

ROOT = Path(__file__).resolve().parents[3]
FIXTURES = ROOT / "shared" / "fixtures"
CONTRACT = ROOT / "frontend" / "src" / "types" / "trace.ts"

LESSONS = {
    "loop": "numbers = [3, 1, 2]\ntotal = 0\nfor n in numbers:\n    total += n\n",
    "branch": (
        "temperature = 30\n"
        "if temperature > 25:\n"
        '    advice = "Wear a T-shirt"\n'
        "else:\n"
        '    advice = "Bring a jacket"\n'
        "print(advice)\n"
    ),
    "function": (
        "def add(a, b):\n"
        "    result = a + b\n"
        "    return result\n"
        "\n"
        "total = add(2, 3)\n"
        "print(total)\n"
    ),
}

GENERATED = ("branch", "function")  # loop.json is never rewritten


def render(result: dict) -> str:
    # Same top-level key order as loop.json, so the files read alike; any
    # other keys follow in the tracer's order.
    order = ["status", "message", "truncated", "codeHash", "steps"]
    ordered = {k: result[k] for k in order if k in result}
    ordered.update({k: v for k, v in result.items() if k not in ordered})
    return json.dumps(ordered, indent=2, ensure_ascii=False) + "\n"


def required_fields(type_name: str) -> list[str]:
    """Non-optional field names of `type_name` in the frozen contract."""
    text = CONTRACT.read_text(encoding="utf-8")
    m = re.search(rf"^export type {type_name} = \{{(.*?)^\}};", text, re.S | re.M)
    if m is None:
        raise SystemExit(f"could not find `export type {type_name}` in {CONTRACT}")
    return re.findall(r"^\s*(\w+):", m.group(1), re.M)


def write_all() -> int:
    """Rewrite every fixture, or none if any trace misses a contract field."""
    result_fields = required_fields("TraceResult")
    step_fields = required_fields("TraceStep")
    results = {name: tracer.trace(source) for name, source in LESSONS.items()}
    problems = []
    for name, result in results.items():
        missing = [f for f in result_fields if f not in result]
        missing += [f for f in step_fields if any(f not in s for s in result["steps"])]
        if missing:
            problems.append(f"{name}: tracer output lacks {', '.join(missing)}")
    if problems:
        for p in problems:
            print(p, file=sys.stderr)
        print(
            "fixtures NOT regenerated: tracer.py does not yet emit every field "
            "frontend/src/types/trace.ts requires",
            file=sys.stderr,
        )
        return 1
    for name, result in results.items():
        path = FIXTURES / f"{name}.json"
        path.write_text(render(result), encoding="utf-8")
        print(f"wrote {path}")
    return 0


def main(argv: list[str]) -> int:
    if "--all" in argv:
        return write_all()
    check = "--check" in argv
    bad = []
    for name in LESSONS:
        path = FIXTURES / f"{name}.json"
        expected = tracer.trace(LESSONS[name])
        if check or name not in GENERATED:
            on_disk = json.loads(path.read_text(encoding="utf-8")) if path.exists() else None
            if on_disk != expected:
                bad.append(name)
            continue
        path.write_text(render(expected), encoding="utf-8")
        print(f"wrote {path}")
    if bad:
        print(f"fixtures out of date: {', '.join(bad)}", file=sys.stderr)
        return 1
    print("fixtures ok")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
