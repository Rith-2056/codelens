// The no-invented-number check.
//
// Every number in an explanation must come from the prev/curr snapshots: a
// local's name or value (including a placeholder's __len__), the line, the
// returnValue, stdout, the function name, or the error type and message.
// `index`, `depth` and `frameId` are deliberately NOT sources: the UI already
// shows "Step X of Y", and depth/frame ids are internal.
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
      collect(k, out);
      collect(v[k], out);
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
