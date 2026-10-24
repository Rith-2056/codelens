"""Make frontend/src/py importable from the tests, so pytest can import the
tracer module the same way the plan describes (plain Python under CPython)."""

import sys
from pathlib import Path

PY_DIR = Path(__file__).resolve().parent.parent / "frontend" / "src" / "py"
sys.path.insert(0, str(PY_DIR))
