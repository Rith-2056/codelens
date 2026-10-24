// Deterministic step explanations (English + Spanish) for CodeLens.
//
// Usage from the UI:
//   explainStep(i > 0 ? steps[i - 1] : undefined, steps[i], lang)
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
export function explainStep(prev: TraceStep | undefined, curr: TraceStep, lang: Lang): string {
  const plan = planStep(prev, curr);
  return lang === "es" ? renderEs(plan) : renderEn(plan);
}

export { diffStep } from "./diff.ts";
export type { StepDiff, VarChange, VarEntry } from "./diff.ts";
export { allowedNumbers, inventedNumbers, numberTokens } from "./numbers.ts";
