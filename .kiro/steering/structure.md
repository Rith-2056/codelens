# Structure

## Folder layout
```
codelens/
  .kiro/steering/   .kiro/specs/   .kiro/hooks/
  docs/plan.md
  frontend/src/components/   (Editor, Timeline, Variables, Arrays, Explanation, Predict, Narrator)
  frontend/src/worker/trace.worker.ts
  frontend/src/py/tracer.py
  frontend/src/types/trace.ts      (FROZEN contract)
  frontend/src/lessons.ts
  frontend/src/explain/            (deterministic templates, en + es)
  api/explain.ts
  shared/fixtures/*.json           (precomputed traces for the 3 lessons)
  tests/test_tracer.py  tests/test_tracer_properties.py
  README.md  KIRO_USAGE.md  LICENSE
```

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
  - `frontend/src/components/`
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
- `.kiro` lives at the repo root and must never be added to `.gitignore`.
- No server-side execution of student code; Python only runs client-side in the
  Web Worker.

## Schedule gates
- Mocked end-to-end (fixture traces in UI) by 12:30
- Real Pyodide traces for all 3 lessons + preview deploy by 2:30
- Predict, error explainer, narrator, explanations by 4:00
- Feature freeze 5:00; video and write-up 5:00–6:15; submit by 7:45
