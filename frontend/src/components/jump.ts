// "Jump to the next / previous change of <variable>" over a stored trace.
// Pure, and linear in the number of steps, so it stays fast at 2000 steps.

import type { JsonValue, TraceStep } from "../types/trace.ts";
import { sameValue } from "../explain/snapshot.ts";
import { framesOf } from "./structures.ts";

function has(obj: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

/** Every local name in the trace, in order of first appearance. */
export function variableNames(steps: readonly TraceStep[]): string[] {
  const seen = new Set<string>();
  for (const step of steps) {
    for (const name of Object.keys(step.locals)) seen.add(name);
  }
  return [...seen];
}

type Slot = { present: boolean; value: JsonValue | undefined };

function slot(locals: Record<string, JsonValue>, name: string): Slot {
  return has(locals, name) ? { present: true, value: locals[name] } : { present: false, value: undefined };
}

function differs(a: Slot, b: Slot): boolean {
  return a.present !== b.present || (a.present && !sameValue(a.value, b.value));
}

/**
 * The frame that owns `name` at step `index`: the current frame if the name is
 * one of its locals, else the innermost calling frame that has it, else null.
 */
export function ownerFrame(steps: readonly TraceStep[], index: number, name: string): { frameId: string; slot: Slot } | null {
  const step = steps[index];
  if (!step) return null;
  if (has(step.locals, name)) return { frameId: step.frameId, slot: slot(step.locals, name) };
  const frames = framesOf(step);
  for (let f = frames.length - 2; f >= 0; f--) {
    const fr = frames[f]!;
    if (has(fr.locals, name)) return { frameId: fr.frameId, slot: slot(fr.locals, name) };
  }
  return null;
}

/**
 * The index of the next (dir = 1) or previous (dir = -1) step where `name`
 * changes, or -1 if there is none.
 *
 * - The variable is tracked in the frame that owns it (see ownerFrame). Its
 *   value can only change while that frame runs, so only that frame's steps
 *   are compared. A change is a value that differs by sameValue, or the name
 *   appearing or disappearing.
 * - Next: the first later step whose value differs from this step's.
 * - Previous: the latest earlier step where the value became different from
 *   the step before it in the same frame (so it lands on the change itself).
 * - If no active frame has the name, Next / Previous find the nearest step
 *   where it is one of the current locals ("where it appears").
 */
export function findChange(steps: readonly TraceStep[], index: number, name: string, dir: 1 | -1): number {
  if (!steps[index]) return -1;
  const owner = ownerFrame(steps, index, name);
  if (owner === null) {
    for (let s = index + dir; s >= 0 && s < steps.length; s += dir) {
      if (has(steps[s]!.locals, name)) return s;
    }
    return -1;
  }
  const { frameId } = owner;
  if (dir === 1) {
    for (let s = index + 1; s < steps.length; s++) {
      const step = steps[s]!;
      if (step.frameId !== frameId) continue;
      if (differs(slot(step.locals, name), owner.slot)) return s;
    }
    return -1;
  }
  let afterIdx = index;
  let after = owner.slot;
  for (let s = index - 1; s >= 0; s--) {
    const step = steps[s]!;
    if (step.frameId !== frameId) continue;
    const here = slot(step.locals, name);
    if (differs(here, after) && afterIdx < index) return afterIdx;
    afterIdx = s;
    after = here;
  }
  // The frame's first step: the name appearing there counts as a change.
  return afterIdx < index && after.present ? afterIdx : -1;
}
