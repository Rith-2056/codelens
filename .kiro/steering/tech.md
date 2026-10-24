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

## FROZEN shared contract
This contract is FROZEN. Version 2026-10-24: adds the tagged set, dict,
deque, and ref value forms, plus `heap` and `stack` on every step. Owned by
the integrator in `frontend/src/types/trace.ts`. Do not change field names,
types, or shapes.

```ts
type JsonValue = null | boolean | number | string | JsonValue[] | { [k: string]: JsonValue };

// Tagged JsonValue forms (each is a one-key object, so it is already a JsonValue):
type SetValue   = { __set: JsonValue[] };               // sorted when possible
type DictValue  = { __dict: [JsonValue, JsonValue][] }; // keeps insertion order and non-string keys
type DequeValue = { __deque: JsonValue[] };             // front first
type RefValue   = { __ref: string };                    // points into heap

type HeapObject = { id: string; type: string; fields: Record<string, JsonValue> };

type StackFrame = {
  functionName: string;
  frameId: string;
  line: number;
  locals: Record<string, JsonValue>;
};

type TraceStep = {
  index: number;
  line: number;
  event: "call" | "line" | "return" | "exception";
  functionName: string;
  frameId: string;
  depth: number;
  locals: Record<string, JsonValue>;   // current frame only
  stdout: string;            // cumulative
  returnValue?: JsonValue;
  error?: { type: string; message: string };
  heap: Record<string, HeapObject>;
  stack: StackFrame[];       // all active user frames, outermost first; last = current frame
};

type TraceResult = {
  steps: TraceStep[];
  status: "ok" | "error" | "limit" | "timeout";
  message?: string;
  truncated: boolean;
  codeHash: string;
};
```

- `TraceStep.locals` stays the current frame's locals. `stack` holds every
  active user frame, outermost first; its last entry is the current frame, so
  `stack.length` equals the number of active user frames (decided 2026-10-24,
  wave 3).
- Lists and tuples stay plain JSON arrays. A dict is always written as
  `{"__dict": ...}`, never as a plain JSON object.
- Placeholders keep their existing `{"__type__": name}` shape.
- `heap` holds objects reached through `{"__ref": id}`; every ref in a step
  resolves in that step's `heap`.

## Tracer rules
- Use `sys.settrace` for call, line, return, exception events. Line events fire
  BEFORE the line runs: the UI says "Next line to run".
- Compile with filename `codelens_user.py`; record only frames from that
  filename.
- Snapshot locals without running student code (exact type checks only), using
  the contract's value forms: lists and tuples as arrays, sets as `__set`,
  dicts as `__dict`, deques as `__deque`, student-defined objects as `__ref`
  into `heap`; anything else becomes a type-only placeholder. Never call
  arbitrary repr.
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
- Provider: Gemini through the official `@google/genai` SDK (Interactions
  API), key `GEMINI_API_KEY` in the server environment only. Always send
  `store: false` so student code is not kept on Google's side.
  - `/api/explain`: `gemini-3.5-flash-lite`, 5 s, one or two sentences per step.
  - `/api/help`: `gemini-3.8-flash`, 12 s, three levels for a wrong solution
    (1 hint, no code; 2 what went wrong, no code; 3 a small fix to the
    student's own code, never a whole solution). Replies are rejected (and
    the built-in template is used) if levels 1-2 contain code, if any number
    is not in the code, input, answers, error or line numbers, or if they are
    too long.
- LLM prompt: patient beginner tutor, one or two sentences, requested language,
  only values present in the snapshots, never future values, say the
  highlighted line has not run yet, decline unrelated requests.
- Server-side check: if the LLM reply contains a number not in the snapshots or
  code slice, discard it and use the template.
- Cache by codeHash + step index + language. Cap payload size, rate-limit, 5 s
  timeout, do not log code.
