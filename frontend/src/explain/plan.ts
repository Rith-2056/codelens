// Decides WHAT to say about a step, independent of language. en.ts and es.ts
// decide HOW to say it, so Spanish can use its own sentence structure instead
// of mirroring the English word for word.
//
// Only `prev` and `curr` are read. The highlighted line (curr.line) has not
// run yet on line/call steps; on return steps the frame is finishing, and on
// exception steps curr.line is the line that failed.

import type { JsonValue, TraceStep } from "../types/trace.ts";
import { diffStep } from "./diff.ts";
import { readError, type ErrorInfo } from "./errors.ts";
import {
  branchOutcome,
  callerFrame,
  heapOf,
  isRecursiveCall,
  membership,
  stackOf,
  stepEvents,
  type Branch,
  type Membership,
  type StructEvent,
} from "./events.ts";
import { sameValue } from "./snapshot.ts";
import { proseText, viewValue, type ValueView } from "./values.ts";

export type { Branch, Membership, StructEvent } from "./events.ts";

export const MODULE = "<module>";

/** At most this many variable changes are listed by name in one sentence. */
const MAX_LISTED = 3;
const MAX_OUTPUT_LINES = 3;
const OUTPUT_LINE_MAX = 40;
/** At most this many structure-level items are described for one line. */
const MAX_ITEMS = 2;

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

/** One thing a line did, when the step is described item by item. */
export type Item =
  | StructEvent
  | { kind: "var"; change: ChangeView }
  | { kind: "new"; v: VarView }
  | { kind: "gone"; name: string };

/** The structure-level description of a line: at most MAX_ITEMS items. */
export type Items = { list: Item[]; more: boolean; output?: OutputView };

/** What just happened between prev and curr. */
export type Lead =
  /**
   * `items`: set when a data structure changed or a pointer moved; then the
   * renderers describe `items` instead of `changes`.
   * `check`: a membership condition that ran and changed nothing.
   * `branch`: any other if / elif / while condition that ran and changed nothing.
   */
  | { kind: "ran"; line: number; changes: Changes; items?: Items; check?: Membership; branch?: Branch }
  /**
   * `inner`: a call returned into another call of the same function (recursion).
   * `now`: variables of the caller that changed when the call finished.
   */
  | { kind: "returned"; fn: string; inner: boolean; value?: ValueView; place: string; output?: OutputView; now?: VarView[]; cls: boolean }
  /** `cls`: the frame is a class body (`class TreeNode:`), not a function. */
  | { kind: "entered"; place: string; cls: boolean }
  | { kind: "moved"; place: string; back: boolean; output?: OutputView }
  | { kind: "none" };

/** What curr is about to do. */
export type Tail =
  | { kind: "next"; line: number; again: boolean }
  /** `toSelf`: the caller is another call of the same function (recursion). */
  | { kind: "fnDone"; fn: string; value?: ValueView; toSelf: boolean; cls: boolean }
  | { kind: "end" };

export type Plan =
  | { kind: "start"; line: number }
  | { kind: "resume"; line: number }
  | { kind: "call"; fn: string; callerLine?: number; params: VarView[]; more: boolean; output?: OutputView; recursive: boolean; cls: boolean }
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
  const hp = heapOf(prev);
  const hc = heapOf(curr);
  const changed: ChangeView[] = [];
  const created: VarView[] = [];
  const removed: string[] = [];
  let budget = MAX_LISTED;
  let more = false;
  for (const c of d.changed) {
    if (budget === 0) { more = true; break; }
    changed.push({ name: c.name, before: viewValue(c.before, hp), after: viewValue(c.after, hc) });
    budget -= 1;
  }
  for (const c of d.created) {
    if (budget === 0) { more = true; break; }
    created.push({ name: c.name, value: viewValue(c.value, hc) });
    budget -= 1;
  }
  for (const c of d.removed) {
    if (budget === 0) { more = true; break; }
    removed.push(c.name);
    budget -= 1;
  }
  return { changed, created, removed, more, output: viewOutput(d.output) };
}

/**
 * Item-by-item description when a data structure changed or a pointer moved:
 * structure events first (in their priority order), then other variables,
 * at most MAX_ITEMS in all. Undefined when there is no structure event.
 */
function viewItems(prev: TraceStep, curr: TraceStep, source: string | undefined): Items | undefined {
  const { events, covered } = stepEvents(prev, curr, source);
  if (events.length === 0) return undefined;
  const d = diffStep(prev, curr);
  const hp = heapOf(prev);
  const hc = heapOf(curr);
  const rest: Item[] = [
    ...d.changed
      .filter((c) => !covered.has(c.name))
      .map((c): Item => ({ kind: "var", change: { name: c.name, before: viewValue(c.before, hp), after: viewValue(c.after, hc) } })),
    ...d.created.map((c): Item => ({ kind: "new", v: { name: c.name, value: viewValue(c.value, hc) } })),
    ...d.removed.map((c): Item => ({ kind: "gone", name: c.name })),
  ];
  const all: Item[] = [...events, ...rest];
  return { list: all.slice(0, MAX_ITEMS), more: all.length > MAX_ITEMS, output: viewOutput(d.output) };
}

/**
 * The frame named `name` runs a class body: the source has `class name` and
 * no `def name`. Needs the source; without it, frames read as functions.
 */
function isClassBody(name: string, source: string | undefined): boolean {
  if (source === undefined || !/^[A-Za-z_]\w*$/.test(name)) return false;
  return new RegExp(`^\\s*class\\s+${name}\\b`, "m").test(source) && !new RegExp(`^\\s*(?:async\\s+)?def\\s+${name}\\b`, "m").test(source);
}

/** Caller variables that changed when a call finished (from prev.stack's copy of the caller frame). */
function callerNow(prev: TraceStep, curr: TraceStep): VarView[] | undefined {
  const before = stackOf(prev).find((f) => f.frameId === curr.frameId);
  if (before === undefined || before.locals === null || typeof before.locals !== "object") return undefined;
  const hc = heapOf(curr);
  const out: VarView[] = [];
  for (const name of Object.keys(curr.locals)) {
    const was: JsonValue | undefined = Object.prototype.hasOwnProperty.call(before.locals, name) ? before.locals[name] : undefined;
    if (was !== undefined && sameValue(was, curr.locals[name])) continue;
    out.push({ name, value: viewValue(curr.locals[name], hc) });
  }
  return out.length > 0 ? out.slice(0, MAX_ITEMS) : undefined;
}

export function planStep(prev: TraceStep | undefined, curr: TraceStep, source?: string): Plan {
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
    const hc = heapOf(curr);
    const params = names.slice(0, MAX_LISTED).map((name) => ({ name, value: viewValue(curr.locals[name], hc) }));
    const isCaller = prev !== undefined && prev.event === "line" && prev.depth < curr.depth;
    return {
      kind: "call",
      fn: curr.functionName,
      callerLine: isCaller ? prev.line : undefined,
      params,
      more: names.length > MAX_LISTED,
      output: prev !== undefined ? viewOutput(diffStep(prev, curr).output) : undefined,
      recursive: isRecursiveCall(prev, curr),
      cls: isClassBody(curr.functionName, source),
    };
  }

  if (prev === undefined) {
    const blank = Object.keys(curr.locals).length === 0 && curr.stdout === "";
    if (curr.event === "call" || (curr.event === "line" && blank)) return { kind: "start", line: curr.line };
    if (curr.event === "line") return { kind: "resume", line: curr.line };
    return { kind: "flow", lead: { kind: "none" }, tail: tailFor(curr, { kind: "none" }, source) };
  }

  if (curr.event === "call") {
    // A module-level call event that isn't the first step; nothing to diff.
    return { kind: "resume", line: curr.line };
  }

  const lead = leadFor(prev, curr, source);
  return { kind: "flow", lead, tail: tailFor(curr, lead, source) };
}

function leadFor(prev: TraceStep, curr: TraceStep, source: string | undefined): Lead {
  if (prev.frameId === curr.frameId) {
    if (prev.event === "line") {
      const changes = viewChanges(prev, curr);
      const items = viewItems(prev, curr, source);
      if (items !== undefined) return { kind: "ran", line: prev.line, changes, items };
      if (!hasChanges(changes)) {
        const check = membership(prev, curr, source);
        if (check !== undefined) return { kind: "ran", line: prev.line, changes, check };
        const branch = branchOutcome(prev, curr, source);
        if (branch !== undefined) return { kind: "ran", line: prev.line, changes, branch };
      }
      return { kind: "ran", line: prev.line, changes };
    }
    if (prev.event === "call" && curr.event === "line") {
      return { kind: "entered", place: curr.functionName, cls: isClassBody(curr.functionName, source) };
    }
    return { kind: "none" };
  }
  const output = viewOutput(diffStep(prev, curr).output);
  if (prev.event === "return" && prev.depth > curr.depth) {
    return {
      kind: "returned",
      fn: prev.functionName,
      inner: prev.functionName === curr.functionName,
      value: prev.returnValue !== undefined ? viewValue(prev.returnValue, heapOf(prev)) : undefined,
      place: curr.functionName,
      output,
      now: output === undefined ? callerNow(prev, curr) : undefined,
      cls: isClassBody(prev.functionName, source),
    };
  }
  return { kind: "moved", place: curr.functionName, back: prev.depth > curr.depth, output };
}

function tailFor(curr: TraceStep, lead: Lead, source: string | undefined): Tail {
  if (curr.event === "return") {
    if (curr.functionName === MODULE) return { kind: "end" };
    return {
      kind: "fnDone",
      fn: curr.functionName,
      value: curr.returnValue !== undefined ? viewValue(curr.returnValue, heapOf(curr)) : undefined,
      toSelf: callerFrame(curr)?.functionName === curr.functionName,
      cls: isClassBody(curr.functionName, source),
    };
  }
  return { kind: "next", line: curr.line, again: lead.kind === "ran" && lead.line === curr.line };
}
