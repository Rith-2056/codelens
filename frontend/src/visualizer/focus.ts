// What the Code Visualizer focuses on at each step. Everything is worked out
// from the trace and the code itself, never from which problem is open, so a
// student's own program on the Your code page gets the same views.
//
// - detectPattern: which algorithm the run looks like (binary search, sliding
//   window, two pointers, DP, tree, graph, hash map, array, general), the main
//   list and its pointer variables.
// - codeContext: where the step is: function, recursion depth, enclosing loop
//   and how many passes that loop has started.
// - variableGroups: the frame's variables grouped (parameters, loop counters,
//   pointers, other), each marked changed and/or relevant to this step.
// - accessedCells: the list cells a line reads or writes, e.g. ways[i - 1].

import type { JsonValue, TraceStep } from "../types/trace";
import { POINTER_NAMES, kindOf, sameValue } from "../explain/snapshot";
import { graphOf, isTreeNodeRef } from "../components/graphTree";
import { lineUses, structuresFor, summarizeChanges } from "../components/structures";
import { formatValue } from "../components/values";
import { sourceLines } from "../components/CodeView";
import { previousInFrame } from "../components/stepInfo";

export type PatternKind =
  | "binary-search"
  | "sliding-window"
  | "two-pointers"
  | "dp"
  | "tree"
  | "graph"
  | "hash-map"
  | "array"
  | "general";

export type Pattern = {
  kind: PatternKind;
  /** The list the pointers move over (not for dp, which has `table`). */
  array?: string;
  /** The DP list being filled. */
  table?: string;
  /** Index variables on the main list, in reading order (left before right). */
  pointers: string[];
  /** Sliding window: the variable holding the window size, and the running window value. */
  windowSize?: string;
  windowValue?: string;
  /** Some function calls itself. */
  recursive: boolean;
};

const has = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);
const isInt = (v: JsonValue | undefined): v is number => typeof v === "number" && Number.isInteger(v);
const isFlatList = (v: JsonValue | undefined): v is JsonValue[] =>
  v !== undefined && kindOf(v) === "array" && (v as JsonValue[]).every((x) => x === null || typeof x !== "object");

/** Reading order for pointer labels: low end first, the middle, then the high end. */
const POINTER_ORDER = ["lo", "low", "l", "left", "start", "slow", "i", "mid", "m", "j", "fast", "end", "r", "right", "hi", "high", "k"];
const LOW = ["lo", "low", "l", "left", "start"];
const HIGH = ["hi", "high", "r", "right", "end"];
const PAIRS: [string, string][] = [["left", "right"], ["lo", "hi"], ["low", "high"], ["l", "r"], ["start", "end"], ["slow", "fast"], ["i", "j"]];
const DP_NAMES = ["dp", "ways", "memo", "table", "cache", "f"];
const HIDDEN_TYPES = new Set(["function", "type", "module", "method", "builtin_function_or_method", "classmethod", "staticmethod"]);
const POINTERISH = [...POINTER_NAMES, "low", "high", "m"];

const byOrder = (a: string, b: string) => {
  const ia = POINTER_ORDER.indexOf(a);
  const ib = POINTER_ORDER.indexOf(b);
  return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
};

/** Functions, classes and modules are not shown as variables. */
export function isHiddenValue(v: JsonValue | undefined): boolean {
  if (v === undefined || kindOf(v) !== "placeholder") return false;
  return HIDDEN_TYPES.has(String((v as Record<string, JsonValue>)["__type__"]));
}

/** Every frame's locals at a step (the current frame's from step.locals). */
function frameLocals(step: TraceStep): Record<string, JsonValue>[] {
  const stack = Array.isArray(step.stack) ? step.stack : [];
  const others = stack.filter((f) => f.frameId !== step.frameId).map((f) => f.locals);
  return [...others, step.locals];
}

export function detectPattern(steps: readonly TraceStep[], source: string): Pattern {
  const arrays: string[] = [];
  const pointersOf = new Map<string, Set<string>>();
  const names = new Set<string>();
  let tree = false;
  let graph = false;
  let mapOrSet = false;
  let recursive = false;

  for (const step of steps) {
    const stack = Array.isArray(step.stack) ? step.stack : [];
    const fnNames = stack.map((f) => f.functionName);
    if (fnNames.some((n, k) => n !== "<module>" && fnNames.indexOf(n) !== k)) recursive = true;
    for (const locals of frameLocals(step)) {
      for (const [name, value] of Object.entries(locals)) {
        if (isHiddenValue(value)) continue;
        names.add(name);
        const kind = kindOf(value);
        if (!tree && kind === "ref" && isTreeNodeRef(value, step.heap ?? {})) tree = true;
        if (kind === "dict" && graphOf(value)) graph = true;
        else if (kind === "dict" || kind === "set") mapOrSet = true;
        if (isFlatList(value) && !arrays.includes(name)) arrays.push(name);
      }
      for (const [arr, value] of Object.entries(locals)) {
        if (!isFlatList(value)) continue;
        for (const [p, v] of Object.entries(locals)) {
          if (POINTERISH.includes(p) && isInt(v) && v >= 0 && v < value.length) {
            if (!pointersOf.has(arr)) pointersOf.set(arr, new Set());
            pointersOf.get(arr)!.add(p);
          }
        }
      }
    }
  }

  const ptrs = (arr: string | undefined, skip: string[] = []) =>
    arr ? [...(pointersOf.get(arr) ?? [])].filter((p) => !skip.includes(p)).sort(byOrder) : [];
  const withPointers = arrays.filter((a) => (pointersOf.get(a)?.size ?? 0) > 0);
  const main = [...withPointers].sort((a, b) => (pointersOf.get(b)!.size - pointersOf.get(a)!.size))[0] ?? arrays[0];

  if (tree) return { kind: "tree", pointers: [], recursive };
  if (graph) return { kind: "graph", pointers: [], recursive };

  const mainPtrs = ptrs(main);
  const hasPtr = (list: string[]) => list.some((p) => mainPtrs.includes(p));
  if (main && (mainPtrs.includes("mid") || mainPtrs.includes("m")) && hasPtr(LOW) && hasPtr(HIGH)) {
    return { kind: "binary-search", array: main, pointers: mainPtrs.filter((p) => p !== "k"), recursive };
  }

  const windowValue = [...names].find((n) => /window/i.test(n));
  const slides = windowValue !== undefined || /\[\s*\w+\s*-\s*k\s*(?:\+\s*1\s*)?\]/.test(source);
  if (main && slides) {
    const windowSize = names.has("k") ? "k" : undefined;
    const p: Pattern = { kind: "sliding-window", array: main, pointers: ptrs(main, windowSize ? [windowSize] : []), recursive };
    if (windowSize) p.windowSize = windowSize;
    if (windowValue) p.windowValue = windowValue;
    return p;
  }

  const recurrence = /(\w+)\[(\w+)\]\s*=.*\b\1\[\s*\2\s*[-+]\s*\d+\s*\]/.exec(source);
  const table = arrays.find((a) => DP_NAMES.includes(a)) ?? (recurrence && arrays.includes(recurrence[1]!) ? recurrence[1] : undefined);
  if (table) return { kind: "dp", table, pointers: ptrs(table), recursive };

  if (main && PAIRS.some(([a, b]) => mainPtrs.includes(a) && mainPtrs.includes(b))) {
    return { kind: "two-pointers", array: main, pointers: mainPtrs.filter((p) => p !== "k"), recursive };
  }
  if (mapOrSet) return main ? { kind: "hash-map", array: main, pointers: mainPtrs, recursive } : { kind: "hash-map", pointers: [], recursive };
  if (main) return { kind: "array", array: main, pointers: mainPtrs, recursive };
  return { kind: "general", pointers: [], recursive };
}

// ---- Index expressions --------------------------------------------------------

type Tok = { t: "num"; v: number } | { t: "id"; v: string } | { t: "op"; v: string };

function lex(expr: string): Tok[] | null {
  const out: Tok[] = [];
  const re = /\s*(?:(\d+)|([A-Za-z_]\w*)|(\/\/|[-+*%()]))/y;
  let at = 0;
  while (at < expr.length) {
    if (/^\s*$/.test(expr.slice(at))) break;
    re.lastIndex = at;
    const m = re.exec(expr);
    if (!m) return null;
    if (m[1] !== undefined) out.push({ t: "num", v: Number(m[1]) });
    else if (m[2] !== undefined) out.push({ t: "id", v: m[2] });
    else out.push({ t: "op", v: m[3]! });
    at = re.lastIndex;
  }
  return out;
}

/** The value of a simple integer expression (names, + - * // %, parentheses), or null. */
export function evalIndex(expr: string, locals: Record<string, JsonValue>): number | null {
  const lexed = lex(expr);
  if (!lexed || lexed.length === 0) return null;
  const toks: Tok[] = lexed;
  let k = 0;
  const peek = () => toks[k];
  const isOp = (v: string) => peek()?.t === "op" && peek()!.v === v;
  function primary(): number | null {
    const tok = toks[k++];
    if (!tok) return null;
    if (tok.t === "num") return tok.v;
    if (tok.t === "id") {
      if (isOp("(")) return null; // a call such as len(nums)
      const v = locals[tok.v];
      return isInt(v) ? v : null;
    }
    if (tok.v === "(") {
      const v = sum();
      if (!isOp(")")) return null;
      k++;
      return v;
    }
    if (tok.v === "-") {
      const v = primary();
      return v === null ? null : -v;
    }
    return null;
  }
  function product(): number | null {
    let v = primary();
    while (v !== null && (isOp("*") || isOp("//") || isOp("%"))) {
      const op = toks[k++]!.v;
      const r = primary();
      if (r === null || (op !== "*" && r === 0)) return null;
      v = op === "*" ? v * r : op === "//" ? Math.floor(v / r) : ((v % r) + r) % r;
    }
    return v;
  }
  function sum(): number | null {
    let v = product();
    while (v !== null && (isOp("+") || isOp("-"))) {
      const op = toks[k++]!.v;
      const r = product();
      if (r === null) return null;
      v = op === "+" ? v + r : v - r;
    }
    return v;
  }
  const v = sum();
  return v !== null && k === toks.length ? v : null;
}

/** The text inside the brackets that open at `open`, or null if unbalanced. */
function bracketBody(line: string, open: number): string | null {
  let depth = 0;
  for (let k = open; k < line.length; k++) {
    if (line[k] === "[") depth++;
    else if (line[k] === "]" && --depth === 0) return line.slice(open + 1, k);
  }
  return null;
}

/** Cells of each flat list local that `line` indexes or slices, by list name. */
export function accessedCells(line: string, locals: Record<string, JsonValue>): Record<string, number[]> {
  const out: Record<string, Set<number>> = {};
  const code = line.replace(/#.*$/, "");
  for (const m of code.matchAll(/([A-Za-z_]\w*)\s*\[/g)) {
    const list = locals[m[1]!];
    if (!isFlatList(list)) continue;
    const body = bracketBody(code, m.index! + m[0].length - 1);
    if (body === null) continue;
    const n = list.length;
    const norm = (v: number) => (v < 0 ? v + n : v);
    const cells = new Set<number>();
    if (body.includes(":")) {
      const [a = "", b = ""] = body.split(":");
      const lo = a.trim() === "" ? 0 : evalIndex(a, locals);
      const hi = b.trim() === "" ? n : evalIndex(b, locals);
      if (lo === null || hi === null) continue;
      for (let x = Math.max(0, norm(lo)); x < Math.min(n, norm(hi)); x++) cells.add(x);
    } else {
      const v = evalIndex(body, locals);
      if (v === null) continue;
      const x = norm(v);
      if (x >= 0 && x < n) cells.add(x);
    }
    if (cells.size) out[m[1]!] = new Set([...(out[m[1]!] ?? []), ...cells]);
  }
  return Object.fromEntries(Object.entries(out).map(([k, s]) => [k, [...s].sort((a, b) => a - b)]));
}

// ---- Where the step is in the code ----------------------------------------------

export type CodeContext = {
  functionName: string;
  /** The line of `def` (or `class`) for the current frame; null in the main program. */
  defLine: number | null;
  /** Frames below the main program (0 in the main program). */
  depth: number;
  /** How many calls of this same function are active (2+ means recursion). */
  callDepth: number;
  recursive: boolean;
  /** The innermost loop around the next line (or the loop header itself), if any. */
  loopLine: number | null;
  loopKind: "for" | "while" | null;
  /** How many times that loop's header has run in this call so far. */
  loopPass: number;
};

const indentOf = (s: string) => /^[ \t]*/.exec(s)![0].replace(/\t/g, "    ").length;
const LOOP = /^\s*(for|while)\b.*:\s*(#.*)?$/;

export function codeContext(steps: readonly TraceStep[], i: number, source: string): CodeContext {
  const step = steps[i]!;
  const lines = sourceLines(source);
  const fn = step.functionName;
  const stack = Array.isArray(step.stack) ? step.stack : [];
  const callDepth = fn === "<module>" ? 0 : Math.max(1, stack.filter((f) => f.functionName === fn).length);
  let defLine: number | null = null;
  if (fn !== "<module>") {
    const re = new RegExp(`^\\s*(?:async\\s+)?(?:def|class)\\s+${fn.replace(/[^\w]/g, "")}\\b`);
    const k = lines.findIndex((l) => re.test(l));
    if (k >= 0) defLine = k + 1;
  }

  let loopLine: number | null = null;
  const current = lines[step.line - 1] ?? "";
  if (LOOP.test(current)) loopLine = step.line;
  else {
    let limit = indentOf(current);
    const stop = defLine ?? 0;
    for (let n = step.line - 1; n > stop; n--) {
      const text = lines[n - 1] ?? "";
      if (text.trim() === "" || text.trim().startsWith("#")) continue;
      const ind = indentOf(text);
      if (ind >= limit) continue;
      if (LOOP.test(text)) {
        loopLine = n;
        break;
      }
      limit = ind;
      if (/^\s*(def|class)\b/.test(text)) break;
    }
  }
  let loopPass = 0;
  if (loopLine !== null) {
    for (let j = 0; j < i; j++) {
      const s = steps[j]!;
      if (s.frameId === step.frameId && s.line === loopLine && s.event === "line") loopPass++;
    }
  }
  const loopKind = loopLine === null ? null : (LOOP.exec(lines[loopLine - 1] ?? "")![1] as "for" | "while");
  return { functionName: fn, defLine, depth: step.depth ?? 0, callDepth, recursive: callDepth > 1, loopLine, loopKind, loopPass };
}

// ---- Variables, grouped ---------------------------------------------------------

export type VarInfo = {
  name: string;
  value: JsonValue;
  /** New in this frame, or a different value than at the frame's previous step. */
  changed: boolean;
  /** Changed, or used by the line that just ran or the line that runs next. */
  relevant: boolean;
};

export type VariableGroups = {
  parameters: VarInfo[];
  loopCounters: VarInfo[];
  pointers: VarInfo[];
  other: VarInfo[];
};

function loopTargets(source: string): Set<string> {
  const out = new Set<string>();
  for (const m of source.matchAll(/^\s*for\s+(.+?)\s+in\b/gm)) {
    for (const id of m[1]!.matchAll(/[A-Za-z_]\w*/g)) out.add(id[0]);
  }
  return out;
}

export function variableGroups(steps: readonly TraceStep[], i: number, source: string): VariableGroups {
  const step = steps[i]!;
  const prev = previousInFrame(steps, i);
  const lines = sourceLines(source);
  const justRan = prev ? (lines[prev.line - 1] ?? "") : "";
  const next = lines[step.line - 1] ?? "";
  const callStep = steps.find((s, k) => k <= i && s.frameId === step.frameId);
  const params = new Set(callStep && callStep.event === "call" && step.functionName !== "<module>" ? Object.keys(callStep.locals) : []);
  const counters = loopTargets(source);
  const lists = Object.values(step.locals).filter(isFlatList);

  const groups: VariableGroups = { parameters: [], loopCounters: [], pointers: [], other: [] };
  for (const [name, value] of Object.entries(step.locals)) {
    if (isHiddenValue(value)) continue;
    const changed = !prev || !has(prev.locals, name) || !sameValue(prev.locals[name], value);
    const relevant = changed || lineUses(justRan, name) || lineUses(next, name);
    const info: VarInfo = { name, value, changed, relevant };
    if (params.has(name)) groups.parameters.push(info);
    else if (counters.has(name)) groups.loopCounters.push(info);
    else if (POINTERISH.includes(name) && isInt(value) && lists.some((l) => value >= 0 && value < l.length)) groups.pointers.push(info);
    else groups.other.push(info);
  }
  return groups;
}

// ---- What changed ---------------------------------------------------------------

export type StepChange = { shown: string; spoken: string };

const isScalar = (v: JsonValue) => ["primitive", "placeholder"].includes(kindOf(v));

/** What a step changed, one entry each: visible text (with →) and spoken text (without). */
export function stepChanges(step: TraceStep, prev: TraceStep | undefined): StepChange[] {
  const out: StepChange[] = [];
  const heap = step.heap ?? {};
  if (!prev) {
    if (step.functionName !== "<module>") {
      const t = `${step.functionName}() was called`;
      out.push({ shown: t, spoken: t });
    }
    return out;
  }
  const structures = new Map(structuresFor(step.locals, prev.locals).map((s) => [s.name, s]));
  for (const [name, value] of Object.entries(step.locals)) {
    const before = prev.locals[name];
    const s = structures.get(name);
    if (s) {
      if (s.isNew) out.push({ shown: `${name}: new ${s.view === "array" ? "list" : s.view}`, spoken: `${name} was created` });
      else if (s.changes.length) out.push({ shown: `${name}: ${summarizeChanges(s.changes, s.view, heap)}`, spoken: `${name}: ${summarizeChanges(s.changes, s.view, heap, true)}` });
      else if (s.replaced) out.push({ shown: `${name}: new value`, spoken: `${name} got a new value` });
      continue;
    }
    if (!isScalar(value)) continue;
    if (before === undefined) out.push({ shown: `${name} = ${formatValue(value, heap)} (new)`, spoken: `${name} was set to ${formatValue(value, heap)}` });
    else if (formatValue(before, heap) !== formatValue(value, heap))
      out.push({ shown: `${name}: ${formatValue(before, heap)} → ${formatValue(value, heap)}`, spoken: `${name} changed from ${formatValue(before, heap)} to ${formatValue(value, heap)}` });
  }
  if (step.event === "return" && step.returnValue !== undefined && step.functionName !== "<module>") {
    const t = `${step.functionName}() returns ${formatValue(step.returnValue, heap)}`;
    out.push({ shown: t, spoken: t });
  }
  return out;
}

