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
| 2 | Graph and tree visualizers | done |
| 3 | Acceptance and accessibility pass | done (real screen reader still to do) |
| 4 | Fix the stale `StackFrame` comment in `trace.ts` | done |
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

### Stage 2: graph and tree visualizers
- **Test tools added** (frontend dev dependencies, pinned): vitest 3.2.7,
  jsdom 30.1.3, Testing Library (react 16.3.3, dom 10.4.2), axe-core 4.14.0.
  `npm test` runs vitest; `scripts/check-all.sh` now includes it.
- **Tests written first** (`graphTree.test.ts`, `DataStructures.test.tsx`), run
  red, then made green:
  - graph detection from the BFS adjacency dict (5 nodes, 5 undirected links),
    directed links, set neighbors, and every "not a graph" case (the `hops`
    dict, unknown neighbors, nested lists, placeholders)
  - node badges in text: "in visited", "in queue", "← person"
  - circle layout; tree detection, cycles and mixed types refused
  - the whole tree from the outermost `root` during recursion, with each
    call's `node` marked and exactly one "(running)"
  - in-order tree layout; one tree card per distinct root
  - components: graph and tree drawn as SVG with a summary label and a text
    version; hops stays a key → value table; the card says "graph"; badges are
    not cut off; no axe violations
- **Test fix, stated:** the tree test first picked the deepest recursion step,
  whose `node` is `None` (the base case), so nothing could be "running". It now
  picks the deepest step whose `node` is a real node.
- **Bug found by testing:** `GraphTree.tsx` and `graphTree.ts` clash on macOS's
  case-insensitive disk; the views file is now `GraphTreeViews.tsx`.
- **Browser check:** BFS graph with visited / queue / person badges; tree with
  `root` and each `node` marked; no horizontal scroll at 406 px. Badge text got
  a halo so it stays readable over lines (CSS only, no test).
- **Checks:** all green (189 pytest, 111 node tests, 23 vitest, typecheck,
  build).

### Stage 3: acceptance and accessibility pass
- **Tests written first** (`frontend/src/App.test.tsx`, 14 tests on the whole
  App; the Pyodide worker is mocked, and `print(x)` / `while True` are traced by
  the real CPython tracer in `frontend/test/acceptance-traces.mjs`):
  - loop: total 0 → 3 → 4 → 6, "Next line to run" at every line step,
    backward stepping without running Python again, arrow keys (not while
    typing)
  - every step of all nine lessons has a template explanation with
    `/api/explain` offline; Spanish toggle
  - `print(x)` ends on line 1 with a NameError explanation; `while True` ends as
    "limit" in under 2 s and the editor stays usable
  - Level 2: hash map `{}` → `{4: 0}` → `{4: 0, 9: 1}` and `[1, 2]`; pointers
    (left, right) = (0,5) (0,4) (1,4) (1,3) (2,3) and `[4, 6]`; graph, queue
    front/back and visited badges, final hops; tree drawn, call stack 1 → 6 → 1
    and `4`
  - axe (jsdom) at the first, middle and last step of every lesson; the
    narrator's live region changes on each step
- **First run:** 12 of 13 passed once my test helpers were fixed: "Next" also
  matched "Next change", the lesson buttons use short names, and the call-stack
  count included lists inside each card. No product bug showed up in jsdom.
- **Real-browser sweep** (axe-core with color contrast, 375 px, light and dark,
  27 checkpoints each): one violation, `scrollable-region-focusable`. The
  code view and structure boxes scroll sideways on a phone, but the keyboard
  could not reach them.
  - Red test first: every sideways-scrolling box must be focusable with a
    label. Fix: `components/scrollBox.ts`, used by all seven boxes.
  - After the fix: 0 violations in light and dark, no sideways page scroll; the
    code box takes keyboard focus with a 3 px outline.
- **Pyodide:** `while True` and the three `except` variants hit the limit at
  1999 steps in about 30 ms.
- **Not covered:** a real screen reader (VoiceOver / NVDA).
- **Gaps found:** two MVP features in `docs/plan.md` were never built:
  predict-then-reveal (the loop acceptance test's "predict accepts 4") and the
  share link.
- **Checks:** all green (189 pytest, 111 node tests, 37 vitest, typecheck,
  build).

### Stage 4: stale `StackFrame` comment in the contract
- **Test written first** (`tests/test_contract_docs.py`, 4 tests): the
  contract blocks in `tech.md` and `plan.md` are identical; every type and
  field in `trace.ts` appears in `tech.md`; `trace.ts` no longer says "A
  calling frame", and its `stack` line says "all active user frames … current
  frame"; both docs describe `stack` the same way.
- **Red:** 1 failed (the stale comment), 3 passed (the docs already agreed).
- **Fix:** comments only in `frontend/src/types/trace.ts`; no type changed.
  The contract hook's fixture step (`gen_fixtures.py --all`) left every
  fixture byte-identical.
- **Checks:** all green (193 pytest, 111 node tests, 37 vitest, typecheck,
  build). The new tests now guard the three contract copies against drift.
