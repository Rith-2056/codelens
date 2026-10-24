// traceClient with a fake Worker: the request shapes, ordering and timeouts,
// without loading Pyodide. (The real worker is checked by pyodide-check.mjs.)
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Posted = Record<string, unknown> & { id: number };

class FakeWorker {
  static all: FakeWorker[] = [];
  posted: Posted[] = [];
  terminated = false;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onerror: unknown = null;
  onmessageerror: unknown = null;
  constructor() {
    FakeWorker.all.push(this);
  }
  postMessage(msg: Posted) {
    this.posted.push(msg);
  }
  terminate() {
    this.terminated = true;
  }
  /** Simulate the worker answering. */
  send(data: unknown) {
    this.onmessage?.({ data });
  }
}

const trace = (status = "ok") => ({ steps: [], status, truncated: false, codeHash: "h" });

let client: typeof import("./traceClient");
beforeEach(async () => {
  FakeWorker.all = [];
  vi.stubGlobal("Worker", FakeWorker);
  vi.resetModules();
  client = await import("./traceClient");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function readyWorker(): Promise<FakeWorker> {
  const ready = client.preloadTracer();
  const w = FakeWorker.all[FakeWorker.all.length - 1]!;
  w.send({ type: "ready" });
  await ready;
  return w;
}
const flush = () => new Promise((r) => setTimeout(r, 0));
/** Wait until the worker has received `n` requests (hashing the code first is async). */
const posted = (w: FakeWorker, n = 1) => vi.waitFor(() => expect(w.posted.length).toBeGreaterThanOrEqual(n));

describe("traceClient requests", () => {
  it("runTrace posts a trace request and resolves the parsed TraceResult", async () => {
    const w = await readyWorker();
    const p = client.runTrace("x = 1\n");
    await posted(w);
    expect(w.posted[0]).toEqual({ id: w.posted[0]!.id, kind: "trace", source: "x = 1\n" });
    w.send({ id: w.posted[0]!.id, result: JSON.stringify(trace()) });
    expect((await p).status).toBe("ok");
  });

  it("tracePractice posts the problem, the source and the input, and resolves {program, trace}", async () => {
    const w = await readyWorker();
    const p = client.tracePractice("two-sum", "class Solution: ...", [[4, 4], 8]);
    await posted(w);
    const req = w.posted[0]!;
    expect(req).toEqual({ id: req.id, kind: "practice-trace", slug: "two-sum", source: "class Solution: ...", args: [[4, 4], 8] });
    w.send({ id: req.id, result: JSON.stringify({ program: "P", trace: trace() }) });
    expect(await p).toEqual({ program: "P", trace: trace() });
  });

  it("tracePractice with no source asks for the reference solution", async () => {
    const w = await readyWorker();
    void client.tracePractice("two-sum", null, [[4, 4], 8]);
    await posted(w);
    expect(w.posted[0]!.source).toBeNull();
  });

  it("checkPractice posts a check request and resolves the comparison", async () => {
    const w = await readyWorker();
    const p = client.checkPractice("climbing-stairs", "src", [4]);
    await posted(w);
    const req = w.posted[0]!;
    expect(req.kind).toBe("practice-check");
    const answer = { correct: false, got: 4, expected: 5, error: null };
    w.send({ id: req.id, result: JSON.stringify(answer) });
    expect(await p).toEqual(answer);
  });

  it("runs one request at a time", async () => {
    const w = await readyWorker();
    const a = client.runTrace("a\n");
    const b = client.checkPractice("climbing-stairs", "b", [1]);
    await posted(w);
    await flush();
    expect(w.posted).toHaveLength(1); // the second request waits for the first
    w.send({ id: w.posted[0]!.id, result: JSON.stringify(trace()) });
    await a;
    await posted(w, 2);
    w.send({ id: w.posted[1]!.id, result: JSON.stringify({ correct: true, got: 1, expected: 1, error: null }) });
    expect((await b).correct).toBe(true);
  });
});

describe("timeouts", () => {
  it("a stuck practice trace resolves as a timeout and a fresh worker starts", async () => {
    const w = await readyWorker();
    vi.useFakeTimers();
    const p = client.tracePractice("climbing-stairs", "loop forever", [3]);
    // Hashing the code is async: only once the request is posted does the timer exist.
    await posted(w);
    await vi.advanceTimersByTimeAsync(client.TRACE_TIMEOUT_MS + 1);
    const res = await p;
    expect(res.trace.status).toBe("timeout");
    expect(w.terminated).toBe(true);
    expect(FakeWorker.all).toHaveLength(2);
  });

  it("a stuck check resolves as not correct, with a Timeout error", async () => {
    const w = await readyWorker();
    vi.useFakeTimers();
    const p = client.checkPractice("climbing-stairs", "loop forever", [3]);
    await posted(w);
    await vi.advanceTimersByTimeAsync(client.TRACE_TIMEOUT_MS + 1);
    const res = await p;
    expect(res.correct).toBe(false);
    expect(res.error?.type).toBe("Timeout");
  });
});
