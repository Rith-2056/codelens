// Structure-level reading of one step: what changed INSIDE data structures,
// which index pointers moved, membership checks, and recursion. Language
// neutral; en.ts / es.ts word it.
//
// Grounding: everything comes from prev and curr (locals, heap, stack). The
// optional program source is only used to read the text of prev.line (for a
// membership condition) and to prefer the names the code itself uses; it never
// supplies a value. Index numbers are never stated unless an int local in the
// same frame holds that number, so the no-invented-number check stays strict.

import type { HeapObject, JsonValue, StackFrame, TraceStep } from "../types/trace.ts";
import { allowedNumbers, numberTokens } from "./numbers.ts";
import { diffHeap, diffValue, dictEntries, itemsOf, kindOf, POINTER_NAMES, sameValue, type Change } from "./snapshot.ts";
import { viewValue, type ValueView } from "./values.ts";

type Heap = Record<string, HeapObject>;

/** At most this many changes inside one container are described one by one. */
const MAX_INNER = 2;

export type StructEvent =
  | { kind: "dictAdd"; name: string; key: ValueView; value: ValueView }
  | { kind: "dictChange"; name: string; key: ValueView; before: ValueView; after: ValueView }
  | { kind: "dictRemove"; name: string; key: ValueView }
  | { kind: "setAdd" | "setRemove"; name: string; item: ValueView }
  | { kind: "queue"; name: string; op: "pushed" | "popped"; end: "front" | "back"; item: ValueView }
  /** An array or grid cell. `index` holds local NAMES (e.g. ["i"]) or is undefined. */
  | { kind: "cell"; name: string; index?: string[]; row: boolean; before: ValueView; after: ValueView }
  | { kind: "append" | "popEnd"; name: string; item: ValueView }
  /** A heap object's field. `owner` is a local name referring to the object, if any. */
  | { kind: "field"; owner?: string; typeName: string; field: string; before?: ValueView; after: ValueView }
  | { kind: "pointer"; name: string; before: ValueView; after: ValueView; array: string; target: ValueView };

export type Membership = {
  /** Normalized condition text, e.g. `need in seen`. */
  cond: string;
  /** The left side: a local name with its value, or a literal. */
  subject: { name?: string; value: ValueView };
  container: string;
  dict: boolean;
  /** Whether the item was found in the container. */
  found: boolean;
  /** Value of the whole condition (found, or !found for `not in`). */
  result: boolean;
  loop: boolean;
};

export function heapOf(step: TraceStep | undefined): Heap {
  const h = step?.heap;
  return h !== null && typeof h === "object" && !Array.isArray(h) ? h : {};
}

export function stackOf(step: TraceStep | undefined): StackFrame[] {
  const s = step?.stack;
  return Array.isArray(s) ? s : [];
}

const has = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

function isInt(v: JsonValue | undefined): v is number {
  return typeof v === "number" && Number.isInteger(v);
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The text of 1-based line `n`, or undefined. */
export function sourceLine(source: string | undefined, n: number): string | undefined {
  if (typeof source !== "string" || !Number.isInteger(n) || n < 1) return undefined;
  const lines = source.split("\n");
  if (n > lines.length) return undefined;
  return lines[n - 1].replace(/\r$/, "");
}

/** Names used inside `arr[...]` on a line of code, in order. */
function subscriptNames(code: string | undefined, arr: string): string[] {
  if (code === undefined) return [];
  const out: string[] = [];
  const re = new RegExp(`(?<![\\w.])${escapeRe(arr)}\\s*\\[\\s*([A-Za-z_]\\w*)\\s*\\]`, "g");
  for (const m of code.matchAll(re)) out.push(m[1]);
  return out;
}

/**
 * A local (same frame) whose int value is `idx` in both prev and curr, or
 * undefined. Prefers names the line's code uses to subscript `arr`, then the
 * usual pointer names, then locals order.
 */
function indexName(idx: number, arr: string, prev: TraceStep, curr: TraceStep, code: string | undefined): string | undefined {
  const ok = (n: string) =>
    n !== arr && has(prev.locals, n) && has(curr.locals, n) &&
    isInt(prev.locals[n]) && prev.locals[n] === idx && curr.locals[n] === idx;
  const order = [...subscriptNames(code, arr), ...POINTER_NAMES, ...Object.keys(prev.locals)];
  return order.find(ok);
}

function containerEvents(
  name: string,
  before: JsonValue,
  after: JsonValue,
  prev: TraceStep,
  curr: TraceStep,
  code: string | undefined,
): StructEvent[] | undefined {
  const kb = kindOf(before);
  const ka = kindOf(after);
  const changes: Change[] = diffValue(before, after);
  if (changes.length === 0 || changes.length > MAX_INNER) return undefined;
  const hp = heapOf(prev);
  const hc = heapOf(curr);
  const pv = (v: JsonValue) => viewValue(v, hp);
  const cv = (v: JsonValue) => viewValue(v, hc);

  if (kb === "dict" && ka === "dict") {
    return changes.map((c): StructEvent => {
      if (c.kind === "added") return { kind: "dictAdd", name, key: cv(c.key), value: cv(c.value ?? null) };
      if (c.kind === "changed") return { kind: "dictChange", name, key: cv(c.key), before: pv(c.before), after: cv(c.after) };
      return { kind: "dictRemove", name, key: pv((c as { key: JsonValue }).key) };
    });
  }
  if (kb === "set" && ka === "set") {
    return changes.map((c): StructEvent => {
      const key = (c as { key: JsonValue }).key;
      return c.kind === "added" ? { kind: "setAdd", name, item: cv(key) } : { kind: "setRemove", name, item: pv(key) };
    });
  }
  if (kb === "deque" && ka === "deque") {
    return changes.map((c): StructEvent => {
      const q = c as { kind: "pushed" | "popped"; end: "front" | "back"; value: JsonValue };
      return { kind: "queue", name, op: q.kind, end: q.end, item: q.kind === "pushed" ? cv(q.value) : pv(q.value) };
    });
  }
  const arrayish = (k: string) => k === "array" || k === "grid";
  if (arrayish(kb) && arrayish(ka)) {
    if (changes.every((c) => c.kind === "changed")) {
      return changes.map((c): StructEvent => {
        const ch = c as { key: JsonValue; before: JsonValue; after: JsonValue };
        let index: string[] | undefined;
        let row = false;
        if (Array.isArray(ch.key)) {
          const r = indexName(ch.key[0] as number, name, prev, curr, code);
          const col = indexName(ch.key[1] as number, name, prev, curr, code);
          index = r !== undefined && col !== undefined ? [r, col] : undefined;
        } else {
          row = Array.isArray(ch.before) || Array.isArray(ch.after);
          const r = indexName(ch.key as number, name, prev, curr, code);
          index = r !== undefined ? [r] : undefined;
        }
        return { kind: "cell", name, index, row, before: pv(ch.before), after: cv(ch.after) };
      });
    }
    if (changes.every((c) => c.kind === "added")) {
      return changes.map((c) => ({ kind: "append", name, item: cv((c as { value?: JsonValue }).value ?? null) }));
    }
    if (changes.every((c) => c.kind === "removed")) {
      return changes.map((c) => ({ kind: "popEnd", name, item: pv((c as { value?: JsonValue }).value ?? null) }));
    }
  }
  return undefined;
}

function pointerEvent(name: string, before: JsonValue, after: JsonValue, curr: TraceStep, source: string | undefined): StructEvent | undefined {
  if (!POINTER_NAMES.includes(name) || !isInt(before) || !isInt(after)) return undefined;
  const arrays = Object.keys(curr.locals).filter((a) => {
    const v = curr.locals[a];
    return a !== name && kindOf(v) === "array" && after >= 0 && after < (v as JsonValue[]).length;
  });
  if (arrays.length === 0) return undefined;
  const used = arrays.find(
    (a) => source !== undefined && new RegExp(`(?<![\\w.])${escapeRe(a)}\\s*\\[\\s*${escapeRe(name)}\\s*\\]`).test(source),
  );
  const array = used ?? arrays[0];
  const hc = heapOf(curr);
  return {
    kind: "pointer",
    name,
    before: viewValue(before),
    after: viewValue(after, hc),
    array,
    target: viewValue((curr.locals[array] as JsonValue[])[after], hc),
  };
}

export type StepEvents = {
  /** In priority order: container changes, heap fields, pointer moves. */
  events: StructEvent[];
  /** Local names whose change the events already describe. */
  covered: Set<string>;
};

/** Structure events for a line that ran in the same frame (prev.frameId === curr.frameId). */
export function stepEvents(prev: TraceStep, curr: TraceStep, source?: string): StepEvents {
  const containers: StructEvent[] = [];
  const pointers: StructEvent[] = [];
  const covered = new Set<string>();
  const code = sourceLine(source, prev.line);

  for (const name of Object.keys(curr.locals)) {
    if (!has(prev.locals, name)) continue;
    const before = prev.locals[name];
    const after = curr.locals[name];
    if (sameValue(before, after)) continue;
    const inner = containerEvents(name, before, after, prev, curr, code);
    if (inner !== undefined) {
      containers.push(...inner);
      covered.add(name);
      continue;
    }
    const p = pointerEvent(name, before, after, curr, source);
    if (p !== undefined) {
      pointers.push(p);
      covered.add(name);
    }
  }

  const fields: StructEvent[] = [];
  const hp = heapOf(prev);
  const hc = heapOf(curr);
  for (const h of diffHeap(hp, hc)) {
    if (h.kind === "removed") continue;
    const owner = Object.keys(curr.locals).find((n) => {
      const v = curr.locals[n];
      return kindOf(v) === "ref" && (v as { __ref: string }).__ref === h.id;
    });
    fields.push({
      kind: "field",
      owner,
      typeName: h.type,
      field: h.field,
      before: h.kind === "changed" ? viewValue(h.before ?? null, hp) : undefined,
      after: viewValue(h.after ?? null, hc),
    });
  }

  return { events: [...containers, ...fields, ...pointers], covered };
}

// ---------------------------------------------------------------------------
// Membership checks: `if X in Y:` / `elif X not in Y:` / `while X in Y:`.

const CONDITION = /^\s*(if|elif|while)\s+(.+?)\s*:\s*(?:#.*)?$/;
const MEMBERSHIP =
  /^(-?\d+(?:\.\d+)?|"[^"\\]*"|'[^'\\]*'|[A-Za-z_]\w*)\s+(not\s+in|in)\s+([A-Za-z_]\w*)$/;
const KEYWORDS = new Set(["True", "False", "None", "and", "or", "not", "in", "is", "lambda"]);

function parseLiteral(text: string): { ok: true; value: JsonValue } | { ok: false } {
  if (text === "True") return { ok: true, value: true };
  if (text === "False") return { ok: true, value: false };
  if (text === "None") return { ok: true, value: null };
  if (/^-?\d+(?:\.\d+)?$/.test(text)) {
    const n = Number(text);
    return Number.isFinite(n) && Math.abs(n) <= Number.MAX_SAFE_INTEGER ? { ok: true, value: n } : { ok: false };
  }
  if (/^(["']).*\1$/.test(text)) return { ok: true, value: text.slice(1, -1) };
  return { ok: false };
}

/** Python `==` between two primitives (True == 1, False == 0). */
function pyEq(a: JsonValue, b: JsonValue): boolean {
  const norm = (v: JsonValue) => (typeof v === "boolean" ? (v ? 1 : 0) : v);
  return norm(a) === norm(b);
}

/**
 * The result of a membership condition on prev.line, evaluated from prev's
 * snapshot, or undefined when the line is not such a condition or the result
 * cannot be told from the snapshot alone (unknown names, placeholders, refs
 * whose __eq__ the student may have written, numbers not in the data).
 */
export function membership(prev: TraceStep, curr: TraceStep, source: string | undefined): Membership | undefined {
  const code = sourceLine(source, prev.line);
  if (code === undefined) return undefined;
  const m = code.match(CONDITION);
  if (m === null) return undefined;
  let cond = m[2].trim();
  const paren = cond.match(/^\((.*)\)$/);
  if (paren !== null) cond = paren[1].trim();
  const cm = cond.match(MEMBERSHIP);
  if (cm === null) return undefined;
  const [, left, rawOp, right] = cm;
  const negated = rawOp !== "in";
  if (KEYWORDS.has(right) || !has(prev.locals, right)) return undefined;

  let subjectName: string | undefined;
  let x: JsonValue;
  if (/^[A-Za-z_]\w*$/.test(left) && !KEYWORDS.has(left)) {
    if (!has(prev.locals, left)) return undefined;
    subjectName = left;
    x = prev.locals[left];
  } else {
    const lit = parseLiteral(left);
    if (!lit.ok) return undefined;
    x = lit.value;
  }
  if (kindOf(x) !== "primitive") return undefined;

  const y = prev.locals[right];
  const ky = kindOf(y);
  let items: JsonValue[];
  if (ky === "dict") items = dictEntries(y).map(([k]) => k);
  else if (ky === "set" || ky === "array" || ky === "grid" || ky === "deque") items = itemsOf(y);
  else return undefined;
  // A ref's class may define __eq__, and a placeholder could be anything.
  if (items.some((it) => kindOf(it) === "ref" || kindOf(it) === "placeholder")) return undefined;
  const found = items.some((it) => kindOf(it) === "primitive" && pyEq(it, x));

  const value = viewValue(x, heapOf(prev));
  if (subjectName === undefined && value.kind === "literal") {
    // A literal from the code is only quoted if its numbers are in the data.
    const allowed = allowedNumbers(prev, curr);
    if (numberTokens(value.text).some((t) => !allowed.has(t))) return undefined;
  }

  return {
    cond: `${left} ${negated ? "not in" : "in"} ${right}`,
    subject: { name: subjectName, value },
    container: right,
    dict: ky === "dict",
    found,
    result: negated ? !found : found,
    loop: m[1] === "while",
  };
}

/** Any if / elif / while condition that ran: whether it was True. */
export type Branch = {
  /** The condition as written, or null when quoting it could show a number that is not in the data. */
  cond: string | null;
  result: boolean;
  loop: boolean;
};

const MAX_COND = 60;
const indentOf = (s: string) => /^[ \t]*/.exec(s)![0].replace(/\t/g, "    ").length;

/**
 * Whether the condition on prev.line was True, told from where the trace went
 * next: into the block (the next code line, indented deeper) or not. Only for
 * a step that stayed in the same frame and ran nothing else.
 */
export function branchOutcome(prev: TraceStep, curr: TraceStep, source: string | undefined): Branch | undefined {
  if (prev.frameId !== curr.frameId || curr.event !== "line") return undefined;
  const code = sourceLine(source, prev.line);
  const next = sourceLine(source, curr.line);
  if (code === undefined || next === undefined) return undefined;
  const m = code.match(CONDITION);
  if (m === null) return undefined;
  let between = true;
  for (let n = prev.line + 1; n < curr.line; n++) {
    const t = sourceLine(source, n)?.trim() ?? "";
    if (t !== "" && !t.startsWith("#")) between = false;
  }
  const result = curr.line > prev.line && between && indentOf(next) > indentOf(code);
  let cond: string | null = m[2].trim();
  const paren = cond.match(/^\((.*)\)$/);
  if (paren !== null) cond = paren[1].trim();
  const allowed = allowedNumbers(prev, curr);
  if (cond.length > MAX_COND || numberTokens(cond).some((t) => !allowed.has(t))) cond = null;
  return { cond, result, loop: m[1] === "while" };
}

// ---------------------------------------------------------------------------
// Recursion.

/** curr is a call event of a function that is already active further out. */
export function isRecursiveCall(prev: TraceStep | undefined, curr: TraceStep): boolean {
  const outer = stackOf(curr).filter((f) => f.frameId !== curr.frameId);
  if (outer.length > 0) return outer.some((f) => f.functionName === curr.functionName);
  return prev !== undefined && prev.frameId !== curr.frameId && prev.functionName === curr.functionName && prev.depth < curr.depth;
}

/** The frame that called curr's frame, from curr.stack, if known. */
export function callerFrame(curr: TraceStep): StackFrame | undefined {
  const stack = stackOf(curr);
  const at = stack.findIndex((f) => f.frameId === curr.frameId);
  if (at > 0) return stack[at - 1];
  if (at === -1 && stack.length > 0) return stack[stack.length - 1];
  return undefined;
}
