// Task 1: what changed between the previous and the current TraceStep.
//
// The diff only ever looks at `prev` and `curr`, so it cannot leak values from
// later steps. Variables are compared only when both steps are in the same
// frame: locals from different frames (a caller and its callee) are unrelated.

import type { JsonValue, TraceStep } from "../types/trace.ts";
import { sameValue } from "./values.ts";

export type VarEntry = { name: string; value: JsonValue };
export type VarChange = { name: string; before: JsonValue; after: JsonValue };

export type StepDiff = {
  /** There is no previous step. */
  first: boolean;
  /** prev and curr belong to the same frame (same frameId). */
  sameFrame: boolean;
  /** Variables in curr that prev's frame did not have (same frame only). */
  created: VarEntry[];
  /** Variables whose value differs between prev and curr (same frame only). */
  changed: VarChange[];
  /** Variables prev had that curr no longer has, e.g. after `del` (same frame only). */
  removed: VarEntry[];
  /** stdout text appended since prev ("" if none, or if it can't be told). */
  output: string;
};

export function diffStep(prev: TraceStep | undefined, curr: TraceStep): StepDiff {
  if (prev === undefined) {
    return { first: true, sameFrame: false, created: [], changed: [], removed: [], output: "" };
  }

  const output = curr.stdout.startsWith(prev.stdout) ? curr.stdout.slice(prev.stdout.length) : "";
  const sameFrame = prev.frameId === curr.frameId;
  const created: VarEntry[] = [];
  const changed: VarChange[] = [];
  const removed: VarEntry[] = [];

  if (sameFrame) {
    const has = (o: Record<string, JsonValue>, k: string) => Object.prototype.hasOwnProperty.call(o, k);
    for (const name of Object.keys(curr.locals)) {
      const after = curr.locals[name];
      if (!has(prev.locals, name)) {
        created.push({ name, value: after });
      } else if (!sameValue(prev.locals[name], after)) {
        changed.push({ name, before: prev.locals[name], after });
      }
    }
    for (const name of Object.keys(prev.locals)) {
      if (!has(curr.locals, name)) removed.push({ name, value: prev.locals[name] });
    }
  }

  return { first: false, sameFrame, created, changed, removed, output };
}
