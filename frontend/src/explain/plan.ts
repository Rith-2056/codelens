// Decides WHAT to say about a step, independent of language. en.ts and es.ts
// decide HOW to say it, so Spanish can use its own sentence structure instead
// of mirroring the English word for word.
//
// Only `prev` and `curr` are read. The highlighted line (curr.line) has not
// run yet on line/call steps; on return steps the frame is finishing, and on
// exception steps curr.line is the line that failed.

import type { TraceStep } from "../types/trace.ts";
import { diffStep } from "./diff.ts";
import { readError, type ErrorInfo } from "./errors.ts";
import { proseText, viewValue, type ValueView } from "./values.ts";

export const MODULE = "<module>";

/** At most this many variable changes are listed by name in one sentence. */
const MAX_LISTED = 3;
const MAX_OUTPUT_LINES = 3;
const OUTPUT_LINE_MAX = 40;

export type VarView = { name: string; value: ValueView };
export type ChangeView = { name: string; before: ValueView; after: ValueView };

/** New stdout text since the previous step, ready for quoting. */
export type OutputView = { lines: string[]; blank: boolean; more: boolean };

export type Changes = {
  changed: ChangeView[];
  created: VarView[];
  removed: string[];
  /** More variables changed than are listed. */
  more: boolean;
  output?: OutputView;
};

/** What just happened between prev and curr. */
export type Lead =
  | { kind: "ran"; line: number; changes: Changes }
  /** `inner`: a call returned into another call of the same function (recursion). */
  | { kind: "returned"; fn: string; inner: boolean; value?: ValueView; place: string; output?: OutputView }
  | { kind: "entered"; place: string }
  | { kind: "moved"; place: string; back: boolean; output?: OutputView }
  | { kind: "none" };

/** What curr is about to do. */
export type Tail =
  | { kind: "next"; line: number; again: boolean }
  | { kind: "fnDone"; fn: string; value?: ValueView }
  | { kind: "end" };

export type Plan =
  | { kind: "start"; line: number }
  | { kind: "resume"; line: number }
  | { kind: "call"; fn: string; callerLine?: number; params: VarView[]; more: boolean; output?: OutputView }
  | { kind: "error"; line: number; place: string; nothingRan: boolean; error: ErrorInfo }
  | { kind: "flow"; lead: Lead; tail: Tail };

export function hasChanges(c: Changes): boolean {
  return c.changed.length + c.created.length + c.removed.length > 0 || c.more || c.output !== undefined;
}

function viewOutput(added: string): OutputView | undefined {
  if (added === "") return undefined;
  const body = added.endsWith("\n") ? added.slice(0, -1) : added;
  const all = body.split("\n");
  const filled = all.filter((l) => l.trim() !== "");
  if (filled.length === 0) return { lines: [], blank: true, more: false };
  return {
    lines: filled.slice(0, MAX_OUTPUT_LINES).map((l) => proseText(l, OUTPUT_LINE_MAX)),
    blank: false,
    more: filled.length > MAX_OUTPUT_LINES,
  };
}

function viewChanges(prev: TraceStep, curr: TraceStep): Changes {
  const d = diffStep(prev, curr);
  const changed: ChangeView[] = [];
  const created: VarView[] = [];
  const removed: string[] = [];
  let budget = MAX_LISTED;
  let more = false;
  for (const c of d.changed) {
    if (budget === 0) { more = true; break; }
    changed.push({ name: c.name, before: viewValue(c.before), after: viewValue(c.after) });
    budget -= 1;
  }
  for (const c of d.created) {
    if (budget === 0) { more = true; break; }
    created.push({ name: c.name, value: viewValue(c.value) });
    budget -= 1;
  }
  for (const c of d.removed) {
    if (budget === 0) { more = true; break; }
    removed.push(c.name);
    budget -= 1;
  }
  return { changed, created, removed, more, output: viewOutput(d.output) };
}

export function planStep(prev: TraceStep | undefined, curr: TraceStep): Plan {
  // Errors first: an exception step (or any step carrying an error).
  if (curr.event === "exception" || curr.error !== undefined) {
    return {
      kind: "error",
      line: curr.line,
      place: curr.functionName,
      nothingRan: prev === undefined,
      error: readError(curr.error),
    };
  }

  if (curr.event === "call" && curr.functionName !== MODULE) {
    const names = Object.keys(curr.locals);
    const params = names.slice(0, MAX_LISTED).map((name) => ({ name, value: viewValue(curr.locals[name]) }));
    const isCaller = prev !== undefined && prev.event === "line" && prev.depth < curr.depth;
    return {
      kind: "call",
      fn: curr.functionName,
      callerLine: isCaller ? prev.line : undefined,
      params,
      more: names.length > MAX_LISTED,
      output: prev !== undefined ? viewOutput(diffStep(prev, curr).output) : undefined,
    };
  }

  if (prev === undefined) {
    const blank = Object.keys(curr.locals).length === 0 && curr.stdout === "";
    if (curr.event === "call" || (curr.event === "line" && blank)) return { kind: "start", line: curr.line };
    if (curr.event === "line") return { kind: "resume", line: curr.line };
    return { kind: "flow", lead: { kind: "none" }, tail: tailFor(curr, { kind: "none" }) };
  }

  if (curr.event === "call") {
    // A module-level call event that isn't the first step; nothing to diff.
    return { kind: "resume", line: curr.line };
  }

  const lead = leadFor(prev, curr);
  return { kind: "flow", lead, tail: tailFor(curr, lead) };
}

function leadFor(prev: TraceStep, curr: TraceStep): Lead {
  if (prev.frameId === curr.frameId) {
    if (prev.event === "line") return { kind: "ran", line: prev.line, changes: viewChanges(prev, curr) };
    if (prev.event === "call" && curr.event === "line") return { kind: "entered", place: curr.functionName };
    return { kind: "none" };
  }
  const output = viewOutput(diffStep(prev, curr).output);
  if (prev.event === "return" && prev.depth > curr.depth) {
    return {
      kind: "returned",
      fn: prev.functionName,
      inner: prev.functionName === curr.functionName,
      value: prev.returnValue !== undefined ? viewValue(prev.returnValue) : undefined,
      place: curr.functionName,
      output,
    };
  }
  return { kind: "moved", place: curr.functionName, back: prev.depth > curr.depth, output };
}

function tailFor(curr: TraceStep, lead: Lead): Tail {
  if (curr.event === "return") {
    if (curr.functionName === MODULE) return { kind: "end" };
    return {
      kind: "fnDone",
      fn: curr.functionName,
      value: curr.returnValue !== undefined ? viewValue(curr.returnValue) : undefined,
    };
  }
  return { kind: "next", line: curr.line, again: lead.kind === "ran" && lead.line === curr.line };
}
