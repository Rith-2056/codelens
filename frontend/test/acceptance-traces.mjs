// Vitest global setup: trace a few acceptance-test programs with the real
// tracer (CPython) once, and hand the results to the tests via `inject`.
// Kept outside src/ so the app's tsconfig never needs Node's types.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));

export const PROGRAMS = {
  nameError: "print(x)\n",
  forever: "while True:\n    pass\n",
};

export default function setup({ provide }) {
  const script = [
    "import json, sys, time",
    "sys.path.insert(0, 'frontend/src/py')",
    "import tracer",
    "progs = json.loads(sys.argv[1])",
    "out = {}",
    "for name, src in progs.items():",
    "    t = time.perf_counter(); r = tracer.trace(src)",
    "    r['_seconds'] = time.perf_counter() - t",
    "    out[name] = r",
    "print(json.dumps(out))",
  ].join("\n");
  const json = execFileSync(`${root}.venv/bin/python`, ["-c", script, JSON.stringify(PROGRAMS)], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  provide("traces", JSON.parse(json));
  provide("programs", PROGRAMS);
  // Vitest blanks CSS imports (even ?raw), so tests that read the stylesheet get it here.
  provide("stylesCss", readFileSync(new URL("../src/styles.css", import.meta.url), "utf8"));
}
