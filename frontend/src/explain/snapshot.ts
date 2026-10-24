// Shared helpers for snapshot values (frozen contract 2026-10-24).
//
// A snapshot value is one of:
//   - a primitive (null, boolean, number, string)
//   - a JSON array (Python list or tuple)
//   - {"__dict": [[k, v], ...]}   insertion order, any key type
//   - {"__set": [...]}            sorted when possible
//   - {"__deque": [...]}          front first
//   - {"__ref": id}               resolved in step.heap[id]
//   - a placeholder {"__type__": name} or {"__type__": name, "__len__": n}
//
// Everything here is pure and deterministic, has no imports besides types,
// and never throws on malformed input. Used by the explainer and the UI.

import type { HeapObject, JsonValue } from "../types/trace.ts";

export type ValueKind = "primitive" | "placeholder" | "array" | "grid" | "set" | "dict" | "deque" | "ref";

type JsonObject = { [k: string]: JsonValue };

function isObject(v: JsonValue | undefined): v is JsonObject {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function hasOnly(o: JsonObject, key: string): boolean {
  const keys = Object.keys(o);
  return keys.length === 1 && keys[0] === key;
}

/**
 * The kind of a snapshot value. "grid" is a non-empty array whose items are
 * all arrays (a 2D table); an empty array is "array".
 *
 * Old-shape fixtures wrote dicts as plain JSON objects; those report "dict"
 * too, and `dictEntries` reads both shapes.
 */
export function kindOf(v: JsonValue): ValueKind {
  if (v === null || typeof v !== "object") return "primitive";
  if (Array.isArray(v)) {
    if (v.length > 0 && v.every((item) => Array.isArray(item))) return "grid";
    return "array";
  }
  if (typeof v["__type__"] === "string") return "placeholder";
  if (hasOnly(v, "__ref") && typeof v["__ref"] === "string") return "ref";
  if (hasOnly(v, "__set") && Array.isArray(v["__set"])) return "set";
  if (hasOnly(v, "__deque") && Array.isArray(v["__deque"])) return "deque";
  if (hasOnly(v, "__dict") && Array.isArray(v["__dict"])) return "dict";
  return "dict"; // legacy plain-object dict
}

/** The heap object a `{"__ref": id}` points at; undefined for anything else. */
export function resolveRef(v: JsonValue, heap: Record<string, HeapObject>): HeapObject | undefined {
  if (kindOf(v) !== "ref" || !heap) return undefined;
  const id = (v as JsonObject)["__ref"] as string;
  return Object.prototype.hasOwnProperty.call(heap, id) ? heap[id] : undefined;
}

/** The `[key, value]` pairs of a dict value (tagged or legacy), in order. */
export function dictEntries(v: JsonValue): [JsonValue, JsonValue][] {
  if (!isObject(v)) return [];
  const tagged = v["__dict"];
  if (hasOnly(v, "__dict") && Array.isArray(tagged)) {
    const out: [JsonValue, JsonValue][] = [];
    for (const pair of tagged) {
      if (Array.isArray(pair) && pair.length === 2) out.push([pair[0], pair[1]]);
    }
    return out;
  }
  if (typeof v["__type__"] === "string") return [];
  return Object.keys(v).map((k) => [k, v[k]] as [JsonValue, JsonValue]);
}

/** The items of a set, array, grid, or deque value (front first); [] otherwise. */
export function itemsOf(v: JsonValue): JsonValue[] {
  const kind = kindOf(v);
  if (kind === "array" || kind === "grid") return v as JsonValue[];
  if (kind === "set") return (v as JsonObject)["__set"] as JsonValue[];
  if (kind === "deque") return (v as JsonObject)["__deque"] as JsonValue[];
  return [];
}

/** The value stored under `key` in a dict value, or undefined. */
export function dictGet(v: JsonValue, key: JsonValue): JsonValue | undefined {
  for (const [k, val] of dictEntries(v)) {
    if (sameValue(k, key)) return val;
  }
  return undefined;
}

function containsValue(items: JsonValue[], x: JsonValue): boolean {
  return items.some((item) => sameValue(item, x));
}

/**
 * Structural equality. Sets compare without order, dicts compare as mappings
 * (key order ignored), refs compare by id, and `undefined` equals only itself.
 */
export function sameValue(a: JsonValue | undefined, b: JsonValue | undefined): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined) return false;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") {
    return false; // primitives that are not === (NaN never reaches JSON)
  }
  const ka = kindOf(a);
  const kb = kindOf(b);
  if (ka === "grid" || ka === "array") {
    if (kb !== "grid" && kb !== "array") return false;
    const x = a as JsonValue[];
    const y = b as JsonValue[];
    if (x.length !== y.length) return false;
    for (let i = 0; i < x.length; i++) if (!sameValue(x[i], y[i])) return false;
    return true;
  }
  if (ka !== kb) return false;
  if (ka === "set") {
    const x = itemsOf(a);
    const y = itemsOf(b);
    if (x.length !== y.length) return false;
    return x.every((item) => containsValue(y, item)) && y.every((item) => containsValue(x, item));
  }
  if (ka === "dict") {
    const x = dictEntries(a);
    const y = dictEntries(b);
    if (x.length !== y.length) return false;
    for (const [k, val] of x) {
      const other = dictGet(b, k);
      if (other === undefined || !sameValue(val, other)) return false;
    }
    return true;
  }
  if (ka === "deque") {
    const x = itemsOf(a);
    const y = itemsOf(b);
    if (x.length !== y.length) return false;
    for (let i = 0; i < x.length; i++) if (!sameValue(x[i], y[i])) return false;
    return true;
  }
  // ref, placeholder: compare every own key.
  const oa = a as JsonObject;
  const ob = b as JsonObject;
  const keysA = Object.keys(oa);
  const keysB = Object.keys(ob);
  if (keysA.length !== keysB.length) return false;
  for (const k of keysA) {
    if (!Object.prototype.hasOwnProperty.call(ob, k)) return false;
    if (!sameValue(oa[k], ob[k])) return false;
  }
  return true;
}

/** Local names that usually hold an index into an array (two pointers, etc.). */
export const POINTER_NAMES: readonly string[] = Object.freeze([
  "i", "j", "k", "l", "r", "lo", "hi", "left", "right", "mid", "start", "end", "slow", "fast",
]);

export type Change =
  | { kind: "added" | "removed"; key: JsonValue; value?: JsonValue }
  | { kind: "changed"; key: JsonValue; before: JsonValue; after: JsonValue }
  | { kind: "pushed" | "popped"; end: "front" | "back"; value: JsonValue };

const DEQUE_SEARCH_MAX = 300;

/**
 * What changed inside one value between two snapshots.
 *
 * - dict: "added"/"removed" (key + value) and "changed" (key, before, after).
 *   Order: added and changed in curr's key order, then removed in prev's order.
 * - set: "added"/"removed" with the item as `key`.
 * - array: "changed" per cell (key = index); items appended at the end are
 *   "added" and items gone from the end are "removed" (key = index, value =
 *   item).
 * - grid: "changed" per cell with key = [row, col] when both rows are arrays
 *   of the same length, otherwise key = row index with whole rows.
 * - deque: "popped"/"pushed" at "front"/"back", found by matching the longest
 *   run of prev's items that is still in curr. Order: front pops, back pops,
 *   front pushes, back pushes, each in the order they happened.
 *
 * Returns [] when prev is undefined (a new variable), when the kinds differ
 * (the whole value was replaced), for primitives, placeholders, and refs
 * (a ref's object lives in the heap; compare heap fields for that).
 */
export function diffValue(prev: JsonValue | undefined, curr: JsonValue): Change[] {
  if (prev === undefined) return [];
  const kp = kindOf(prev);
  const kc = kindOf(curr);
  const arrayish = (k: ValueKind) => k === "array" || k === "grid";
  if (arrayish(kp) && arrayish(kc)) return diffArray(prev as JsonValue[], curr as JsonValue[]);
  if (kp !== kc) return [];
  if (kp === "dict") return diffDict(prev, curr);
  if (kp === "set") return diffSet(itemsOf(prev), itemsOf(curr));
  if (kp === "deque") return diffDeque(itemsOf(prev), itemsOf(curr));
  return [];
}

function diffDict(prev: JsonValue, curr: JsonValue): Change[] {
  const out: Change[] = [];
  const before = dictEntries(prev);
  const after = dictEntries(curr);
  for (const [k, v] of after) {
    const old = dictGet(prev, k);
    if (old === undefined) out.push({ kind: "added", key: k, value: v });
    else if (!sameValue(old, v)) out.push({ kind: "changed", key: k, before: old, after: v });
  }
  for (const [k, v] of before) {
    if (dictGet(curr, k) === undefined) out.push({ kind: "removed", key: k, value: v });
  }
  return out;
}

function diffSet(prev: JsonValue[], curr: JsonValue[]): Change[] {
  const out: Change[] = [];
  for (const item of curr) if (!containsValue(prev, item)) out.push({ kind: "added", key: item });
  for (const item of prev) if (!containsValue(curr, item)) out.push({ kind: "removed", key: item });
  return out;
}

function diffArray(prev: JsonValue[], curr: JsonValue[]): Change[] {
  const out: Change[] = [];
  const common = Math.min(prev.length, curr.length);
  for (let r = 0; r < common; r++) {
    const a = prev[r];
    const b = curr[r];
    if (sameValue(a, b)) continue;
    if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) {
      for (let c = 0; c < a.length; c++) {
        if (!sameValue(a[c], b[c])) out.push({ kind: "changed", key: [r, c], before: a[c], after: b[c] });
      }
    } else {
      out.push({ kind: "changed", key: r, before: a, after: b });
    }
  }
  for (let r = common; r < curr.length; r++) out.push({ kind: "added", key: r, value: curr[r] });
  for (let r = common; r < prev.length; r++) out.push({ kind: "removed", key: r, value: prev[r] });
  return out;
}

function runMatches(p: JsonValue[], pStart: number, c: JsonValue[], cStart: number, len: number): boolean {
  for (let t = 0; t < len; t++) if (!sameValue(p[pStart + t], c[cStart + t])) return false;
  return true;
}

function diffDeque(prev: JsonValue[], curr: JsonValue[]): Change[] {
  const P = prev.length;
  const C = curr.length;
  if (P === C && runMatches(prev, 0, curr, 0, P)) return [];

  // Find the kept middle run prev[f, P-b) == curr[pf, pf+len), keeping as many
  // items as possible. Ties prefer queue-like moves (pop front, push back).
  let best = { f: P, b: 0, pf: 0, len: 0, odd: 0 };
  if (P <= DEQUE_SEARCH_MAX && C <= DEQUE_SEARCH_MAX) {
    for (let len = Math.min(P, C); len > 0; len--) {
      let found: typeof best | undefined;
      for (let f = 0; f + len <= P; f++) {
        for (let pf = 0; pf + len <= C; pf++) {
          if (!runMatches(prev, f, curr, pf, len)) continue;
          const b = P - f - len;
          const odd = b + pf; // back pops and front pushes are the unusual moves
          if (found === undefined || odd < found.odd || (odd === found.odd && f < found.f)) {
            found = { f, b, pf, len, odd };
          }
        }
      }
      if (found !== undefined) {
        best = found;
        break;
      }
    }
  }

  const out: Change[] = [];
  for (let t = 0; t < best.f; t++) out.push({ kind: "popped", end: "front", value: prev[t] });
  for (let t = P - 1; t >= best.f + best.len; t--) out.push({ kind: "popped", end: "back", value: prev[t] });
  for (let t = best.pf - 1; t >= 0; t--) out.push({ kind: "pushed", end: "front", value: curr[t] });
  for (let t = best.pf + best.len; t < C; t++) out.push({ kind: "pushed", end: "back", value: curr[t] });
  return out;
}

export type HeapChange = {
  id: string;
  type: string;
  field: string;
  kind: "added" | "removed" | "changed";
  before?: JsonValue;
  after?: JsonValue;
};

/**
 * Field changes per heap object id, for ids present in both heaps (an object
 * that only appears in one step's heap is new or out of reach, not changed).
 * Order: curr's heap order, then curr's field order; removed fields last per
 * object. Heap ids are for matching only; never show them to the student.
 */
export function diffHeap(
  prevHeap: Record<string, HeapObject> | undefined,
  currHeap: Record<string, HeapObject> | undefined,
): HeapChange[] {
  const out: HeapChange[] = [];
  if (!prevHeap || !currHeap) return out;
  const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);
  for (const id of Object.keys(currHeap)) {
    if (!own(prevHeap, id)) continue;
    const a = prevHeap[id];
    const b = currHeap[id];
    const fa = a && typeof a.fields === "object" && a.fields !== null ? a.fields : {};
    const fb = b && typeof b.fields === "object" && b.fields !== null ? b.fields : {};
    const type = b && typeof b.type === "string" ? b.type : "";
    for (const field of Object.keys(fb)) {
      if (!own(fa, field)) out.push({ id, type, field, kind: "added", after: fb[field] });
      else if (!sameValue(fa[field], fb[field])) {
        out.push({ id, type, field, kind: "changed", before: fa[field], after: fb[field] });
      }
    }
    for (const field of Object.keys(fa)) {
      if (!own(fb, field)) out.push({ id, type, field, kind: "removed", before: fa[field] });
    }
  }
  return out;
}

// describeShort lives in describe.ts (it needs the en/es wording); re-exported
// here so the UI can import every value helper from one module.
export { describeShort } from "./describe.ts";
