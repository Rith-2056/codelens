# Tasks: ds-visualizers

- [ ] 1. Land contract v2 (integrator)
  - Add `Ref`, `ObjectSnapshot`, `StackFrame`, `objects`, `stack`, and `version: 2` to `frontend/src/types/trace.ts`, exactly as in design.md.
  - In the same change, add `version: 2` to the timeout result in `frontend/src/worker/traceClient.ts` (coordinate with trace-engineer) so the contract-guard hook's typecheck passes.
  - Move the contract in `.kiro/steering/tech.md` and `docs/plan.md` from "planned" to "current".
  - _Requirements: 1.1–1.4_

- [ ] 2. Snapshot objects, stack, and new limits in the tracer (trace-engineer)
  - Implement the object table, deterministic ids, refs, kinds (list, tuple, dict, set, frozenset, deque, student objects), set ordering, cycle handling, and the safety check from design.md.
  - Record `stack` on every step and add `version: 2` to results.
  - Set MAX_STEPS = 2000, MAX_ITEMS = 20, MAX_OBJECTS = 60, and TRACE_BYTE_CAP. Make the limit message state the real step count, and extend the step byte cap fallback.
  - Tests: every kind, aliasing, cycles, id stability, hash-seed independence, hostile classes, each cap and `truncated`, and `while True` limit under 2 s. Update the Hypothesis properties (a)–(e) for v2 and add "every ref resolves".
  - _Requirements: 2.1–2.7, 3.1–3.6, 8.1_

- [ ] 3. Add the Level 2 lessons and regenerate all fixtures (trace-engineer, ui-builder)
  - trace-engineer: add the six sources from design.md to `gen_fixtures.py` and generate v2 fixtures for all nine lessons (Level 1 fixtures change too, because lists become refs). Extend `pyodide-check.mjs` to all nine with CPython parity and per-lesson timing.
  - ui-builder: add the same sources byte for byte to `lessons.ts`, with `level`, `pattern`, and the en/es statements. Group the picker by Level 1 and Level 2 and show the statement.
  - _Requirements: 4.1–4.5, 7.4, 8.2_

- [ ] 4. Shared object helpers and structure-change explanations (explainer)
  - Add `frontend/src/explain/objects.ts` (`isRef`, `resolve`, `describeShort`, `diffObjects`) for both the explainer and the UI.
  - Move the existing templates to v2 values. Add the new en/es cases (dict, set, list item, deque, object field, recursive call and return).
  - Extend `inventedNumbers` sources to objects and stack. Update `/api/explain` to send `objects`/`stack` within the payload cap.
  - Tests: every new case in both languages, `diffObjects` per kind, and the number check across all nine fixtures.
  - _Requirements: 5.1–5.3_

- [ ] 5. Move the UI to v2 and add the call stack (ui-builder)
  - Resolve refs in Variables, Arrays, and change markers using `objects.ts`. Mark aliases as "same object as `x`".
  - Add the Data structures panel and the fallback view.
  - Add the CallStack visualizer with a text alternative.
  - _Requirements: 6.1, 6.2, 6.4, 7.1_

- [ ] 6. Hash map, set, queue, and array pointer visualizers (ui-builder)
  - Build HashMap, Set, and Queue, and add pointer markers (including "used by next line") to array cells, using the detection rules in design.md.
  - Text change markers come from `diffObjects`. Detection rules get `node --test` coverage.
  - _Requirements: 6.1–6.3, 7.1–7.3_

- [ ] 7. Graph and tree visualizers (ui-builder)
  - Build Graph (circular layout, visited / in queue / current badges) and Tree (layered layout, badges for nodes referenced by the current frame or the stack). Each has a text alternative.
  - The narrator adds the step's top structure change. Respect `prefers-reduced-motion`.
  - _Requirements: 6.1–6.3, 7.1–7.3_

- [ ] 8. Acceptance, accessibility, and performance pass (all)
  - In the browser, run the Level 2 acceptance tests in `docs/plan.md`, plus `while True: pass` → limit under 2 s at MAX_STEPS = 2000 in Pyodide.
  - Check keyboard-only use, screen-reader narration of structure changes, 375 px width, and that every Level 2 lesson traces in under 1 s in Pyodide.
  - Run `.venv/bin/pytest`, the `node --test` suites, `npm run typecheck`, and `npm run build`.
  - _Requirements: 3.3, 7.1–7.4, 8.3_
