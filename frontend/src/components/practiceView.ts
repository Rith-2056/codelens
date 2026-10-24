// Pure helpers for the problem page.

import type { JsonValue, TraceStep } from "../types/trace.ts";
import { resolveRef } from "../explain/snapshot.ts";
import { formatValue } from "./values.ts";

type Locals = Record<string, JsonValue>;

/** True when `self` is the field-less Solution object every LeetCode answer has. */
function isEmptySolution(v: JsonValue | undefined, step: TraceStep): boolean {
  if (v === undefined) return false;
  const obj = resolveRef(v, step.heap ?? {});
  return obj !== undefined && obj.type === "Solution" && Object.keys(obj.fields ?? {}).length === 0;
}

function withoutSelf(locals: Locals, step: TraceStep): Locals {
  if (!isEmptySolution(locals.self, step)) return locals;
  const { self: _self, ...rest } = locals;
  return rest;
}

/**
 * The step without the `self` that points at an empty Solution object: it is
 * the same in every LeetCode answer and only adds noise. Any other `self`
 * (another class, or a Solution that stores state) stays.
 */
export function hideSolutionSelf(step: TraceStep): TraceStep {
  return {
    ...step,
    locals: withoutSelf(step.locals, step),
    stack: (step.stack ?? []).map((f) => ({ ...f, locals: withoutSelf(f.locals, step) })),
  };
}

/** "nums = [3, 8, 5, 1], target = 6": an example's arguments as Python. */
export function formatInput(params: readonly string[], args: readonly JsonValue[]): string {
  return params.map((name, i) => `${name} = ${formatValue(args[i] ?? null)}`).join(", ");
}

export type CheckResult = {
  correct: boolean;
  got: JsonValue;
  expected: JsonValue;
  error: { type: string; message: string } | null;
};

/** The verdict for one run, in plain words. */
export function resultMessage(r: CheckResult): { tone: "ok" | "error"; text: string } {
  if (r.correct) return { tone: "ok", text: `Correct: your solution returned ${formatValue(r.got)} for this input.` };
  if (r.error) {
    if (r.error.type === "StepLimit") {
      return { tone: "error", text: "Your solution ran too long: is there a loop that never ends?" };
    }
    if (r.error.type === "Timeout") return { tone: "error", text: `${r.error.message} Is there a loop that never ends?` };
    const detail = r.error.message ? `: ${r.error.message}` : "";
    return { tone: "error", text: `Your solution stopped with ${r.error.type}${detail}.` };
  }
  return {
    tone: "error",
    text: `Not yet: your solution returned ${formatValue(r.got)}, but the correct answer is ${formatValue(r.expected)}.`,
  };
}
