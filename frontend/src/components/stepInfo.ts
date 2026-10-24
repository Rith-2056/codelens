import type { JsonValue, TraceStep } from "../types/trace";
import { valueKey } from "./values";

// The step to compare against when looking for changes: the nearest earlier
// step in the same frame. Inside one frame this is simply steps[i - 1]; it
// only differs when a call or return switches frames, so returning from a
// function does not mark every module variable as "new".
export function previousInFrame(
  steps: readonly TraceStep[],
  index: number,
): TraceStep | undefined {
  const current = steps[index];
  if (!current) return undefined;
  for (let j = index - 1; j >= 0; j--) {
    const s = steps[j];
    if (s && s.frameId === current.frameId) return s;
  }
  return undefined;
}

export type Change =
  | { kind: "same" }
  | { kind: "new" }
  | { kind: "changed"; before: JsonValue };

export type VariableRow = { name: string; value: JsonValue; change: Change };

export function diffLocals(
  current: Record<string, JsonValue>,
  previous: Record<string, JsonValue> | undefined,
): VariableRow[] {
  return Object.keys(current).map((name) => {
    const value = current[name] ?? null;
    if (!previous || !Object.prototype.hasOwnProperty.call(previous, name)) {
      return { name, value, change: { kind: "new" } };
    }
    const before = previous[name] ?? null;
    if (valueKey(before) === valueKey(value)) {
      return { name, value, change: { kind: "same" } };
    }
    return { name, value, change: { kind: "changed", before } };
  });
}

// Text label for the highlighted line. Line and call events fire BEFORE the
// line runs, so the highlighted line has not run yet.
export function lineLabel(step: TraceStep): string {
  switch (step.event) {
    case "call":
    case "line":
      return "Next line to run";
    case "return":
      return step.depth === 0
        ? "Program finished"
        : `Returning from ${step.functionName}`;
    case "exception":
      return "Error on this line";
  }
}
