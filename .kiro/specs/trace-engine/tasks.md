# Tasks: trace-engine

- [ ] 1. Implement `snapshot` and the size caps in `tracer.py`
  - Add the constants MAX_ITEMS, MAX_STR_LEN, STDOUT_BYTE_CAP and STEP_BYTE_CAP.
  - Implement `snapshot(value) -> (json_value, was_cut)` following the design table. Use exact type checks only, and never call student-overridable methods.
  - Add unit tests in `tests/test_tracer.py` for each row of the table, including subclasses of `int`/`str` with a hostile `__repr__`.
  - _Requirements: 2.1–2.5, 2.7_

- [ ] 2. Implement the core `trace()` and `trace_json()` loop
  - Compile as `codelens_user.py`, use `sys.settrace` with the filename filter, and handle call/line/return events.
  - Assign frameId and depth, keep the per-frame state, and use line 1 for the module call event (Python reports 0).
  - Capture stdout with `CappedWriter`, stub `input()`, and restore everything in `finally`.
  - Enforce the step byte cap and set `truncated`.
  - Tests: the loop lesson equals `shared/fixtures/loop.json` (remove the fixture's informal `message` field), a function call has depth 1 and a returnValue, and state is restored after each run.
  - _Requirements: 1.1–1.8, 2.6, 2.7, 3.4, 3.5, 6.2_

- [ ] 3. Add the guards and error handling
  - Add `StepLimit(BaseException)`, cap regular steps at MAX_STEPS − 1, and make the limit sticky so it is raised again at the next event.
  - SyntaxError becomes a single error step. An uncaught exception becomes one terminal `exception` step at the innermost user line, with `error` and `message`.
  - Exceptions the student catches don't end the trace: track the unwinding flag and skip the return events Python fires during unwinding.
  - Tests: `while True: pass` gives `"limit"` in under 2 s, including with `except Exception` and a bare `except:`. `print(x)` gives a NameError on line 1. A SyntaxError gives one step. A caught ZeroDivisionError continues.
  - _Requirements: 3.1–3.3, 4.1–4.3_

- [ ] 4. Write the Hypothesis property tests
  - In `tests/test_tracer_properties.py`, add a program-generator strategy (assignments, for loops, if/else, one function) and a cap-stress strategy (long strings and lists, heavy printing).
  - Cover properties (a)–(e): final locals equal the untraced namespace, indices count up from 0 within MAX_STEPS, lines are in range and depth ≥ 0, steps fit the byte cap and `truncated` is set correctly, and results are deterministic.
  - Run `.venv/bin/pytest`; the whole suite must pass.
  - _Requirements: 6.1_

- [ ] 5. Build the Pyodide worker and client
  - Pin the `pyodide` npm package to an exact version.
  - Write `frontend/src/worker/trace.worker.ts`: load Pyodide, write `tracer.py` (imported via `?raw`) into its filesystem, and answer `{id, source}` messages.
  - Write `frontend/src/worker/traceClient.ts`: `preloadTracer()` and `traceCode()`, a 3000 ms timeout that terminates the worker, returns a `"timeout"` result with a SHA-256 `codeHash`, and respawns the worker.
  - `npm run typecheck` and `npm run build` must pass.
  - _Requirements: 5.1, 5.2_

- [ ] 6. Check the tracer under Pyodide
  - Add `frontend/src/worker/pyodide-check.mjs`, a Node script run as `node src/worker/pyodide-check.mjs`. It loads the same pinned Pyodide in Node, runs `tracer.trace_json` on the loop lesson, and exits non-zero unless the result equals `shared/fixtures/loop.json`. It also checks that `while True: pass` gives `"limit"`.
  - Note Pyodide's Python version and any trace-event differences in `design.md`.
  - The browser timeout path (`10**10**8` gives `"timeout"` and the next run still works) is checked once ui-builder wires `traceCode` into the app. This stays inside trace-engineer's folders.
  - _Requirements: 3.3, 5.2, 6.2_
