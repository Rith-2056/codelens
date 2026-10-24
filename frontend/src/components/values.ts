import type { HeapObject, JsonValue } from "../types/trace.ts";
import { dictEntries, itemsOf, kindOf, resolveRef } from "../explain/snapshot.ts";

// Every snapshot value form (frozen contract 2026-10-24) becomes readable,
// Python-like text here. No raw tag ("__dict", "__ref", ...) ever reaches the
// screen: tagged values are dispatched through kindOf, and anything kindOf
// does not recognise as tagged is an old-shape plain-object dict.

export type Heap = Record<string, HeapObject>;

const EMPTY_HEAP: Heap = {};

// The tracer replaces values it cannot show safely with a placeholder dict:
// {"__type__": "function"} or {"__type__": "list", "__len__": 12}.
export type Placeholder = { typeName: string; length?: number };

export function asPlaceholder(value: JsonValue): Placeholder | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const typeName = value["__type__"];
  if (typeof typeName !== "string") return null;
  const length = value["__len__"];
  return typeof length === "number" ? { typeName, length } : { typeName };
}

export function placeholderLabel(p: Placeholder): string {
  if (p.length !== undefined) {
    const items = p.length === 1 ? "item" : "items";
    return `${p.typeName} with ${p.length} ${items} (too long to show)`;
  }
  return `${p.typeName} (not shown)`;
}

// Python-style string literal: single quotes unless the text contains a
// single quote and no double quote, the same rule Python's repr uses.
export function pyString(text: string): string {
  const quote = text.includes("'") && !text.includes('"') ? '"' : "'";
  let out = "";
  for (const ch of text) {
    if (ch === "\\") out += "\\\\";
    else if (ch === quote) out += "\\" + ch;
    else if (ch === "\n") out += "\\n";
    else if (ch === "\t") out += "\\t";
    else if (ch === "\r") out += "\\r";
    else out += ch;
  }
  return quote + out + quote;
}

// Field names tried first when naming an object in one short phrase.
const LABEL_FIELDS = ["val", "value", "key", "name", "data", "id"];

function isPrimitive(v: JsonValue | undefined): v is null | boolean | number | string {
  return v === null || typeof v !== "object";
}

/** "TreeNode(val=2)": a heap object named by one primitive field. */
export function objectShort(obj: HeapObject): string {
  const fields = obj.fields ?? {};
  const names = Object.keys(fields);
  const pick =
    LABEL_FIELDS.find((f) => names.includes(f) && isPrimitive(fields[f])) ??
    names.find((f) => isPrimitive(fields[f]));
  if (pick === undefined) return `${obj.type} object`;
  return `${obj.type}(${pick}=${formatValue(fields[pick] ?? null)})`;
}

/** Short text for a ref: "TreeNode(val=2)", or a note when it cannot be found. */
export function refShort(value: JsonValue, heap: Heap | undefined): string {
  const obj = resolveRef(value, heap ?? EMPTY_HEAP);
  return obj ? objectShort(obj) : "object (not shown)";
}

/**
 * Format a snapshot value the way a beginner would see it in Python.
 * Refs inside it become short text such as "TreeNode(val=2)".
 */
export function formatValue(value: JsonValue, heap?: Heap): string {
  if (value === null) return "None";
  if (value === true) return "True";
  if (value === false) return "False";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return pyString(value);
  const f = (v: JsonValue) => formatValue(v, heap);
  switch (kindOf(value)) {
    case "array":
    case "grid":
      return "[" + (value as JsonValue[]).map(f).join(", ") + "]";
    case "placeholder":
      return placeholderLabel(asPlaceholder(value) ?? { typeName: "value" });
    case "ref":
      return refShort(value, heap);
    case "set": {
      const items = itemsOf(value);
      return items.length === 0 ? "set()" : "{" + items.map(f).join(", ") + "}";
    }
    case "deque":
      return "deque([" + itemsOf(value).map(f).join(", ") + "])";
    case "dict":
      return "{" + dictEntries(value).map(([k, v]) => `${f(k)}: ${f(v)}`).join(", ") + "}";
    case "primitive":
      return String(value);
  }
}

/** What kind of thing a value is, in plain words, for headings and labels. */
export function kindLabel(value: JsonValue): string {
  switch (kindOf(value)) {
    case "array":
      return "list";
    case "grid":
      return "2D list (table)";
    case "dict":
      return "hash map (dict)";
    case "set":
      return "set";
    case "deque":
      return "queue (deque)";
    case "ref":
      return "object";
    case "placeholder":
      return asPlaceholder(value)?.typeName ?? "value";
    case "primitive":
      return value === null ? "None" : typeof value === "string" ? "text" : typeof value === "boolean" ? "True/False" : "number";
  }
}

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}
