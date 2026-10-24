# Testing: test-driven development

Every change follows test-driven development. This applies to every
workstream, every agent, and every Kiro spec task.

## The loop
1. **Red:** write the tests for the new behavior first, and run them to see
   them fail for the expected reason.
2. **Green:** write the smallest code that makes them pass.
3. **Refactor:** clean up with the tests still green.
4. Run `scripts/check-all.sh`. Move on only when it says "All checks green."

## Rules
- No feature code without a failing test written first. A bug fix starts with
  a test that reproduces the bug.
- Never weaken, skip, or delete a test to get to green. If a test is wrong,
  say why in the change that fixes it.
- Commits only happen when everything is green. The git pre-commit hook
  (`.githooks/pre-commit`, enabled with `git config core.hooksPath .githooks`)
  runs `scripts/check-all.sh` and blocks red commits.
- Log each stage in `docs/PROGRESS.md`: which tests were written first, what
  they checked, and the result.

## Where tests live
| What | Tool | Location |
|---|---|---|
| Tracer, fixtures, lessons | pytest + Hypothesis | `tests/` |
| Explanations, value helpers, API | `node --test` | `frontend/src/explain/*.test.mjs`, `api/*.test.mjs` |
| UI logic (pure functions) | `node --test` | `frontend/src/components/*.test.mjs` |
| React components, accessibility | vitest + jsdom + Testing Library + axe-core | `frontend/src/**/*.test.tsx` |
| CPython vs Pyodide | Node + Pyodide | `frontend/src/worker/pyodide-check.mjs` (set `PYODIDE_DIR`) |
