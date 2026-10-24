import { describe, expect, it } from "vitest";
import type { TraceResult } from "../types/trace";
import twoSumRaw from "../../../shared/fixtures/practice/two-sum.json?raw";
import { formatInput, hideSolutionSelf, resultMessage } from "./practiceView";

const fixture = JSON.parse(twoSumRaw) as { program: string; trace: TraceResult };

describe("hideSolutionSelf", () => {
  const inMethod = fixture.trace.steps.find((s) => s.functionName === "twoSum" && "self" in s.locals)!;

  it("drops a field-less Solution `self` from the locals and every stack frame", () => {
    expect(inMethod).toBeTruthy();
    const step = hideSolutionSelf(inMethod);
    expect("self" in step.locals).toBe(false);
    for (const f of step.stack) expect("self" in f.locals).toBe(false);
    expect(step.locals.nums).toEqual(inMethod.locals.nums); // everything else stays
  });

  it("keeps `self` when it is any other object, or a Solution with fields", () => {
    const withFields = {
      ...inMethod,
      heap: { ...inMethod.heap, o1: { id: "o1", type: "Solution", fields: { memo: { __dict: [] } } } },
      locals: { ...inMethod.locals, self: { __ref: "o1" } },
    };
    expect("self" in hideSolutionSelf(withFields).locals).toBe(true);
    const other = {
      ...inMethod,
      heap: { ...inMethod.heap, o9: { id: "o9", type: "Node", fields: {} } },
      locals: { ...inMethod.locals, self: { __ref: "o9" } },
    };
    expect("self" in hideSolutionSelf(other).locals).toBe(true);
  });
});

describe("formatInput", () => {
  it("shows an example's arguments the way Python would", () => {
    expect(formatInput(["nums", "target"], [[3, 8, 5, 1], 6])).toBe("nums = [3, 8, 5, 1], target = 6");
    expect(formatInput(["root"], [[1, null, 2]])).toBe("root = [1, None, 2]");
    expect(formatInput(["n", "edges", "source", "destination"], [1, [], 0, 0])).toBe("n = 1, edges = [], source = 0, destination = 0");
  });
});

describe("resultMessage", () => {
  it("says correct, wrong (with both answers) or which error happened", () => {
    expect(resultMessage({ correct: true, got: [2, 3], expected: [2, 3], error: null })).toEqual({
      tone: "ok",
      text: "Correct: your solution returned [2, 3] for this input.",
    });
    expect(resultMessage({ correct: false, got: 4, expected: 5, error: null })).toEqual({
      tone: "error",
      text: "Not yet: your solution returned 4, but the correct answer is 5.",
    });
    expect(resultMessage({ correct: false, got: null, expected: true, error: { type: "IndexError", message: "list index out of range" } })).toEqual({
      tone: "error",
      text: "Your solution stopped with IndexError: list index out of range.",
    });
    expect(resultMessage({ correct: false, got: null, expected: 5, error: { type: "StepLimit", message: "Stopped after 20000 lines." } }).text).toMatch(
      /never ends|too long/i,
    );
  });
});
