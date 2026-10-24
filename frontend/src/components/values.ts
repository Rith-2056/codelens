import type { JsonValue } from "../types/trace";

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
function pyString(text: string): string {
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

// Format a snapshot value the way a beginner would see it in Python.
export function formatValue(value: JsonValue): string {
  if (value === null) return "None";
  if (value === true) return "True";
  if (value === false) return "False";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return pyString(value);
  if (Array.isArray(value)) return "[" + value.map(formatValue).join(", ") + "]";
  const p = asPlaceholder(value);
  if (p) return placeholderLabel(p);
  const entries = Object.keys(value).map(
    (k) => `${pyString(k)}: ${formatValue(value[k])}`,
  );
  return "{" + entries.join(", ") + "}";
}

// Structural key for comparing two values: object keys are sorted, so two
// dicts with the same contents compare equal, like they do in Python.
export function valueKey(value: JsonValue): string {
  if (Array.isArray(value)) return "[" + value.map(valueKey).join(",") + "]";
  if (value !== null && typeof value === "object") {
    const parts = Object.keys(value)
      .sort()
      .map((k) => JSON.stringify(k) + ":" + valueKey(value[k]));
    return "{" + parts.join(",") + "}";
  }
  return JSON.stringify(value);
}
