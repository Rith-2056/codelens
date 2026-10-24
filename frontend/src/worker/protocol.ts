// Messages between traceClient.ts (main thread) and trace.worker.ts.

/** Pinned Pyodide release. 0.29.x is built on CPython 3.13 (0.29.5 → 3.13.2),
 *  the same minor version the shared fixtures were generated with. */
export const PYODIDE_VERSION = "0.29.5";
export const PYODIDE_INDEX_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

import type { JsonValue } from "../types/trace";

/** main → worker */
export type WorkerRequest =
  /** Trace any program (the playground). */
  | { id: number; kind: "trace"; source: string }
  /** Trace a practice solution on one input; `source: null` means the reference solution. */
  | { id: number; kind: "practice-trace"; slug: string; source: string | null; args: JsonValue[] }
  /** Run a practice solution untraced and compare it with the reference. */
  | { id: number; kind: "practice-check"; slug: string; source: string; args: JsonValue[] }
  /** Search small inputs for one where the solution disagrees with the reference. */
  | { id: number; kind: "practice-counterexample"; slug: string; source: string };

/** worker → main */
export type WorkerMessage =
  | { type: "ready" }
  | { type: "load-error"; message: string }
  /** `result` is a JSON string: a TraceResult, {program, trace}, or a check result. */
  | { id: number; result: string }
  | { id: number; error: string };
