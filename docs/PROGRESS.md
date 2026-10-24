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
| 5 | Shrink the bundle | done |
| 6 | Live LLM test | paused: needs your Gemini key |

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

### Stage 5: shrink the bundle
- **Measured first:** the main JS was 723,835 bytes (over Vite's 500 kB
  warning). The nine fixtures were 482,169 bytes of indented JSON, bundled as
  text; compact JSON would make them 174,738.
- **Tests written first, all red:**
  - `tests/test_tracer.py::test_fixtures_are_stored_as_compact_json`
  - `scripts/bundle-size.test.mjs`, run by `scripts/check-all.sh` after every
    build: the main JS is under 500 kB, and all fixtures together are under
    200 kB
- **Fix:** `gen_fixtures.py` writes compact JSON; `gen_fixtures.py --all`
  regenerated all nine fixtures. The data is unchanged (`--check` and every
  fixture test pass).
- **Result:** main JS 723,835 → 416,404 bytes; Vite's chunk-size warning is
  gone. The fixtures are no longer readable by eye; use
  `python -m json.tool shared/fixtures/<name>.json` to read one.
- **Checks:** all green (194 pytest, 111 node tests, 37 vitest, 2 bundle-size
  tests, typecheck, build).

## Next round: LeetCode practice, counterexamples, AI help

Decisions (2026-10-24):
- Use Gemini instead of Claude, for its free tier.
- Use the real LeetCode problem names and formats (`class Solution`), with
  statements in our own words.
- The BFS lesson becomes "Find if Path Exists in Graph".
- Drop the "no online judging" non-goal.
- Save sessions in this browser only.

| Stage | Goal | Status |
|---|---|---|
| 7 | Swap Claude for Gemini in `/api/explain` | done |
| 8 | Pages and navigation, glassy iOS-style UI | done |
| 9 | LeetCode problems with reference solutions | 9a done (Python); 9b UI todo |
| 10 | Counterexample search in Pyodide | todo |
| 11 | Three-level AI help (hint, explanation, possible fix) | todo |
| 12 | Mistake categories and saved sessions | todo |
| 13 | Live Gemini test | paused: needs your Gemini key |

### Stage 7: Claude → Gemini
- **Docs checked first:** Google's quickstart, text generation and models pages,
  and the installed SDK's type definitions.
- **SDK:** `@google/genai` 2.31.0 (exact pin) replaces `@anthropic-ai/sdk` in
  `api/package.json`.
- **Tests rewritten first, run red** (the module could not load):
  - the request: `gemini-3.5-flash-lite`, the system instruction, a small
    `max_output_tokens`, `thinking_level: "minimal"`, `store: false`
  - `geminiComplete`: passes `timeout_ms` and the abort signal, reads
    `output_text`
  - unfinished interactions (`incomplete`, `failed`, `cancelled`,
    `budget_exceeded`, `requires_action`) fall back to the template
  - the key comes from `GEMINI_API_KEY`, never `ANTHROPIC_API_KEY`
  - `package.json` pins the Gemini SDK and no longer lists Anthropic's
- **Code:** only the provider seam in `api/explain.ts` changed. The number
  check, caps, cache, rate limit, 5 s deadline and no-logging rule are
  untouched. The real `GoogleGenAI` client type-checks against our interface
  with no cast.
- **Checks:** all green (33 API tests). The live call is untested until a key
  is set (stage 13).

### Stage 8: pages, navigation, glassy iOS-style look
- **Tests written first** (`router.test.ts`, `problems.test.ts`,
  `Shell.test.tsx`), run red (modules missing), then made green:
  - hash routes `#/`, `#/problems`, `#/problems/<slug>`, `#/playground`, and
    not-found, round-tripping
  - the six problems with LeetCode's exact names, numbers, slugs, difficulty
    and `class Solution` signatures; statements in English and Spanish
  - shell: a nav labeled "Main" with Home / Problems / Your code;
    `aria-current="page"`; page titles; focus moves to the new page's `h1`;
    problem page with statement and signature; friendly not-found; the
    playground keeps the visualizer; axe on every page
- **Test fixes, stated:**
  - In jsdom the hash changes a moment after a click, so the helper waits for
    the browser's own `hashchange`.
  - Setup uses `history.replaceState` so a late `hashchange` can't leak into
    the next test.
  - The playground acceptance tests now start at `#/playground`.
- **Look:** frosted glass panels and header (`backdrop-filter`) over a soft
  gradient, pill buttons and nav, SF system font, light and dark. It falls back
  to solid panels for reduced transparency, forced colors, and browsers
  without blur. On narrow screens the header becomes a rounded card.
- **Contrast:** axe can't measure text on glass over a gradient, so
  `theme.test.ts` computes WCAG contrast for every text color against every
  gradient stop, on the page and through glass, in light and dark (16 checks).
  A mutation check proved it fails on a low-contrast color.
- **Browser sweep** (axe with contrast, 375 px, light and dark, every page):
  one violation, the signature box was unreachable by keyboard. Red test first,
  then fixed with `scrollBox`. After the fix: 0 violations and no sideways
  scroll in either theme.
- **Docs:** plan and steering now say LeetCode's names with our own words,
  and the "no online judging" non-goal is replaced by "no hidden tests, scores
  or leaderboards". New features 12-17 are listed.
- **Checks:** all green (194 pytest, 111 node tests, 68 vitest, typecheck,
  build, bundle size).

### Stage 9a: practice harness (Python)
- **Tests written first** (`tests/test_practice.py`, 17 tests), run red (no
  `practice` module), then made green:
  - the six problems' data and reference files; slugs and method names match
    `frontend/src/problems.ts`
  - every reference solution gives every expected answer (our own examples,
    worked out by hand)
  - the visible driver appended after the student's code; tree inputs built
    from level-order lists
  - the hidden prelude: never a prelude line in the trace, its names never in
    locals, its `TreeNode`s visible in the heap
  - `Solution.method` runs as its own frame (depth 1, stack of 2)
  - LeetCode annotations (`List[int]`) and `deque` work without imports
  - errors are results, not crashes (IndexError, missing method, no class); a
    runaway loop stops at the line budget
  - answer rules: Two Sum in any order, Two Sum II smaller first, real bools
    and ints only, never calling a student `__eq__`
  - reference fixtures match fresh traces
- **Test fix, stated:** I first expected only `TreeNode` in the heap, but the
  `Solution` object is correctly there too (`self` inside the method). The UI
  will hide a field-less `self`.
- **Bug found by testing:** a submission with no `class Solution` raised
  `KeyError`; it now reports `NameError` like Python would.
- **Code:**
  - `tracer.trace(source, prelude=...)` runs the prelude untraced and hides its
    names (identity check)
  - `frontend/src/py/practice.py`: program, trace, run, compare
  - `shared/practice/`: `problems.json` and six reference solutions
  - `gen_fixtures.py` writes and checks `shared/fixtures/practice/*.json`
- **Checks:** all green (211 pytest).
