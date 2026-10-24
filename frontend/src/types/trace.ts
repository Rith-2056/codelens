// FROZEN shared contract. Owned by the integrator.
// Do not change field names, types, or shapes.

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [k: string]: JsonValue };

export type TraceStep = {
  index: number;
  line: number;
  event: "call" | "line" | "return" | "exception";
  functionName: string;
  frameId: string;
  depth: number;
  locals: Record<string, JsonValue>;
  stdout: string; // cumulative
  returnValue?: JsonValue;
  error?: { type: string; message: string };
};

export type TraceResult = {
  steps: TraceStep[];
  status: "ok" | "error" | "limit" | "timeout";
  message?: string;
  truncated: boolean;
  codeHash: string;
};
