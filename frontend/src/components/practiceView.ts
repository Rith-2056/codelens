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

export type Message = { tone: "ok" | "error"; text: string };

/** What went wrong on one input, as a sentence (or null if it was right). */
function whatWentWrong(r: CheckResult): string | null {
  if (r.correct) return null;
  if (r.error) {
    if (r.error.type === "StepLimit") {
      return "Your solution ran too long: is there a loop that never ends, or a lot of repeated work?";
    }
    if (r.error.type === "Timeout") return `${r.error.message} Is there a loop that never ends?`;
    const detail = r.error.message ? `: ${r.error.message}` : "";
    return `Your solution stopped with ${r.error.type}${detail}.`;
  }
  return `Your solution returned ${formatValue(r.got)}, but the correct answer is ${formatValue(r.expected)}.`;
}

/** The verdict for one run, in plain words. */
export function resultMessage(r: CheckResult): Message {
  if (r.correct) return { tone: "ok", text: `Correct: your solution returned ${formatValue(r.got)} for this input.` };
  const wrong = whatWentWrong(r)!;
  if (r.error) return { tone: "error", text: wrong };
  return { tone: "error", text: `Not yet: ${wrong[0]!.toLowerCase()}${wrong.slice(1)}` };
}

/** The verdict when the search found an input that breaks the solution. */
export function counterexampleMessage(params: readonly string[], found: CheckResult & { args: readonly JsonValue[] }): Message {
  return {
    tone: "error",
    text: `CodeLens found a small input where your solution goes wrong: ${formatInput(params, found.args)}. ${whatWentWrong(found)}`,
  };
}

/** The verdict when the search found nothing and every example passed. */
export function passedMessage(search: { tried: number; complete: boolean; timedOut?: boolean }, examples: number): Message {
  const all = `all ${examples} examples`;
  if (search.timedOut) {
    return {
      tone: "error",
      text: `The search for a failing input took too long, so CodeLens stopped it. Your solution was right on ${all}; if it is slow, look for repeated work.`,
    };
  }
  if (search.complete) {
    return {
      tone: "ok",
      text: `Accepted: CodeLens checked ${search.tried} small inputs and ${all}, and your solution was right every time.`,
    };
  }
  return {
    tone: "ok",
    text: `No mistake found: your solution was right on the ${search.tried} small inputs CodeLens had time to check and on ${all}.`,
  };
}
