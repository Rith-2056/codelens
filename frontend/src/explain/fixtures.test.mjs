// Every step of every fixture in shared/fixtures/*.json through explainStep,
// in both languages, with the lesson's source when it can be found.
// Run from the repo root:
//   node --test frontend/src/explain/fixtures.test.mjs
//
// Lesson sources are read (never imported or run) from the LESSONS dict in
// frontend/src/py/gen_fixtures.py with Python's ast.literal_eval, and are
// only used when their sha256 matches the fixture's codeHash.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { explainStep, inventedNumbers, LANGS } from "./index.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const FIXTURES = join(ROOT, "shared", "fixtures");
const GEN = join(ROOT, "frontend", "src", "py", "gen_fixtures.py");

function readLessonSources() {
  const py = [
    "import ast, json, sys",
    "tree = ast.parse(open(sys.argv[1], encoding='utf-8').read())",
    "for node in ast.walk(tree):",
    "    if isinstance(node, ast.Assign) and any(getattr(t, 'id', None) == 'LESSONS' for t in node.targets):",
    "        print(json.dumps(ast.literal_eval(node.value)))",
    "        break",
  ].join("\n");
  for (const exe of ["python3", "python"]) {
    try {
      const out = execFileSync(exe, ["-I", "-c", py, GEN], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
      if (out.trim() !== "") return JSON.parse(out);
    } catch {
      // try the next interpreter
    }
  }
  return {};
}

const SOURCES = readLessonSources();
const FIXTURE_NAMES = readdirSync(FIXTURES).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)).sort();
const LOADED = Object.fromEntries(
  FIXTURE_NAMES.map((name) => [name, JSON.parse(readFileSync(join(FIXTURES, `${name}.json`), "utf8"))]),
);

function sourceFor(name) {
  const src = SOURCES[name];
  if (typeof src !== "string") return undefined;
  const hash = createHash("sha256").update(src, "utf8").digest("hex");
  return hash === LOADED[name].codeHash ? src : undefined;
}

function prose(text) {
  return text.replace(/“[^”]*”/g, "Q").replace(/«[^»]*»/g, "Q").replace(/"(?:[^"\\]|\\.)*"/g, "Q");
}

const RAW = /__(?:dict|set|deque|ref|type|len)(?:__)?(?![A-Za-z0-9])|\{"__|undefined|NaN|\[object Object\]/;

function explainAll(name, lang, withSource = true) {
  const steps = LOADED[name].steps;
  const source = withSource ? sourceFor(name) : undefined;
  return steps.map((s, i) => explainStep(i > 0 ? steps[i - 1] : undefined, s, lang, source));
}

test("fixtures are present, with the Level 2 lessons and their sources", () => {
  assert.ok(FIXTURE_NAMES.length >= 3, `fixtures: ${FIXTURE_NAMES}`);
  for (const name of FIXTURE_NAMES) {
    if (SOURCES[name] !== undefined) {
      assert.ok(sourceFor(name) !== undefined, `${name}: LESSONS source does not match the fixture codeHash`);
    }
  }
  const level2 = ["pair-sum", "any-repeats", "sorted-pair", "network-hops", "tree-height", "stairs"];
  const missing = level2.filter((n) => !FIXTURE_NAMES.includes(n));
  assert.deepEqual(missing, [], "Level 2 fixtures missing");
});

test("every step of every fixture: no exception, number check, no raw tags, 1-2 sentences (en, es; with and without source)", () => {
  for (const name of FIXTURE_NAMES) {
    const steps = LOADED[name].steps;
    for (const lang of LANGS) {
      for (const withSource of [true, false]) {
        const texts = explainAll(name, lang, withSource);
        texts.forEach((text, i) => {
          const label = `[${lang}${withSource ? "" : ", no source"}] ${name} step ${i}`;
          const prev = steps[i - 1];
          const curr = steps[i];
          assert.ok(typeof text === "string" && text.length > 0 && text.length <= 320, `${label}: ${text}`);
          assert.deepEqual(inventedNumbers(text, prev, curr), [], `${label}: invented number: ${text}`);
          assert.doesNotMatch(text, RAW, `${label}: raw data: ${text}`);
          const n = (prose(text).match(/[.!?](?=\s|$)/g) ?? []).length;
          assert.ok(n >= 1 && n <= 2, `${label}: ${n} sentences: ${text}`);
          if ((curr.event === "line" || curr.event === "call") && curr.error === undefined && i > 0) {
            if (curr.event === "line") {
              const next = lang === "en" ? `Line ${curr.line} is next` : `la línea ${curr.line}, que todavía no se ha ejecutado`;
              assert.ok(text.includes(next), `${label}: should say line ${curr.line} hasn't run yet: ${text}`);
            } else {
              assert.match(text, lang === "en" ? /has run yet|hasn't run yet/ : /todavía no se ha ejecutado/i, `${label}: ${text}`);
            }
          }
          if (curr.event === "return" || curr.event === "exception") {
            assert.doesNotMatch(text, lang === "en" ? /hasn't run yet/ : /que todavía no se ha ejecutado/, `${label}: ${text}`);
          }
        });
      }
    }
  }
});

/** Lesson-specific events that must show up somewhere in the lesson (with its source). */
const EXPECTED = {
  "pair-sum": {
    en: ["seen now has key 4 with value 0", "seen now has key 9 with value 1", "need is 7, which is not a key in seen, so it's False and Python skips that block",
      "need is 9, which is a key in seen, so it's True and Python goes into that block", "i moved from 0 to 1, so it now points at nums[i], which is 9"],
    es: ["seen ahora tiene la clave 4 con el valor 0", "need vale 9, que es una clave de seen, así que da True y Python entra en ese bloque"],
  },
  "any-repeats": {
    en: ["5 was added to the set seen", "n is 1, which is in seen, so it's True and Python goes into that block", "n is 8, which is not in seen"],
    es: ["5 se agregó al conjunto seen", "n vale 1, que está en seen, así que da True"],
  },
  "sorted-pair": {
    en: ["right moved from 5 to 4, so it now points at nums[right], which is 8", "left moved from 0 to 1, so it now points at nums[left], which is 3"],
    es: ["right pasó de 5 a 4, así que ahora apunta a nums[right], que vale 8", "left pasó de 0 a 1"],
  },
  "network-hops": {
    en: ['"A" was taken off the front of queue', '"B" joined the back of queue', '"B" was added to the set visited', 'hops now has key "B" with value 1',
      "friend not in visited", 'friend is "A", which is in visited, so it\'s False and Python skips that block'],
    es: ['"A" salió por el frente de queue', '"B" entró por el final de queue', 'friend vale "B", que no está en visited, así que da True'],
  },
  "tree-height": {
    en: ["max_depth calls itself again with node = TreeNode(val=2)", "max_depth calls itself again with node = None", "self.val is now",
      "to the call of max_depth that was waiting for it", "The inner call to max_depth gave back 0; back in the earlier call of max_depth, left is now 0",
      "Python starts setting up the class TreeNode"],
    es: ["max_depth se llama a sí misma otra vez con node = TreeNode(val=2)", "a la llamada de max_depth que la estaba esperando"],
  },
  stairs: {
    en: ["ways[i] changed from 0 to 2", "ways[i] changed from 0 to 13", "a cell of ways changed from 0 to 1"],
    es: ["ways[i] pasó de 0 a 2", "una casilla de ways pasó de 0 a 1"],
  },
  loop: { en: ["changed total from 0 to 3"], es: ["total pasó de 0 a 3"] },
  function: { en: ["called the function add with a = 2 and b = 3"], es: ["llamó a la función add con a = 2 y b = 3"] },
};

test("each lesson mentions its pattern's key events (pair-sum key, sorted-pair pointers, network-hops queue, ...)", () => {
  for (const [name, want] of Object.entries(EXPECTED)) {
    if (!FIXTURE_NAMES.includes(name)) continue; // presence is checked above
    for (const lang of LANGS) {
      const all = explainAll(name, lang).join("\n");
      for (const w of want[lang]) assert.ok(all.includes(w), `[${lang}] ${name}: missing "${w}"`);
    }
  }
  // The tree lesson never states a stack depth.
  if (FIXTURE_NAMES.includes("tree-height")) {
    for (const lang of LANGS) {
      assert.doesNotMatch(explainAll("tree-height", lang).join("\n"), /\bdepth\b|\bdeep\b|profundidad|\blevel\b|\bnivel\b/);
    }
  }
});

test("membership results agree with where the trace went next", () => {
  for (const name of FIXTURE_NAMES) {
    const steps = LOADED[name].steps;
    const texts = explainAll(name, "en");
    texts.forEach((text, i) => {
      const m = text.match(/^Line (\d+) just checked .*, so it's (True|False) and Python (goes into|skips|runs|leaves)/);
      if (m === null) return;
      const prev = steps[i - 1];
      const curr = steps[i];
      if (m[3] === "goes into" || m[3] === "runs") {
        assert.equal(curr.line, prev.line + 1, `${name} step ${i}: said it enters the block: ${text}`);
      } else {
        assert.notEqual(curr.line, prev.line + 1, `${name} step ${i}: said it skips the block: ${text}`);
      }
    });
  }
});

test("fixture explanations are deterministic", () => {
  for (const name of FIXTURE_NAMES) {
    for (const lang of LANGS) assert.deepEqual(explainAll(name, lang), explainAll(name, lang));
  }
});
