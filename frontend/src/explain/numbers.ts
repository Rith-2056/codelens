// The no-invented-number check.
//
// Every number in an explanation must come from the prev/curr snapshots: a
// local's name or value (including a placeholder's __len__ and the contents
// of tagged __dict/__set/__deque values), the line, the returnValue, stdout,
// the function name, the error type and message, heap object fields (and
// type names), and the stack frames' locals, lines and function names.
// `index`, `depth`, `frameId` and heap ids (the "3" in "o3") are deliberately
// NOT sources: the UI already shows "Step X of Y", and depth/ids are internal.
// Array positions are not sources either; a position may only be stated when
// the same number is a value somewhere in the data (e.g. a local `i`).
//
// The tests run this over every template. The /api/explain LLM path is meant
// to reuse it (with the code slice as an extra source) before accepting text.

import type { JsonValue, TraceStep } from "../types/trace.ts";

/** A run of digits (with an optional decimal part) not glued to a word. */
const NUMBER_TOKEN = /(?<![\p{L}\p{N}_.])\d+(?:\.\d+)?/gu;

export function numberTokens(text: string): string[] {
  return text.match(NUMBER_TOKEN) ?? [];
}

function collect(v: JsonValue | undefined, out: Set<string>): void {
  if (v === undefined || v === null || typeof v === "boolean") return;
  if (typeof v === "number") {
    for (const t of numberTokens(String(v))) out.add(t);
  } else if (typeof v === "string") {
    for (const t of numberTokens(v)) out.add(t);
  } else if (Array.isArray(v)) {
    for (const item of v) collect(item, out);
  } else {
    for (const k of Object.keys(v)) {
      if (k === "__ref") continue; // a heap id, never a source
      collect(k, out);
      collect(v[k], out);
    }
  }
}

function collectHeap(heap: unknown, out: Set<string>): void {
  if (heap === null || typeof heap !== "object" || Array.isArray(heap)) return;
  for (const obj of Object.values(heap as Record<string, unknown>)) {
    if (obj === null || typeof obj !== "object") continue;
    const o = obj as { type?: unknown; fields?: unknown };
    if (typeof o.type === "string") collect(o.type, out);
    if (o.fields !== null && typeof o.fields === "object" && !Array.isArray(o.fields)) {
      collect(o.fields as JsonValue, out);
    }
  }
}

function collectStack(stack: unknown, out: Set<string>): void {
  if (!Array.isArray(stack)) return;
  for (const f of stack) {
    if (f === null || typeof f !== "object") continue;
    const frame = f as { functionName?: unknown; line?: unknown; locals?: unknown };
    if (typeof frame.functionName === "string") collect(frame.functionName, out);
    if (typeof frame.line === "number") collect(frame.line, out);
    if (frame.locals !== null && typeof frame.locals === "object" && !Array.isArray(frame.locals)) {
      collect(frame.locals as JsonValue, out);
    }
  }
}

/** Number tokens that an explanation of (prev, curr) may contain. */
export function allowedNumbers(
  prev: TraceStep | undefined,
  curr: TraceStep,
  extraSources: readonly string[] = [],
): Set<string> {
  const out = new Set<string>();
  for (const step of [prev, curr]) {
    if (step === undefined) continue;
    collect(step.line, out);
    collect(step.functionName, out);
    collect(step.locals, out);
    collect(step.stdout, out);
    collect(step.returnValue, out);
    if (step.error !== undefined) {
      collect(step.error.type, out);
      collect(step.error.message, out);
    }
    collectHeap(step.heap, out);
    collectStack(step.stack, out);
  }
  for (const s of extraSources) collect(s, out);
  return out;
}

/** Numbers in `text` that do not appear in prev/curr (empty means the text passes). */
export function inventedNumbers(
  text: string,
  prev: TraceStep | undefined,
  curr: TraceStep,
  extraSources: readonly string[] = [],
): string[] {
  const allowed = allowedNumbers(prev, curr, extraSources);
  return numberTokens(text).filter((t) => !allowed.has(t));
}
