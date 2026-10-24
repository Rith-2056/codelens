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
| 9 | LeetCode problems with reference solutions | done |
| 10 | Counterexample search in Pyodide | done |
| 11 | Three-level AI help (hint, explanation, possible fix) | done (live Gemini wording checked in stage 13) |
| 12 | Mistake categories and saved sessions | done |
| 13 | Live Gemini test | done |
| 14 | Side-by-side workspace, syntax colors, new palette and fonts | done |
| 15 | Code Visualizer mode (focused debugger view) | done |
| 16 | Your feedback, then a full UX review | in progress |

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

### Stage 9b-1: practice requests through the Pyodide worker
- **Tests written first:**
  - `practice.check` / `check_json` / `trace_example_json` (5 pytest)
  - `traceClient.test.ts` with a fake Worker (7 vitest): request shapes, one
    request at a time, timeouts that resolve and start a fresh worker
  - a practice section in `pyodide-check.mjs` that loads the harness exactly
    like the worker
- **Bug found by the real-Pyodide check:** Pyodide 0.29 passes JavaScript
  `null` to Python as a `JsNull` object, not `None`, so "trace the reference"
  crashed. Red test first (any non-string source means the reference), then
  fixed.
- **Also fixed:**
  - `practice.py`'s default data path assumed the repo layout; it now falls
    back to `./practice` next to the file, the worker layout
  - the Pyodide mirror lacked `practice.py`, which `gen_fixtures` now imports
  - two check-script mistakes: a diff helper called on equal values, and
    comparing JSON text where key order differs (now deep equality)
- **Flaky test fixed, stated:** the stuck-trace test advanced fake timers
  before the async code hash finished, so the timeout timer did not exist yet.
  It now waits for the request to be posted. 74/74 on six runs in a row.
- **Code:**
  - `protocol.ts`: `trace` / `practice-trace` / `practice-check` requests
  - `traceClient.ts`: one generic request path; `tracePractice()` and
    `checkPractice()`
  - `trace.worker.ts`: loads `practice.py` and the problem data
- **Pyodide:** reference traces equal CPython and the fixtures for all six
  problems (each under 7 ms); a wrong answer is flagged; a runaway loop stops
  in about 4 ms.
- **Checks:** all green (216 pytest, 111 node tests, 74 vitest, typecheck,
  build, bundle size, Pyodide check).

### Stage 9b-2: the problem page
- **Tests written first**, run red, then made green:
  - `practiceView.test.ts` (4): hide a field-less Solution `self`; format
    inputs as Python; plain-words verdicts (correct / wrong with both answers /
    error / runaway)
  - `ProblemPage.test.tsx` (10): starter `class Solution` stub; our three
    examples as buttons; Run checks and traces the chosen example; wrong-answer
    message; the correct solution is hidden until asked (example 1 from the
    lazy fixture, others traced by Python); arrow keys step only the focused
    viewer; `self` is hidden; editing clears the result; axe with both runs
    showing
- **Found by the axe test:**
  - Two viewers duplicated landmarks ("Data structures", "Call stack",
    "Program code"). The inner panels are now labeled groups, and so are the
    scroll boxes (stage 3 had made them regions; two tests updated, reason
    stated).
  - Fixed ids (`ds-heading`, `step-scrubber`, ...) are now per-instance
    `useId`.
- **Test fixes, stated:** the axe test wraps the page in `<main>` like the app
  shell does.
- **Test timeout:** raised to 20 s. The machine's load average hit 45 from
  system processes, and the whole-app tests took up to 142 s during one run.
  They pass in about 2 s normally, and 20 s still catches a real hang. The
  next runs were green.
- **Code:**
  - `StepViewer` (a run you can step through, keys scoped to the viewer)
  - `ProblemPage` (editor, examples, Run, verdict, opt-in correct solution side
    by side)
  - `Timeline`'s `globalKeys` option
  - problem params and examples read from `shared/practice/problems.json`
- **Real browser + Pyodide:** a wrong Two Sum (adds a number to itself) gives
  "Not yet: your solution returned [0, 0], but the correct answer is [2, 3]."
  in 0.86 s, and both runs show side by side. axe with contrast: 0 violations
  in light and dark; no sideways scroll at 400 px.
- **Noticed, not fixed:** at very narrow widths, long code lines in the editor
  wrap and push the line numbers out of step (from wave 2).
- **Checks:** all green (216 pytest, 111 node tests, 88 vitest, typecheck,
  build, bundle size).

### Stage 9b-3: LeetCode names everywhere
- **Tests written first:**
  - the playground offers only Loop / Branch / Function, and no old Level 2
    names appear (red: they were still there)
  - the six Level 2 acceptance tests move to the problem pages, checking the
    correct-solution viewer step by step with exact sequences from the real
    reference runs
- **Test fix, stated:** in Climbing Stairs, `ways` lives inside the method, so
  the test reads its last value while the method runs, not at the final module
  step.
- **Code:**
  - `lessons.ts` keeps only the three Level 1 examples
  - the six old Level 2 scripts stay in `gen_fixtures.py` as test data
  - `plan.md` acceptance tests and the structure rules are updated
- **Bundle:** main JS 416 KB → 263 KB; each problem's reference run is its own
  lazy chunk (11-85 KB).
- **Checks:** all green (216 pytest, 111 node tests, 91 vitest, typecheck,
  build, bundle size).

### Stage 10: counterexample search
- **Tests written first** (`tests/test_counterexample.py`, 22), run red, then
  made green:
  - every reference solution has no counterexample, and the search really
    checks every candidate
  - every candidate input is valid within LeetCode's rules (the reference
    accepts it) and sorted smallest first
  - six planted beginner bugs, each found at its smallest possible input,
    with nothing smaller failing:
    - Climbing Stairs off-by-one loop → `n = 2`
    - Two Sum using one element twice → a 2-number list, `[0, 0]`
    - Contains Duplicate checking only neighbours → a 3-number list
    - Two Sum II returning 0-based indices → a 2-number list
    - a path search that forgets edges go both ways → `n = 2`
    - max depth counting edges, not nodes → the one-node tree
  - crashes and runaway loops count as counterexamples; the search is
    deterministic; it respects its time budget
- **Test fix, stated:** the time-budget test used a slow exponential
  `climbStairs`. That gets flagged by the line budget at about n = 18 (like
  LeetCode's "time limit exceeded") before a 0.05 s deadline, so the test uses
  a 2 ms budget. The runaway message now also mentions "a lot of repeated
  work".
- **Client and UI tests first** (8, red, then green):
  - `findCounterexample` request and timeout
  - Submit: shows the failing input and steps through it; reports crashes;
    "Accepted" with the counts; honest when time ran out; falls back to a
    failing example; explains a timed-out search
- **Code:**
  - `practice.py`: per-problem input generators (two-sum 423, two-sum-ii 325,
    path 169, duplicates 120, tree shapes 23, stairs 20) and
    `find_counterexample` with a 1.5 s budget
  - worker request `practice-counterexample`; `findCounterexample()`
  - Submit button and a "Failing input" chip on the problem page
- **Pyodide:** the planted bug is found on the 2nd input; full searches of the
  correct references take 11-251 ms.
- **Real browser:** the "uses one element twice" Two Sum is caught with
  `nums = [0, 0], target = 0` in 0.5 s; a correct solution is accepted after
  423 small inputs and 3 examples in 0.7 s.
- **Checks:** all green (238 pytest, 111 node tests, 99 vitest, typecheck,
  build, bundle size, Pyodide check).

### Stage 11: three levels of AI help
- **Tests written first:**
  - `frontend/src/explain/help.test.mjs` (8): offline templates for every level
    in English and Spanish, crash and runaway wording, the number allow-list,
    and a client that never rejects
  - `api/help.test.mjs` (10, all with a fake Gemini):
    - template when there's no key, and Gemini is then never called
    - prompt contents; student text can't close the data tag
    - levels 1-2 reject code, level 3 may show a small fix
    - invented numbers are rejected; unfinished, too-long or `USE_TEMPLATE`
      replies, errors and timeouts all fall back
    - 405/413/400, 429 with the template; `store: false`; never logs
  - `ProblemPage.test.tsx` (+6): help appears only after a wrong answer, one
    level at a time (hint → what went wrong → possible fix); exact request
    contents; Spanish; level 3 code renders as a code block; resets on edit;
    uses Submit's failing input, including crashes
- **Test fix, stated:** my "invented number" example used 7, but the sample
  code has 7 lines, so 7 is a valid line number. It now uses 42.
- **Code:**
  - `frontend/src/explain/help.ts` (types, templates, allow-list, client)
  - `api/help.ts` (Gemini `gemini-3.8-flash`, 12 s, reply checks)
  - shared helpers exported from `api/explain.ts`
  - `HelpPanel` on the problem page
  - `check-all.sh` runs every `api/*.test.mjs`
- **Real browser (offline AI):** an off-by-one Climbing Stairs is caught at
  `n = 2`, and all three built-in help levels appear in order; axe finds 0
  violations.
- **Checks:** all green (238 pytest, 129 node tests, 105 vitest, typecheck,
  build, bundle size).

### Stage 12: mistake categories and saved sessions
- **Tests written first** (all red at first):
  - `mistakes.test.ts` (11): the planted bugs from stage 10 with their real
    counterexamples, each labeled:
    - off-by-one: `range(2, n)`, 0-based positions, counting edges, an
      IndexError, `<` vs `<=`
    - incorrect pointer variables: one element used twice
    - missed edge case: a crash on a one-item list or an empty tree
    - loop never ends
    - logic mistake for the rest
  - `sessions.test.ts` (5): newest first, capped at 200, survives junk or
    missing or throwing storage, clear, counts by category
  - `ProblemPage.test.tsx` (+3): "Likely mistake" note; Submit saves wrong and
    accepted attempts; Run does not save
  - `SessionsPage.test.tsx` (5): empty state that says data stays in this
    browser; list and per-kind counts; "Open in editor" loads the saved code;
    clear after confirming; axe
  - `router.test.ts`: the `#/sessions` route
  - `Shell.test.tsx`: the nav now has 4 links (test updated for the new page)
- **Code:**
  - `components/mistakes.ts`: deterministic rules, using the answers, the
    input, and loop bounds compared with the reference solution
  - `sessions.ts`: browser storage only, never throws
  - `pages/SessionsPage.tsx`, the "My sessions" nav link, the "Likely
    mistake" note on the problem page
- **Real browser + Pyodide:** three real buggy submissions were found,
  labeled (off-by-one, incorrect pointer variables, off-by-one) and saved; My
  sessions showed "Off-by-one error: 2, Incorrect pointer variables: 1"; axe
  found 0 violations. The test sessions were then removed from the browser.
- **Checks:** all green (238 pytest, 129 node tests, 129 vitest, typecheck,
  build, bundle size).

### Stage 13: live Gemini test
The key is kept in a private file outside the repo (mode 600), passed to
commands without being printed, and never written to any project file or the
browser bundle. Recommendation: rotate it, since it was pasted into chat.

- **Live checks first:** `api/live.check.mjs`, skipped without a key and kept
  out of the pre-commit hook on purpose (it costs quota):
  - both models answer
  - `/api/explain` returns tutor text for a real loop step
  - `/api/help` returns tutor text at all three levels for a real off-by-one
    bug
- **What the first live run found:**
  - The help model `gemini-3.8-flash` took **165.8 s** for one sentence. The
    SDK's default retries kept a timed-out call going long after the
    endpoint's 12 s deadline had already sent the student the template.
    Diagnosis with retries off: 3.8-flash timed out at 20 s, and it rejects
    `thinking_level: "minimal"` with a 400. `gemini-3.6-flash` answered in
    about 3 s.
  - My live check never asserted the 12 s limit (fixed).
  - `gemini-3.5-flash-lite` latency varied from 0.9 to 5.9 s, often over the
    5 s explain budget. `gemini-3.6-flash` with minimal thinking took 1.1-1.4 s.
  - Level 3 was sometimes rejected, but nothing showed why.
- **Fixes, unit tests first (red, then green):**
  - every Gemini call sets `retries: { strategy: "none" }`
  - both endpoints use `gemini-3.6-flash` (help: low thinking; explain:
    minimal)
  - `/api/help` takes an `onReject` hook that reports reason codes only
    (`timeout`, `invented-numbers`, `error:429`, ...); production leaves it
    unset, so nothing is logged
  - the help prompt asks for plain text (no LaTeX: one reply wrote `$n$`)
  - inline `` `code` `` in help shows as code
- **Live results after the fixes:**
  - `/api/explain`: tutor text in 1.0 s ("Line 4 just finished running and
    updated total from 0 to 3. Now the program is going back to line 3, which
    is the next line to run.")
  - `/api/help`: all three levels from the tutor in 2.0-3.4 s each. Level 1
    hints at the loop's upper bound; level 2 explains that `range(2, 2)` never
    runs; level 3 shows only `for i in range(2, n + 1):`.
- **Free-tier quota (blocking):** `gemini-3.6-flash` allows only **20
  requests per day** on the free tier ("Rate limit exceeded ... limit: 20
  requests per day on Free Tier"). Our testing used it up. The app handled it
  as designed: 429 → built-in text in about 0.3 s. Both lite models still had
  quota (`gemini-3.1-flash-lite` answered in 1.1 s). Google doesn't publish
  free-tier limits per model; they are shown in AI Studio.
- **Dev server API, tests first** (`frontend/dev/apiDevServer.test.mjs`, 5):
  a dev-only Vite plugin serves `/api/explain` and `/api/help` from the real
  handlers. The key comes from the dev server's environment, never the
  bundle. Verified in the browser: requests reach the handlers (200), but the
  answers were the built-in text because of the quota.
- **Checks:** all green (pre-commit suite; the live checks run separately).

#### Stage 13 follow-up: models split for the free tier (your decision)
- Per-step explanations now use `gemini-3.1-flash-lite`, which has its own
  free-tier quota. The three help levels keep `gemini-3.6-flash` (20 free
  requests a day; help is asked for far less often than step explanations).
- Test first: the model test was changed and failed (red), then `MODEL` was
  switched (green, 45 API tests).
- Live (explain checks only, so no 3.6-flash quota was spent): the model
  answered in 1.1 s and `/api/explain` in 1.8 s with tutor text ("The total
  variable has been updated to 3 because we added the first number from the
  list...").

### Stage 14: side-by-side workspace, syntax colors, new look
Your feedback: the editor was bland, stepping meant scrolling down past the
code, and the yellow highlight looked bad. Tests first for each part (red,
then green):
- **Syntax colors** (`components/highlight.ts`, 7 tests): a small Python
  highlighter for keywords (purple, as asked), def and class names, calls,
  built-ins, `self`, strings (including triple-quoted ones across lines),
  numbers, constants and comments. It never changes text: every line's tokens
  join back to the line, checked on every lesson and reference solution.
- **Colored editor and code view** (`SyntaxColors.test.tsx`): the editor is
  still a plain labeled textarea (its text is transparent). A colored copy
  of the code sits under it, hidden from screen readers; forced-colors mode
  falls back to the plain textarea. The step view colors each line and keeps
  the "Next line to run" label. Checked in the browser: the colored layer and
  the textarea have the same box, padding and font.
- **Layout** (problem page tests, `layout.test.ts`): four panels like your
  sketch. On screens at least 1000 px wide: the problem (top left) and the
  step-through (bottom left), the code (top right) and the tests (bottom
  right). They fit the window, and each panel scrolls on its own. After Run,
  the code panel shows the run's code with the next line marked, next to the
  step controls; Edit code brings the editor back. The correct solution no
  longer sits beside yours: a "Your solution / Correct solution" switch
  changes both panels, each run keeps its own step, and the arrow keys step
  the run on screen. Focus moves to the switch when it appears. The DOM order
  (and the phone order) is problem, code, tests, step-through. Your code page
  uses the same layout, with an Output panel.
- **Palette and fonts** (`theme.test.ts`): a dark navy, blue and purple palette
  from your mockup, and a light version. The next line and the current
  call-stack frame are blue (the tests check their hue), not yellow. Every
  syntax color reaches 4.5:1 on the code background and on the highlighted
  line, in both themes. Fonts are Inter and JetBrains Mono, self-hosted
  (`@fontsource-variable`, no font-service request), with code ligatures off
  so `->` looks the way it was typed.
- **Browser check** (1440x900 dark and light, 375 px phone): the panels sit
  side by side without page scroll and stack on a phone with no sideways
  scroll. Run, stepping, the correct-solution switch and the arrow keys
  work. The problem statement panel scrolls when the statement is long.
- **Checks:** all green.

### Stage 15: Code Visualizer mode
Your answers: add two problems so the sliding-window and binary-search views
have something to show, and make the workspace's Step through panel compact.

**15a: two new problems, tests first.** These are 643. Maximum Average
Subarray I (sliding window) and 704. Binary Search, with our own statements
in English and Spanish, our own examples, and reference solutions. Each has a
counterexample generator (324 and 158 small valid inputs). A new comparison
rule, `close`, accepts averages within 1e-5, as LeetCode does; bools and lists
are rejected. Tests plant real bugs: `while left < right` is caught on a
one-number list, and a loop that skips the last window is caught on
`[[-1, 0], 1]`. Both bugs are classed as off-by-one. A first version had
2,930 average inputs and timed out once under load, so I cut the generators
down.

**15b: the Code Visualizer, tests first.**
- **Step logic** (`visualizer/focus.ts`, 17 tests on real traces):
  - which algorithm a run uses: binary search, sliding window, two pointers,
    DP, tree, graph, hash map, plain list or general. This is read from the
    trace and the code, never from the problem, so the Your code page gets it
    too.
  - where a step is: function, recursion depth, the enclosing loop and its pass
  - which list cells a line reads or writes, e.g. `ways[i - 1]` or `nums[:k]`,
    using a small safe evaluator for index expressions
  - each variable grouped (parameters, loop counters, pointers, other) and
    marked changed or relevant
  - what changed, with spoken text that avoids the arrow symbol
- **Control bar** (6 tests):
  - Restart, Previous, Play/Pause, Next, speed (0.5x to 4x), a progress
    slider, and the step's sentence
  - Play stops at the end; stepping by hand pauses it
  - the end buttons stay focusable
- **The visualizer** (13 tests):
  - a full-screen dialog; the page behind it is inert and hidden from screen
    readers; Esc or Exit closes it
  - code on the left: next line marked, syntax colored, "In search() · while
    loop, pass 2" or "call 5 deep (recursion)", and that function's and
    loop's lines labeled
  - a split you can resize (drag, or arrow keys on the divider); the width is
    remembered. A test found the width was never saved: a local variable
    named `window` hid the browser's `window`. Renamed.
  - the visualization on the right: what changed, a large view chosen for the
    algorithm, the variables in focus, and every variable grouped behind a
    collapsed "All variables" section
  - Binary search: `lo`, `mid` and `hi` sit above their cells, and ruled-out
    cells are struck through. Sliding window: a band over the k cells with
    the window's value. DP: the cell just written and the cells it read.
    Recursion: the tree and the call stack side by side. Graph: the graph and
    the queue.
  - pointer labels glide and changed cells pop, but only when reduced motion
    is not requested
  - per-step AI explanations are off by default (an "AI explanation" toggle),
    which saves the free-tier quota
- **Pages:**
  - the code panel has an "Open Code Visualizer" button. Before any run it
    runs the chosen example first. Exit returns to the same step, with focus
    back on the button.
  - the correct solution's run opens with the switch in the visualizer's
    header
  - the workspace's Step through panel is compact: the control bar, what
    changed, and a link to the visualizer
  - the old step widgets (Timeline, Scrubber, Jump to a change, Variables
    table) are removed. "Jump to a change of a variable" is gone for now.
- **Acceptance tests moved into the visualizer:** the hash map growing, the
  set growing, pointers moving inward, the graph, queue and visited marks, the
  tree with the call stack 6 deep, and the DP list filling. axe finds no
  violations on a problem and on the Your code page with the visualizer open.
- **Browser check** (1440x900 dark, 375 px phone): binary search, sliding
  window, DP and recursion as described above. Exit keeps the step. On a
  phone the code sits above the visualization and the control bar is
  compact. Two fixes came from this check: the next-line label no longer
  covers long lines, and the tree's text outline is hidden on screen (screen
  readers still get it).
- **Checks:** all green.

### Stage 16: your feedback, then a full UX review
**16a: code is never lost, tests first.** In the browser, the code survived
Run → visualizer → Exit → Edit code. But leaving a page (or reloading) reset
both the problem page and Your code to the starter code: nothing saved it.
Now each page's code is saved in this browser as you type (`drafts.ts`, the
same local-only, never-throws approach as saved sessions). A problem goes back
to its stub only if you never changed it. On Your code, the lesson you started
from is restored too. Tests: leaving and returning keeps the code on both
pages; each problem keeps its own; the code survives Run, the visualizer and
Edit code; junk, oversized or blocked storage is ignored.

**16b: runs open at your first real line, tests first.** A run used to open
at `class Solution:`, then took several steps through class and def setup
before reaching your code. Now a problem's run opens at the first line inside
your method (`seen = {}` / `count = {}`). On Your code, a run opens at the
first line that is not def, class, import or a comment. Restart (and Play
from the end) returns there. The setup steps are still one Previous away.
Tests: the step logic on real traces (with fallbacks), the control bar's
Restart, the problem page (steps panel and visualizer open on line 3), and
the Your code lesson opening on line 1.
