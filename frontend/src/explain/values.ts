// Value and text formatting shared by the English and Spanish templates.
//
// Everything here is pure and locale-independent: numbers go through String()
// (never toLocaleString or Intl), and nothing reads the clock or randomness.
//
// Number rule: explanations may only contain numbers that appear in the
// prev/curr snapshots. Shortening text therefore never cuts through a run of
// digits, and lengths are only shown when a placeholder carries `__len__`.

import type { JsonValue } from "../types/trace.ts";

/** A snapshot value prepared for a sentence. */
export type ValueView =
  /** Python-style literal text, e.g. `[3, 1, 2]`, `"hi"`, `None`, `True`. */
  | { kind: "literal"; text: string }
  /** A tracer placeholder such as {"__type__": "list", "__len__": 12}. */
  | { kind: "placeholder"; typeName: string; length?: number };

const TOP_STRING_MAX = 40;
const NESTED_STRING_MAX = 16;
const CONTAINER_BUDGET = 48;
const TYPE_NAME_MAX = 40;
const ELLIPSIS = "…";

type JsonObject = { [k: string]: JsonValue };

function isObject(v: JsonValue): v is JsonObject {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** True for tracer placeholders: objects carrying a string `__type__`. */
export function isPlaceholder(v: JsonValue): v is JsonObject {
  return isObject(v) && typeof v["__type__"] === "string";
}

export function viewValue(v: JsonValue): ValueView {
  if (isPlaceholder(v)) {
    const len = v["__len__"];
    return {
      kind: "placeholder",
      typeName: proseText(v["__type__"] as string, TYPE_NAME_MAX),
      length: typeof len === "number" ? len : undefined,
    };
  }
  return { kind: "literal", text: literal(v, TOP_STRING_MAX, CONTAINER_BUDGET) };
}

/** Structural equality for snapshot values. */
export function sameValue(a: JsonValue, b: JsonValue): boolean {
  if (a === b) return true;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!sameValue(a[i], b[i])) return false;
    }
    return true;
  }
  if (isObject(a)) {
    if (!isObject(b)) return false;
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    for (const k of ka) {
      if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
      if (!sameValue(a[k], b[k])) return false;
    }
    return true;
  }
  return false;
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

function literal(v: JsonValue, stringMax: number, budget: number): string {
  if (v === null) return "None";
  if (typeof v === "boolean") return v ? "True" : "False";
  if (typeof v === "number") return String(v);
  if (typeof v === "string") return pyString(v, stringMax);
  if (Array.isArray(v)) {
    return container("[", "]", v.map((item) => () => literal(item, NESTED_STRING_MAX, budget / 2)), budget);
  }
  if (isPlaceholder(v)) return "<" + cleanUnits(v["__type__"] as string, false) + ">";
  return container(
    "{",
    "}",
    Object.keys(v).map(
      (k) => () => pyString(k, NESTED_STRING_MAX) + ": " + literal(v[k], NESTED_STRING_MAX, budget / 2),
    ),
    budget,
  );
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
