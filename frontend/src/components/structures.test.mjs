// Tests for the UI's pure logic: value text, renderer choice, pointers,
// change text, frames, and jump-to-change. Run from the repo root:
//   node --test frontend/src/components/*.test.mjs
// Node 24 strips TypeScript types natively; every import uses a .ts extension.

import { test } from "node:test";
import assert from "node:assert/strict";
import { formatValue, objectShort } from "./values.ts";
import {
  aliasesIn,
  describeChange,
  framesOf,
  lineUses,
  pointersFor,
  structuresFor,
  summarizeChanges,
  topStructureChange,
  viewKindOf,
} from "./structures.ts";
import { findChange, ownerFrame, variableNames } from "./jump.ts";

function step(fields) {
  return {
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
}

const HEAP = {
  o1: { id: "o1", type: "TreeNode", fields: { val: 1, left: { __ref: "o2" }, right: null } },
  o2: { id: "o2", type: "TreeNode", fields: { val: 2, left: null, right: null } },
  o3: { id: "o3", type: "Thing", fields: { child: { __ref: "o1" } } },
};

// ---- formatValue: every form is readable, no raw tags -------------------

test("formatValue writes every contract form as Python-like text", () => {
  assert.equal(formatValue({ __dict: [[4, 0], [9, 1]] }), "{4: 0, 9: 1}");
  assert.equal(formatValue({ __dict: [["A", ["B", "C"]]] }), "{'A': ['B', 'C']}");
  assert.equal(formatValue({ __dict: [] }), "{}");
  assert.equal(formatValue({ __set: [1, 5, 8] }), "{1, 5, 8}");
  assert.equal(formatValue({ __set: [] }), "set()");
  assert.equal(formatValue({ __deque: ["A", "B"] }), "deque(['A', 'B'])");
  assert.equal(formatValue({ __ref: "o2" }, HEAP), "TreeNode(val=2)");
  assert.equal(formatValue({ __ref: "zz" }, HEAP), "object (not shown)");
  assert.equal(formatValue({ __type__: "function" }), "function (not shown)");
  assert.equal(formatValue({ __type__: "list", __len__: 30 }), "list with 30 items (too long to show)");
  assert.equal(formatValue([[0, 1], [2, 3]]), "[[0, 1], [2, 3]]");
  assert.equal(formatValue([null, true, "it's"]), `[None, True, "it's"]`);
});

test("formatValue reads old-shape plain-object dicts", () => {
  assert.equal(formatValue({ a: 1, b: [2] }), "{'a': 1, 'b': [2]}");
});

test("formatValue never shows a raw tag", () => {
  const values = [
    { __dict: [[1, { __set: [2] }]] },
    { __deque: [{ __ref: "o1" }] },
    [{ __dict: [] }, { __set: [] }],
    { __ref: "o3" },
  ];
  for (const v of values) assert.doesNotMatch(formatValue(v, HEAP), /__/);
});

test("objectShort names an object by val, else its first primitive field", () => {
  assert.equal(objectShort(HEAP.o1), "TreeNode(val=1)");
  assert.equal(objectShort({ id: "x", type: "P", fields: { a: [1], b: "hi" } }), "P(b='hi')");
  assert.equal(objectShort(HEAP.o3), "Thing object");
});

// ---- renderer choice ----------------------------------------------------

test("viewKindOf picks a renderer from the value's shape", () => {
  assert.equal(viewKindOf([1, 2]), "array");
  assert.equal(viewKindOf([]), "array");
  assert.equal(viewKindOf([[0], [1]]), "grid");
  assert.equal(viewKindOf({ __dict: [] }), "dict");
  assert.equal(viewKindOf({ __set: [] }), "set");
  assert.equal(viewKindOf({ __deque: [] }), "deque");
  assert.equal(viewKindOf({ __ref: "o1" }), "ref");
  assert.equal(viewKindOf({ legacy: 1 }), "dict");
  assert.equal(viewKindOf(3), null);
  assert.equal(viewKindOf("s"), null);
  assert.equal(viewKindOf(null), null);
  assert.equal(viewKindOf({ __type__: "function" }), null);
});

// ---- pointers -----------------------------------------------------------

test("pointersFor marks valid indexes of pointer-named int locals", () => {
  const locals = { nums: [1, 3, 4, 6], left: 0, right: 3, total: 2, i: 9, mid: -1, k: 1.5, lo: true, hi: 0 };
  assert.deepEqual(pointersFor(4, locals), [["left", "hi"], [], [], ["right"]]);
  assert.deepEqual(pointersFor(0, locals), []);
});

test("lineUses matches whole identifiers only", () => {
  assert.equal(lineUses("total = nums[left] + nums[right]", "left"), true);
  assert.equal(lineUses("lefty = 1", "left"), false);
  assert.equal(lineUses("ways[i] = ways[i - 1]", "i"), true);
  assert.equal(lineUses("print(x)", "i"), false);
});

// ---- structures and change markers --------------------------------------

test("structuresFor lists structures in local order with dict/set changes", () => {
  const prev = { nums: [4, 9], seen: { __dict: [[4, 0]] }, s: { __set: [1] }, n: 4 };
  const curr = { nums: [4, 9], seen: { __dict: [[4, 0], [9, 1]] }, s: { __set: [] }, n: 9, q: { __deque: [] } };
  const items = structuresFor(curr, prev);
  assert.deepEqual(items.map((it) => it.name), ["nums", "seen", "s", "q"]);
  assert.deepEqual(items[0].changes, []);
  assert.deepEqual(items[1].changes, [{ kind: "added", key: 9, value: 1 }]);
  assert.deepEqual(items[2].changes, [{ kind: "removed", key: 1 }]);
  assert.equal(items[3].isNew, true);
});

test("structuresFor without a comparison step shows no markers", () => {
  const items = structuresFor({ seen: { __dict: [[1, 2]] } }, undefined);
  assert.equal(items[0].isNew, false);
  assert.deepEqual(items[0].changes, []);
});

test("structuresFor flags a replaced value and refs to the same object", () => {
  const items = structuresFor(
    { node: { __ref: "o2" }, other: { __ref: "o2" }, root: { __ref: "o1" } },
    { node: { __ref: "o1" }, other: { __ref: "o2" }, root: { __ref: "o1" } },
  );
  assert.equal(items[0].replaced, true);
  assert.equal(items[1].aliasOf, "node");
  assert.equal(items[2].aliasOf, undefined);
  assert.deepEqual([...aliasesIn({ a: { __ref: "o1" }, b: 1, c: { __ref: "o1" } })], [["c", "a"]]);
});

test("describeChange words every change kind in text", () => {
  assert.equal(describeChange({ kind: "added", key: 9, value: 1 }, "dict"), "added key 9 with value 1");
  assert.equal(describeChange({ kind: "changed", key: "A", before: 0, after: 1 }, "dict"), "key 'A': 0 → 1");
  assert.equal(describeChange({ kind: "removed", key: 4, value: 0 }, "dict"), "removed key 4");
  assert.equal(describeChange({ kind: "added", key: 5 }, "set"), "added 5");
  assert.equal(describeChange({ kind: "removed", key: 5 }, "set"), "removed 5");
  assert.equal(describeChange({ kind: "changed", key: 2, before: 0, after: 2 }, "array"), "index 2: 0 → 2");
  assert.equal(
    describeChange({ kind: "changed", key: 2, before: 0, after: 2 }, "array", undefined, true),
    "index 2: changed from 0 to 2",
  );
  assert.equal(describeChange({ kind: "changed", key: [1, 2], before: 0, after: 3 }, "grid"), "row 1, column 2: 0 → 3");
  assert.equal(describeChange({ kind: "added", key: 3, value: 7 }, "array"), "added 7 at index 3");
  assert.equal(describeChange({ kind: "pushed", end: "back", value: "B" }, "deque"), "added 'B' at back");
  assert.equal(describeChange({ kind: "popped", end: "front", value: "A" }, "deque"), "removed 'A' from front");
});

test("summarizeChanges and topStructureChange", () => {
  const changes = [
    { kind: "added", key: 1 },
    { kind: "added", key: 2 },
    { kind: "added", key: 3 },
  ];
  assert.equal(summarizeChanges(changes, "set"), "added 1 and 2 more changes");
  const items = structuresFor({ a: [1], seen: { __dict: [[9, 1]] } }, { a: [1], seen: { __dict: [] } });
  assert.equal(topStructureChange(items), "seen: added key 9 with value 1.");
  assert.equal(topStructureChange([]), "");
  for (const text of [topStructureChange(items)]) assert.doesNotMatch(text, /→/);
});

// ---- frames ---------------------------------------------------------------

test("framesOf uses the stack, current frame last, with current locals", () => {
  const s = step({
    functionName: "f",
    frameId: "f-1",
    line: 3,
    locals: { x: 2 },
    stack: [
      { functionName: "<module>", frameId: "module", line: 7, locals: { y: 1 } },
      { functionName: "f", frameId: "f-1", line: 3, locals: {} },
    ],
  });
  const frames = framesOf(s);
  assert.equal(frames.length, 2);
  assert.deepEqual(frames[1].locals, { x: 2 });
  assert.equal(frames[0].frameId, "module");
});

test("framesOf falls back to the current frame for old fixtures", () => {
  const s = step({ locals: { a: 1 } });
  delete s.stack;
  assert.deepEqual(framesOf(s), [{ functionName: "<module>", frameId: "module", line: 1, locals: { a: 1 } }]);
});

// ---- jump to change -------------------------------------------------------

const LOOP = [
  step({ index: 0, locals: {} }),
  step({ index: 1, locals: { total: 0 } }),
  step({ index: 2, locals: { total: 0, n: 3 } }),
  step({ index: 3, locals: { total: 3, n: 3 } }),
  step({ index: 4, locals: { total: 3, n: 1 } }),
  step({ index: 5, locals: { total: 4, n: 1 } }),
];

test("variableNames lists every local in order of first appearance", () => {
  assert.deepEqual(variableNames(LOOP), ["total", "n"]);
});

test("findChange forward finds the next differing step", () => {
  assert.equal(findChange(LOOP, 1, "total", 1), 3);
  assert.equal(findChange(LOOP, 3, "total", 1), 5);
  assert.equal(findChange(LOOP, 5, "total", 1), -1);
  assert.equal(findChange(LOOP, 0, "n", 1), 2); // appears
});

test("findChange backward lands on the step where the value changed", () => {
  assert.equal(findChange(LOOP, 5, "total", -1), 3);
  assert.equal(findChange(LOOP, 4, "total", -1), 3);
  assert.equal(findChange(LOOP, 3, "total", -1), 1);
  assert.equal(findChange(LOOP, 1, "total", -1), -1);
  assert.equal(findChange(LOOP, 0, "total", -1), -1);
});

test("findChange compares structures with sameValue", () => {
  const steps = [
    step({ index: 0, locals: { s: { __set: [1, 2] } } }),
    step({ index: 1, locals: { s: { __set: [2, 1] } } }),
    step({ index: 2, locals: { s: { __set: [1, 2, 3] } } }),
  ];
  assert.equal(findChange(steps, 0, "s", 1), 2);
});

test("findChange tracks a variable in its own frame across calls", () => {
  const mod = (index, locals, extra = {}) => step({ index, locals, ...extra });
  const inF = (index, locals, total) =>
    step({
      index,
      functionName: "f",
      frameId: "f-1",
      depth: 1,
      locals,
      stack: [
        { functionName: "<module>", frameId: "module", line: 5, locals: { total } },
        { functionName: "f", frameId: "f-1", line: 2, locals },
      ],
    });
  const steps = [
    mod(0, { total: 1 }),
    inF(1, { a: 1 }, 1),
    inF(2, { a: 1, b: 2 }, 1),
    mod(3, { total: 1 }),
    mod(4, { total: 3 }),
  ];
  // From inside f, total belongs to the module frame: f's steps are skipped.
  assert.deepEqual(ownerFrame(steps, 1, "total")?.frameId, "module");
  assert.equal(findChange(steps, 1, "total", 1), 4);
  assert.equal(findChange(steps, 0, "total", 1), 4);
  // b changes inside f; after f returns there is no later change in that call.
  assert.equal(findChange(steps, 1, "b", 1), 2);
  assert.equal(findChange(steps, 2, "b", 1), -1);
  assert.equal(findChange(steps, 2, "a", -1), 1);
});

test("findChange stays fast on a 2000-step trace", () => {
  const steps = Array.from({ length: 2000 }, (_, i) =>
    step({ index: i, locals: { seen: { __dict: Array.from({ length: 20 }, (_, k) => [k, 0]) }, i: i < 1999 ? 0 : 1 } }),
  );
  const t0 = performance.now();
  assert.equal(findChange(steps, 0, "seen", 1), -1);
  assert.equal(findChange(steps, 0, "i", 1), 1999);
  assert.equal(findChange(steps, 1999, "i", -1), 0); // i appeared at step 0
  assert.ok(performance.now() - t0 < 500);
});
