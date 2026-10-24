// Deterministic step explanations (English + Spanish) for CodeLens.
//
// Usage from the UI:
//   explainStep(i > 0 ? steps[i - 1] : undefined, steps[i], lang, source)
//
// `source` (optional) is the traced program's text. It is only used to read
// the code of the line that just ran (to explain `if x in seen:` results and
// to prefer the names the code uses); every value still comes from prev/curr.
//
// Pure and deterministic: the result depends only on the arguments. No clock,
// no randomness, no locale-dependent formatting. Only prev and curr are read,
// so an explanation can never mention a value from a later step.

import type { TraceStep } from "../types/trace.ts";
import { renderEn } from "./en.ts";
import { renderEs } from "./es.ts";
import { planStep } from "./plan.ts";

export type Lang = "en" | "es";

export const LANGS: readonly Lang[] = ["en", "es"];

/** One or two short sentences explaining what changed between prev and curr. */
export function explainStep(prev: TraceStep | undefined, curr: TraceStep, lang: Lang, source?: string): string {
  const plan = planStep(prev, curr, typeof source === "string" ? source : undefined);
  return lang === "es" ? renderEs(plan) : renderEn(plan);
}

export { diffStep } from "./diff.ts";
export type { StepDiff, VarChange, VarEntry } from "./diff.ts";
export { allowedNumbers, inventedNumbers, numberTokens } from "./numbers.ts";
export {
  describeShort,
  diffHeap,
  diffValue,
  dictEntries,
  itemsOf,
  kindOf,
  POINTER_NAMES,
  resolveRef,
  sameValue,
} from "./snapshot.ts";
export type { Change, HeapChange, ValueKind } from "./snapshot.ts";
