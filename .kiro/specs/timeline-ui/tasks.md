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

## Wave 2

Editable code and real traces. Data sources: `shared/fixtures/{loop,branch,function}.json`
for the unedited lessons, `runTrace()` from `frontend/src/worker/traceClient.ts` for
everything else, and `explainStep()` / `fetchExplanation()` from `frontend/src/explain/`.

- [x] 7. Lesson picker
  - `lessons.ts`: the loop, branch and function lessons, each with its fixture loaded via `?raw` + `JSON.parse`. Sources match the fixtures byte for byte (trailing newline included).
  - Picking a lesson loads its source and shows its fixture trace instantly, steppable while Python is still loading.

- [x] 8. Code editor
  - Plain `<textarea>`: monospace, line numbers, Tab indents but Esc then Tab leaves the field, no new packages.
  - Edit mode vs. step mode: the editor and the stepping `CodeView` share the code panel; "Edit code" switches to the editor, a trace switches back to stepping.

- [x] 9. Visualize button and run state machine
  - `preloadTracer()` on page open, status via `onTracerStatus`. Visualize calls `runTrace(code)`.
  - Explicit reducer: LoadingPython → Idle → Running → Ready → Error | Limit | Timeout. Any edit clears the trace; the fixture only applies to the unedited lesson source.
  - Error and Limit stay steppable (Error ends on the exception step; Limit shows the result's message). Timeout shows a friendly message and lets the student run again. Visualize is disabled while a run is in flight; the editor is not. Python failing to load keeps the fixtures usable.

- [x] 10. Explanation panel
  - Under the variables: `explainStep(prev, curr, lang)` right away, then `fetchExplanation(…)` swaps in its text only if the trace, step and language are unchanged. Stale requests are aborted. Small text marker of the source. English/Spanish toggle.

- [x] 11. Accessibility pass
  - Status changes announced in an aria-live region; the explanation is narrated once per step (no double announcement when the swap happens).
  - Arrow-key stepping is ignored while typing; keyboard-only flow, high contrast and narrow widths still work.
  - `npm run typecheck` and `npm run build` pass.
