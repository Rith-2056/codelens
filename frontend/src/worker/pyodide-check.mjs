// Runs tracer.py under real Pyodide in Node and compares it with CPython's
// fixtures. Usage (from frontend/):
//
//   node src/worker/pyodide-check.mjs [path/to/node_modules/pyodide]
//   PYODIDE_DIR=/path/to/node_modules/pyodide node src/worker/pyodide-check.mjs
//
// The pyodide package is not a project dependency; install the version pinned
// in protocol.ts (PYODIDE_VERSION) anywhere, e.g. `npm i pyodide@0.29.5` in a
// temp dir, and pass its directory. Exits non-zero on any mismatch.

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../../..");
const pyDir = join(repo, "frontend/src/py");
const fixturesDir = join(repo, "shared/fixtures");

const pyodideDir = process.argv[2] ?? process.env.PYODIDE_DIR;
if (!pyodideDir) {
  console.error("usage: node src/worker/pyodide-check.mjs <node_modules/pyodide dir>  (or set PYODIDE_DIR)");
  process.exit(2);
}

const pinned = /PYODIDE_VERSION = "([^"]+)"/.exec(readFileSync(join(here, "protocol.ts"), "utf8"))?.[1];
const installed = JSON.parse(readFileSync(join(pyodideDir, "package.json"), "utf8")).version;

const { loadPyodide } = await import(pathToFileURL(join(resolve(pyodideDir), "pyodide.mjs")).href);
const t0 = performance.now();
const pyodide = await loadPyodide({ indexURL: resolve(pyodideDir) + "/", stdout: () => {}, stderr: () => {} });
const loadMs = performance.now() - t0;

// Mirror the worker: write tracer.py (and the lesson list) into the FS, import.
pyodide.FS.mkdirTree("/codelens/frontend/src/py");
for (const f of ["tracer.py", "gen_fixtures.py"]) {
  pyodide.FS.writeFile(`/codelens/frontend/src/py/${f}`, readFileSync(join(pyDir, f), "utf8"), { encoding: "utf8" });
}
const traceJson = pyodide.runPython(
  "import sys\nsys.path.insert(0, '/codelens/frontend/src/py')\nimport tracer\ntracer.trace_json",
);
const pyVersion = pyodide.runPython("import sys; sys.version.split()[0]");
const lessons = JSON.parse(pyodide.runPython("import json, gen_fixtures; json.dumps(gen_fixtures.LESSONS)"));

console.log(`pyodide ${installed} (pinned ${pinned}), Python ${pyVersion}, loaded in ${loadMs.toFixed(0)} ms`);

let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  ${detail}` : ""}`);
  if (!ok) failures++;
}

check("installed version matches PYODIDE_VERSION", installed === pinned, `${installed} vs ${pinned}`);
check("callable proxy has typeof 'function' (worker relies on it)", typeof traceJson === "function");

function firstDiff(a, b) {
  const n = Math.max(a.steps.length, b.steps.length);
  for (let i = 0; i < n; i++) {
    if (!isDeepStrictEqual(a.steps[i], b.steps[i])) {
      return `step ${i}: got ${JSON.stringify(a.steps[i])} expected ${JSON.stringify(b.steps[i])}`;
    }
  }
  return `top-level: got ${JSON.stringify({ ...a, steps: undefined })} expected ${JSON.stringify({ ...b, steps: undefined })}`;
}

for (const [name, source] of Object.entries(lessons)) {
  const got = JSON.parse(traceJson(source));
  const want = JSON.parse(readFileSync(join(fixturesDir, `${name}.json`), "utf8"));
  const same = isDeepStrictEqual(got, want);
  check(`${name} lesson equals shared/fixtures/${name}.json`, same, same ? `(${got.steps.length} steps)` : firstDiff(got, want));
}

const limitCases = {
  "while True: pass": "while True:\n    pass\n",
  "except Exception in loop": "while True:\n    try:\n        pass\n    except Exception:\n        pass\n",
  "bare except in loop": "while True:\n    try:\n        x = 1\n    except:\n        pass\n",
  "bare except around loop": "try:\n    while True:\n        pass\nexcept:\n    print('caught')\n",
};
for (const [name, source] of Object.entries(limitCases)) {
  const t = performance.now();
  const r = JSON.parse(traceJson(source));
  const ms = performance.now() - t;
  check(`${name} -> limit`, r.status === "limit" && ms < 2000, `status=${r.status} steps=${r.steps.length} ${ms.toFixed(0)} ms`);
}

const misc = [
  ["NameError on line 1", "print(x)\n", (r) => r.status === "error" && r.steps.at(-1).line === 1 && r.steps.at(-1).error?.type === "NameError"],
  ["SyntaxError is one step", "x = (\n", (r) => r.status === "error" && r.steps.length === 1],
  [
    "caught ZeroDivisionError continues",
    "try:\n    1/0\nexcept ZeroDivisionError:\n    y = 2\nprint(y)\n",
    (r) => r.status === "ok" && r.steps.at(-1).stdout === "2\n",
  ],
  [
    "recursion return values",
    "def f(n):\n    if n == 0:\n        return 0\n    return n + f(n - 1)\n\nprint(f(3))\n",
    (r) => r.status === "ok" && r.steps.filter((s) => s.event === "return" && s.functionName === "f").map((s) => s.returnValue).join() === "0,1,3,6",
  ],
  [
    "generator yields are return steps with the yielded value",
    "def g():\n    yield 1\n    yield 2\n\nfor v in g():\n    pass\n",
    (r) =>
      r.status === "ok" &&
      JSON.stringify(r.steps.filter((s) => s.event === "return" && s.functionName === "g").map((s) => s.returnValue)) ===
        "[1,2,null]",
  ],
  ["input() gives friendly error", 'input("?")\n', (r) => r.status === "error"],
];
for (const [name, source, ok] of misc) {
  const r = JSON.parse(traceJson(source));
  check(name, ok(r), `status=${r.status}`);
}

// Differential check: the same corpus under CPython (repo .venv, or $CPYTHON)
// must give byte-identical trace_json output. This covers the bytecode-based
// return/yield/unwind classification, which depends on the interpreter build.
const corpus = [
  ...Object.values(lessons),
  ...Object.values(limitCases),
  ...misc.map(([, source]) => source),
  "def f():\n    try:\n        return 1\n    finally:\n        print('fin')\n\nf()\n",
  "def f():\n    try:\n        1/0\n    finally:\n        x = 2\n\ntry:\n    f()\nexcept ZeroDivisionError:\n    print('ok')\n",
  "def outer():\n    def inner(y):\n        return y * 2\n    return inner(3) + 1\n\nprint(outer())\n",
  "squares = [n * n for n in range(4)]\nprint(squares)\n",
  "total = sum(n for n in range(5))\nprint(total)\n",
  "def g():\n    yield 1\n    yield 2\n\nit = g()\nprint(next(it))\nit.close()\n",
  "def g():\n    yield 1\n    yield 2\n\nfor v in g():\n    break\nprint(v)\n",
  "def g():\n    try:\n        yield 1\n    finally:\n        print('bye')\n\nit = g()\nnext(it)\nit.close()\n",
  "class P:\n    def __init__(self, x):\n        self.x = x\n\np = P(4)\nprint(p.x)\n",
  "i = 0\nwhile i < 5:\n    i += 1\n    if i == 3:\n        break\nelse:\n    print('no')\nprint(i)\n",
  "f = lambda a: a + 1\nprint(f(1))\n",
  "d = {'a': 1}\nfor k, v in d.items():\n    print(k, v)\n",
  "def f(n):\n    return f(n + 1)\n\nf(0)\n",
  "x = [1, 2, 3]\nprint(x[5])\n",
  "s = 'abc' * 1000\nprint(len(s))\n",
  "for i in range(400):\n    print(i)\n",
  "def h():\n    raise ValueError('bad')\n\ntry:\n    h()\nexcept ValueError as e:\n    msg = str(e)\nprint(msg)\n",
];
const cpython = process.env.CPYTHON ?? join(repo, ".venv/bin/python");
let cpyResults = null;
try {
  const { execFileSync } = await import("node:child_process");
  const script =
    "import json, sys\nsys.path.insert(0, sys.argv[1])\nimport tracer\n" +
    "print(json.dumps([tracer.trace_json(s) for s in json.load(sys.stdin)]))";
  const out = execFileSync(cpython, ["-I", "-c", script, pyDir], { input: JSON.stringify(corpus), maxBuffer: 1 << 28 });
  cpyResults = JSON.parse(out.toString("utf8"));
  const cpyVersion = execFileSync(cpython, ["-I", "-c", "import sys; print(sys.version.split()[0])"]).toString().trim();
  console.log(`differential check against CPython ${cpyVersion} (${cpython}), ${corpus.length} programs`);
} catch (err) {
  console.log(`SKIP  differential check: could not run CPython at ${cpython} (${err.message.split("\n")[0]})`);
}
if (cpyResults) {
  let diffs = 0;
  corpus.forEach((source, i) => {
    const mine = traceJson(source);
    if (mine !== cpyResults[i]) {
      diffs++;
      const a = JSON.parse(mine);
      const b = JSON.parse(cpyResults[i]);
      check(`CPython == Pyodide for ${JSON.stringify(source.slice(0, 40))}`, false, firstDiff(a, b));
    }
  });
  check("CPython and Pyodide traces are identical across the corpus", diffs === 0, `${corpus.length - diffs}/${corpus.length}`);
}

// The worker's codeHash scheme (WebCrypto SHA-256 hex) must match tracer.code_hash.
const { webcrypto } = await import("node:crypto");
for (const source of [...Object.values(lessons), 'e = "🎉ñ"\n']) {
  const buf = await webcrypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
  const hex = Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
  const py = JSON.parse(traceJson(source)).codeHash;
  if (hex !== py) check(`codeHash matches for ${JSON.stringify(source.slice(0, 20))}`, false, `${hex} vs ${py}`);
}
check("WebCrypto codeHash == tracer.code_hash", true);

console.log(failures ? `\n${failures} check(s) FAILED` : "\nall Pyodide checks passed");
process.exit(failures ? 1 : 0);
