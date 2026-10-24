"""Regenerate the precomputed lesson traces in shared/fixtures/.

Usage (from the repo root):
    .venv/bin/python frontend/src/py/gen_fixtures.py          # write branch + function
    .venv/bin/python frontend/src/py/gen_fixtures.py --check  # verify all three, write nothing

The lesson sources below must stay byte-for-byte identical to the strings in
frontend/src/lessons.ts (trailing newline included), or the codeHash will not
match. loop.json is hand-formatted and read by other workstreams' tests, so it
is only ever checked, never rewritten.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import tracer  # noqa: E402

FIXTURES = Path(__file__).resolve().parents[3] / "shared" / "fixtures"

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


def render(name: str) -> str:
    result = tracer.trace(LESSONS[name])
    # Same top-level key order as loop.json, so the files read alike.
    order = ["status", "message", "truncated", "codeHash", "steps"]
    ordered = {k: result[k] for k in order if k in result}
    return json.dumps(ordered, indent=2, ensure_ascii=False) + "\n"


def main(argv: list[str]) -> int:
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
        path.write_text(render(name), encoding="utf-8")
        print(f"wrote {path}")
    if bad:
        print(f"fixtures out of date: {', '.join(bad)}", file=sys.stderr)
        return 1
    print("fixtures ok")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
