# Tasks: ds-visualizers

- [x] 1. Land the contract (integrator), done 2026-10-24
  - `frontend/src/types/trace.ts` defines the tagged forms (`SetValue`, `DictValue`, `DequeValue`, `RefValue`), `HeapObject`, `StackFrame`, and `heap` / `stack` on `TraceStep`. `JsonValue` is unchanged, because the tagged forms already fit its object member.
  - `.kiro/steering/tech.md` marks the contract FROZEN with the version note 2026-10-24.
  - `shared/fixtures/loop.json` has `heap: {}` and `stack: []` on every step.
  - `npm run typecheck` passes.
  - Left for task 2: the tracer still emits the old shape, so the two loop-fixture tests in `tests/test_tracer.py` fail until then.
  - _Requirements: 1.1–1.5_

- [x] 2. Emit the new value forms, heap, and stack from the tracer (trace-engineer)
  - Write lists and tuples as arrays, dicts as `__dict`, sets as `__set` (sorted when possible), and deques as `__deque`. Write student-defined objects as `__ref` into `heap`, with deterministic ids and the safety check from design.md.
  - Fill `stack` (every active user frame, outermost first, current frame last) and `heap` on every step.
  - Set MAX_STEPS = 2000, MAX_ITEMS = 20, MAX_NEST_DEPTH = 4, MAX_HEAP_OBJECTS = 200, and TRACE_BYTE_CAP. Make the limit message state the real step count, and extend the step byte cap fallback.
  - Tests:
    - each value form, nesting and cycle caps, int dict keys, heap id stability, shared refs, hash-seed-independent set order, hostile classes, stack order, each cap and `truncated`, and `while True` limit under 2 s
    - update the Hypothesis properties (a)–(e) and add "every ref resolves"
    - the two failing loop-fixture tests pass again
  - _Requirements: 2.1–2.7, 3.1–3.6, 8.1_

- [x] 3. Add the Level 2 lessons and regenerate all fixtures (trace-engineer, ui-builder)
  - trace-engineer:
    - Add the six sources from design.md to `gen_fixtures.py`.
    - Regenerate `branch.json` and `function.json` (now with `heap`/`stack`) and add the six Level 2 fixtures. Confirm `loop.json` matches tracer output.
    - Extend `pyodide-check.mjs` to all nine lessons, with CPython parity and per-lesson timing.
  - ui-builder: add the same sources byte for byte to `lessons.ts`, with `level`, `pattern`, and the en/es statements. Group the picker by Level 1 and Level 2 and show the statement.
  - _Requirements: 4.1–4.5, 7.4, 8.2_
  - Note (ui-builder, wave 3): the picker is grouped as "Level 1: How code runs" / "Level 2: Interview patterns" and shows a Level 2 lesson's pattern and statement in the current language. `lessons.ts` itself was written by trace-engineer this wave.

- [x] 4. Shared value helpers and structure-change explanations (explainer)
  - Add `frontend/src/explain/snapshot.ts` (`kindOf`, `resolveRef`, `describeShort`, `diffValue`, `diffHeap`) for both the explainer and the UI.
  - Move the existing value formatting and templates to the tagged forms. Add the new en/es cases: dict, set, array item, deque, heap field, and recursive call and return.
  - Extend `inventedNumbers` sources to heap fields and stack locals. Update `/api/explain` to send `heap`/`stack` within the payload cap.
  - Tests: every new case in both languages, each helper per kind, and the number check across all nine fixtures.
  - _Requirements: 5.1–5.3_
  - Done in wave 3, beyond the text above:
    - `snapshot.ts` also has a `"grid"` kind, `sameValue`, `POINTER_NAMES`, `dictEntries`, `itemsOf`; `describeShort` lives in `describe.ts` and is re-exported from `snapshot.ts`.
    - `explainStep(prev, curr, lang, source?)` and `fetchExplanation(..., { source })`: with the program source, `if/elif/while X in Y` results are explained from prev's snapshot ("need is 7, which is not a key in seen, so it's False and Python skips that block"), and class bodies are no longer called functions. The source is never sent to the server.
    - Pointer moves ("left moved from 0 to 1, so it now points at nums[left], which is 3"), DP cells that name the index only when an int local equals it ("ways[i]" vs "a cell of ways"), and the caller's new value after a return ("back in the earlier call of max_depth, left is now 0").
    - At most two items per line, in a fixed priority: container changes, heap fields, pointer moves, then other variables.
    - `/api/explain` validates `heap`/`stack`, trims the prompt to MAX_PAYLOAD_BYTES (other frames' locals, then other frames, then heap; else template, no LLM call), and rejects replies containing raw tags.
    - Tests: `snapshot.test.mjs`, `structures.test.mjs`, `fixtures.test.mjs` (every step of every fixture, both languages, with and without source), plus additions to `api/explain.test.mjs` and `client.test.mjs`.

- [x] 5. Move the UI to the new value forms and add the call stack (ui-builder)
  - Render tagged values and refs in Variables, Arrays, and change markers using `snapshot.ts`. Mark names that share a heap object as "same object as `x`".
  - Add the Data structures panel and the fallback view.
  - Add the CallStack visualizer with a text alternative.
  - Merge together with tasks 2–4, so raw tags never reach the screen.
  - _Requirements: 6.1, 6.2, 6.4, 7.1_

- [x] 6. Hash map, set, queue, and array pointer visualizers (ui-builder)
  - Build HashMap (`__dict`), Set (`__set`), and Queue (`__deque`), and add pointer markers (including "used by next line") to array cells, using the detection rules in design.md.
  - Text change markers come from `diffValue`. Detection rules get `node --test` coverage.
  - _Requirements: 6.1–6.3, 7.1–7.3_

- [x] 7. Graph and tree visualizers (ui-builder)
  - Build Graph (adjacency `__dict`, circular layout, visited / in queue / current badges) and Tree (heap objects with `left`/`right`, layered layout, badges for nodes referenced by the current locals or the stack). Each has a text alternative.
  - The narrator adds the step's top structure change. Respect `prefers-reduced-motion`.
  - _Requirements: 6.1–6.3, 7.1–7.3_
  - Note (ui-builder, wave 3): partly done. The narrator speaks the top structure change (via the explanation template, with a UI fallback), and `prefers-reduced-motion` turns off any transition. Graph and Tree are not built: the BFS graph shows as a hash map and tree nodes use the object fallback card.
  - Done in TDD stage 2: `graphTree.ts` (logic) and `GraphTreeViews.tsx` (SVG + text version), wired into the Data structures panel. 23 vitest tests, including axe checks.

- [ ] 8. Acceptance, accessibility, and performance pass (all)
  - In the browser, run the Level 2 acceptance tests in `docs/plan.md`, plus `while True: pass` → limit under 2 s at MAX_STEPS = 2000 in Pyodide.
  - Check keyboard-only use, screen-reader narration of structure changes, 375 px width, and that every Level 2 lesson traces in under 1 s in Pyodide.
  - Run `.venv/bin/pytest`, the `node --test` suites, `npm run typecheck`, and `npm run build`.
  - _Requirements: 3.3, 7.1–7.4, 8.3_
  - Note (TDD stage 3): done except a real screen-reader run. `App.test.tsx` covers every acceptance test in docs/plan.md plus axe at the first, middle and last step of all nine lessons (jsdom); a real-browser axe sweep (color contrast on) at 375 px in light and dark found one issue, sideways-scrolling boxes keyboard users could not reach, now fixed. `while True` hits the limit in 30 ms in Pyodide. Still open: test with VoiceOver or NVDA.
