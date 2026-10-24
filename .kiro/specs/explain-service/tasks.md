# Tasks: explain-service

Deterministic explanations built from the diff between the previous and current
`TraceStep` (types read-only from `frontend/src/types/trace.ts`).

- [x] 1. Step diff
  - In `frontend/src/explain/`, compute what changed between `prev` (may be undefined) and `curr`: new variables, changed variables (before/after), stdout appended, call/return/exception events.

- [x] 2. English and Spanish templates
  - One or two short, patient sentences per step. Use only values present in `prev`/`curr`; never future values. Say the highlighted line has not run yet.
  - Cover: first step, new variable, changed variable, output printed, function call, return value, error (NameError, TypeError, IndexError, ZeroDivisionError, SyntaxError first, framed as normal and fixable), nothing changed.

- [x] 3. Export `explainStep(prev, curr, lang)`
  - `lang` is `"en" | "es"`. Pure and deterministic: same input gives same output.

- [x] 4. `api/explain.ts` stub
  - Serverless handler stub that returns the deterministic template (no LLM call yet, no key, no logging of code). Leave TODOs for the LLM path, number check, cache key (codeHash + step index + language), payload cap, rate limit and 5 s timeout.

- [x] 5. Tests
  - Tests for every template case in both languages, including the loop lesson (total 0 → 3 → 4 → 6) from `shared/fixtures/loop.json`, and a check that no explanation contains a number absent from `prev`/`curr`.
  - Tests pass; `npm run typecheck` still passes.
