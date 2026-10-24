# Tasks: timeline-ui

Fixture-only step viewer. Data source: `shared/fixtures/loop.json` (no Pyodide yet).
Contract: import `TraceResult` / `TraceStep` from `frontend/src/types/trace.ts` (read-only).

- [x] 1. Lesson + fixture loading
  - `frontend/src/lessons.ts`: the loop lesson source (`numbers = [3, 1, 2]` / `total = 0` / `for n in numbers:` / `    total += n`) and its fixture trace imported from `shared/fixtures/loop.json`, typed as `TraceResult`.

- [x] 2. Code view with "Next line to run" highlight
  - Show the lesson code with line numbers. Mark the current step's `line` with a visible text label "Next line to run" (not color alone).

- [x] 3. Previous / Next stepping and "Step X of Y"
  - Previous/Next buttons, disabled at the ends, keyboard operable (Left/Right arrows too). Backward stepping uses the stored trace, never re-runs.
  - Show "Step X of Y" (1-based X).

- [x] 4. Variable table with text change markers
  - Table of the current step's `locals`. A value that changed since the previous step shows `before → after` in text; a new variable shows a "new" text marker.

- [x] 5. Array cells
  - List values render as indexed cells (index above, value inside).

- [x] 6. Accessibility and styles
  - High-contrast styles, visible focus, aria-live region announcing the step number and next line.
  - `npm run typecheck` and `npm run build` pass.
