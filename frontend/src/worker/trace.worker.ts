// Module Web Worker: hosts Pyodide and runs tracer.trace_json on request.
//
// Protocol (see protocol.ts):
//   on start  → posts {type: "ready"} or {type: "load-error", message}
//   {id, source} → {id, result: <TraceResult JSON>} or {id, error}

import tracerSource from "../py/tracer.py?raw";
import { PYODIDE_INDEX_URL } from "./protocol";
import type { TraceRequest, WorkerMessage } from "./protocol";

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

// The DOM lib is in scope (tsconfig is shared with the app), so describe the
// worker global by hand instead of pulling in lib.webworker.
type WorkerScope = {
  postMessage(message: WorkerMessage): void;
  addEventListener(type: "message", listener: (ev: MessageEvent<TraceRequest>) => void): void;
};
const scope = self as unknown as WorkerScope;

const TRACER_DIR = "/codelens";

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function load(): Promise<TraceJson> {
  const mod = (await import(/* @vite-ignore */ `${PYODIDE_INDEX_URL}pyodide.mjs`)) as PyodideModule;
  const pyodide = await mod.loadPyodide({
    indexURL: PYODIDE_INDEX_URL,
    // tracer.py captures student stdout itself; drop anything else.
    stdout: () => {},
    stderr: () => {},
  });
  pyodide.FS.mkdirTree(TRACER_DIR);
  pyodide.FS.writeFile(`${TRACER_DIR}/tracer.py`, tracerSource, { encoding: "utf8" });
  const fn = pyodide.runPython(
    `import sys\nif ${JSON.stringify(TRACER_DIR)} not in sys.path:\n    sys.path.insert(0, ${JSON.stringify(TRACER_DIR)})\nimport tracer\ntracer.trace_json`,
  );
  if (typeof fn !== "function") throw new Error("tracer.trace_json is not callable");
  const traceJson = fn as TraceJson;
  traceJson("pass\n"); // warm-up: the first real trace is then fast
  return traceJson;
}

const ready = load();

ready.then(
  () => scope.postMessage({ type: "ready" }),
  (err: unknown) => scope.postMessage({ type: "load-error", message: describe(err) }),
);

scope.addEventListener("message", (ev) => {
  const { id, source } = ev.data;
  ready.then(
    (traceJson) => {
      try {
        scope.postMessage({ id, result: traceJson(source) });
      } catch (err) {
        scope.postMessage({ id, error: describe(err) });
      }
    },
    (err: unknown) => scope.postMessage({ id, error: describe(err) }),
  );
});
