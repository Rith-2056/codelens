// Value and text formatting shared by the English and Spanish templates.
//
// Everything here is pure and locale-independent: numbers go through String()
// (never toLocaleString or Intl), and nothing reads the clock or randomness.
//
// Number rule: explanations may only contain numbers that appear in the
// prev/curr snapshots. Shortening text therefore never cuts through a run of
// digits, and lengths are only shown when a placeholder carries `__len__`.

import type { HeapObject, JsonValue } from "../types/trace.ts";
import { dictEntries, itemsOf, kindOf, resolveRef } from "./snapshot.ts";

export { sameValue } from "./snapshot.ts";

type Heap = Record<string, HeapObject>;

/** A snapshot value prepared for a sentence. */
export type ValueView =
  /** Python-style literal text, e.g. `[3, 1, 2]`, `"hi"`, `None`, `True`. */
  | { kind: "literal"; text: string }
  /** A tracer placeholder such as {"__type__": "list", "__len__": 12}. */
  | { kind: "placeholder"; typeName: string; length?: number }
  /**
   * A student-defined object reached through {"__ref": id}. `fields` is a
   * short `val=2` style summary of its primitive fields, if it has any.
   * `typeName` is "" when the ref does not resolve in the step's heap.
   * The heap id itself is never shown.
   */
  | { kind: "object"; typeName: string; fields?: string };

const TOP_STRING_MAX = 40;
const NESTED_STRING_MAX = 16;
const CONTAINER_BUDGET = 48;
const TYPE_NAME_MAX = 40;
const ELLIPSIS = "…";
const FIELDS_BUDGET = 40;
const MAX_FIELDS = 3;

type JsonObject = { [k: string]: JsonValue };

function isObject(v: JsonValue): v is JsonObject {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** True for tracer placeholders: objects carrying a string `__type__`. */
export function isPlaceholder(v: JsonValue): v is JsonObject {
  return isObject(v) && typeof v["__type__"] === "string";
}

export function viewValue(v: JsonValue, heap: Heap = {}): ValueView {
  if (kindOf(v) === "ref") {
    const obj = resolveRef(v, heap);
    if (obj === undefined) return { kind: "object", typeName: "" };
    return { kind: "object", typeName: proseText(String(obj.type), TYPE_NAME_MAX), fields: fieldSummary(obj, heap) };
  }
  if (isPlaceholder(v)) {
    const len = v["__len__"];
    return {
      kind: "placeholder",
      typeName: proseText(v["__type__"] as string, TYPE_NAME_MAX),
      length: typeof len === "number" ? len : undefined,
    };
  }
  return { kind: "literal", text: literal(v, heap, TOP_STRING_MAX, CONTAINER_BUDGET) };
}

/**
 * `val=2, name="x"` for a heap object's primitive fields (None, refs and
 * containers are left out), or undefined when it has none.
 */
function fieldSummary(obj: HeapObject, heap: Heap): string | undefined {
  const fields = obj.fields !== null && typeof obj.fields === "object" ? obj.fields : {};
  const parts: Array<() => string> = [];
  for (const name of Object.keys(fields)) {
    const f = fields[name];
    if (f === null || typeof f === "object") continue;
    if (parts.length === MAX_FIELDS) break;
    parts.push(() => proseText(name, NESTED_STRING_MAX) + "=" + literal(f, heap, NESTED_STRING_MAX, FIELDS_BUDGET));
  }
  if (parts.length === 0) return undefined;
  const text = container("", "", parts, FIELDS_BUDGET);
  return text;
}

/** `TreeNode(val=2)`, or `<TreeNode>` when it has no primitive fields; used inside containers. */
function objectLiteral(v: JsonValue, heap: Heap): string {
  const obj = resolveRef(v, heap);
  if (obj === undefined) return "<object>";
  const typeName = cleanUnits(proseText(String(obj.type), TYPE_NAME_MAX), false);
  const fields = fieldSummary(obj, heap);
  return fields === undefined ? "<" + typeName + ">" : typeName + "(" + fields + ")";
}

function isNumChar(c: string | undefined): boolean {
  return c !== undefined && ((c >= "0" && c <= "9") || c === ".");
}

/**
 * Shorten `s` to at most `max` UTF-16 units without splitting a number or a
 * surrogate pair, so a cut can never create a number that isn't in the data.
 */
export function cutSafe(s: string, max: number): { text: string; cut: boolean } {
  if (s.length <= max) return { text: s, cut: false };
  let end = max;
  while (end > 0 && isNumChar(s[end - 1]) && isNumChar(s[end])) end -= 1;
  const code = s.charCodeAt(end - 1);
  if (end > 0 && code >= 0xd800 && code <= 0xdbff) end -= 1;
  return { text: s.slice(0, end), cut: true };
}

function isControl(code: number): boolean {
  return code < 0x20 || (code >= 0x7f && code <= 0x9f);
}

/** Replace unpaired surrogates and other unprintable units. */
function cleanUnits(s: string, escapeCode: boolean): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    const code = s.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = s.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        out += ch + s[i + 1];
        i += 1;
      } else {
        out += "�";
      }
      continue;
    }
    if (code >= 0xdc00 && code <= 0xdfff) {
      out += "�";
      continue;
    }
    if (escapeCode) {
      if (ch === "\\") out += "\\\\";
      else if (ch === '"') out += '\\"';
      else if (ch === "\n") out += "\\n";
      else if (ch === "\t") out += "\\t";
      else if (ch === "\r") out += "\\r";
      else if (isControl(code)) out += "�";
      else out += ch;
    } else {
      if (ch === "\t") out += " ";
      else if (ch === "\r") out += "";
      else if (isControl(code)) out += "�";
      else out += ch;
    }
  }
  return out;
}

/** A Python string literal in double quotes, shortened if long. */
export function pyString(s: string, max: number): string {
  const { text, cut } = cutSafe(s, max);
  return '"' + cleanUnits(text, true) + (cut ? ELLIPSIS : "") + '"';
}

/**
 * Plain prose text (printed output, Python error messages), shortened if long.
 * The caller adds language-appropriate quotes.
 */
export function proseText(s: string, max: number): string {
  const { text, cut } = cutSafe(s, max);
  return cleanUnits(text, false) + (cut ? ELLIPSIS : "");
}

function literal(v: JsonValue, heap: Heap, stringMax: number, budget: number): string {
  if (v === null) return "None";
  if (typeof v === "boolean") return v ? "True" : "False";
  if (typeof v === "number") return String(v);
  if (typeof v === "string") return pyString(v, stringMax);
  const nested = (item: JsonValue) => () => literal(item, heap, NESTED_STRING_MAX, budget / 2);
  switch (kindOf(v)) {
    case "array":
    case "grid":
      return container("[", "]", (v as JsonValue[]).map(nested), budget);
    case "placeholder":
      return "<" + cleanUnits((v as JsonObject)["__type__"] as string, false) + ">";
    case "ref":
      return objectLiteral(v, heap);
    case "set": {
      const items = itemsOf(v);
      return items.length === 0 ? "set()" : container("{", "}", items.map(nested), budget);
    }
    case "deque":
      return "deque(" + container("[", "]", itemsOf(v).map(nested), budget - 7) + ")";
    case "dict": {
      const pairs = dictEntries(v).map(([k, val]) => () =>
        literal(k, heap, NESTED_STRING_MAX, budget / 2) + ": " + literal(val, heap, NESTED_STRING_MAX, budget / 2),
      );
      return container("{", "}", pairs, budget);
    }
    default:
      return "<object>";
  }
}

/** Render items until the budget is used up; every shown item is complete. */
function container(open: string, close: string, items: Array<() => string>, budget: number): string {
  const shown: string[] = [];
  let used = open.length + close.length;
  let cut = false;
  for (const render of items) {
    const text = render();
    const extra = text.length + (shown.length > 0 ? 2 : 0);
    if (shown.length > 0 && used + extra > budget) {
      cut = true;
      break;
    }
    shown.push(text);
    used += extra;
  }
  if (cut) shown.push(ELLIPSIS);
  return open + shown.join(", ") + close;
}
