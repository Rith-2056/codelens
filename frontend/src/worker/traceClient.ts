// Main-thread client for the Pyodide trace worker.
//
// - One worker at a time. It loads Pyodide + tracer.py, then reports "ready".
// - Requests (runTrace, tracePractice, checkPractice) are serialized: each
//   waits for the previous one.
// - The TRACE_TIMEOUT_MS timer starts only when a request is posted to a
//   ready worker. On timeout the worker is terminated, a "timeout"
//   TraceResult is returned, and a fresh worker is spawned in the background.

import type { JsonValue, TraceResult } from "../types/trace";
import type { WorkerMessage, WorkerRequest } from "./protocol";

export const TRACE_TIMEOUT_MS = 3000;

export type TracerStatus = "loading" | "ready" | "error";

/** A practice solution traced on one input: the program shown (code + driver) and its trace. */
export type PracticeTrace = { program: string; trace: TraceResult };

/** A practice solution checked against the reference on one input. */
export type PracticeCheck = {
  correct: boolean;
  got: JsonValue;
  expected: JsonValue;
  error: { type: string; message: string } | null;
};

/** The result of searching small inputs for one where a solution goes wrong. */
export type CounterexampleSearch =
  | {
      found: true;
      args: JsonValue[];
      got: JsonValue;
      expected: JsonValue;
      error: { type: string; message: string } | null;
      tried: number;
    }
  | { found: false; tried: number; complete: boolean; timedOut?: boolean };

/** A request body without its id (distributes over the union). */
type RequestBody = WorkerRequest extends infer R ? (R extends WorkerRequest ? Omit<R, "id"> : never) : never;

type Pending = {
  id: number;
  /** Receives the worker's raw JSON result. */
  resolve: (json: string) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

type Loader = {
  worker: Worker;
  ready: Promise<void>;
};

let status: TracerStatus = "loading";
const listeners = new Set<(s: TracerStatus) => void>();
let loader: Loader | null = null;
let pending: Pending | null = null;
let nextId = 1;
let queue: Promise<unknown> = Promise.resolve();

function setStatus(next: TracerStatus): void {
  if (next === status) return;
  status = next;
  for (const fn of [...listeners]) {
    try {
      fn(status);
    } catch {
      // A broken listener must not break the tracer.
    }
  }
}

function failPending(err: Error): void {
  if (!pending) return;
  const p = pending;
  pending = null;
  clearTimeout(p.timer);
  p.reject(err);
}

function discard(l: Loader): void {
  l.worker.terminate();
  if (loader === l) loader = null;
}

function spawn(): Loader {
  setStatus("loading");
  const worker = new Worker(new URL("./trace.worker.ts", import.meta.url), { type: "module" });
  let settle: { resolve: () => void; reject: (e: Error) => void } | null = null;
  const ready = new Promise<void>((resolve, reject) => {
    settle = { resolve, reject };
  });
  // The background respawn after a timeout may have no awaiting caller.
  ready.catch(() => {});
  const l: Loader = { worker, ready };

  const crash = (message: string): void => {
    if (loader !== l) return;
    discard(l);
    setStatus("error");
    const err = new Error(message);
    settle?.reject(err);
    settle = null;
    failPending(err);
  };

  worker.onmessage = (ev: MessageEvent<WorkerMessage>) => {
    if (loader !== l) return;
    const msg = ev.data;
    if ("type" in msg) {
      if (msg.type === "ready") {
        setStatus("ready");
        settle?.resolve();
        settle = null;
      } else {
        crash(`Python failed to load: ${msg.message}`);
      }
      return;
    }
    if (!pending || pending.id !== msg.id) return;
    const p = pending;
    pending = null;
    clearTimeout(p.timer);
    if ("result" in msg) {
      p.resolve(msg.result);
    } else {
      p.reject(new Error(`Tracer failed: ${msg.error}`));
    }
  };
  worker.onerror = (ev: ErrorEvent) => {
    ev.preventDefault();
    crash(`Trace worker crashed: ${ev.message || "unknown error"}`);
  };
  worker.onmessageerror = () => crash("Trace worker sent an unreadable message");

  loader = l;
  return l;
}

/** Start the worker + Pyodide load (idempotent). Resolves when ready; rejects if Pyodide can't load.
 *  After a failed load, calling it again retries with a fresh worker. */
export function preloadTracer(): Promise<void> {
  return (loader ?? spawn()).ready;
}

/** Subscribe to loader status (fires immediately with the current status). Returns an unsubscribe fn. */
export function onTracerStatus(listener: (status: TracerStatus) => void): () => void {
  listeners.add(listener);
  try {
    listener(status);
  } catch {
    // ignore
  }
  return () => {
    listeners.delete(listener);
  };
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** sha256 hex of the UTF-8 source: the same scheme as tracer.code_hash. */
export async function codeHash(source: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source)));
}

/**
 * Send one request to a ready worker. `onTimeout` gives the result to resolve
 * with when the worker is stuck past TRACE_TIMEOUT_MS (it is then replaced).
 */
async function requestOne<T>(body: RequestBody, onTimeout: () => T, retried = false): Promise<T> {
  const l = loader ?? spawn();
  await l.ready;
  if (loader !== l) {
    // The worker died between "ready" and now; try once with a fresh one.
    if (retried) throw new Error("Trace worker stopped before the run started");
    return requestOne(body, onTimeout, true);
  }
  return new Promise<T>((resolve, reject) => {
    const id = nextId++;
    const timer = setTimeout(() => {
      if (!pending || pending.id !== id) return;
      pending = null;
      discard(l);
      resolve(onTimeout());
      spawn(); // fresh worker in the background: status → "loading" → "ready"
    }, TRACE_TIMEOUT_MS);
    const parse = (json: string) => {
      try {
        resolve(JSON.parse(json) as T);
      } catch (e) {
        reject(new Error(`Tracer returned invalid JSON: ${String(e)}`));
      }
    };
    pending = { id, resolve: parse, reject, timer };
    l.worker.postMessage({ id, ...body } as WorkerRequest);
  });
}

function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.then(job);
  queue = run.catch(() => {});
  return run;
}

const timeoutTrace = (hash: string): TraceResult => ({ steps: [], status: "timeout", truncated: false, codeHash: hash });

/** Trace student code. Waits for the tracer to be ready. Resolves with a TraceResult for every student-code outcome
 *  (ok / error / limit / timeout). Rejects only for infrastructure failures (Pyodide failed to load, worker crashed). */
export function runTrace(code: string): Promise<TraceResult> {
  return enqueue(async () => {
    const hash = await codeHash(code);
    return requestOne<TraceResult>({ kind: "trace", source: code }, () => timeoutTrace(hash));
  });
}

/** Trace a practice solution (or the reference, when `source` is null) on one input. */
export function tracePractice(slug: string, source: string | null, args: JsonValue[]): Promise<PracticeTrace> {
  return enqueue(async () => {
    const hash = await codeHash(source ?? "");
    return requestOne<PracticeTrace>({ kind: "practice-trace", slug, source, args }, () => ({
      program: "",
      trace: timeoutTrace(hash),
    }));
  });
}

/** Run a practice solution untraced on one input and compare it with the reference. */
export function checkPractice(slug: string, source: string, args: JsonValue[]): Promise<PracticeCheck> {
  return enqueue(() =>
    requestOne<PracticeCheck>({ kind: "practice-check", slug, source, args }, () => ({
      correct: false,
      got: null,
      expected: null,
      error: { type: "Timeout", message: `Your solution took longer than ${TRACE_TIMEOUT_MS / 1000} seconds.` },
    })),
  );
}

/** Search small valid inputs, smallest first, for one where the solution disagrees with the reference. */
export function findCounterexample(slug: string, source: string): Promise<CounterexampleSearch> {
  return enqueue(() =>
    requestOne<CounterexampleSearch>({ kind: "practice-counterexample", slug, source }, () => ({
      found: false,
      tried: 0,
      complete: false,
      timedOut: true,
    })),
  );
}
