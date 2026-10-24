# Tech

## Stack
- Vite + React + TypeScript static site in `frontend/`.
- Real Python runs client-side via Pyodide in a Web Worker
  (`frontend/src/worker/trace.worker.ts`), which loads
  `frontend/src/py/tracer.py`.
- `tracer.py` is plain Python, also imported directly by pytest in CPython for
  testing.
- Optional serverless function `api/explain.ts` holds the LLM key. Never run
  student code on a server.
- Preload the worker on page open; show precomputed fixture traces instantly
  while Python loads.

## FROZEN shared contract (v1, current)
This contract is frozen. Owned by the integrator in
`frontend/src/types/trace.ts`. Do not change field names, types, or shapes.

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

### Planned: contract v2
Specified in `.kiro/specs/ds-visualizers/design.md`. v2 keeps every v1 field
and adds `objects` and `stack` to each step and `version: 2` to the result.
Lists, tuples, dicts, sets, deques, and student-defined objects become
references (`{"__ref__": "o1"}`) into `objects`. Only the integrator lands it
(ds-visualizers task 1). Until then, build against v1 and treat v2 as a
proposal.

## Tracer rules
- Use `sys.settrace` for call, line, return, exception events. Line events fire
  BEFORE the line runs: the UI says "Next line to run".
- Compile with filename `codelens_user.py`; record only frames from that
  filename.
- Snapshot locals without running student code (exact type checks only).
  Contract v1: primitives and short lists/dicts/tuples of primitives; anything
  else becomes a type-only placeholder. Contract v2: containers and
  student-defined objects become shared object snapshots, as in the spec.
  Never call arbitrary repr.
- Capture stdout with a byte cap.
- MAX_STEPS = 2000 is the main infinite-loop guard. Raise the limit as a
  subclass of BaseException (not Exception) so student `except Exception`
  cannot swallow it. The limit message states the number of steps actually
  recorded.
- `while True: pass` must still end as "limit" in under 2 seconds, in CPython
  and in Pyodide.
- Replace `input()` with a stub that raises a friendly error.
- SyntaxError becomes a single error state; runtime exceptions end the trace
  with a terminal error step.
- Worker timeout (~3 s) is only a backstop for slow C-level calls; after a
  timeout, start a fresh worker in the background.

## Explanation API rules
- LLM prompt: patient beginner tutor, one or two sentences, requested language,
  only values present in the snapshots, never future values, say the
  highlighted line has not run yet, decline unrelated requests.
- Server-side check: if the LLM reply contains a number not in the snapshots or
  code slice, discard it and use the template.
- Cache by codeHash + step index + language. Cap payload size, rate-limit, 5 s
  timeout, do not log code.
