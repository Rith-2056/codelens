// Module Web Worker: hosts Pyodide and runs the tracer and the practice
// harness on request.
//
// Protocol (see protocol.ts):
//   on start → posts {type: "ready"} or {type: "load-error", message}
//   {id, kind, ...} → {id, result: <JSON string>} or {id, error}
//
// Layout in Pyodide's file system (mirrored by pyodide-check.mjs):
//   /codelens/tracer.py, /codelens/practice.py, /codelens/practice/<data>

import tracerSource from "../py/tracer.py?raw";
import practiceSource from "../py/practice.py?raw";
import { PYODIDE_INDEX_URL } from "./protocol";
import type { WorkerMessage, WorkerRequest } from "./protocol";

// problems.json and the reference solutions, as text (a few KB).
const practiceData = import.meta.glob("../../../shared/practice/*", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

// Minimal local types for the parts of the Pyodide API used here.
type PyodideFS = {
  mkdirTree(path: string): void;
  writeFile(path: string, data: string, opts?: { encoding: "utf8" }): void;
};
type PyodideAPI = {
  FS: PyodideFS;
  runPython(code: string): unknown;
};
type PyodideModule = {
  loadPyodide(options: {
    indexURL: string;
    stdout?: (line: string) => void;
    stderr?: (line: string) => void;
  }): Promise<PyodideAPI>;
};
type TraceJson = (source: string) => string;
type PracticeTraceJson = (slug: string, source: string | null, argsJson: string) => string;
type PracticeCheckJson = (slug: string, source: string, argsJson: string) => string;
type CounterexampleJson = (slug: string, source: string) => string;
type Python = {
  traceJson: TraceJson;
  practiceTrace: PracticeTraceJson;
  practiceCheck: PracticeCheckJson;
  counterexample: CounterexampleJson;
};

// The DOM lib is in scope (tsconfig is shared with the app), so describe the
// worker global by hand instead of pulling in lib.webworker.
type WorkerScope = {
  postMessage(message: WorkerMessage): void;
  addEventListener(type: "message", listener: (ev: MessageEvent<WorkerRequest>) => void): void;
};
const scope = self as unknown as WorkerScope;

const TRACER_DIR = "/codelens";

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function callable<T>(value: unknown, name: string): T {
  if (typeof value !== "function") throw new Error(`${name} is not callable`);
  return value as T;
}

async function load(): Promise<Python> {
  const mod = (await import(/* @vite-ignore */ `${PYODIDE_INDEX_URL}pyodide.mjs`)) as PyodideModule;
  const pyodide = await mod.loadPyodide({
    indexURL: PYODIDE_INDEX_URL,
    // tracer.py captures student stdout itself; drop anything else.
    stdout: () => {},
    stderr: () => {},
  });
  pyodide.FS.mkdirTree(`${TRACER_DIR}/practice`);
  pyodide.FS.writeFile(`${TRACER_DIR}/tracer.py`, tracerSource, { encoding: "utf8" });
  pyodide.FS.writeFile(`${TRACER_DIR}/practice.py`, practiceSource, { encoding: "utf8" });
  for (const [path, text] of Object.entries(practiceData)) {
    const name = path.slice(path.lastIndexOf("/") + 1);
    pyodide.FS.writeFile(`${TRACER_DIR}/practice/${name}`, text, { encoding: "utf8" });
  }
  pyodide.runPython(
    `import sys\nif ${JSON.stringify(TRACER_DIR)} not in sys.path:\n    sys.path.insert(0, ${JSON.stringify(TRACER_DIR)})\nimport tracer, practice`,
  );
  const py: Python = {
    traceJson: callable<TraceJson>(pyodide.runPython("tracer.trace_json"), "tracer.trace_json"),
    practiceTrace: callable<PracticeTraceJson>(pyodide.runPython("practice.trace_example_json"), "practice.trace_example_json"),
    practiceCheck: callable<PracticeCheckJson>(pyodide.runPython("practice.check_json"), "practice.check_json"),
    counterexample: callable<CounterexampleJson>(
      pyodide.runPython("practice.find_counterexample_json"),
      "practice.find_counterexample_json",
    ),
  };
  py.traceJson("pass\n"); // warm-up: the first real trace is then fast
  return py;
}

function handle(py: Python, req: WorkerRequest): string {
  switch (req.kind) {
    case "trace":
      return py.traceJson(req.source);
    case "practice-trace":
      return py.practiceTrace(req.slug, req.source, JSON.stringify(req.args));
    case "practice-check":
      return py.practiceCheck(req.slug, req.source, JSON.stringify(req.args));
    case "practice-counterexample":
      return py.counterexample(req.slug, req.source);
  }
}

const ready = load();

ready.then(
  () => scope.postMessage({ type: "ready" }),
  (err: unknown) => scope.postMessage({ type: "load-error", message: describe(err) }),
);

scope.addEventListener("message", (ev) => {
  const req = ev.data;
  const { id } = req;
  ready.then(
    (py) => {
      try {
        scope.postMessage({ id, result: handle(py, req) });
      } catch (err) {
        scope.postMessage({ id, error: describe(err) });
      }
    },
    (err: unknown) => scope.postMessage({ id, error: describe(err) }),
  );
});
