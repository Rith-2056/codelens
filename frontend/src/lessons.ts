import type { TraceResult } from "./types/trace";
// `?raw` gives the file's text as a string (typed by vite/client), so this
// works without `resolveJsonModule`.
import loopFixtureText from "../../shared/fixtures/loop.json?raw";
import branchFixtureText from "../../shared/fixtures/branch.json?raw";
import functionFixtureText from "../../shared/fixtures/function.json?raw";

export type LessonId = "loop" | "branch" | "function";

export type Lesson = {
  id: LessonId;
  title: string; // shown as the code panel heading
  short: string; // shown on the lesson picker button
  // Must match the source the fixture was traced from byte for byte
  // (trailing newline included), so the codeHash matches.
  source: string;
  fixture: TraceResult; // precomputed trace, shown before Python has loaded
  level: 1 | 2; // the picker groups lessons by level
  pattern?: string; // optional: the technique the example teaches
  statement?: { en: string; es: string }; // optional: a problem statement
};

function parseFixture(name: string, text: string): TraceResult {
  const data: unknown = JSON.parse(text);
  if (
    typeof data !== "object" ||
    data === null ||
    !Array.isArray((data as { steps?: unknown }).steps)
  ) {
    throw new Error(`Fixture ${name} is not a TraceResult`);
  }
  return data as TraceResult;
}

export const loopLesson: Lesson = {
  id: "loop",
  title: "Loop: adding up a list",
  short: "Loop",
  source: "numbers = [3, 1, 2]\ntotal = 0\nfor n in numbers:\n    total += n\n",
  level: 1,
  fixture: parseFixture("loop.json", loopFixtureText),
};

export const branchLesson: Lesson = {
  id: "branch",
  title: "Branch: choosing with if / else",
  short: "Branch",
  source:
    'temperature = 30\nif temperature > 25:\n    advice = "Wear a T-shirt"\nelse:\n    advice = "Bring a jacket"\nprint(advice)\n',
  level: 1,
  fixture: parseFixture("branch.json", branchFixtureText),
};

export const functionLesson: Lesson = {
  id: "function",
  title: "Function: calling add(a, b)",
  short: "Function",
  source:
    "def add(a, b):\n    result = a + b\n    return result\n\ntotal = add(2, 3)\nprint(total)\n",
  level: 1,
  fixture: parseFixture("function.json", functionFixtureText),
};

// The playground's examples, in teaching order. The interview problems
// (Level 2) live on their own pages, under their LeetCode names: see
// problems.ts.
export const lessons: readonly Lesson[] = [loopLesson, branchLesson, functionLesson];

export function lessonById(id: LessonId): Lesson {
  return lessons.find((l) => l.id === id) ?? loopLesson;
}
