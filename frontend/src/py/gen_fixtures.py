"""Regenerate the precomputed lesson traces in shared/fixtures/.

Usage (from the repo root):
    .venv/bin/python frontend/src/py/gen_fixtures.py          # write every fixture but loop
    .venv/bin/python frontend/src/py/gen_fixtures.py --check  # verify all nine, write nothing
    .venv/bin/python frontend/src/py/gen_fixtures.py --all    # rewrite every fixture

The lesson sources below must stay byte-for-byte identical to the strings in
frontend/src/lessons.ts (trailing newline included), or the codeHash will not
match. Fixtures are written as compact JSON, one line each. The default mode
only checks loop.json, never rewriting it. --all (run by the contract hooks
when trace.ts changes) rewrites every fixture, loop.json included, but only
after checking that every trace has the fields trace.ts requires; if any is
missing it writes nothing.
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
    # Level 2: interview patterns. Sources from
    # .kiro/specs/ds-visualizers/design.md, byte for byte.
    "pair-sum": (
        "nums = [4, 9, 2, 7]\n"
        "target = 11\n"
        "seen = {}\n"
        "answer = None\n"
        "for i, n in enumerate(nums):\n"
        "    need = target - n\n"
        "    if need in seen:\n"
        "        answer = [seen[need], i]\n"
        "        break\n"
        "    seen[n] = i\n"
        "print(answer)\n"
    ),
    "any-repeats": (
        "nums = [5, 1, 8, 1, 3]\n"
        "seen = set()\n"
        "has_repeat = False\n"
        "for n in nums:\n"
        "    if n in seen:\n"
        "        has_repeat = True\n"
        "        break\n"
        "    seen.add(n)\n"
        "print(has_repeat)\n"
    ),
    "sorted-pair": (
        "nums = [1, 3, 4, 6, 8, 11]\n"
        "target = 10\n"
        "left = 0\n"
        "right = len(nums) - 1\n"
        "pair = None\n"
        "while left < right:\n"
        "    total = nums[left] + nums[right]\n"
        "    if total == target:\n"
        "        pair = [nums[left], nums[right]]\n"
        "        break\n"
        "    elif total < target:\n"
        "        left += 1\n"
        "    else:\n"
        "        right -= 1\n"
        "print(pair)\n"
    ),
    "network-hops": (
        "from collections import deque\n"
        "\n"
        "graph = {\n"
        "    \"A\": [\"B\", \"C\"],\n"
        "    \"B\": [\"A\", \"D\"],\n"
        "    \"C\": [\"A\", \"D\"],\n"
        "    \"D\": [\"B\", \"C\", \"E\"],\n"
        "    \"E\": [\"D\"],\n"
        "}\n"
        "visited = {\"A\"}\n"
        "queue = deque([\"A\"])\n"
        "hops = {\"A\": 0}\n"
        "while queue:\n"
        "    person = queue.popleft()\n"
        "    for friend in graph[person]:\n"
        "        if friend not in visited:\n"
        "            visited.add(friend)\n"
        "            hops[friend] = hops[person] + 1\n"
        "            queue.append(friend)\n"
        "print(hops)\n"
    ),
    "tree-height": (
        "class TreeNode:\n"
        "    def __init__(self, val, left=None, right=None):\n"
        "        self.val = val\n"
        "        self.left = left\n"
        "        self.right = right\n"
        "\n"
        "\n"
        "def max_depth(node):\n"
        "    if node is None:\n"
        "        return 0\n"
        "    left = max_depth(node.left)\n"
        "    right = max_depth(node.right)\n"
        "    return 1 + max(left, right)\n"
        "\n"
        "\n"
        "root = TreeNode(1, TreeNode(2, TreeNode(4)), TreeNode(3, None, TreeNode(5, TreeNode(6))))\n"
        "print(max_depth(root))\n"
    ),
    "stairs": (
        "n = 6\n"
        "ways = [0] * (n + 1)\n"
        "ways[0] = 1\n"
        "ways[1] = 1\n"
        "for i in range(2, n + 1):\n"
        "    ways[i] = ways[i - 1] + ways[i - 2]\n"
        "print(ways[n])\n"
    ),
}

# Written by the default mode; loop.json is only rewritten by --all.
GENERATED = tuple(name for name in LESSONS if name != "loop")


def render(result: dict) -> str:
    # Same top-level key order in every fixture; any other keys follow in the
    # tracer's order. Compact (one line): the fixtures are bundled into the app
    # as text, and indentation cost ~300 KB (see scripts/bundle-size.test.mjs).
    order = ["status", "message", "truncated", "codeHash", "steps"]
    ordered = {k: result[k] for k in order if k in result}
    ordered.update({k: v for k, v in result.items() if k not in ordered})
    return json.dumps(ordered, separators=(",", ":"), ensure_ascii=False) + "\n"


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
