# CodeLens progress log

One entry per commit-sized step, newest at the bottom. Each entry says what
changed, which tests were written first, and the check results. Commit hashes
are in `git log`.

## Project so far (before the TDD stages)

| When (2026-10-24) | What | Result |
|---|---|---|
| Morning | Steering, specs, scaffold, loop fixture | Skeleton builds; pytest green |
| Wave 1 | Tracer (snapshots, step cap, errors, Hypothesis tests); fixture-only step viewer; deterministic en/es explanations + `/api/explain` stub | 120 pytest, 17 node tests |
| Wave 2 | Pyodide worker with 3 s timeout; editor, Visualize, state machine, lesson picker, explanation panel; Claude call in `/api/explain` with number check, caps, cache, rate limit | 129 pytest, 49 node tests; real Pyodide verified in browser |
| Pivot | Learning path "from your first loop to your first interview": Level 2 (6 interview lessons), MAX_STEPS 2000, ds-visualizers spec | Docs and spec |
| Contract | Frozen contract 2026-10-24: `__set`, `__dict`, `__deque`, `__ref`, `heap`, `stack` | Typecheck green |
| Hooks | Contract hooks regenerate fixtures (refuse if the tracer lacks contract fields); lesson-check hook | Hook commands tested from the terminal |
| Wave 3 | Tracer emits the contract (heap cap 200, full stack); 9 lesson fixtures; data-structure panel, call stack, scrubber, jump-to-change; data-structure explanations | 189 pytest, 111 node tests, Pyodide parity 46/46 |

## TDD stages

Rule from here on (see `.kiro/steering/testing.md`): tests first, see them
fail, then code; commit only when `scripts/check-all.sh` is all green (the git
pre-commit hook enforces it).

| Stage | Goal | Status |
|---|---|---|
| 1 | Branch `codelens-stages`, TDD tooling, commit wave 3 | done |
| 2 | Graph and tree visualizers | todo |
| 3 | Acceptance and accessibility pass | todo |
| 4 | Fix the stale `StackFrame` comment in `trace.ts` | todo |
| 5 | Shrink the bundle | todo |
| 6 | Live Claude API test | paused: needs your API key |

### Stage 1: TDD tooling and wave 3 commit
- Branch `codelens-stages` created from `main`.
- `scripts/check-all.sh` runs every suite: pytest, fixture check, lesson
  check, node tests, api typecheck, frontend typecheck, frontend build (and the
  Pyodide check when `PYODIDE_DIR` is set).
- `.githooks/pre-commit` runs it and blocks red commits;
  `git config core.hooksPath .githooks` enables it.
- `.kiro/steering/testing.md` makes TDD the rule for every workstream.
- `*.tsbuildinfo` build files are no longer tracked.
- **Hook test:** a deliberately failing test made the hook exit 1 with "commit
  blocked"; the probe was then removed.
- **Checks:** all green (189 pytest, 111 node tests, typecheck, build).
