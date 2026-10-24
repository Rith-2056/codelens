// Main-thread client for the Pyodide trace worker.
//
// - One worker at a time. It loads Pyodide + tracer.py, then reports "ready".
// - runTrace() calls are serialized: each waits for the previous one.
// - The TRACE_TIMEOUT_MS timer starts only when a request is posted to a
//   ready worker. On timeout the worker is terminated, a "timeout"
//   TraceResult is returned, and a fresh worker is spawned in the background.

import type { TraceResult } from "../types/trace";
import type { TraceRequest, WorkerMessage } from "./protocol";

export const TRACE_TIMEOUT_MS = 3000;

export type TracerStatus = "loading" | "ready" | "error";

type Pending = {
  id: number;
  resolve: (r: TraceResult) => void;
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
      try {
        p.resolve(JSON.parse(msg.result) as TraceResult);
      } catch (e) {
        p.reject(new Error(`Tracer returned invalid JSON: ${String(e)}`));
      }
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

async function runOne(code: string, retried = false): Promise<TraceResult> {
  const hash = await codeHash(code);
  const l = loader ?? spawn();
  await l.ready;
  if (loader !== l) {
    // The worker died between "ready" and now; try once with a fresh one.
    if (retried) throw new Error("Trace worker stopped before the run started");
    return runOne(code, true);
  }
  return new Promise<TraceResult>((resolve, reject) => {
    const id = nextId++;
    const timer = setTimeout(() => {
      if (!pending || pending.id !== id) return;
      pending = null;
      discard(l);
      resolve({ steps: [], status: "timeout", truncated: false, codeHash: hash });
      spawn(); // fresh worker in the background: status → "loading" → "ready"
    }, TRACE_TIMEOUT_MS);
    pending = { id, resolve, reject, timer };
    const req: TraceRequest = { id, source: code };
    l.worker.postMessage(req);
  });
}

/** Trace student code. Waits for the tracer to be ready. Resolves with a TraceResult for every student-code outcome
 *  (ok / error / limit / timeout). Rejects only for infrastructure failures (Pyodide failed to load, worker crashed). */
export function runTrace(code: string): Promise<TraceResult> {
  const run = queue.then(() => runOne(code));
  queue = run.catch(() => {});
  return run;
}
