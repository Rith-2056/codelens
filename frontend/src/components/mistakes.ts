// Classify a wrong practice solution into a kind of mistake, so students learn
// to recognise their own patterns. Deterministic rules, checked in order:
//   1. runaway   the run never finished (StepLimit or Timeout)
//   2. pointer   an index answer that uses the same position twice
//   3. off-by-one the answer is off by exactly 1 (or every index is)
//   4. edge-case the failing input is the smallest kind (empty, one item, n = 1)
//   5. off-by-one an IndexError, or loop bounds that differ from the reference by
//                one (range(2, n) vs range(2, n + 1), < vs <=)
//   6. logic     anything else
// It is a best guess, so the UI says "Likely mistake".

import type { JsonValue } from "../types/trace";

export type Mistake = "off-by-one" | "edge-case" | "pointer" | "runaway" | "logic";

export const MISTAKES: Record<Mistake, { label: string; tip: string }> = {
  "off-by-one": {
    label: "Off-by-one error",
    tip: "Check loop bounds and indexes: range(a, n) stops before n, and positions start at 0.",
  },
  "edge-case": {
    label: "Missed edge case",
    tip: "Check the smallest inputs first: an empty list, one item, n = 1, or an empty tree.",
  },
  pointer: {
    label: "Incorrect pointer variables",
    tip: "Check where each pointer or index starts and how it moves, so two of them never land on the same item by mistake.",
  },
  runaway: {
    label: "Loop never ends (or too slow)",
    tip: "Make sure every loop moves toward its end, and avoid doing the same work over and over.",
  },
  logic: {
    label: "Logic mistake",
    tip: "Step through your run next to the correct one and find the first step where they differ.",
  },
};

const references = import.meta.glob("../../../shared/practice/*.py", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

/** The reference solution's source, used to compare loop bounds. */
export function referenceSource(slug: string): string {
  return references[`../../../shared/practice/${slug}.py`] ?? "";
}

export type MistakeInput = {
  slug: string;
  args: JsonValue[];
  got: JsonValue;
  expected: JsonValue;
  error: { type: string; message: string } | null;
  code: string;
};

/** Problems whose answer is a pair of positions. */
const INDEX_ANSWERS = new Set(["two-sum", "two-sum-ii-input-array-is-sorted"]);

function isMinimalInput(slug: string, args: JsonValue[]): boolean {
  const list = (v: JsonValue | undefined) => (Array.isArray(v) ? v : []);
  switch (slug) {
    case "contains-duplicate":
      return list(args[0]).length <= 1;
    case "find-if-path-exists-in-graph":
      return args[0] === 1 || list(args[1]).length === 0 || args[2] === args[3];
    case "maximum-depth-of-binary-tree":
      return list(args[0]).filter((v) => v !== null).length <= 1;
    case "climbing-stairs":
      return args[0] === 1;
    default:
      return false; // Two Sum inputs always have at least two numbers
  }
}

function offByOneAnswer(got: JsonValue, expected: JsonValue): boolean {
  if (typeof got === "number" && typeof expected === "number") return Math.abs(got - expected) === 1;
  if (!Array.isArray(got) || !Array.isArray(expected) || got.length === 0 || got.length !== expected.length) return false;
  const deltas = got.map((g, i) => (typeof g === "number" && typeof expected[i] === "number" ? g - (expected[i] as number) : NaN));
  return Math.abs(deltas[0]!) === 1 && deltas.every((d) => d === deltas[0]);
}

const squash = (code: string) => code.replace(/\s+/g, "");

function ranges(code: string): string[] {
  return [...squash(code).matchAll(/range\(((?:[^()]|\([^()]*\))*)\)/g)].map((m) => m[1]!);
}

function comparisons(code: string): [string, string, string][] {
  return [...squash(code).matchAll(/(\w+)(<=|>=|<|>)(\w+)/g)].map((m) => [m[1]!, m[2]!, m[3]!]);
}

/** Loop bounds that differ from the reference's by exactly one. */
function boundsDifferByOne(code: string, reference: string): boolean {
  if (!code || !reference) return false;
  const refRanges = new Set(ranges(reference));
  for (const r of ranges(code)) {
    if (refRanges.has(r)) continue;
    const variants = [`${r}+1`, `${r}-1`, r.replace(/[+-]1$/, "")];
    if (variants.some((v) => refRanges.has(v))) return true;
  }
  const refCmp = comparisons(reference);
  for (const [a, op, b] of comparisons(code)) {
    const flipped = op.endsWith("=") ? op[0] : `${op}=`;
    if (refCmp.some(([ra, rop, rb]) => ra === a && rb === b && rop === flipped)) return true;
  }
  return false;
}

/** The likely kind of mistake behind a wrong answer. */
export function classifyMistake(m: MistakeInput): Mistake {
  const type = m.error?.type;
  if (type === "StepLimit" || type === "Timeout") return "runaway";
  if (!m.error && INDEX_ANSWERS.has(m.slug) && Array.isArray(m.got) && m.got.length === 2 && m.got[0] === m.got[1]) {
    return "pointer";
  }
  if (!m.error && offByOneAnswer(m.got, m.expected)) return "off-by-one";
  if (isMinimalInput(m.slug, m.args)) return "edge-case";
  if (type === "IndexError" || boundsDifferByOne(m.code, referenceSource(m.slug))) return "off-by-one";
  return "logic";
}
