// Messages between traceClient.ts (main thread) and trace.worker.ts.

/** Pinned Pyodide release. 0.29.x is built on CPython 3.13 (0.29.5 → 3.13.2),
 *  the same minor version the shared fixtures were generated with. */
export const PYODIDE_VERSION = "0.29.5";
export const PYODIDE_INDEX_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

/** main → worker */
export type TraceRequest = { id: number; source: string };

/** worker → main */
export type WorkerMessage =
  | { type: "ready" }
  | { type: "load-error"; message: string }
  /** `result` is the JSON string produced by tracer.trace_json. */
  | { id: number; result: string }
  | { id: number; error: string };
