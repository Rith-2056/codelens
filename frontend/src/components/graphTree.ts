// Pure logic for the Graph and Tree views. Both are chosen from the shape of
// the data, never from the lesson:
// - a graph is a dict whose values are lists (or sets) of its own keys, like
//   an adjacency dict for BFS;
// - a tree is made of heap objects with `left` and `right` fields that are
//   None or refs to objects of the same type, like a TreeNode.

import type { HeapObject, JsonValue, StackFrame } from "../types/trace.ts";
import { dictEntries, itemsOf, kindOf, resolveRef, sameValue } from "../explain/snapshot.ts";
import { formatValue, type Heap } from "./values.ts";
import { frameTitle } from "./structures.ts";

// ---- Graph -------------------------------------------------------------------

export type Graph = {
  nodes: JsonValue[];
  /** Undirected graphs list each link once; directed graphs list every arrow. */
  edges: [JsonValue, JsonValue][];
  directed: boolean;
};

const isNodeName = (v: JsonValue): boolean => typeof v === "string" || typeof v === "number";

/** The graph an adjacency dict describes, or null when the value isn't one. */
export function graphOf(value: JsonValue): Graph | null {
  if (kindOf(value) !== "dict") return null;
  const entries = dictEntries(value);
  if (entries.length < 2) return null;
  const nodes = entries.map(([k]) => k);
  if (!nodes.every(isNodeName)) return null;
  const isNode = (v: JsonValue) => nodes.some((n) => sameValue(n, v));

  const arrows: [JsonValue, JsonValue][] = [];
  for (const [from, neighbors] of entries) {
    const kind = kindOf(neighbors);
    if (kind !== "array" && kind !== "set") return null;
    for (const to of itemsOf(neighbors)) {
      if (!isNodeName(to) || !isNode(to)) return null;
      arrows.push([from, to]);
    }
  }
  const hasArrow = (a: JsonValue, b: JsonValue) => arrows.some(([x, y]) => sameValue(x, a) && sameValue(y, b));
  const directed = arrows.some(([a, b]) => !hasArrow(b, a));
  if (directed) return { nodes, edges: arrows, directed };

  const edges: [JsonValue, JsonValue][] = [];
  for (const [a, b] of arrows) {
    const seen = edges.some(([x, y]) => (sameValue(x, a) && sameValue(y, b)) || (sameValue(x, b) && sameValue(y, a)));
    if (!seen) edges.push([a, b]);
  }
  return { nodes, edges, directed };
}

/** A node's name as plain text: `A`, not `'A'`. */
export function nodeLabel(node: JsonValue): string {
  return typeof node === "string" ? node : formatValue(node);
}

/**
 * Text badges for one graph node, from the other locals in the frame, in local
 * order: "in visited" (a set, list, or queue that holds it) and "← person" (a
 * variable equal to it).
 */
export function graphBadges(node: JsonValue, locals: Record<string, JsonValue>, graphName: string): string[] {
  const out: string[] = [];
  for (const name of Object.keys(locals)) {
    if (name === graphName) continue;
    const v = locals[name] ?? null;
    const kind = kindOf(v);
    if (kind === "set" || kind === "deque" || kind === "array") {
      if (itemsOf(v).some((item) => sameValue(item, node))) out.push(`in ${name}`);
    } else if (kind === "primitive" && isNodeName(v) && sameValue(v, node)) {
      out.push(`← ${name}`);
    }
  }
  return out;
}

/** Evenly spaced points on a circle inside a `size` × `size` box, first at the top. */
export function circleLayout(count: number, size: number): { x: number; y: number }[] {
  const c = size / 2;
  if (count === 1) return [{ x: c, y: c }];
  const r = size * 0.36;
  const round = (n: number) => Math.round(n * 100) / 100;
  return Array.from({ length: count }, (_, i) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / count;
    return { x: round(c + r * Math.cos(angle)), y: round(c + r * Math.sin(angle)) };
  });
}

// ---- Tree --------------------------------------------------------------------

export type TreeNode = { id: string; label: string; left: TreeNode | null; right: TreeNode | null };

const hasField = (obj: HeapObject, f: string) => Object.prototype.hasOwnProperty.call(obj.fields ?? {}, f);

function childOk(child: JsonValue | undefined, type: string, heap: Heap): boolean {
  if (child === null) return true;
  const obj = child === undefined ? undefined : resolveRef(child, heap);
  return obj !== undefined && obj.type === type;
}

/** True for a ref to an object with `left` and `right` that are None or same-type refs. */
export function isTreeNodeRef(value: JsonValue, heap: Heap): boolean {
  const obj = resolveRef(value, heap);
  if (!obj || !hasField(obj, "left") || !hasField(obj, "right")) return false;
  return childOk(obj.fields.left, obj.type, heap) && childOk(obj.fields.right, obj.type, heap);
}

function nodeText(obj: HeapObject): string {
  const f = obj.fields ?? {};
  const isPrim = (v: JsonValue | undefined) => v === null || (v !== undefined && typeof v !== "object");
  if (isPrim(f.val)) return formatValue(f.val ?? null);
  const pick = Object.keys(f).find((k) => k !== "left" && k !== "right" && isPrim(f[k]));
  return pick === undefined ? obj.type : formatValue(f[pick] ?? null);
}

/** The tree hanging from a node ref, or null if it isn't a proper tree (cycles, shared nodes, mixed types). */
export function treeOf(ref: JsonValue, heap: Heap): TreeNode | null {
  const seen = new Set<string>();
  let ok = true;
  const build = (v: JsonValue): TreeNode | null => {
    if (!ok || v === null) return null;
    if (!isTreeNodeRef(v, heap)) {
      ok = false;
      return null;
    }
    const obj = resolveRef(v, heap)!;
    if (seen.has(obj.id)) {
      ok = false;
      return null;
    }
    seen.add(obj.id);
    return {
      id: obj.id,
      label: nodeText(obj),
      left: build(obj.fields.left ?? null),
      right: build(obj.fields.right ?? null),
    };
  };
  const root = build(ref);
  return ok ? root : null;
}

/** Ids of every node in a tree. */
export function treeIds(root: TreeNode | null): string[] {
  return root ? [root.id, ...treeIds(root.left), ...treeIds(root.right)] : [];
}

/**
 * The biggest tree that contains `ref`'s node, looking at tree-node refs in
 * every frame, outermost first. During recursion this is the whole tree, not
 * just the subtree the running call is looking at.
 */
export function treeRootFor(ref: JsonValue, frames: StackFrame[], heap: Heap): TreeNode | null {
  const target = resolveRef(ref, heap)?.id;
  if (target === undefined) return null;
  let best: TreeNode | null = null;
  for (const frame of frames) {
    for (const v of Object.values(frame.locals)) {
      if (!isTreeNodeRef(v, heap)) continue;
      const t = treeOf(v, heap);
      if (!t) continue;
      const ids = treeIds(t);
      if (ids.includes(target) && (best === null || ids.length > treeIds(best).length)) best = t;
    }
  }
  return best ?? treeOf(ref, heap);
}

export type TreeCard = { name: string; where: string; root: TreeNode };

/**
 * Every distinct tree reachable from any frame, outermost frame first, each
 * named by the first variable that leads to it (e.g. `root` in the main
 * program). A subtree of a tree already found is not listed again.
 */
export function treesIn(frames: StackFrame[], heap: Heap): TreeCard[] {
  const out: TreeCard[] = [];
  const drawn = new Set<string>();
  for (const frame of frames) {
    for (const name of Object.keys(frame.locals)) {
      const v = frame.locals[name] ?? null;
      if (!isTreeNodeRef(v, heap) || drawn.has(resolveRef(v, heap)!.id)) continue;
      const root = treeRootFor(v, frames, heap);
      if (!root || drawn.has(root.id)) continue;
      treeIds(root).forEach((id) => drawn.add(id));
      out.push({ name, where: frameTitle(frame.functionName), root });
    }
  }
  return out;
}

/** "main program", "max_depth() #3", with " (running)" on the current (last) frame. */
export function frameLabels(frames: StackFrame[]): string[] {
  const total = new Map<string, number>();
  for (const f of frames) total.set(f.functionName, (total.get(f.functionName) ?? 0) + 1);
  const count = new Map<string, number>();
  return frames.map((f, i) => {
    const n = (count.get(f.functionName) ?? 0) + 1;
    count.set(f.functionName, n);
    let label = frameTitle(f.functionName);
    if ((total.get(f.functionName) ?? 0) > 1) label += ` #${n}`;
    if (i === frames.length - 1) label += " (running)";
    return label;
  });
}

/** For each tree node id, which variables in which frames point at it. */
export function treeBadges(frames: StackFrame[], heap: Heap): Map<string, string[]> {
  const labels = frameLabels(frames);
  const out = new Map<string, string[]>();
  frames.forEach((frame, i) => {
    for (const name of Object.keys(frame.locals)) {
      const v = frame.locals[name] ?? null;
      if (!isTreeNodeRef(v, heap)) continue;
      const id = resolveRef(v, heap)!.id;
      out.set(id, [...(out.get(id) ?? []), `${name} in ${labels[i]}`]);
    }
  });
  return out;
}

/** In-order x position (0, 1, 2, …) and depth for every node. */
export function treeLayout(root: TreeNode): Map<string, { x: number; depth: number }> {
  const out = new Map<string, { x: number; depth: number }>();
  let x = 0;
  const walk = (n: TreeNode | null, depth: number) => {
    if (!n) return;
    walk(n.left, depth + 1);
    out.set(n.id, { x: x++, depth });
    walk(n.right, depth + 1);
  };
  walk(root, 0);
  return out;
}
