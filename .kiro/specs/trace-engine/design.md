# Design: trace-engine

## Overview
The engine has two pieces:
- `frontend/src/py/tracer.py`: a single plain-Python file. It runs under CPython (pytest) and under Pyodide.
- `frontend/src/worker/`: a Web Worker that hosts Pyodide, plus a small main-thread client that handles the timeout and restarts the worker.

```
UI ──traceCode(src)──> traceClient.ts ──postMessage──> trace.worker.ts
                         │ 3 s timer                     │ Pyodide
                         │ on timeout: terminate,        │ tracer.trace_json(src)
                         │ return "timeout", respawn     ▼
                         ◀────────── TraceResult JSON ───┘
```

## tracer.py

### Public API
- `trace(source: str) -> dict`: returns a TraceResult dict.
- `trace_json(source: str) -> str`: the same result as JSON, for the worker.
- `snapshot(value) -> tuple[JsonValue, bool]`: returns the JSON-safe value and whether a size cap dropped data.
- Existing helpers: `MAX_STEPS`, `code_hash`, `empty_result`.

### Constants
| Name | Value |
|---|---|
| MAX_STEPS | 300 |
| MAX_ITEMS | 10 |
| MAX_STR_LEN | 200 |
| STDOUT_BYTE_CAP | 4000 |
| STEP_BYTE_CAP | 16000 |

### Run sequence
1. `compile(source, "codelens_user.py", "exec")`. A SyntaxError becomes a single error step: line `max(1, err.lineno or 1)`, `functionName "<module>"`, `frameId "module"`, depth 0, empty locals, status `"error"`.
2. Save the current values of `sys.stdout` and `builtins.input`, then replace them:
   - `sys.stdout` becomes a `CappedWriter` that stops storing output once STDOUT_BYTE_CAP is reached and sets the truncated flag.
   - `input` becomes a stub that raises `RuntimeError("input() isn't available in CodeLens. Set the value directly, e.g. name = \"Ada\".")`.
3. Call `sys.settrace(tracefn)`, run `exec(code, ns)` with `ns = {"__name__": "__main__", "__builtins__": builtins}`, and restore everything in a `finally` block.

### Trace function
- Returns `None` for frames that aren't user frames, so their descendants aren't traced either.
- Keeps a per-frame record in a dict keyed on `id(frame)`, holding `frameId` and `depth`, for the frame's lifetime only. These ids never appear in the output, so results stay deterministic.
- `call`: assigns a frameId (`module` or `<name>-<n>`). Depth is the parent's depth + 1, or 0 for the module frame. The recorded line is `frame.f_lineno or 1`.
- `line`: records a step. If the frame was marked unwinding, the mark is cleared, because the exception was caught.
- `exception`: no step is recorded. The frame is marked unwinding and `(type, msg, frame snapshot, line)` is kept as the latest exception.
- `return`: if the frame is unwinding, no step is recorded (Python fires this return while an exception passes through). Otherwise a step is recorded with `returnValue = snapshot(arg)`.
- Locals: `frame.f_locals` minus names starting with `__`, each value passed through `snapshot`.

### Limit guard
- `class StepLimit(BaseException)`.
- Regular steps are capped at `MAX_STEPS - 1`. One slot is kept free so the error step for an uncaught exception always fits.
- Appending a regular step past the cap raises StepLimit and sets a sticky `limited` flag. While the flag is set, every later event raises StepLimit again before doing anything else. That way a bare `except:` can't hold execution in a loop for long.
- `exec` ending with StepLimit gives `status "limit"`, `truncated true`, and the message "Stopped after 300 steps. Is there a loop that never ends?"

### Uncaught exceptions
- The last saved exception comes from the innermost frame. The tracer appends one `exception` step with that frame's line, functionName, frameId, depth and locals, plus `error: {type: type(e).__name__, message}`.
- `message` comes from `e.args`: a single arg of exact type `str` is used as-is, otherwise `""`. This avoids calling a `__str__` that student code could override. The same text goes into the result's `message`.
- If `exec` raises an exception that the trace function never saw (unlikely), the tracer falls back to the last user line found in the traceback.

### snapshot(value)
Every check uses `type(v) is X`, so subclasses never qualify and student methods never run.

| Input | Output | Counts as cut? |
|---|---|---|
| `None`, `bool`, `int` with abs ≤ 2**53, finite `float` | value as-is | no |
| larger `int`, NaN/inf `float` | `{"__type__": "int"}` / `{"__type__": "float"}` | no |
| `str` | first MAX_STR_LEN chars | yes, if cut |
| `list` / `tuple` of ≤ MAX_ITEMS primitives | JSON array | no |
| `list` / `tuple` with more than MAX_ITEMS items | `{"__type__": "list", "__len__": n}` | yes |
| `dict` with `str` keys and primitive values, ≤ MAX_ITEMS | JSON object | no |
| a dict containing the key `"__type__"` | placeholder, so it can't look like one | no |
| anything else (functions, modules, nested containers, objects) | `{"__type__": name}` | no |

- The type name comes from `type.__dict__["__name__"].__get__(type(v))`, which a metaclass can't intercept.
- Step byte cap: if a step's compact JSON is over STEP_BYTE_CAP, each local is replaced by its type placeholder and the result is marked truncated.

## Worker (`frontend/src/worker/`)
- `trace.worker.ts` (module worker):
  - loads Pyodide from the pinned `pyodide` npm package, with `indexURL` pointing at the matching jsDelivr version;
  - writes `tracer.py` (imported via Vite `?raw`) into the Pyodide filesystem and imports it;
  - answers `{id, source}` messages with `{id, result}`, or with `{id, error}` if it fails internally.
- `traceClient.ts`:
  - `preloadTracer()`, called when the page opens, and `traceCode(source): Promise<TraceResult>`;
  - a 3000 ms timer per request. On timeout it terminates the worker, resolves `{steps: [], status: "timeout", truncated: false, codeHash}`, and spawns a fresh worker;
  - computes `codeHash` with `crypto.subtle.digest("SHA-256", utf8(source))` as a hex string, the same scheme as `tracer.code_hash`.

## Testing
- `tests/test_tracer.py` (example tests):
  - the loop lesson output equals `loop.json` exactly. The informal `message` field is removed from the fixture so they match.
  - `while True: pass` gives `"limit"` in under 2 s.
  - `while True` combined with `try: … except Exception` and with a bare `except:` both still give `"limit"`.
  - `print(x)` gives a NameError on line 1.
  - SyntaxError gives exactly one step.
  - `input()` gives the friendly error.
  - a function call gives depth 1 and a `returnValue`.
  - `sys.settrace`, `sys.stdout` and `input` are restored after every run.
  - unit tests for each row of the snapshot table.
- `tests/test_tracer_properties.py` (Hypothesis) generates small programs: assignments of small int expressions, `for` over short int lists, `if/else`, and one simple function def and call. A separate strategy produces long strings, long lists and heavy printing to trigger the caps. Properties (a)–(e) follow Requirement 6, and the reference for (a) runs `exec` without tracing, then applies `snapshot` and the `__` filter.
- The worker is verified by `npm run typecheck` and `npm run build`, and by `src/worker/pyodide-check.mjs`, which runs the tracer under Pyodide in Node and compares the result with `loop.json`. The timeout path (`10**10**8`) is checked in the browser once the UI calls `traceCode`.

## Risks
- Placeholders are dicts, so the UI must check for `__type__` before showing a value.
- Python 3.12+ changed how trace events behave around loops. The fixture matches CPython 3.13 and 3.14. Pyodide's Python version should be checked against it when the worker is added.
