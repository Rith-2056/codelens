# Requirements: trace-engine

## Introduction
The trace engine runs a beginner's Python program in the browser (Pyodide in a
Web Worker) and returns a `TraceResult` matching the frozen contract in
`frontend/src/types/trace.ts`. The UI uses that trace to step forward and
backward. Its source is the "Tracer rules" and "Property-based tests" sections
of `docs/plan.md`. Owner: trace-engineer (`frontend/src/py/`,
`frontend/src/worker/`, `tests/`, `shared/fixtures/`).

## Glossary
- **Tracer**: `frontend/src/py/tracer.py`, entry point `trace(source) -> dict`.
- **User frame**: a frame whose `co_filename` is `codelens_user.py`.
- **Step**: one `TraceStep`, recorded on a call, line or return event.
- **Size cap**: a limit that drops data: container length, string length,
  stdout bytes, step bytes, or MAX_STEPS.

## Requirement 1: Recording execution
**User story:** As a student, I want every step of my program recorded, so that I can see what happens before each line runs.
1. WHEN the Tracer runs a program THEN it SHALL compile it with filename `codelens_user.py` and use `sys.settrace`.
2. The Tracer SHALL record steps only for user frames.
3. WHEN a line event fires THEN the step SHALL be recorded before that line runs.
4. The Tracer SHALL record `call`, `line` and `return` events with `functionName`, `frameId`, `depth` and `locals`.
5. Every step's `line` SHALL be within 1..number of source lines. Python reports line 0 for the module-level call event, so that step SHALL use line 1.
6. `index` SHALL start at 0 and increase by 1 per step. `depth` SHALL be 0 for the module and increase by 1 per nested user call.
7. `frameId` SHALL be `"module"` for the module frame and `<functionName>-<n>` for calls, with `n` counting calls within that one run.
8. `stdout` SHALL hold all output printed up to that step.

## Requirement 2: Safe snapshots
**User story:** As a student, I want variable values shown accurately without my code being able to break the visualizer.
1. Locals SHALL include values of exact type `None`, `bool`, `int`, `float` and `str`, plus `list`, `tuple` and `dict` values that hold only those types. Tuples SHALL appear as JSON arrays.
2. Any other value SHALL become a type-only placeholder `{"__type__": "<type name>"}`.
3. The Tracer SHALL NOT call `repr`, `str`, `__eq__`, `__hash__` or any other method that student code can override.
4. Names starting with `__` SHALL be excluded from `locals`.
5. Strings longer than MAX_STR_LEN SHALL be shortened, and containers with more than MAX_ITEMS items SHALL become placeholders that include their length.
6. Total stdout SHALL be capped at STDOUT_BYTE_CAP, and every step SHALL serialize to JSON within STEP_BYTE_CAP.
7. `truncated` SHALL be true if and only if a size cap dropped data.

## Requirement 3: Guards
**User story:** As a student, I want infinite loops and unsupported calls to end cleanly, so that the app stays usable.
1. `len(steps)` SHALL never exceed MAX_STEPS = 300. When execution would exceed the cap, the trace SHALL end with status `"limit"`.
2. The limit SHALL be raised as a `BaseException` subclass, so `except Exception` cannot catch it. If student code catches it anyway (for example with a bare `except:`), it SHALL be raised again at the next event.
3. `while True: pass` SHALL finish with status `"limit"` in under 2 seconds.
4. Calling `input()` SHALL raise an error with a friendly message saying that `input()` is not available.
5. After every run, the Tracer SHALL restore `sys.settrace`, `sys.stdout` and the builtin `input`, even when the run fails.

## Requirement 4: Errors
**User story:** As a student, I want my error shown on the exact line where it happened.
1. WHEN the source has a SyntaxError THEN the result SHALL contain exactly one `exception` step with the error's line and `error`, and status `"error"`.
2. WHEN an exception goes uncaught THEN the trace SHALL end with one `exception` step at the innermost failing user line, containing `error: {type, message}`. Status SHALL be `"error"` and `message` SHALL be set.
3. Exceptions that the student's code catches SHALL NOT end the trace.

## Requirement 5: Worker
**User story:** As a student on a Chromebook, I want tracing to run off the main thread and recover from a hang.
1. The worker SHALL load Pyodide when the page opens and run the Tracer in response to a request message.
2. WHEN no result arrives within 3 seconds THEN the client SHALL terminate the worker and return status `"timeout"` with a `codeHash` matching Python's. It SHALL then start a fresh worker in the background.

## Requirement 6: Verification
1. Hypothesis tests SHALL check that: (a) for status `"ok"` runs that were not truncated, the final step's locals equal a snapshot of the same program's namespace run without tracing; (b) indices count up from 0 and `len(steps) <= MAX_STEPS`; (c) every line is within the program and `depth >= 0`; (d) every step fits STEP_BYTE_CAP and `truncated` is set whenever a cap dropped data; (e) tracing the same program twice gives identical results.
2. `trace()` applied to the loop lesson SHALL equal `shared/fixtures/loop.json`.
