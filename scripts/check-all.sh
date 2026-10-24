#!/usr/bin/env bash
# Run every CodeLens test suite and check. Exits non-zero if any of them fails.
# Used by the git pre-commit hook (.githooks/pre-commit): nothing is committed
# unless everything here is green.
#
# Optional: set PYODIDE_DIR to a node_modules/pyodide folder to also run the
# CPython-vs-Pyodide check (slow; needs Pyodide installed outside the repo).
set -u
cd "$(dirname "$0")/.." || exit 1

fail=0
run() {
  local name="$1"; shift
  local out
  if out=$("$@" 2>&1); then
    echo "ok    $name"
  else
    echo "FAIL  $name"
    echo "$out" | tail -40 | sed 's/^/      /'
    fail=1
  fi
}

run "pytest"                   .venv/bin/pytest -q
run "fixtures up to date"      .venv/bin/python frontend/src/py/gen_fixtures.py --check
run "lessons trace ok"         .venv/bin/python frontend/src/py/check_lessons.py
run "node tests"               node --test api/explain.test.mjs frontend/src/explain/*.test.mjs frontend/src/components/*.test.mjs
run "api typecheck"            frontend/node_modules/.bin/tsc -p api
run "frontend typecheck"       npm --prefix frontend run -s typecheck
if grep -q '"test"' frontend/package.json; then
  run "frontend component tests" npm --prefix frontend run -s test
fi
run "frontend build"           npm --prefix frontend run -s build
run "bundle size"              node --test scripts/bundle-size.test.mjs
if [ -n "${PYODIDE_DIR:-}" ]; then
  run "pyodide parity"         node frontend/src/worker/pyodide-check.mjs "$PYODIDE_DIR"
fi

if [ "$fail" -ne 0 ]; then
  echo "Some checks FAILED."
  exit 1
fi
echo "All checks green."
