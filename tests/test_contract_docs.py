"""The frozen contract lives in three places that must agree:
frontend/src/types/trace.ts (source of truth), .kiro/steering/tech.md, and
docs/plan.md. These tests catch drift between them, including stale comments."""

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TRACE_TS = (ROOT / "frontend" / "src" / "types" / "trace.ts").read_text()


def contract_block(path: Path) -> str:
    text = path.read_text()
    start = text.index("FROZEN shared contract")
    return re.search(r"```ts\n(.*?)```", text[start:], re.S).group(1)


TECH = contract_block(ROOT / ".kiro" / "steering" / "tech.md")
PLAN = contract_block(ROOT / "docs" / "plan.md")


def test_tech_and_plan_carry_the_same_contract():
    assert TECH == PLAN


def test_every_contract_type_and_field_is_documented():
    types = re.findall(r"^export type (\w+)", TRACE_TS, re.M)
    fields = re.findall(r"^\s+(\w+)\??:", TRACE_TS, re.M)
    assert types, "no exported types found in trace.ts"
    for name in types + fields:
        assert re.search(rf"\b{name}\b", TECH), f"{name} is in trace.ts but not in tech.md"


def test_trace_ts_describes_the_stack_as_all_active_frames():
    # Decided in wave 3: stack holds every active user frame, outermost
    # first, with the current frame last (len(stack) == depth + 1).
    assert "A calling frame" not in TRACE_TS
    stack_line = next(line for line in TRACE_TS.splitlines() if re.match(r"\s+stack:", line))
    assert "all active user frames" in stack_line
    assert "current frame" in stack_line


def test_docs_describe_the_stack_the_same_way():
    for name, block in (("tech.md", TECH), ("plan.md", PLAN)):
        stack_line = next(line for line in block.splitlines() if re.match(r"\s+stack:", line))
        assert "all active user frames" in stack_line, name
