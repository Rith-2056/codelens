// FROZEN shared contract. Owned by the integrator.
// Do not change field names, types, or shapes.
// Version 2026-10-24: tagged set/dict/deque/ref values, heap, and stack.

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [k: string]: JsonValue };

// Tagged JsonValue forms. Each is an object with exactly one key, so each is
// already a JsonValue through the object member above:
//   { "__set": [...] }          a set; items sorted when possible
//   { "__dict": [[k, v], ...] } a dict; keeps insertion order and non-string keys
//   { "__deque": [...] }        a collections.deque, front first
//   { "__ref": "<id>" }         an object stored in TraceStep.heap under that id
export type SetValue = { __set: JsonValue[] };
export type DictValue = { __dict: [JsonValue, JsonValue][] };
export type DequeValue = { __deque: JsonValue[] };
export type RefValue = { __ref: string };

export type HeapObject = {
  id: string;
  type: string;
  fields: Record<string, JsonValue>;
};

// A calling frame. TraceStep.stack lists them outermost first; the current
// frame's locals stay in TraceStep.locals.
export type StackFrame = {
  functionName: string;
  frameId: string;
  line: number;
  locals: Record<string, JsonValue>;
};

export type TraceStep = {
  index: number;
  line: number;
  event: "call" | "line" | "return" | "exception";
  functionName: string;
  frameId: string;
  depth: number;
  locals: Record<string, JsonValue>; // current frame only
  stdout: string; // cumulative
  returnValue?: JsonValue;
  error?: { type: string; message: string };
  heap: Record<string, HeapObject>;
  stack: StackFrame[]; // outermost first
};

export type TraceResult = {
  steps: TraceStep[];
  status: "ok" | "error" | "limit" | "timeout";
  message?: string;
  truncated: boolean;
  codeHash: string;
};
