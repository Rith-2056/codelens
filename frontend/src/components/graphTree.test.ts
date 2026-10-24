import { describe, expect, it } from "vitest";
import type { JsonValue, TraceResult, TraceStep } from "../types/trace";
import hopsRaw from "../../../shared/fixtures/network-hops.json?raw";
import treeRaw from "../../../shared/fixtures/tree-height.json?raw";
import { framesOf } from "./structures";
import {
  circleLayout,
  graphBadges,
  graphOf,
  isTreeNodeRef,
  treeBadges,
  treeIds,
  treeLayout,
  treeOf,
  treeRootFor,
  treesIn,
  type TreeNode,
} from "./graphTree";

const hops = JSON.parse(hopsRaw) as TraceResult;
const tree = JSON.parse(treeRaw) as TraceResult;

const dict = (pairs: [JsonValue, JsonValue][]): JsonValue => ({ __dict: pairs });
const set = (items: JsonValue[]): JsonValue => ({ __set: items });
const deque = (items: JsonValue[]): JsonValue => ({ __deque: items });

/** The BFS step where the queue holds something and visited has grown. */
function bfsStep(): TraceStep {
  const s = hops.steps.find((st) => {
    const q = st.locals.queue as { __deque?: JsonValue[] } | undefined;
    const v = st.locals.visited as { __set?: JsonValue[] } | undefined;
    return q?.__deque && q.__deque.length > 0 && v?.__set && v.__set.length >= 3 && "person" in st.locals;
  });
  if (!s) throw new Error("fixture has no mid-BFS step");
  return s;
}

/** The deepest step of the tree-height recursion where `node` is a real node (not the None base case). */
function deepestStep(): TraceStep {
  const withNode = tree.steps.filter((s) => isTreeNodeRef(s.locals.node ?? null, s.heap));
  return withNode.reduce((a, b) => (b.stack.length > a.stack.length ? b : a));
}

const labels = (n: TreeNode | null): string[] => (n ? [...labels(n.left), n.label, ...labels(n.right)] : []);

describe("graphOf", () => {
  it("reads the BFS adjacency dict as an undirected graph", () => {
    const g = graphOf(bfsStep().locals.graph!);
    expect(g).not.toBeNull();
    expect(g!.nodes).toEqual(["A", "B", "C", "D", "E"]);
    expect(g!.directed).toBe(false);
    const edges = g!.edges.map(([a, b]) => [a, b].sort().join("-")).sort();
    expect(edges).toEqual(["A-B", "A-C", "B-D", "C-D", "D-E"]);
  });

  it("keeps edge direction when a link has no way back", () => {
    const g = graphOf(dict([["a", ["b"]], ["b", []]]));
    expect(g).toEqual({ nodes: ["a", "b"], edges: [["a", "b"]], directed: true });
  });

  it("accepts sets as neighbor lists and int node names", () => {
    const g = graphOf(dict([[1, set([2])], [2, set([1])]]));
    expect(g?.nodes).toEqual([1, 2]);
    expect(g?.edges).toEqual([[1, 2]]);
  });

  it("is not a graph when values are not neighbor lists of its own keys", () => {
    expect(graphOf(dict([["A", 0], ["B", 1]]))).toBeNull(); // the hops dict
    expect(graphOf(dict([["A", ["Z"]], ["B", []]]))).toBeNull(); // Z is not a key
    expect(graphOf(dict([["A", ["A"]]]))).toBeNull(); // fewer than 2 nodes
    expect(graphOf(dict([["A", [["B"]]], ["B", []]]))).toBeNull(); // nested list
    expect(graphOf([1, 2, 3])).toBeNull();
    expect(graphOf({ __type__: "dict", __len__: 30 })).toBeNull();
  });
});

describe("graphBadges", () => {
  it("names the sets, queues, and variables a node is in, in text", () => {
    const locals = {
      graph: dict([["A", ["B"]], ["B", ["A"]]]),
      visited: set(["A", "B"]),
      queue: deque(["B"]),
      person: "A",
      friend: "B",
    };
    expect(graphBadges("A", locals, "graph")).toEqual(["in visited", "← person"]);
    expect(graphBadges("B", locals, "graph")).toEqual(["in visited", "in queue", "← friend"]);
    expect(graphBadges("C", locals, "graph")).toEqual([]);
  });

  it("does not badge a node with the graph itself or with other dicts", () => {
    const locals = { graph: dict([["A", []], ["B", []]]), hops: dict([["A", 0]]) };
    expect(graphBadges("A", locals, "graph")).toEqual([]);
  });
});

describe("circleLayout", () => {
  it("places nodes on a circle inside the box, in a fixed order", () => {
    const pts = circleLayout(5, 200);
    expect(pts).toHaveLength(5);
    expect(circleLayout(5, 200)).toEqual(pts);
    for (const p of pts) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(200);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(200);
    }
    expect(pts[0]!.y).toBeLessThan(pts[2]!.y); // first node at the top
  });

  it("puts a single node in the middle", () => {
    expect(circleLayout(1, 100)).toEqual([{ x: 50, y: 50 }]);
  });
});

describe("trees", () => {
  const last = tree.steps[tree.steps.length - 1]!;
  const root = last.locals.root!;

  it("recognises TreeNode refs with left and right fields", () => {
    expect(isTreeNodeRef(root, last.heap)).toBe(true);
    expect(isTreeNodeRef(5, last.heap)).toBe(false);
    expect(isTreeNodeRef({ __ref: "nope" }, last.heap)).toBe(false);
  });

  it("builds the lesson's tree from the root", () => {
    const t = treeOf(root, last.heap);
    expect(t?.label).toBe("1");
    expect(labels(t)).toEqual(["4", "2", "1", "3", "6", "5"]); // in-order
  });

  it("refuses cycles and objects that are not tree nodes", () => {
    const heap = {
      o1: { id: "o1", type: "Node", fields: { val: 1, left: { __ref: "o2" }, right: null } },
      o2: { id: "o2", type: "Node", fields: { val: 2, left: { __ref: "o1" }, right: null } },
      o3: { id: "o3", type: "Point", fields: { x: 1, y: 2 } },
      o4: { id: "o4", type: "Node", fields: { val: 4, left: { __ref: "o3" }, right: null } },
    };
    expect(treeOf({ __ref: "o1" }, heap)).toBeNull();
    expect(isTreeNodeRef({ __ref: "o3" }, heap)).toBe(false);
    expect(treeOf({ __ref: "o4" }, heap)).toBeNull(); // child of another type
  });

  it("draws the whole tree from the outermost root during recursion", () => {
    const step = deepestStep();
    const frames = framesOf(step);
    const current = step.locals.node!;
    const t = treeRootFor(current, frames, step.heap);
    expect(t?.label).toBe("1");
  });

  it("badges nodes with the variables that point at them, marking the running call", () => {
    const step = deepestStep();
    const badges = treeBadges(framesOf(step), step.heap);
    const all = [...badges.values()].flat();
    expect(all).toContain("root in main program");
    expect(all.filter((b) => b.endsWith("(running)"))).toHaveLength(1);
    expect(all.some((b) => /^node in max_depth\(\) #\d+$/.test(b))).toBe(true);
  });

  it("finds each distinct tree once, named by its outermost variable", () => {
    for (const step of [deepestStep(), last]) {
      const trees = treesIn(framesOf(step), step.heap);
      expect(trees).toHaveLength(1);
      expect(trees[0]!.name).toBe("root");
      expect(trees[0]!.where).toBe("main program");
      expect(treeIds(trees[0]!.root)).toHaveLength(6);
    }
    const first = tree.steps[0]!;
    expect(treesIn(framesOf(first), first.heap)).toEqual([]);
  });

  it("lays out in order: left subtree, node, right subtree; depth from the root", () => {
    const t = treeOf(root, last.heap)!;
    const pos = treeLayout(t);
    expect(pos.get(t.id)?.depth).toBe(0);
    expect(pos.get(t.left!.id)!.x).toBeLessThan(pos.get(t.id)!.x);
    expect(pos.get(t.right!.id)!.x).toBeGreaterThan(pos.get(t.id)!.x);
    expect(Math.max(...[...pos.values()].map((p) => p.depth))).toBe(3);
  });
});
