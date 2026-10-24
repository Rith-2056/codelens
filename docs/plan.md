# CodeLens: build plan (Hackachusetts 2026, Civic Action track)

## Goal
A free, accessible web app that turns a beginner's real Python execution into step-by-step lessons. A student picks or edits a short Python program, clicks Visualize, steps forward and backward through accurate execution states, predicts the next value before it is revealed, and reads a plain-language explanation grounded only in the real trace.

## Users
- Intro CS students without access to a tutor or dedicated CS teacher
- Learners in library and after-school coding programs, often on shared school Chromebooks
- English learners (Spanish first)
- Students using screen readers

## Definition of done (by 7:30 PM, submissions lock 8:00 PM)
- Public deployed URL that works with no account
- Public GitHub repo with `/.kiro` at the root (never in .gitignore)
- Public demo video under 3 minutes
- README, project description, and KIRO_USAGE.md write-up of how Kiro was used

## MVP features
1. Editor: syntax-highlighted Python, three lessons (loop, branch, function). Editing allowed.
2. Execution: real Python via Pyodide in a Web Worker; trace of snapshots; "Next line to run" highlight; Previous/Next.
3. Visualization: variable table, array cells, before→after change markers (text, not color only).
4. Predict-then-reveal: before a step that changes a variable, ask the student for the new value; grade it from the next snapshot. No LLM needed.
5. Error explainer: on an exception, highlight the failing line and explain it simply (NameError, TypeError, IndexError, ZeroDivisionError, SyntaxError first).
6. Explanations: deterministic template text for every step (English and Spanish); optional LLM text from /api/explain replaces it when available.
7. Accessibility: aria-live narration of each step, keyboard-only flow, high contrast.
8. Share link: code and step encoded in the URL; no database.

Should-have if time allows: language toggle, lessons tagged with Massachusetts DLCS standards, simple recursion call-stack view (stop by 4 PM).

## Non-goals
No accounts, database, analytics, grading, multiplayer, package installation, file access, or server-side code execution.

## Acceptance tests
- `numbers = [3, 1, 2]; total = 0; for n in numbers: total += n` shows total 0 → 3 → 4 → 6, next line visible at every step, backward stepping without re-running, predict accepts 4.
- `while True: pass` ends as status "limit" in under 2 seconds; editor stays usable.
- `print(x)` with x undefined ends with the failing line highlighted and a NameError explanation.
- With /api/explain offline, every step still has a deterministic explanation.

## Architecture
- Vite + React + TypeScript static site in `frontend/`.
- Web Worker (`frontend/src/worker/trace.worker.ts`) loads Pyodide and runs `frontend/src/py/tracer.py`.
- `tracer.py` is plain Python, also imported directly by pytest in CPython for testing.
- Optional serverless function `api/explain.ts` holds the LLM key. Never run student code on a server.
- Preload the worker on page open; show precomputed fixture traces instantly while Python loads.

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

## FROZEN shared contract
```ts
type JsonValue = null | boolean | number | string | JsonValue[] | { [k: string]: JsonValue };

type TraceStep = {
  index: number;
  line: number;
  event: "call" | "line" | "return" | "exception";
  functionName: string;
  frameId: string;
  depth: number;
  locals: Record<string, JsonValue>;
  stdout: string;            // cumulative
  returnValue?: JsonValue;
  error?: { type: string; message: string };
};

type TraceResult = {
  steps: TraceStep[];
  status: "ok" | "error" | "limit" | "timeout";
  message?: string;
  truncated: boolean;
  codeHash: string;
};
```

## Tracer rules
- Use `sys.settrace` for call, line, return, exception events. Line events fire BEFORE the line runs: the UI says "Next line to run".
- Compile with filename `codelens_user.py`; record only frames from that filename.
- Snapshot locals: primitives and short lists/dicts/tuples of primitives; anything else becomes a type-only placeholder. Never call arbitrary repr.
- Capture stdout with a byte cap.
- MAX_STEPS = 300 is the main infinite-loop guard. Raise the limit as a subclass of BaseException (not Exception) so student `except Exception` cannot swallow it.
- Replace `input()` with a stub that raises a friendly error.
- SyntaxError becomes a single error state; runtime exceptions end the trace with a terminal error step.
- Worker timeout (~3 s) is only a backstop for slow C-level calls; after a timeout, start a fresh worker in the background.

## Explanation rules
- Deterministic templates first, built from the diff between previous and current snapshot.
- LLM prompt: patient beginner tutor, one or two sentences, in the requested language, only values present in the snapshots, never future values, say the highlighted line has not run yet, decline unrelated requests.
- Server-side check: if the LLM reply contains a number not in the snapshots or code slice, discard it and use the template.
- Cache by codeHash + step index + language. Cap payload size, rate-limit, 5 s timeout, do not log code.

## Property-based tests (Hypothesis)
- Final locals equal the namespace from running the same program untraced.
- Indices contiguous from 0; len(steps) <= MAX_STEPS.
- Every line within the program's line range; depth never negative.
- Every step JSON-serializes under the byte cap; truncated is true whenever something was cut.
- Tracing the same program twice gives identical results.

## Workstreams and file ownership
- trace-engineer: frontend/src/py/, frontend/src/worker/, tests/, shared/fixtures/
- ui-builder: frontend/src/components/, frontend/src/App.tsx, frontend/src/lessons.ts, styles
- explainer: frontend/src/explain/, api/
- integrator (human): frontend/src/types/trace.ts, merges, deploy, README, KIRO_USAGE.md

## Schedule gates
- Mocked end-to-end (fixture traces in UI) by 12:30
- Real Pyodide traces for all 3 lessons + preview deploy by 2:30
- Predict, error explainer, narrator, explanations by 4:00
- Feature freeze 5:00; video and write-up 5:00–6:15; submit by 7:45
