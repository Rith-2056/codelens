import type { TraceResult } from "./types/trace";
// `?raw` gives the file's text as a string (typed by vite/client), so this
// works without `resolveJsonModule`.
import loopFixtureText from "../../shared/fixtures/loop.json?raw";

export type Lesson = {
  id: string;
  title: string;
  source: string;
  fixture: TraceResult; // precomputed trace, shown before Python has loaded
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
  source: "numbers = [3, 1, 2]\ntotal = 0\nfor n in numbers:\n    total += n\n",
  fixture: parseFixture("loop.json", loopFixtureText),
};

export const lessons: Lesson[] = [loopLesson];
