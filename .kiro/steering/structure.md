# Structure

## Folder layout
```
codelens/
  .kiro/steering/   .kiro/specs/   .kiro/hooks/
  docs/plan.md
  frontend/src/components/   (Editor, CodeView, highlight.ts, StepViewer, DataStructures, Arrays, CallStack, Explanation, Narrator)
  frontend/src/visualizer/   (CodeVisualizer, ControlBar, ArrayStage, ChangeList, focus.ts: pattern, context, variables, cells)
  shared/practice/           (problems.json + one reference solution per problem; see steering/problems.md)
  frontend/src/components/visualizers/   (HashMap, Set, Queue, Graph, Tree, CallStack)
  frontend/src/worker/trace.worker.ts  traceClient.ts
  frontend/src/py/tracer.py  gen_fixtures.py
  frontend/src/types/trace.ts      (FROZEN contract)
  frontend/src/App.tsx  router.ts  (app shell and hash routes)
  frontend/src/pages/              (Home, ProblemList, ProblemPage, Playground)
  frontend/src/problems.ts         (the LeetCode practice problems)
  frontend/src/lessons.ts          (playground examples)
  frontend/src/explain/            (deterministic templates, en + es; client.ts)
  api/explain.ts
  shared/fixtures/*.json           (precomputed traces, one per lesson)
  tests/test_tracer.py  tests/test_tracer_properties.py
  README.md  KIRO_USAGE.md  LICENSE
```

## Specs
- `trace-engine`: tracer, worker, Pyodide check (v1, done)
- `timeline-ui`: step viewer, editor, state machine, explanation panel (done)
- `explain-service`: templates, `/api/explain`, client (done)
- `ds-visualizers`: tracer for the 2026-10-24 contract, Level 2 lessons, data-structure visualizers

## Workstreams and file ownership
Each workstream edits only its own folders. The frozen contract in
`frontend/src/types/trace.ts` is owned solely by the integrator; everyone else
imports it read-only.

- **trace-engineer** may edit:
  - `frontend/src/py/`
  - `frontend/src/worker/`
  - `tests/`
  - `shared/fixtures/`

- **ui-builder** may edit:
  - `frontend/src/components/` (including `visualizers/`)
  - `frontend/src/App.tsx`
  - `frontend/src/lessons.ts`
  - styles

- **explainer** may edit:
  - `frontend/src/explain/`
  - `api/`

- **integrator (human)** may edit:
  - `frontend/src/types/trace.ts` (the FROZEN contract — owner)
  - merges across workstreams
  - deploy, `README.md`, `KIRO_USAGE.md`

## Rules
- Do not edit files outside your workstream's listed folders.
- Treat `frontend/src/types/trace.ts` as read-only unless you are the
  integrator.
- The playground examples exist in two places that must match byte for byte
  (the fixture `codeHash` depends on it): `frontend/src/lessons.ts` and
  `frontend/src/py/gen_fixtures.py`. Change both together. `gen_fixtures.py`
  also keeps the six earlier Level 2 scripts as test data only; they are not
  shown in the app.
- Practice problems: metadata and statements in `frontend/src/problems.ts`;
  parameters, examples and reference solutions in `shared/practice/`, read by
  both the UI and `frontend/src/py/practice.py`.
- Practice problems use LeetCode's real titles, numbers and method signatures;
  problem statements and examples are written by us. Never copy LeetCode's
  problem text or examples.
- `.kiro` lives at the repo root and must never be added to `.gitignore`.
- No server-side execution of student code; Python only runs client-side in the
  Web Worker.

## Schedule gates
- Mocked end-to-end (fixture traces in UI) by 12:30
- Real Pyodide traces for all 3 lessons + preview deploy by 2:30
- Predict, error explainer, narrator, explanations by 4:00
- Feature freeze 5:00; video and write-up 5:00–6:15; submit by 7:45
