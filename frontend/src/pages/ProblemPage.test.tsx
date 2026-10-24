// The problem page: write a class Solution, run it on an example, see the
// verdict, step through your run, and (on request) the correct solution next
// to it. The worker is mocked; its answers are realistic shapes.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import axe from "axe-core";
import type { JsonValue, TraceResult } from "../types/trace";
import twoSumRaw from "../../../shared/fixtures/practice/two-sum.json?raw";
import { problemBySlug } from "../problems";

const fixture = JSON.parse(twoSumRaw) as { program: string; trace: TraceResult };

const tracePractice = vi.fn<(slug: string, source: string | null, args: JsonValue[]) => Promise<{ program: string; trace: TraceResult }>>();
type Search = { found: boolean; tried: number; complete?: boolean; timedOut?: boolean; args?: JsonValue[]; got?: JsonValue; expected?: JsonValue; error?: { type: string; message: string } | null };
const findCounterexample = vi.fn<(slug: string, source: string) => Promise<Search>>();
const checkPractice = vi.fn<(slug: string, source: string, args: JsonValue[]) => Promise<{ correct: boolean; got: JsonValue; expected: JsonValue; error: { type: string; message: string } | null }>>();
vi.mock("../worker/traceClient", () => ({
  TRACE_TIMEOUT_MS: 3000,
  preloadTracer: () => Promise.resolve(),
  onTracerStatus: (listener: (s: "loading" | "ready" | "error") => void) => {
    listener("ready");
    return () => {};
  },
  runTrace: () => Promise.reject(new Error("not used")),
  tracePractice: (slug: string, source: string | null, args: JsonValue[]) => tracePractice(slug, source, args),
  checkPractice: (slug: string, source: string, args: JsonValue[]) => checkPractice(slug, source, args),
  findCounterexample: (slug: string, source: string) => findCounterexample(slug, source),
}));

const fetchHelp = vi.fn<(r: Record<string, unknown>) => Promise<{ text: string; source: "llm" | "template"; level: number }>>();
vi.mock("../explain/help", () => ({
  fetchHelp: (r: Record<string, unknown>) => fetchHelp(r),
}));

import ProblemPage from "./ProblemPage";

const twoSum = problemBySlug("two-sum")!;

beforeEach(() => {
  tracePractice.mockReset();
  checkPractice.mockReset();
  findCounterexample.mockReset();
  fetchHelp.mockReset();
  fetchHelp.mockImplementation(async (r) => ({
    text: r.level === 3 ? "Start j after i:\n```python\nfor j in range(i + 1, len(nums)):\n```" : `Help at level ${String(r.level)}.`,
    source: "llm",
    level: r.level as number,
  }));
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
  // The student's run reuses the reference fixture's trace shape.
  tracePractice.mockImplementation(async () => fixture);
  checkPractice.mockResolvedValue({ correct: true, got: [2, 3], expected: [2, 3], error: null });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const editor = () => screen.getByRole("textbox", { name: /your solution/i }) as HTMLTextAreaElement;
async function run() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /^run$/i }));
  });
  await screen.findByRole("region", { name: "Your solution's run" });
}

describe("problem page", () => {
  it("starts the editor with the class Solution stub", () => {
    render(<ProblemPage problem={twoSum} />);
    expect(editor().value).toMatch(/^class Solution:\n {4}def twoSum\(self, nums: List\[int\], target: int\) -> List\[int\]:\n/);
  });

  it("offers our own examples, shown the way Python writes them", () => {
    render(<ProblemPage problem={twoSum} />);
    const group = screen.getByRole("group", { name: "Examples" });
    const buttons = within(group).getAllByRole("button");
    expect(buttons.map((b) => b.textContent)).toEqual([
      "nums = [3, 8, 5, 1], target = 6",
      "nums = [4, 4], target = 8",
      "nums = [-2, 7, 11, 5], target = 9",
    ]);
    expect(buttons[0]!.getAttribute("aria-pressed")).toBe("true");
  });

  it("runs the student's code on the chosen example, checks it, and shows its steps", async () => {
    render(<ProblemPage problem={twoSum} />);
    fireEvent.click(screen.getByRole("button", { name: "nums = [4, 4], target = 8" }));
    fireEvent.change(editor(), { target: { value: "class Solution:\n    def twoSum(self, nums, target):\n        return [0, 1]\n" } });
    await run();
    expect(checkPractice).toHaveBeenCalledWith("two-sum", editor().value, [[4, 4], 8]);
    expect(tracePractice).toHaveBeenCalledWith("two-sum", editor().value, [[4, 4], 8]);
    expect(screen.getByRole("status", { name: "Result" }).textContent).toBe("Correct: your solution returned [2, 3] for this input.");
    const mine = screen.getByRole("region", { name: "Your solution's run" });
    expect(within(mine).getByRole("slider").getAttribute("aria-valuetext")).toMatch(/^Step 1 of \d+/);
  });

  it("says what was returned and what was expected when the answer is wrong", async () => {
    checkPractice.mockResolvedValue({ correct: false, got: [0, 0], expected: [2, 3], error: null });
    render(<ProblemPage problem={twoSum} />);
    await run();
    expect(screen.getByRole("status", { name: "Result" }).textContent).toBe(
      "Not yet: your solution returned [0, 0], but the correct answer is [2, 3].",
    );
  });

  it("keeps the correct solution hidden until the student asks for it", async () => {
    render(<ProblemPage problem={twoSum} />);
    expect(screen.queryByRole("button", { name: /show the correct solution/i })).toBeNull(); // not before a run
    await run();
    expect(screen.queryByRole("region", { name: "Correct solution's run" })).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /show the correct solution/i }));
    });
    const ref = await screen.findByRole("region", { name: "Correct solution's run" });
    // Example 1's reference run comes from the bundled fixture, not the worker.
    expect(tracePractice).not.toHaveBeenCalledWith("two-sum", null, expect.anything());
    expect(within(ref).getByRole("slider").getAttribute("aria-valuetext")).toBe(
      `Step 1 of ${fixture.trace.steps.length}, line ${fixture.trace.steps[0]!.line}`,
    );
  });

  it("traces the reference in Python for the other examples", async () => {
    render(<ProblemPage problem={twoSum} />);
    fireEvent.click(screen.getByRole("button", { name: "nums = [4, 4], target = 8" }));
    await run();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /show the correct solution/i }));
    });
    await waitFor(() => expect(tracePractice).toHaveBeenCalledWith("two-sum", null, [[4, 4], 8]));
  });

  it("arrow keys step only the viewer that has focus", async () => {
    render(<ProblemPage problem={twoSum} />);
    await run();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /show the correct solution/i }));
    });
    const mine = screen.getByRole("region", { name: "Your solution's run" });
    const ref = await screen.findByRole("region", { name: "Correct solution's run" });
    const stepOf = (r: HTMLElement) => within(r).getByRole("slider").getAttribute("aria-valuetext")!.split(",")[0];
    fireEvent.keyDown(within(mine).getByRole("button", { name: "Next" }), { key: "ArrowRight" });
    expect(stepOf(mine)).toBe("Step 2 of " + fixture.trace.steps.length);
    expect(stepOf(ref)).toBe("Step 1 of " + fixture.trace.steps.length);
  });

  it("hides the Solution object's `self` from the variables", async () => {
    render(<ProblemPage problem={twoSum} />);
    await run();
    const mine = screen.getByRole("region", { name: "Your solution's run" });
    const slider = within(mine).getByRole("slider");
    const inMethod = fixture.trace.steps.findIndex((s) => s.functionName === "twoSum" && "self" in s.locals);
    fireEvent.change(slider, { target: { value: String(inMethod) } });
    const names = [...mine.querySelectorAll("table.vars tbody tr")].map((r) => r.querySelector("th, td")?.textContent?.trim());
    expect(names).toContain("nums");
    expect(names).not.toContain("self");
  });

  it("clears the result when the code changes", async () => {
    render(<ProblemPage problem={twoSum} />);
    await run();
    fireEvent.change(editor(), { target: { value: editor().value + "\n# edited\n" } });
    expect(screen.queryByRole("status", { name: "Result" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Your solution's run" })).toBeNull();
  });

  it("has no accessibility violations with both runs showing", async () => {
    // Wrapped in <main> as the app shell does, so page content sits in a landmark.
    render(
      <main>
        <ProblemPage problem={twoSum} />
      </main>,
    );
    await run();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /show the correct solution/i }));
    });
    await screen.findByRole("region", { name: "Correct solution's run" });
    const result = await axe.run(document.body, { rules: { "color-contrast": { enabled: false } } });
    expect(result.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });

  describe("Submit: search for a small input that proves the solution wrong", () => {
    async function submit() {
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /^submit$/i }));
      });
      await screen.findByRole("status", { name: "Result" });
    }

    it("shows the smallest failing input and steps through the student's run on it", async () => {
      findCounterexample.mockResolvedValue({ found: true, args: [[-2, -2], -4], got: [0, 0], expected: [0, 1], error: null, tried: 7 });
      render(<ProblemPage problem={twoSum} />);
      await submit();
      expect(findCounterexample).toHaveBeenCalledWith("two-sum", editor().value);
      expect(screen.getByRole("status", { name: "Result" }).textContent).toBe(
        "CodeLens found a small input where your solution goes wrong: nums = [-2, -2], target = -4. " +
          "Your solution returned [0, 0], but the correct answer is [0, 1].",
      );
      await screen.findByRole("region", { name: "Your solution's run" });
      expect(tracePractice).toHaveBeenCalledWith("two-sum", editor().value, [[-2, -2], -4]);
      // The failing input is shown as the current input.
      expect(screen.getByRole("button", { name: "Failing input: nums = [-2, -2], target = -4" }).getAttribute("aria-pressed")).toBe("true");
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /show the correct solution/i }));
      });
      await waitFor(() => expect(tracePractice).toHaveBeenCalledWith("two-sum", null, [[-2, -2], -4]));
    });

    it("reports a crash on the smallest input", async () => {
      findCounterexample.mockResolvedValue({ found: true, args: [[0, 1], 1], got: null, expected: [0, 1], error: { type: "IndexError", message: "list index out of range" }, tried: 1 });
      render(<ProblemPage problem={twoSum} />);
      await submit();
      expect(screen.getByRole("status", { name: "Result" }).textContent).toBe(
        "CodeLens found a small input where your solution goes wrong: nums = [0, 1], target = 1. " +
          "Your solution stopped with IndexError: list index out of range.",
      );
    });

    it("accepts a solution when the search finds nothing and every example passes", async () => {
      findCounterexample.mockResolvedValue({ found: false, tried: 423, complete: true });
      checkPractice.mockResolvedValue({ correct: true, got: [0, 1], expected: [0, 1], error: null });
      render(<ProblemPage problem={twoSum} />);
      await submit();
      expect(checkPractice).toHaveBeenCalledTimes(3);
      expect(screen.getByRole("status", { name: "Result" }).textContent).toBe(
        "Accepted: CodeLens checked 423 small inputs and all 3 examples, and your solution was right every time.",
      );
    });

    it("is honest when the search ran out of time", async () => {
      findCounterexample.mockResolvedValue({ found: false, tried: 120, complete: false });
      checkPractice.mockResolvedValue({ correct: true, got: [0, 1], expected: [0, 1], error: null });
      render(<ProblemPage problem={twoSum} />);
      await submit();
      expect(screen.getByRole("status", { name: "Result" }).textContent).toBe(
        "No mistake found: your solution was right on the 120 small inputs CodeLens had time to check and on all 3 examples.",
      );
    });

    it("falls back to an example that fails when the search found nothing", async () => {
      findCounterexample.mockResolvedValue({ found: false, tried: 50, complete: true });
      checkPractice
        .mockResolvedValueOnce({ correct: true, got: [2, 3], expected: [2, 3], error: null })
        .mockResolvedValueOnce({ correct: false, got: [1, 0], expected: [0, 1], error: null });
      render(<ProblemPage problem={twoSum} />);
      await submit();
      expect(screen.getByRole("status", { name: "Result" }).textContent).toBe(
        "Not yet: your solution returned [1, 0], but the correct answer is [0, 1].",
      );
      expect(screen.getByRole("button", { name: "nums = [4, 4], target = 8" }).getAttribute("aria-pressed")).toBe("true");
    });

    it("explains a search that timed out", async () => {
      findCounterexample.mockResolvedValue({ found: false, tried: 0, complete: false, timedOut: true });
      checkPractice.mockResolvedValue({ correct: true, got: [0, 1], expected: [0, 1], error: null });
      render(<ProblemPage problem={twoSum} />);
      await submit();
      expect(screen.getByRole("status", { name: "Result" }).textContent).toMatch(/took too long/i);
    });
  });

  describe("three levels of help after a wrong answer", () => {
    async function runWrong() {
      checkPractice.mockResolvedValue({ correct: false, got: [0, 0], expected: [2, 3], error: null });
      render(<ProblemPage problem={twoSum} />);
      await run();
    }
    const help = () => screen.getByRole("region", { name: "Stuck? Get help" });

    it("offers a gentle hint first and asks the tutor with the failing input and both answers", async () => {
      await runWrong();
      expect(within(help()).queryByRole("button", { name: /explain what went wrong/i })).toBeNull();
      await act(async () => {
        fireEvent.click(within(help()).getByRole("button", { name: "Show a gentle hint" }));
      });
      expect(fetchHelp).toHaveBeenCalledWith({
        level: 1,
        lang: "en",
        problem: { title: "Two Sum", statement: twoSum.statement.en, signature: twoSum.signature },
        code: editor().value,
        input: "nums = [3, 8, 5, 1], target = 6",
        got: "[0, 0]",
        expected: "[2, 3]",
        error: null,
      });
      expect(within(help()).getByText("Help at level 1.")).toBeTruthy();
    });

    it("unlocks the explanation, then the possible fix, one level at a time", async () => {
      await runWrong();
      await act(async () => {
        fireEvent.click(within(help()).getByRole("button", { name: "Show a gentle hint" }));
      });
      expect(within(help()).queryByRole("button", { name: "Show a possible fix" })).toBeNull();
      await act(async () => {
        fireEvent.click(within(help()).getByRole("button", { name: "Explain what went wrong" }));
      });
      expect(within(help()).getByText("Help at level 2.")).toBeTruthy();
      await act(async () => {
        fireEvent.click(within(help()).getByRole("button", { name: "Show a possible fix" }));
      });
      const code = help().querySelector("pre code");
      expect(code?.textContent).toBe("for j in range(i + 1, len(nums)):");
      expect(fetchHelp.mock.calls.map((c) => c[0].level)).toEqual([1, 2, 3]);
    });

    it("says where the help came from", async () => {
      await runWrong();
      await act(async () => {
        fireEvent.click(within(help()).getByRole("button", { name: "Show a gentle hint" }));
      });
      expect(help().textContent).toMatch(/AI tutor/);
    });

    it("asks in Spanish with the Spanish statement when the page is in Spanish", async () => {
      await runWrong();
      fireEvent.click(screen.getByRole("button", { name: "Español" }));
      await act(async () => {
        fireEvent.click(within(help()).getByRole("button", { name: "Show a gentle hint" }));
      });
      const req = fetchHelp.mock.calls[0]![0];
      expect(req.lang).toBe("es");
      expect((req.problem as { statement: string }).statement).toBe(twoSum.statement.es);
    });

    it("is not offered when the answer is correct, and resets when the code changes", async () => {
      render(<ProblemPage problem={twoSum} />);
      await run();
      expect(screen.queryByRole("region", { name: "Stuck? Get help" })).toBeNull();
      cleanup();
      await runWrong();
      await act(async () => {
        fireEvent.click(within(help()).getByRole("button", { name: "Show a gentle hint" }));
      });
      fireEvent.change(editor(), { target: { value: editor().value + "\n# try again\n" } });
      expect(screen.queryByRole("region", { name: "Stuck? Get help" })).toBeNull();
    });

    it("uses the failing input Submit found, including crashes", async () => {
      findCounterexample.mockResolvedValue({ found: true, args: [[0, 1], 1], got: null, expected: [0, 1], error: { type: "IndexError", message: "list index out of range" }, tried: 1 });
      render(<ProblemPage problem={twoSum} />);
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /^submit$/i }));
      });
      await screen.findByRole("status", { name: "Result" });
      await act(async () => {
        fireEvent.click(within(help()).getByRole("button", { name: "Show a gentle hint" }));
      });
      expect(fetchHelp.mock.calls[0]![0]).toMatchObject({
        input: "nums = [0, 1], target = 1",
        got: null,
        expected: "[0, 1]",
        error: { type: "IndexError", message: "list index out of range" },
      });
    });
  });

  describe("mistake categories and saved sessions", () => {
    beforeEach(() => window.localStorage.clear());
    const saved = () => JSON.parse(window.localStorage.getItem("codelens.sessions.v1") ?? "[]") as Record<string, unknown>[];

    it("names the likely kind of mistake next to a wrong answer", async () => {
      checkPractice.mockResolvedValue({ correct: false, got: [0, 0], expected: [2, 3], error: null });
      render(<ProblemPage problem={twoSum} />);
      await run();
      const note = screen.getByRole("note", { name: "Likely mistake" });
      expect(note.textContent).toMatch(/^Likely mistake: Incorrect pointer variables\./);
      expect(note.textContent).toMatch(/pointer or index starts/);
    });

    it("saves each Submit in this browser, with the failing input and the category", async () => {
      findCounterexample.mockResolvedValue({ found: true, args: [[0, 0], 0], got: [0, 0], expected: [0, 1], error: null, tried: 3 });
      render(<ProblemPage problem={twoSum} />);
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /^submit$/i }));
      });
      await screen.findByRole("status", { name: "Result" });
      expect(saved()).toHaveLength(1);
      expect(saved()[0]).toMatchObject({
        slug: "two-sum",
        title: "Two Sum",
        outcome: "wrong",
        input: "nums = [0, 0], target = 0",
        got: "[0, 0]",
        expected: "[0, 1]",
        category: "pointer",
        code: editor().value,
      });
    });

    it("saves an accepted Submit too, but not a plain Run", async () => {
      findCounterexample.mockResolvedValue({ found: false, tried: 423, complete: true });
      checkPractice.mockResolvedValue({ correct: true, got: [0, 1], expected: [0, 1], error: null });
      render(<ProblemPage problem={twoSum} />);
      await run();
      expect(saved()).toHaveLength(0);
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /^submit$/i }));
      });
      await screen.findByText(/^Accepted/);
      expect(saved()).toHaveLength(1);
      expect(saved()[0]).toMatchObject({ outcome: "accepted", category: null });
    });
  });
});
