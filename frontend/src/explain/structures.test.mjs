// Tests for the structure-change templates (wave 3): dict, set, deque,
// pointers, DP cells, heap fields, membership checks, recursion, class bodies.
// Run from the repo root:
//   node --test frontend/src/explain/structures.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { explainStep, inventedNumbers, LANGS } from "./index.ts";

const dict = (...pairs) => ({ __dict: pairs });
const set = (...items) => ({ __set: items });
const deque = (...items) => ({ __deque: items });
const ref = (id) => ({ __ref: id });

/** A module-level line step in the new contract shape. */
function step(fields) {
  const s = {
    index: 0,
    line: 1,
    event: "line",
    functionName: "<module>",
    frameId: "module",
    depth: 0,
    locals: {},
    stdout: "",
    heap: {},
    stack: [],
    ...fields,
  };
  if (fields.stack === undefined) {
    s.stack = [{ functionName: s.functionName, frameId: s.frameId, line: s.line, locals: s.locals }];
  }
  return s;
}

function prose(text) {
  return text.replace(/“[^”]*”/g, "Q").replace(/«[^»]*»/g, "Q").replace(/"(?:[^"\\]|\\.)*"/g, "Q");
}

function assertWellFormed(text, prev, curr, lang, label) {
  assert.equal(typeof text, "string", label);
  assert.ok(text.length > 0, `${label}: empty`);
  assert.ok(text.length <= 320, `${label}: too long (${text.length}): ${text}`);
  assert.deepEqual(inventedNumbers(text, prev, curr), [], `${label}: invented number in: ${text}`);
  assert.doesNotMatch(text, /__|\{"__|undefined|NaN|\[object Object\]/, `${label}: raw data leaked: ${text}`);
  const n = (prose(text).match(/[.!?](?=\s|$)/g) ?? []).length;
  assert.ok(n >= 1 && n <= 2, `${label}: ${n} sentences: ${text}`);
  if (lang === "es") {
    assert.doesNotMatch(prose(text), /\b(Line|just ran|is next|the function|hasn't|and|with|moved|now)\b/, `${label}: English in Spanish: ${text}`);
  } else {
    assert.doesNotMatch(prose(text), /[áéíóúñ¿¡]/, `${label}: Spanish in English: ${text}`);
  }
}

function check(c) {
  for (const lang of LANGS) {
    const text = explainStep(c.prev, c.curr, lang, c.source);
    for (const want of c[lang] ?? []) {
      assert.ok(text.includes(want), `[${lang}] ${c.name}\n  want: ${want}\n  got:  ${text}`);
    }
    for (const bad of c[`not_${lang}`] ?? []) {
      assert.ok(!text.includes(bad), `[${lang}] ${c.name}\n  must not contain: ${bad}\n  got: ${text}`);
    }
    assertWellFormed(text, c.prev, c.curr, lang, `[${lang}] ${c.name}`);
  }
}

// ---------------------------------------------------------------------------

const CASES = [
  {
    name: "dict: key added",
    prev: step({ line: 10, locals: { seen: dict(), n: 4, i: 0 } }),
    curr: step({ line: 5, locals: { seen: dict([4, 0]), n: 4, i: 0 } }),
    en: ["Line 10 just ran, and seen now has key 4 with value 0.", "Line 5 is next, and it hasn't run yet."],
    es: ["Ya se ejecutó la línea 10: seen ahora tiene la clave 4 con el valor 0.", "Ahora sigue la línea 5"],
  },
  {
    name: "dict: string key added",
    prev: step({ line: 18, locals: { hops: dict(["A", 0]) } }),
    curr: step({ line: 19, locals: { hops: dict(["A", 0], ["B", 1]) } }),
    en: ['hops now has key "B" with value 1'],
    es: ['hops ahora tiene la clave "B" con el valor 1'],
  },
  {
    name: "dict: value changed and key removed",
    prev: step({ line: 3, locals: { d: dict(["a", 1], ["b", 2]) } }),
    curr: step({ line: 4, locals: { d: dict(["a", 5]) } }),
    en: ['d["a"] changed from 1 to 5', 'key "b" was removed from d'],
    es: ['d["a"] pasó de 1 a 5', 'se quitó la clave "b" de d'],
  },
  {
    name: "dict: many changes at once stay a plain change",
    prev: step({ line: 3, locals: { d: dict() } }),
    curr: step({ line: 4, locals: { d: dict([1, 1], [2, 2], [3, 3]) } }),
    en: ["changed d from {} to {1: 1, 2: 2, 3: 3}"],
    es: ["d pasó de {} a {1: 1, 2: 2, 3: 3}"],
  },
  {
    name: "set: item added",
    prev: step({ line: 8, locals: { seen: set(1, 5), n: 8 } }),
    curr: step({ line: 4, locals: { seen: set(1, 5, 8), n: 8 } }),
    en: ["Line 8 just ran, and 8 was added to the set seen."],
    es: ["Ya se ejecutó la línea 8: 8 se agregó al conjunto seen."],
  },
  {
    name: "set: item removed",
    prev: step({ line: 2, locals: { s: set("a", "b") } }),
    curr: step({ line: 3, locals: { s: set("b") } }),
    en: ['"a" was removed from the set s'],
    es: ['"a" se quitó del conjunto s'],
  },
  {
    name: "deque: popleft into a new variable",
    prev: step({ line: 14, locals: { queue: deque("A") } }),
    curr: step({ line: 15, locals: { queue: deque(), person: "A" } }),
    en: ['"A" was taken off the front of queue', 'person was created with the value "A"'],
    es: ['"A" salió por el frente de queue', 'se creó person con el valor "A"'],
  },
  {
    name: "deque: append at the back",
    prev: step({ line: 19, locals: { queue: deque("B") } }),
    curr: step({ line: 15, locals: { queue: deque("B", "C") } }),
    en: ['Line 19 just ran, and "C" joined the back of queue.'],
    es: ['Ya se ejecutó la línea 19: "C" entró por el final de queue.'],
  },
  {
    name: "deque: popleft and append in one step",
    prev: step({ line: 4, locals: { q: deque(1, 2) } }),
    curr: step({ line: 5, locals: { q: deque(2, 3) } }),
    en: ["1 was taken off the front of q and 3 joined the back of q"],
    es: ["1 salió por el frente de q y 3 entró por el final de q"],
  },
  {
    name: "deque: pop and appendleft",
    prev: step({ line: 4, locals: { q: deque(1, 2, 3) } }),
    curr: step({ line: 5, locals: { q: deque(0, 1, 2) } }),
    en: ["3 was taken off the back of q and 0 was put at the front of q"],
    es: ["3 salió por el final de q y 0 entró por el frente de q"],
  },
  {
    name: "pointer moves inward",
    prev: step({ line: 12, locals: { nums: [1, 3, 4, 6], left: 0, right: 3 } }),
    curr: step({ line: 6, locals: { nums: [1, 3, 4, 6], left: 1, right: 3 } }),
    en: ["Line 12 just ran, and left moved from 0 to 1, so it now points at nums[left], which is 3."],
    es: ["Ya se ejecutó la línea 12: left pasó de 0 a 1, así que ahora apunta a nums[left], que vale 3."],
  },
  {
    name: "pointer move plus another change",
    prev: step({ line: 5, locals: { nums: [4, 9], i: 0, n: 4 } }),
    curr: step({ line: 6, locals: { nums: [4, 9], i: 1, n: 9 } }),
    en: ["i moved from 0 to 1, so it now points at nums[i], which is 9, and n changed from 4 to 9"],
    es: ["i pasó de 0 a 1, así que ahora apunta a nums[i], que vale 9, y n pasó de 4 a 9"],
  },
  {
    name: "pointer: the array the code subscripts wins",
    source: "a = [0]\nb = [5, 6]\nj = 0\nj += 1\nprint(b[j])\n",
    prev: step({ line: 4, locals: { a: [0, 0], b: [5, 6], j: 0 } }),
    curr: step({ line: 5, locals: { a: [0, 0], b: [5, 6], j: 1 } }),
    en: ["j moved from 0 to 1, so it now points at b[j], which is 6"],
    es: ["j pasó de 0 a 1, así que ahora apunta a b[j], que vale 6"],
  },
  {
    name: "pointer past the end is a plain change",
    prev: step({ line: 12, locals: { nums: [1, 3], left: 1 } }),
    curr: step({ line: 6, locals: { nums: [1, 3], left: 2 } }),
    en: ["Line 12 just ran and changed left from 1 to 2."],
    es: ["Ya se ejecutó la línea 12: left pasó de 1 a 2."],
    not_en: ["points at"],
  },
  {
    name: "a non-pointer name is a plain change",
    prev: step({ line: 3, locals: { nums: [1, 3], count: 0 } }),
    curr: step({ line: 4, locals: { nums: [1, 3], count: 1 } }),
    en: ["changed count from 0 to 1"],
    es: ["count pasó de 0 a 1"],
    not_en: ["points at"],
  },
  {
    name: "DP cell with a matching index local",
    prev: step({ line: 6, locals: { n: 6, ways: [1, 1, 0, 0], i: 2 } }),
    curr: step({ line: 5, locals: { n: 6, ways: [1, 1, 2, 0], i: 2 } }),
    en: ["Line 6 just ran, and ways[i] changed from 0 to 2."],
    es: ["Ya se ejecutó la línea 6: ways[i] pasó de 0 a 2."],
  },
  {
    name: "DP cell without a matching index local (no invented index)",
    prev: step({ line: 3, locals: { n: 6, ways: [0, 0, 0] } }),
    curr: step({ line: 4, locals: { n: 6, ways: [1, 0, 0] } }),
    en: ["Line 3 just ran, and a cell of ways changed from 0 to 1."],
    es: ["Ya se ejecutó la línea 3: una casilla de ways pasó de 0 a 1."],
    not_en: ["ways[0]", "ways[n]"],
  },
  {
    name: "DP cell: the subscript name in the code wins over other equal locals",
    source: "ways = [0, 0, 0]\nfor k in range(3):\n    ways[k] = 7\n",
    prev: step({ line: 3, locals: { ways: [0, 0, 0], k: 1, i: 1 } }),
    curr: step({ line: 2, locals: { ways: [0, 7, 0], k: 1, i: 1 } }),
    en: ["ways[k] changed from 0 to 7"],
    es: ["ways[k] pasó de 0 a 7"],
  },
  {
    name: "grid cell with both index locals",
    prev: step({ line: 5, locals: { dp: [[0, 0], [0, 0]], r: 1, c: 0 } }),
    curr: step({ line: 6, locals: { dp: [[0, 0], [3, 0]], r: 1, c: 0 } }),
    en: ["dp[r][c] changed from 0 to 3"],
    es: ["dp[r][c] pasó de 0 a 3"],
  },
  {
    name: "grid cell without index locals",
    prev: step({ line: 5, locals: { dp: [[0, 0], [0, 0]] } }),
    curr: step({ line: 6, locals: { dp: [[0, 0], [0, 4]] } }),
    en: ["a cell of dp changed from 0 to 4"],
    es: ["una casilla de dp pasó de 0 a 4"],
  },
  {
    name: "list append",
    prev: step({ line: 2, locals: { nums: [3, 1] } }),
    curr: step({ line: 3, locals: { nums: [3, 1, 2] } }),
    en: ["2 was added to the end of nums"],
    es: ["2 se agregó al final de nums"],
  },
  {
    name: "list pop",
    prev: step({ line: 2, locals: { stack: [3, 1] } }),
    curr: step({ line: 3, locals: { stack: [3] } }),
    en: ["1 was removed from the end of stack"],
    es: ["1 se quitó del final de stack"],
  },
  {
    name: "heap field set on self",
    prev: step({
      line: 3, functionName: "__init__", frameId: "f1", depth: 1,
      locals: { self: ref("o1"), val: 4 }, heap: { o1: { id: "o1", type: "TreeNode", fields: {} } },
    }),
    curr: step({
      line: 4, functionName: "__init__", frameId: "f1", depth: 1,
      locals: { self: ref("o1"), val: 4 }, heap: { o1: { id: "o1", type: "TreeNode", fields: { val: 4 } } },
    }),
    en: ["Line 3 just ran, and self.val is now 4."],
    es: ["Ya se ejecutó la línea 3: self.val ahora vale 4."],
  },
  {
    name: "heap field changed on an object no local names",
    prev: step({ line: 7, locals: { root: ref("o1") }, heap: {
      o1: { id: "o1", type: "Node", fields: { next: ref("o2") } }, o2: { id: "o2", type: "Node", fields: { val: 1 } } } }),
    curr: step({ line: 8, locals: { root: ref("o1") }, heap: {
      o1: { id: "o1", type: "Node", fields: { next: ref("o2") } }, o2: { id: "o2", type: "Node", fields: { val: 5 } } } }),
    en: ["the field val of a Node object changed from 1 to 5"],
    es: ["el campo val de un objeto Node pasó de 1 a 5"],
  },
  {
    name: "new variables holding tagged values read like Python",
    prev: step({ line: 1 }),
    curr: step({ line: 2, locals: { seen: dict(), visited: set("A"), queue: deque("A") } }),
    en: ["created seen = {}, visited = {\"A\"}, and queue = deque([\"A\"])"],
    es: ["se crearon seen = {}, visited = {\"A\"} y queue = deque([\"A\"])"],
  },
  {
    name: "a dict changing in a way that isn't item-by-item still has no raw tags",
    prev: step({ line: 1, locals: { d: dict([1, 2]) } }),
    curr: step({ line: 2, locals: { d: { __type__: "dict", __len__: 30 } } }),
    en: ["changed d from {1: 2} to a dictionary with 30 keys"],
    es: ["d pasó de {1: 2} a un diccionario con 30 claves"],
  },
];

test("structure-change templates read as expected in English and Spanish", () => {
  for (const c of CASES) check(c);
});

// ---------------------------------------------------------------------------
// Membership checks.

const PAIR_SRC = "seen = {}\nneed = 0\nif need in seen:\n    print(1)\nx = 0\n";

test("membership: dict key found (in) goes into the block", () => {
  check({
    name: "dict in, found",
    source: PAIR_SRC,
    prev: step({ line: 3, locals: { seen: dict([4, 0], [9, 1]), need: 9 } }),
    curr: step({ line: 4, locals: { seen: dict([4, 0], [9, 1]), need: 9 } }),
    en: ["Line 3 just checked need in seen: need is 9, which is a key in seen, so it's True and Python goes into that block.", "Line 4 is next"],
    es: ["Ya se ejecutó la línea 3, que comprobó need in seen: need vale 9, que es una clave de seen, así que da True y Python entra en ese bloque.", "Ahora sigue la línea 4"],
  });
});

test("membership: dict key missing (in) skips the block", () => {
  check({
    name: "dict in, missing",
    source: PAIR_SRC,
    prev: step({ line: 3, locals: { seen: dict([4, 0]), need: 7 } }),
    curr: step({ line: 5, locals: { seen: dict([4, 0]), need: 7 } }),
    en: ["need is 7, which is not a key in seen, so it's False and Python skips that block."],
    es: ["need vale 7, que no es una clave de seen, así que da False y Python se salta ese bloque."],
  });
});

test("membership: a dict value is not a key", () => {
  check({
    name: "dict in, value only",
    source: PAIR_SRC,
    prev: step({ line: 3, locals: { seen: dict([4, 0]), need: 0 } }),
    curr: step({ line: 5, locals: { seen: dict([4, 0]), need: 0 } }),
    en: ["need is 0, which is not a key in seen, so it's False"],
    es: ["need vale 0, que no es una clave de seen, así que da False"],
  });
});

test("membership: set with not in, both results", () => {
  const src = "visited = set()\nfriend = 'B'\nif friend not in visited:\n    visited.add(friend)\nx = 0\n";
  check({
    name: "set not in, absent",
    source: src,
    prev: step({ line: 3, locals: { visited: set("A"), friend: "B" } }),
    curr: step({ line: 4, locals: { visited: set("A"), friend: "B" } }),
    en: ['Line 3 just checked friend not in visited: friend is "B", which is not in visited, so it\'s True and Python goes into that block.'],
    es: ['que comprobó friend not in visited: friend vale "B", que no está en visited, así que da True y Python entra en ese bloque.'],
  });
  check({
    name: "set not in, present",
    source: src,
    prev: step({ line: 3, locals: { visited: set("A", "B"), friend: "A" } }),
    curr: step({ line: 5, locals: { visited: set("A", "B"), friend: "A" } }),
    en: ['friend is "A", which is in visited, so it\'s False and Python skips that block.'],
    es: ['friend vale "A", que está en visited, así que da False y Python se salta ese bloque.'],
  });
});

test("membership: set with in, list, deque, elif, while and literals", () => {
  check({
    name: "set in, present",
    source: "if n in seen:\n    pass\n",
    prev: step({ line: 1, locals: { seen: set(1, 5), n: 1 } }),
    curr: step({ line: 2, locals: { seen: set(1, 5), n: 1 } }),
    en: ["n is 1, which is in seen, so it's True and Python goes into that block."],
    es: ["n vale 1, que está en seen, así que da True y Python entra en ese bloque."],
  });
  check({
    name: "list, elif, literal string",
    source: "if False:\n    pass\nelif 'x' in letters:  # check\n    pass\n",
    prev: step({ line: 3, locals: { letters: ["a", "x"] } }),
    curr: step({ line: 4, locals: { letters: ["a", "x"] } }),
    en: ['Line 3 just checked \'x\' in letters: "x" is in letters, so it\'s True'],
    es: ['"x" está en letters, así que da True'],
  });
  check({
    name: "deque, while, stops",
    source: "while target in queue:\n    queue.popleft()\n",
    prev: step({ line: 1, locals: { queue: deque(2, 3), target: 1 } }),
    curr: step({ line: 3, locals: { queue: deque(2, 3), target: 1 } }),
    en: ["target is 1, which is not in queue, so it's False and Python leaves the loop."],
    es: ["target vale 1, que no está en queue, así que da False y Python sale del bucle."],
  });
  check({
    name: "while, keeps going",
    source: "while target in queue:\n    queue.popleft()\n",
    prev: step({ line: 1, locals: { queue: deque(1, 3), target: 1 } }),
    curr: step({ line: 2, locals: { queue: deque(1, 3), target: 1 } }),
    en: ["so it's True and Python runs the loop body."],
    es: ["así que da True y Python ejecuta el cuerpo del bucle."],
  });
  check({
    name: "int literal that is in the data, True == 1",
    source: "if 1 in flags:\n    pass\n",
    prev: step({ line: 1, locals: { flags: [true, false] } }),
    curr: step({ line: 2, locals: { flags: [true, false] } }),
    en: ["1 is in flags, so it's True"],
    es: ["1 está en flags, así que da True"],
  });
});

test("membership: not evaluable from the snapshot never claims what is in the container", () => {
  // Without source, or on a line that is not a condition: the plain template.
  const plainEn = "just ran, and no variables changed.";
  const plainEs = "pero no cambió ninguna variable.";
  for (const [label, source] of [["no source", undefined], ["not a condition line", "n in seen\n"]]) {
    check({
      name: `membership fallback: ${label}`,
      source,
      prev: step({ line: 1, locals: { seen: set(1), n: 1 } }),
      curr: step({ line: 2, locals: { seen: set(1), n: 1 } }),
      en: [plainEn],
      es: [plainEs],
      not_en: ["checked"],
      not_es: ["comprobó"],
    });
  }
  // On a condition line, the result still comes from where the trace went
  // next (line 2 is inside the block, so True), but nothing is said about
  // what the container holds.
  const cases = [
    ["unknown name", "if m in seen:\n    pass\n", { seen: set(1), n: 1 }],
    ["container is a placeholder", "if n in seen:\n    pass\n", { seen: { __type__: "set", __len__: 40 }, n: 1 }],
    ["container holds objects (custom __eq__)", "if n in nodes:\n    pass\n", { nodes: [ref("o1")], n: 1 }],
    ["subject is a list", "if n in seen:\n    pass\n", { seen: set(1), n: [1] }],
    ["compound condition", "if n in seen and n > 0:\n    pass\n", { seen: set(1), n: 1 }],
    ["attribute access", "if n in self.seen:\n    pass\n", { seen: set(1), n: 1 }],
    ["literal number not in the data", "if 42 in seen:\n    pass\n", { seen: set(1) }],
    ["a string container", "if c in word:\n    pass\n", { word: "abc", c: "a" }],
  ];
  for (const [label, source, locals] of cases) {
    check({
      name: `membership fallback: ${label}`,
      source,
      prev: step({ line: 1, locals, heap: { o1: { id: "o1", type: "Node", fields: {} } } }),
      curr: step({ line: 2, locals, heap: { o1: { id: "o1", type: "Node", fields: {} } } }),
      en: ["so it's True and Python goes into that block."],
      es: ["así que da True y Python entra en ese bloque."],
      not_en: ["which is", "is a key", "is in"],
      not_es: ["que es", "es una clave", "está en"],
    });
  }
});

// ---------------------------------------------------------------------------
// Recursion, returns and class bodies.

const MOD = { functionName: "<module>", frameId: "m", line: 17, locals: { root: ref("o1") } };
const TREE_HEAP = {
  o1: { id: "o1", type: "TreeNode", fields: { val: 1, left: ref("o2"), right: null } },
  o2: { id: "o2", type: "TreeNode", fields: { val: 2, left: null, right: null } },
};

function md(n, fields) {
  const frameId = `md${n}`;
  return step({ functionName: "max_depth", frameId, depth: n, heap: TREE_HEAP, ...fields });
}

const F1 = { functionName: "max_depth", frameId: "md1", line: 11, locals: { node: ref("o1") } };
const F1_AFTER = { functionName: "max_depth", frameId: "md1", line: 12, locals: { node: ref("o1"), left: 1 } };
const F2 = { functionName: "max_depth", frameId: "md2", line: 8, locals: { node: ref("o2") } };

test("recursive call: names the function, its arguments (refs described), never a depth", () => {
  const prev = md(1, { line: 11, locals: { node: ref("o1") }, stack: [MOD, F1] });
  const curr = md(2, { event: "call", line: 8, locals: { node: ref("o2") }, stack: [MOD, F1, F2] });
  check({
    name: "recursive call",
    prev, curr,
    en: ["On line 11, max_depth calls itself again with node = TreeNode(val=2).", "Nothing inside this new call has run yet."],
    es: ["En la línea 11, max_depth se llama a sí misma otra vez con node = TreeNode(val=2).", "Todavía no se ha ejecutado nada dentro de esta nueva llamada."],
  });
  for (const lang of LANGS) {
    const text = explainStep(prev, curr, lang);
    assert.doesNotMatch(text, /\bdepth\b|profundidad|\blevel\b|\bnivel\b|\bdeep\b/, `[${lang}] states no depth: ${text}`);
  }
  check({
    name: "recursive call with None",
    prev: md(1, { line: 12, locals: { node: ref("o1"), left: 1 }, stack: [MOD, F1_AFTER] }),
    curr: md(2, { event: "call", line: 8, locals: { node: null }, stack: [MOD, F1_AFTER, { ...F2, locals: { node: null } }] }),
    en: ["On line 12, max_depth calls itself again with node = None."],
    es: ["En la línea 12, max_depth se llama a sí misma otra vez con node = None."],
  });
});

test("recursive call is also detected in old-shape steps without a stack", () => {
  const prev = { ...md(1, { line: 4, locals: { n: 3 } }), stack: [], heap: {} };
  const curr = { ...md(2, { event: "call", line: 1, locals: { n: 2 } }), stack: [], heap: {} };
  delete prev.stack; delete prev.heap; delete curr.stack; delete curr.heap;
  check({ name: "old-shape recursion", prev, curr, en: ["On line 4, max_depth calls itself again with n = 2."], es: ["max_depth se llama a sí misma otra vez con n = 2."] });
});

test("a first (non-recursive) call keeps the plain call template, with refs described", () => {
  check({
    name: "first call",
    prev: step({ line: 17, locals: { root: ref("o1") }, heap: TREE_HEAP, stack: [MOD] }),
    curr: md(1, { event: "call", line: 8, locals: { node: ref("o1") }, stack: [MOD, { ...F1, line: 8 }] }),
    en: ["Line 17 called the function max_depth with node = TreeNode(val=1), so Python jumps into it."],
    es: ["La línea 17 llamó a la función max_depth con node = TreeNode(val=1), así que Python entra en ella."],
    not_en: ["itself"],
  });
});

test("recursive return: gives back to the waiting call, then the caller's new variable", () => {
  const ret = md(2, { event: "return", line: 10, locals: { node: null }, returnValue: 0, stack: [MOD, F1, { ...F2, line: 10, locals: { node: null } }] });
  check({
    name: "return to a recursive caller",
    prev: md(2, { line: 10, locals: { node: null }, stack: [MOD, F1, { ...F2, line: 10, locals: { node: null } }] }),
    curr: ret,
    en: ["This call of max_depth is done and gives back 0 to the call of max_depth that was waiting for it."],
    es: ["Esta llamada a max_depth ya terminó y le devuelve 0 a la llamada de max_depth que la estaba esperando."],
  });
  check({
    name: "back in the recursive caller",
    prev: ret,
    curr: md(1, { line: 12, locals: { node: ref("o1"), left: 0 }, stack: [MOD, { ...F1_AFTER, locals: { node: ref("o1"), left: 0 } }] }),
    en: ["The inner call to max_depth gave back 0; back in the earlier call of max_depth, left is now 0.", "Line 12 is next"],
    es: ["La llamada interna a max_depth devolvió 0; de vuelta en la llamada anterior de max_depth, left ahora vale 0.", "Ahora sigue la línea 12"],
  });
});

test("return to the main program stores the result", () => {
  const ret = step({ event: "return", line: 3, functionName: "add", frameId: "a1", depth: 1, locals: { a: 2, b: 3, result: 5 }, returnValue: 5,
    stack: [{ functionName: "<module>", frameId: "module", line: 5, locals: {} }, { functionName: "add", frameId: "a1", line: 3, locals: { a: 2, b: 3, result: 5 } }] });
  check({
    name: "return to module",
    prev: ret,
    curr: step({ line: 6, locals: { total: 5 } }),
    en: ["The function add gave back 5; back in the main program, total is now 5.", "Line 6 is next"],
    es: ["La función add devolvió 5; de vuelta en el programa principal, total ahora vale 5."],
  });
});

test("class bodies are not called functions when the source is known", () => {
  const src = "class TreeNode:\n    def __init__(self, val):\n        self.val = val\n\nroot = TreeNode(1)\n";
  const mod = (fields) => step({ ...fields });
  const cls = (fields) => step({ functionName: "TreeNode", frameId: "c1", depth: 1, ...fields });
  const steps = [
    mod({ line: 1, event: "call" }),
    mod({ line: 1 }),
    cls({ line: 1, event: "call" }),
    cls({ line: 1 }),
    cls({ line: 2 }),
    cls({ line: 2, event: "return", returnValue: null }),
    mod({ line: 5, locals: { TreeNode: { __type__: "type" } } }),
  ];
  const want = {
    en: ["Python starts setting up the class TreeNode", "Python is now inside the class TreeNode.", "The class TreeNode is ready.", "Python finished setting up the class TreeNode"],
    es: ["Python empieza a preparar la clase TreeNode", "Python ya está dentro de la clase TreeNode.", "La clase TreeNode ya está lista.", "Python terminó de preparar la clase TreeNode"],
  };
  for (const lang of LANGS) {
    const texts = steps.map((s, i) => explainStep(steps[i - 1], s, lang, src));
    texts.forEach((t, i) => assertWellFormed(t, steps[i - 1], steps[i], lang, `[${lang}] class step ${i}`));
    const all = texts.join(" | ");
    for (const w of want[lang]) assert.ok(all.includes(w), `[${lang}] want ${w}\n got ${all}`);
    assert.doesNotMatch(all, /function TreeNode|función TreeNode/);
    // Without the source the old wording stays (the server has no source).
    assert.match(explainStep(steps[1], steps[2], lang), lang === "en" ? /function TreeNode/ : /función TreeNode/);
  }
});

// ---------------------------------------------------------------------------
// Priority, determinism, purity.

test("several changes: at most two items, structure changes first, then 'other things'", () => {
  const prev = step({ line: 5, locals: { seen: dict(), q: deque(1), i: 0, nums: [7, 8], a: 1, b: 1 } });
  const curr = step({ line: 6, locals: { seen: dict([1, 1]), q: deque(), i: 1, nums: [7, 8], a: 2, b: 2 } });
  check({
    name: "priority",
    prev, curr,
    en: ["seen now has key 1 with value 1, 1 was taken off the front of q, and other things changed too."],
    es: ["seen ahora tiene la clave 1 con el valor 1, 1 salió por el frente de q y también cambiaron otras cosas."],
  });
});

test("templates are deterministic and do not mutate their input", () => {
  const all = CASES.map((c) => [c.prev, c.curr, c.source]);
  const run = () => all.flatMap(([p, c, s]) => LANGS.map((lang) => explainStep(p, c, lang, s)));
  const first = run();
  assert.deepEqual(run(), first);
  const frozen = all.map(([p, c, s]) => [deepFreeze(structuredClone(p)), deepFreeze(structuredClone(c)), s]);
  assert.deepEqual(frozen.flatMap(([p, c, s]) => LANGS.map((lang) => explainStep(p, c, lang, s))), first);
});

function deepFreeze(v) {
  if (v && typeof v === "object") {
    Object.values(v).forEach(deepFreeze);
    Object.freeze(v);
  }
  return v;
}

test("explainStep still works with three arguments and with a non-string source", () => {
  const prev = step({ line: 1, locals: { s: set() } });
  const curr = step({ line: 2, locals: { s: set(3) } });
  assert.equal(explainStep(prev, curr, "en"), explainStep(prev, curr, "en", undefined));
  assert.equal(explainStep(prev, curr, "en"), explainStep(prev, curr, "en", 42));
});

test("no raw tags or heap ids in any text, whatever the values", () => {
  const heap = { o7: { id: "o7", type: "Box", fields: { inner: ref("o8") } }, o8: { id: "o8", type: "Box", fields: { v: { __type__: "function" } } } };
  const values = [
    dict([ref("o7"), set(1)]), set([1, 2]), deque(dict(["k", deque()])), ref("o7"), ref("o8"), ref("missing"),
    [ref("o7"), { __type__: "list", __len__: 99 }], [[dict()]], { __type__: "weird__name" },
  ];
  for (const a of values) {
    for (const b of values) {
      const prev = step({ line: 1, locals: { x: a, i: 0 }, heap });
      const curr = step({ line: 2, locals: { x: b, i: 0 }, heap, stdout: "" });
      for (const lang of LANGS) {
        const text = explainStep(prev, curr, lang, "x = 1\nif i in x:\n    pass\n");
        assert.doesNotMatch(text, /__(dict|set|deque|ref)|\{"__|\bo[78]\b|missing/, `[${lang}] ${text}`);
        assert.deepEqual(inventedNumbers(text, prev, curr), [], `[${lang}] ${text}`);
      }
    }
  }
});

test("the number check accepts tagged contents, heap fields and stack locals, but not ids, index or depth", () => {
  const prev = step({
    index: 41, depth: 3, line: 2,
    locals: { seen: dict([12, 13]), node: ref("o77") },
    heap: { o77: { id: "o77", type: "TreeNode", fields: { val: 55 } } },
    stack: [{ functionName: "<module>", frameId: "module", line: 30, locals: { total: 66 } }],
  });
  const curr = step({ ...prev, index: 42, stack: prev.stack });
  assert.deepEqual(inventedNumbers("seen has 12 -> 13, val 55, total 66, line 30", prev, curr), []);
  assert.deepEqual(inventedNumbers("heap id 77, step 41 or 42, depth 3", prev, curr), ["77", "41", "42", "3"]);
  // Array positions are not sources: [9, 9] has no 0 or 1 in it.
  const p2 = step({ line: 5, locals: { a: [9, 9] } });
  assert.deepEqual(inventedNumbers("a[0] and a[1]", p2, p2), ["0", "1"]);
});


// ---- any if / elif / while condition: say whether it was True or False ----------

const BRANCH_SRC = [
  "total = 0",
  "while left < right:",
  "    total = nums[left] + nums[right]",
  "    if total == target:",
  "        print(total)",
  "    elif total < target:",
  "        left += 1",
  "    if total > 99:",
  "        print(total)",
  "print(left)",
].join("\n") + "\n";
const vars = { nums: [1, 2, 4], left: 0, right: 2, target: 6, total: 5 };

test("an if condition that was True: Python goes into that block", () => {
  check({
    name: "if true",
    source: BRANCH_SRC,
    prev: step({ line: 4, locals: { ...vars, total: 6 } }),
    curr: step({ line: 5, locals: { ...vars, total: 6 } }),
    en: ["Line 4 just checked total == target, so it's True and Python goes into that block."],
    es: ["Ya se ejecutó la línea 4, que comprobó total == target, así que da True y Python entra en ese bloque."],
  });
});

test("an if condition that was False: Python skips that block (and elif is checked next)", () => {
  check({
    name: "if false",
    source: BRANCH_SRC,
    prev: step({ line: 4, locals: vars }),
    curr: step({ line: 6, locals: vars }),
    en: ["Line 4 just checked total == target, so it's False and Python skips that block."],
    es: ["así que da False y Python se salta ese bloque."],
  });
  check({
    name: "elif true",
    source: BRANCH_SRC,
    prev: step({ line: 6, locals: vars }),
    curr: step({ line: 7, locals: vars }),
    en: ["Line 6 just checked total < target, so it's True and Python goes into that block."],
  });
});

test("a while condition: True runs the loop body, False leaves the loop", () => {
  check({
    name: "while true",
    source: BRANCH_SRC,
    prev: step({ line: 2, locals: vars }),
    curr: step({ line: 3, locals: vars }),
    en: ["Line 2 just checked left < right, so it's True and Python runs the loop body."],
    es: ["así que da True y Python ejecuta el cuerpo del bucle."],
  });
  check({
    name: "while false",
    source: BRANCH_SRC,
    prev: step({ line: 2, locals: { ...vars, left: 2 } }),
    curr: step({ line: 10, locals: { ...vars, left: 2 } }),
    en: ["Line 2 just checked left < right, so it's False and Python leaves the loop."],
  });
});

test("a condition with a number that is not in the data is not quoted (no invented numbers)", () => {
  check({
    name: "literal in condition",
    source: BRANCH_SRC,
    prev: step({ line: 8, locals: vars }),
    curr: step({ line: 10, locals: vars }),
    en: ["Line 8 just checked its condition, so it's False and Python skips that block."],
    not_en: ["99"],
    es: ["que comprobó su condición, así que da False"],
  });
});
