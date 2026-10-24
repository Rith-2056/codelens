# Tasks: ds-visualizers

- [x] 1. Land the contract (integrator), done 2026-10-24
  - `frontend/src/types/trace.ts` defines the tagged forms (`SetValue`, `DictValue`, `DequeValue`, `RefValue`), `HeapObject`, `StackFrame`, and `heap` / `stack` on `TraceStep`. `JsonValue` is unchanged, because the tagged forms already fit its object member.
  - `.kiro/steering/tech.md` marks the contract FROZEN with the version note 2026-10-24.
  - `shared/fixtures/loop.json` has `heap: {}` and `stack: []` on every step.
  - `npm run typecheck` passes.
  - Left for task 2: the tracer still emits the old shape, so the two loop-fixture tests in `tests/test_tracer.py` fail until then.
  - _Requirements: 1.1–1.5_

- [ ] 2. Emit the new value forms, heap, and stack from the tracer (trace-engineer)
  - Write lists and tuples as arrays, dicts as `__dict`, sets as `__set` (sorted when possible), and deques as `__deque`. Write student-defined objects as `__ref` into `heap`, with deterministic ids and the safety check from design.md.
  - Fill `stack` (calling frames, outermost first, current frame excluded) and `heap` on every step.
  - Set MAX_STEPS = 2000, MAX_ITEMS = 20, MAX_NEST_DEPTH = 4, MAX_HEAP_OBJECTS = 60, and TRACE_BYTE_CAP. Make the limit message state the real step count, and extend the step byte cap fallback.
  - Tests:
    - each value form, nesting and cycle caps, int dict keys, heap id stability, shared refs, hash-seed-independent set order, hostile classes, stack order, each cap and `truncated`, and `while True` limit under 2 s
    - update the Hypothesis properties (a)–(e) and add "every ref resolves"
    - the two failing loop-fixture tests pass again
  - _Requirements: 2.1–2.7, 3.1–3.6, 8.1_

- [ ] 3. Add the Level 2 lessons and regenerate all fixtures (trace-engineer, ui-builder)
  - trace-engineer:
    - Add the six sources from design.md to `gen_fixtures.py`.
    - Regenerate `branch.json` and `function.json` (now with `heap`/`stack`) and add the six Level 2 fixtures. Confirm `loop.json` matches tracer output.
    - Extend `pyodide-check.mjs` to all nine lessons, with CPython parity and per-lesson timing.
  - ui-builder: add the same sources byte for byte to `lessons.ts`, with `level`, `pattern`, and the en/es statements. Group the picker by Level 1 and Level 2 and show the statement.
  - _Requirements: 4.1–4.5, 7.4, 8.2_

- [ ] 4. Shared value helpers and structure-change explanations (explainer)
  - Add `frontend/src/explain/snapshot.ts` (`kindOf`, `resolveRef`, `describeShort`, `diffValue`, `diffHeap`) for both the explainer and the UI.
  - Move the existing value formatting and templates to the tagged forms. Add the new en/es cases: dict, set, array item, deque, heap field, and recursive call and return.
  - Extend `inventedNumbers` sources to heap fields and stack locals. Update `/api/explain` to send `heap`/`stack` within the payload cap.
  - Tests: every new case in both languages, each helper per kind, and the number check across all nine fixtures.
  - _Requirements: 5.1–5.3_

- [ ] 5. Move the UI to the new value forms and add the call stack (ui-builder)
  - Render tagged values and refs in Variables, Arrays, and change markers using `snapshot.ts`. Mark names that share a heap object as "same object as `x`".
  - Add the Data structures panel and the fallback view.
  - Add the CallStack visualizer with a text alternative.
  - Merge together with tasks 2–4, so raw tags never reach the screen.
  - _Requirements: 6.1, 6.2, 6.4, 7.1_

- [ ] 6. Hash map, set, queue, and array pointer visualizers (ui-builder)
  - Build HashMap (`__dict`), Set (`__set`), and Queue (`__deque`), and add pointer markers (including "used by next line") to array cells, using the detection rules in design.md.
  - Text change markers come from `diffValue`. Detection rules get `node --test` coverage.
  - _Requirements: 6.1–6.3, 7.1–7.3_

- [ ] 7. Graph and tree visualizers (ui-builder)
  - Build Graph (adjacency `__dict`, circular layout, visited / in queue / current badges) and Tree (heap objects with `left`/`right`, layered layout, badges for nodes referenced by the current locals or the stack). Each has a text alternative.
  - The narrator adds the step's top structure change. Respect `prefers-reduced-motion`.
  - _Requirements: 6.1–6.3, 7.1–7.3_

- [ ] 8. Acceptance, accessibility, and performance pass (all)
  - In the browser, run the Level 2 acceptance tests in `docs/plan.md`, plus `while True: pass` → limit under 2 s at MAX_STEPS = 2000 in Pyodide.
  - Check keyboard-only use, screen-reader narration of structure changes, 375 px width, and that every Level 2 lesson traces in under 1 s in Pyodide.
  - Run `.venv/bin/pytest`, the `node --test` suites, `npm run typecheck`, and `npm run build`.
  - _Requirements: 3.3, 7.1–7.4, 8.3_
