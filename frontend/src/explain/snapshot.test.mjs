// Tests for the shared value helpers (snapshot.ts, describe.ts). Run from the repo root:
//   node --test frontend/src/explain/snapshot.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  describeShort,
  diffHeap,
  diffValue,
  dictEntries,
  itemsOf,
  kindOf,
  POINTER_NAMES,
  resolveRef,
  sameValue,
} from "./snapshot.ts";

const dict = (...pairs) => ({ __dict: pairs });
const set = (...items) => ({ __set: items });
const deque = (...items) => ({ __deque: items });
const ref = (id) => ({ __ref: id });

const HEAP = {
  o1: { id: "o1", type: "TreeNode", fields: { val: 2, left: ref("o2"), right: null } },
  o2: { id: "o2", type: "TreeNode", fields: { val: 4, left: null, right: null } },
  o3: { id: "o3", type: "Graph", fields: { nodes: [1, 2] } },
};

test("kindOf: one kind per value form", () => {
  const cases = [
    [null, "primitive"], [true, "primitive"], [3, "primitive"], [2.5, "primitive"], ["hi", "primitive"],
    [[], "array"], [[1, 2], "array"], [[1, [2]], "array"],
    [[[1], [2, 3]], "grid"], [[[]], "grid"],
    [set(1, 2), "set"], [set(), "set"],
    [dict([4, 0]), "dict"], [dict(), "dict"],
    [deque("A"), "deque"], [deque(), "deque"],
    [ref("o1"), "ref"],
    [{ __type__: "function" }, "placeholder"], [{ __type__: "list", __len__: 25 }, "placeholder"],
    [{ a: 1 }, "dict"], // old-shape fixtures wrote dicts as plain objects
  ];
  for (const [v, kind] of cases) assert.equal(kindOf(v), kind, JSON.stringify(v));
});

test("resolveRef finds heap objects and ignores everything else", () => {
  assert.equal(resolveRef(ref("o1"), HEAP), HEAP.o1);
  assert.equal(resolveRef(ref("o9"), HEAP), undefined);
  assert.equal(resolveRef(ref("o1"), {}), undefined);
  assert.equal(resolveRef({ __ref: "toString" }, {}), undefined, "no prototype lookups");
  assert.equal(resolveRef([1], HEAP), undefined);
  assert.equal(resolveRef(dict(["__ref", "o1"]), HEAP), undefined);
});

test("dictEntries and itemsOf read the tagged forms (and legacy dicts)", () => {
  assert.deepEqual(dictEntries(dict([4, 0], ["a", [1]])), [[4, 0], ["a", [1]]]);
  assert.deepEqual(dictEntries({ a: 1 }), [["a", 1]]);
  assert.deepEqual(dictEntries({ __type__: "dict", __len__: 30 }), []);
  assert.deepEqual(itemsOf(set(1, 2)), [1, 2]);
  assert.deepEqual(itemsOf(deque("A", "B")), ["A", "B"]);
  assert.deepEqual(itemsOf([[1], [2]]), [[1], [2]]);
  assert.deepEqual(itemsOf(3), []);
});

test("sameValue: sets and dicts ignore order, arrays and deques do not", () => {
  assert.ok(sameValue(set(1, 2), set(2, 1)));
  assert.ok(!sameValue(set(1, 2), set(1, 3)));
  assert.ok(sameValue(dict([1, "a"], [2, "b"]), dict([2, "b"], [1, "a"])));
  assert.ok(!sameValue(dict([1, "a"]), dict([1, "b"])));
  assert.ok(!sameValue(dict([1, "a"]), dict(["1", "a"])), "int key 1 is not string key '1'");
  assert.ok(sameValue({ a: 1, b: 2 }, { b: 2, a: 1 }));
  assert.ok(sameValue([1, [2, 3]], [1, [2, 3]]));
  assert.ok(!sameValue([1, 2], [2, 1]));
  assert.ok(!sameValue(deque(1, 2), deque(2, 1)));
  assert.ok(sameValue(ref("o1"), ref("o1")));
  assert.ok(!sameValue(ref("o1"), ref("o2")));
  assert.ok(sameValue({ __type__: "list", __len__: 3 }, { __type__: "list", __len__: 3 }));
  assert.ok(!sameValue({ __type__: "list", __len__: 3 }, { __type__: "list", __len__: 4 }));
  assert.ok(!sameValue(set(1), [1]));
  assert.ok(!sameValue(dict(), set()));
  assert.ok(sameValue(undefined, undefined));
  assert.ok(!sameValue(undefined, null));
  assert.ok(!sameValue(0, false));
});

test("POINTER_NAMES is exactly the agreed list", () => {
  assert.deepEqual([...POINTER_NAMES], ["i", "j", "k", "l", "r", "lo", "hi", "left", "right", "mid", "start", "end", "slow", "fast"]);
  assert.ok(Object.isFrozen(POINTER_NAMES));
});

test("diffValue: dict keys added, changed, removed (any key type)", () => {
  assert.deepEqual(diffValue(dict(), dict([4, 0])), [{ kind: "added", key: 4, value: 0 }]);
  assert.deepEqual(diffValue(dict([4, 0]), dict([4, 0], [9, 1])), [{ kind: "added", key: 9, value: 1 }]);
  assert.deepEqual(diffValue(dict(["B", 1]), dict(["B", 2])), [{ kind: "changed", key: "B", before: 1, after: 2 }]);
  assert.deepEqual(diffValue(dict(["x", 1], ["y", 2]), dict(["y", 2])), [{ kind: "removed", key: "x", value: 1 }]);
  assert.deepEqual(
    diffValue(dict([[1, 2], "t"]), dict([[1, 2], "u"], [3, null])),
    [{ kind: "changed", key: [1, 2], before: "t", after: "u" }, { kind: "added", key: 3, value: null }],
  );
  assert.deepEqual(diffValue(dict([1, 1], [2, 2]), dict([2, 2], [1, 1])), [], "reordering is not a change");
});

test("diffValue: set items added and removed", () => {
  assert.deepEqual(diffValue(set(), set(5)), [{ kind: "added", key: 5 }]);
  assert.deepEqual(diffValue(set(1, 5), set(1)), [{ kind: "removed", key: 5 }]);
  assert.deepEqual(diffValue(set("A"), set("A", "B")), [{ kind: "added", key: "B" }]);
  assert.deepEqual(diffValue(set(1, 2), set(2, 1)), []);
});

test("diffValue: array cells, appends and pops", () => {
  assert.deepEqual(diffValue([0, 0, 0], [0, 2, 0]), [{ kind: "changed", key: 1, before: 0, after: 2 }]);
  assert.deepEqual(diffValue([3, 1], [3, 1, 2]), [{ kind: "added", key: 2, value: 2 }]);
  assert.deepEqual(diffValue([3, 1, 2], [3, 1]), [{ kind: "removed", key: 2, value: 2 }]);
  assert.deepEqual(diffValue([], [7]), [{ kind: "added", key: 0, value: 7 }]);
  assert.deepEqual(diffValue([1, 2], [1, 2]), []);
});

test("diffValue: grid cells use [row, col]; a reshaped row is one change", () => {
  assert.deepEqual(diffValue([[0, 0], [0, 0]], [[0, 0], [0, 5]]), [{ kind: "changed", key: [1, 1], before: 0, after: 5 }]);
  assert.deepEqual(diffValue([[1], [2]], [[1], [2, 3]]), [{ kind: "changed", key: 1, before: [2], after: [2, 3] }]);
  assert.deepEqual(diffValue([[1]], [[1], [2]]), [{ kind: "added", key: 1, value: [2] }]);
  assert.deepEqual(diffValue([], [[1]]), [{ kind: "added", key: 0, value: [1] }], "array becoming a grid still diffs");
});

test("diffValue: deque pushes and pops at both ends", () => {
  const d = (a, b) => diffValue(deque(...a), deque(...b));
  // BFS: popleft, then (in later steps) append.
  assert.deepEqual(d(["A"], []), [{ kind: "popped", end: "front", value: "A" }]);
  assert.deepEqual(d([], ["B"]), [{ kind: "pushed", end: "back", value: "B" }]);
  assert.deepEqual(d(["B"], ["B", "C"]), [{ kind: "pushed", end: "back", value: "C" }]);
  // popleft followed by append within one step.
  assert.deepEqual(d([1, 2], [2, 3]), [
    { kind: "popped", end: "front", value: 1 },
    { kind: "pushed", end: "back", value: 3 },
  ]);
  assert.deepEqual(d([1], [2, 3]), [
    { kind: "popped", end: "front", value: 1 },
    { kind: "pushed", end: "back", value: 2 },
    { kind: "pushed", end: "back", value: 3 },
  ]);
  // Stack-like use of a deque: pop() and appendleft().
  assert.deepEqual(d([1, 2, 3], [1, 2]), [{ kind: "popped", end: "back", value: 3 }]);
  assert.deepEqual(d([1, 2], [0, 1, 2]), [{ kind: "pushed", end: "front", value: 0 }]);
  assert.deepEqual(d([1, 2, 3], [0, 1, 2]), [
    { kind: "popped", end: "back", value: 3 },
    { kind: "pushed", end: "front", value: 0 },
  ]);
  // Two appendleft calls: listed in the order they happened.
  assert.deepEqual(d([5], [7, 6, 5]), [
    { kind: "pushed", end: "front", value: 6 },
    { kind: "pushed", end: "front", value: 7 },
  ]);
  // Two pops from the back, in the order they happened.
  assert.deepEqual(d([1, 2, 3], [1]), [
    { kind: "popped", end: "back", value: 3 },
    { kind: "popped", end: "back", value: 2 },
  ]);
  // Repeated values: the queue-like reading wins a tie.
  assert.deepEqual(d([1, 1], [1, 1, 1]), [{ kind: "pushed", end: "back", value: 1 }]);
  assert.deepEqual(d([1, 1], [1]), [{ kind: "popped", end: "front", value: 1 }]);
  // Nothing kept: everything left the front, everything new joined the back.
  assert.deepEqual(d(["x"], ["y"]), [
    { kind: "popped", end: "front", value: "x" },
    { kind: "pushed", end: "back", value: "y" },
  ]);
  assert.deepEqual(d([1, 2], [1, 2]), []);
  assert.deepEqual(d([], []), []);
});

test("diffValue: new variables, replaced kinds and scalars give no inner changes", () => {
  assert.deepEqual(diffValue(undefined, dict([1, 1])), []);
  assert.deepEqual(diffValue(set(1), [1]), []);
  assert.deepEqual(diffValue(1, 2), []);
  assert.deepEqual(diffValue(ref("o1"), ref("o2")), []);
  assert.deepEqual(diffValue({ __type__: "list", __len__: 21 }, { __type__: "list", __len__: 22 }), []);
});

test("diffHeap: field changes per id; new or vanished objects are not field changes", () => {
  const prev = { o1: { id: "o1", type: "TreeNode", fields: { val: 1, extra: 0 } } };
  const curr = {
    o1: { id: "o1", type: "TreeNode", fields: { val: 2, left: null } },
    o2: { id: "o2", type: "TreeNode", fields: { val: 9 } },
  };
  assert.deepEqual(diffHeap(prev, curr), [
    { id: "o1", type: "TreeNode", field: "val", kind: "changed", before: 1, after: 2 },
    { id: "o1", type: "TreeNode", field: "left", kind: "added", after: null },
    { id: "o1", type: "TreeNode", field: "extra", kind: "removed", before: 0 },
  ]);
  assert.deepEqual(diffHeap(curr, curr), []);
  assert.deepEqual(diffHeap(undefined, curr), []);
});

test("describeShort renders every form readably in both languages, without raw tags or ids", () => {
  const cases = [
    [dict([4, 0], [9, 1]), "{4: 0, 9: 1}", "{4: 0, 9: 1}"],
    [dict(["A", ["B", "C"]]), '{"A": ["B", "C"]}', '{"A": ["B", "C"]}'],
    [dict(), "{}", "{}"],
    [set(1, 5), "{1, 5}", "{1, 5}"],
    [set(), "set()", "set()"],
    [deque("A", "B"), 'deque(["A", "B"])', 'deque(["A", "B"])'],
    [ref("o1"), "TreeNode(val=2)", "TreeNode(val=2)"],
    [ref("o3"), "a Graph object", "un objeto Graph"],
    [ref("o9"), "an object", "un objeto"],
    [[ref("o1"), ref("o3")], "[TreeNode(val=2), <Graph>]", "[TreeNode(val=2), <Graph>]"],
    [{ __type__: "list", __len__: 25 }, "a list with 25 items", "una lista con 25 elementos"],
    [{ __type__: "deque", __len__: 30 }, "a queue (deque) with 30 items", "una cola (deque) con 30 elementos"],
    [[[0, 1], [1, 2]], "[[0, 1], [1, 2]]", "[[0, 1], [1, 2]]"],
    [null, "None", "None"],
  ];
  for (const [v, en, es] of cases) {
    assert.equal(describeShort(v, HEAP, "en"), en);
    assert.equal(describeShort(v, HEAP, "es"), es);
    for (const text of [describeShort(v, HEAP, "en"), describeShort(v, HEAP, "es")]) {
      assert.doesNotMatch(text, /__|o\d/, `raw tag or heap id in ${text}`);
    }
  }
  assert.equal(describeShort(dict([1, 2])), "{1: 2}", "heap and lang are optional");
});
