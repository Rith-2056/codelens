// Pure logic for the Data structures and Call stack panels. Everything is
// chosen from the shape of the data, never from the lesson, so a student's
// own solution gets the same views as the built-in lessons.

import type { JsonValue, StackFrame, TraceStep } from "../types/trace.ts";
import { diffValue, kindOf, POINTER_NAMES, sameValue, type Change } from "../explain/snapshot.ts";
import { formatValue, type Heap } from "./values.ts";

export type ViewKind = "array" | "grid" | "dict" | "set" | "deque" | "ref";

/** Which visualizer draws this value, or null when the variable table is enough. */
export function viewKindOf(value: JsonValue): ViewKind | null {
  const kind = kindOf(value);
  return kind === "primitive" || kind === "placeholder" ? null : kind;
}

function has(obj: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

/**
 * Pointer arrows for a 1D array of `length` items: for each cell, the names of
 * int locals in the same frame that are in POINTER_NAMES and hold a valid
 * index of the array (0 to length - 1). Several pointers can share a cell.
 */
export function pointersFor(length: number, locals: Record<string, JsonValue>): string[][] {
  const cells: string[][] = Array.from({ length }, () => []);
  for (const name of Object.keys(locals)) {
    if (!POINTER_NAMES.includes(name)) continue;
    const v = locals[name];
    if (typeof v === "number" && Number.isInteger(v) && v >= 0 && v < length) {
      cells[v]!.push(name);
    }
  }
  return cells;
}

/** True when `name` appears as a whole identifier in a line of code. */
export function lineUses(line: string, name: string): boolean {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return false;
  return new RegExp(`(^|[^A-Za-z0-9_])${name}([^A-Za-z0-9_]|$)`).test(line);
}

export type StructureItem = {
  name: string;
  value: JsonValue;
  view: ViewKind;
  /** The name did not exist in the comparison step. */
  isNew: boolean;
  /** The name existed but now holds a different value that diffValue cannot itemize. */
  replaced: boolean;
  /** Changes inside the value since the comparison step. */
  changes: Change[];
  /** For a ref: an earlier name in the same frame that holds the same object. */
  aliasOf?: string;
};

/**
 * One item per local whose value gets a visualizer, in local order.
 * `prevLocals` is the comparison step's locals (the same frame's previous
 * step); when it is undefined there is nothing to compare with, so no change
 * markers are produced at all.
 */
export function structuresFor(
  locals: Record<string, JsonValue>,
  prevLocals: Record<string, JsonValue> | undefined,
): StructureItem[] {
  const out: StructureItem[] = [];
  const firstNameForRef = new Map<string, string>();
  for (const name of Object.keys(locals)) {
    const value = locals[name] ?? null;
    const view = viewKindOf(value);
    if (view === null) continue;
    let isNew = false;
    let replaced = false;
    let changes: Change[] = [];
    if (prevLocals) {
      if (!has(prevLocals, name)) {
        isNew = true;
      } else {
        const before = prevLocals[name] ?? null;
        changes = diffValue(before, value);
        replaced = changes.length === 0 && !sameValue(before, value);
      }
    }
    const item: StructureItem = { name, value, view, isNew, replaced, changes };
    if (view === "ref") {
      const id = String((value as { __ref: string }).__ref);
      const first = firstNameForRef.get(id);
      if (first !== undefined) item.aliasOf = first;
      else firstNameForRef.set(id, name);
    }
    out.push(item);
  }
  return out;
}

/** Names of earlier locals holding the same heap object, keyed by local name. */
export function aliasesIn(locals: Record<string, JsonValue>): Map<string, string> {
  const first = new Map<string, string>();
  const out = new Map<string, string>();
  for (const name of Object.keys(locals)) {
    const v = locals[name] ?? null;
    if (kindOf(v) !== "ref") continue;
    const id = String((v as { __ref: string }).__ref);
    const seen = first.get(id);
    if (seen !== undefined) out.set(name, seen);
    else first.set(id, name);
  }
  return out;
}

/**
 * One change in plain words. `spoken` avoids the arrow symbol, which screen
 * readers read as "right arrow".
 */
export function describeChange(change: Change, view: ViewKind, heap?: Heap, spoken = false): string {
  const f = (v: JsonValue | undefined) => (v === undefined ? "nothing" : formatValue(v, heap));
  const fromTo = (a: JsonValue | undefined, b: JsonValue | undefined) =>
    spoken ? `changed from ${f(a)} to ${f(b)}` : `${f(a)} → ${f(b)}`;
  if ("end" in change) {
    return change.kind === "pushed" ? `added ${f(change.value)} at ${change.end}` : `removed ${f(change.value)} from ${change.end}`;
  }
  const isList = view === "array" || view === "grid";
  if (change.kind === "changed") {
    if (isList) return `${cellName(change.key)}: ${fromTo(change.before, change.after)}`;
    return `key ${f(change.key)}: ${fromTo(change.before, change.after)}`;
  }
  if (isList) {
    const idx = typeof change.key === "number" ? change.key : 0;
    return change.kind === "added"
      ? `added ${f(change.value)} at index ${idx}`
      : `removed ${f(change.value)} from index ${idx}`;
  }
  if (view === "set") return `${change.kind} ${f(change.key)}`;
  if (change.kind === "added") return `added key ${f(change.key)} with value ${f(change.value)}`;
  return `removed key ${f(change.key)}`;
}

/** "index 2" or "row 1, column 3" for an array or grid change key. */
export function cellName(key: JsonValue): string {
  if (Array.isArray(key) && key.length === 2) return `row ${String(key[0])}, column ${String(key[1])}`;
  return `index ${String(key)}`;
}

/** A short summary of all changes in one structure, e.g. "added key 9 and 1 more change". */
export function summarizeChanges(changes: Change[], view: ViewKind, heap?: Heap, spoken = false): string {
  if (changes.length === 0) return "";
  const first = describeChange(changes[0]!, view, heap, spoken);
  const rest = changes.length - 1;
  if (rest === 0) return first;
  return `${first} and ${rest} more ${rest === 1 ? "change" : "changes"}`;
}

/** The step's top structure change, for the narrator: "seen: added key 9 with value 1". */
export function topStructureChange(items: StructureItem[], heap?: Heap): string {
  const item = items.find((it) => it.changes.length > 0);
  if (!item) return "";
  return `${item.name}: ${summarizeChanges(item.changes, item.view, heap, true)}.`;
}

/**
 * Every active frame, outermost first, current frame last. Falls back to the
 * current frame alone for old fixtures with an empty stack. The current frame
 * always uses TraceStep.locals, which the tracer never empties.
 */
export function framesOf(step: TraceStep): StackFrame[] {
  const current: StackFrame = {
    functionName: step.functionName,
    frameId: step.frameId,
    line: step.line,
    locals: step.locals,
  };
  const stack = Array.isArray(step.stack) ? step.stack : [];
  if (stack.length === 0) return [current];
  const last = stack[stack.length - 1]!;
  if (last.frameId === step.frameId) return [...stack.slice(0, -1), { ...last, locals: step.locals, line: step.line }];
  return [...stack, current];
}

/** The frame's name in plain words. */
export function frameTitle(functionName: string): string {
  return functionName === "<module>" ? "main program" : `${functionName}()`;
}
