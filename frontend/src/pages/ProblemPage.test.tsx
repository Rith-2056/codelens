// The problem page: write a class Solution, run it on an example, see the
// verdict, step through your run with the code beside it, and (on request)
// the correct solution's run. The worker is mocked; its answers are realistic shapes.
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
  window.localStorage.clear(); // drafts and sessions start empty in every test
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

/** The editor. After a run the code panel shows the run's code, so open the editor first. */
function editor() {
  const edit = screen.queryByRole("button", { name: "Edit code" });
  if (edit) fireEvent.click(edit);
  return screen.getByRole("textbox", { name: /your solution/i }) as HTMLTextAreaElement;
}
const currentLine = (panel: HTMLElement) =>
  within(panel)
    .getAllByRole("listitem")
    .find((li) => li.getAttribute("aria-current") === "step")!;
const stepOf = (r: HTMLElement) => within(r).getByRole("slider").getAttribute("aria-valuetext")!.split(",")[0];
async function run() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /^run$/i }));
  });
  await screen.findByRole("region", { name: "Your solution's run" });
}

describe("problem page layout", () => {
  const panelNames = () =>
    [...document.querySelectorAll(".workspace > section")].map((s) => document.getElementById(s.getAttribute("aria-labelledby")!)?.textContent);

  it("has four panels in reading order: problem, code, tests, step-through", () => {
    render(<ProblemPage problem={twoSum} />);
    expect(panelNames()).toEqual(["1. Two Sum", "Your solution", "Test your solution", "Step through"]);
    const steps = screen.getByRole("region", { name: "Step through" });
    expect(steps.textContent).toMatch(/Run or Submit your solution to step through it here\./);
  });

  it("after a run, the code panel shows the run's code and follows the steps", async () => {
    render(<ProblemPage problem={twoSum} />);
    const typed = editor().value;
    await run();
    const code = screen.getByRole("region", { name: "Your solution" });
    expect(within(code).queryByRole("textbox")).toBeNull();
    expect(currentLine(code).textContent).toContain(`${fixture.trace.steps[0]!.line}`);
    const mine = screen.getByRole("region", { name: "Your solution's run" });
    const next = fixture.trace.steps.findIndex((s) => s.line !== fixture.trace.steps[0]!.line);
    fireEvent.change(within(mine).getByRole("slider"), { target: { value: String(next) } });
    expect(currentLine(code).textContent).toMatch(new RegExp(`^\\D*${fixture.trace.steps[next]!.line}\\D`));

    // Edit code brings the editor back with the same code; the run stays until the code changes.
    fireEvent.click(within(code).getByRole("button", { name: "Edit code" }));
    expect((within(code).getByRole("textbox") as HTMLTextAreaElement).value).toBe(typed);
    expect(screen.getByRole("region", { name: "Your solution's run" })).toBeTruthy();
    fireEvent.click(within(code).getByRole("button", { name: "Show steps" }));
    expect(within(code).queryByRole("textbox")).toBeNull();
  });
});

describe("Code Visualizer from the problem page", () => {
  const openButton = () => screen.getByRole("button", { name: "Open Code Visualizer" });
  const dialog = () => screen.queryByRole("dialog", { name: /Code Visualizer/ });

  it("is offered before any run: it runs the chosen example first, then opens", async () => {
    render(<ProblemPage problem={twoSum} />);
    await act(async () => {
      fireEvent.click(openButton());
    });
    expect(checkPractice).toHaveBeenCalledWith("two-sum", expect.any(String), [[3, 8, 5, 1], 6]);
    expect(await screen.findByRole("dialog", { name: /Code Visualizer/ })).toBeTruthy();
    expect(dialog()!.textContent).toMatch(/Two Sum · Your solution/);
  });

  it("Exit returns to the workspace at the same step, with focus back on the button", async () => {
    render(<ProblemPage problem={twoSum} />);
    await run();
    fireEvent.click(openButton());
    fireEvent.click(within(dialog()!).getByRole("button", { name: "Next step" }));
    fireEvent.click(within(dialog()!).getByRole("button", { name: "Next step" }));
    fireEvent.click(within(dialog()!).getByRole("button", { name: "Exit visualizer" }));
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(openButton());
    expect(stepOf(screen.getByRole("region", { name: "Your solution's run" }))).toBe(`Step 3 of ${fixture.trace.steps.length}`);
  });

  it("while it is open, the arrow keys step only once per press", async () => {
    render(<ProblemPage problem={twoSum} />);
    await run();
    fireEvent.click(openButton());
    fireEvent.keyDown(document.body, { key: "ArrowRight" });
    expect(within(dialog()!).getByRole("slider", { name: "Step" }).getAttribute("aria-valuetext")).toMatch(/^Step 2 of/);
  });

  it("shows the correct solution's run when that one is selected, with the switch inside", async () => {
    render(<ProblemPage problem={twoSum} />);
    await run();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /show the correct solution/i }));
    });
    await screen.findByRole("region", { name: "Correct solution's run" });
    fireEvent.click(openButton());
    expect(dialog()!.textContent).toMatch(/Two Sum · Correct solution/);
    fireEvent.click(within(dialog()!).getByRole("button", { name: "Your solution" }));
    expect(dialog()!.textContent).toMatch(/Two Sum · Your solution/);
  });

  it("the workspace's Step through panel stays compact: controls, the step's sentence and what changed", async () => {
    render(<ProblemPage problem={twoSum} />);
    await run();
    const panel = screen.getByRole("region", { name: "Step through" });
    expect(within(panel).getByRole("group", { name: "Execution controls" })).toBeTruthy();
    expect(within(panel).getByText("Nothing changed on this step.")).toBeTruthy(); // step 1: about to start
    const seenAdded = fixture.trace.steps.findIndex((s, k) => k > 0 && "seen" in s.locals && !("seen" in fixture.trace.steps[k - 1]!.locals));
    fireEvent.change(within(panel).getByRole("slider", { name: "Step" }), { target: { value: String(seenAdded) } });
    expect(within(panel).getByRole("list", { name: "What changed" }).textContent).toMatch(/seen: new dict/);
    expect(panel.querySelector("table.vars")).toBeNull(); // the details live in the visualizer
  });
});

describe("your code is kept", () => {
  beforeEach(() => window.localStorage.clear());

  it("leaving the page and coming back (or reloading) keeps what you typed", () => {
    const first = render(<ProblemPage problem={twoSum} />);
    fireEvent.change(editor(), { target: { value: "class Solution:\n    def twoSum(self, nums, target):\n        seen = {}\n" } });
    first.unmount();
    render(<ProblemPage problem={twoSum} />);
    expect(editor().value).toBe("class Solution:\n    def twoSum(self, nums, target):\n        seen = {}\n");
  });

  it("each problem keeps its own code, and a new problem starts from the stub", () => {
    const first = render(<ProblemPage problem={twoSum} />);
    fireEvent.change(editor(), { target: { value: "# two sum draft\n" } });
    first.unmount();
    render(<ProblemPage problem={problemBySlug("binary-search")!} />);
    expect(editor().value).toMatch(/^class Solution:\n {4}def search\(/);
  });

  it("the code survives Run, the visualizer and Edit code", async () => {
    render(<ProblemPage problem={twoSum} />);
    fireEvent.change(editor(), { target: { value: "class Solution:\n    def twoSum(self, nums, target):\n        return [0, 1]\n" } });
    await run();
    fireEvent.click(screen.getByRole("button", { name: "Open Code Visualizer" }));
    fireEvent.click(screen.getByRole("button", { name: "Exit visualizer" }));
    expect(editor().value).toBe("class Solution:\n    def twoSum(self, nums, target):\n        return [0, 1]\n");
  });
});

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
    // One run is on screen at a time, with its code in the code panel.
    expect(screen.queryByRole("region", { name: "Your solution's run" })).toBeNull();
    const which = screen.getByRole("group", { name: "Which run to show" });
    expect(within(which).getByRole("button", { name: "Correct solution" }).getAttribute("aria-pressed")).toBe("true");
    expect(within(which).getByRole("button", { name: "Your solution" }).getAttribute("aria-pressed")).toBe("false");
    // The button that was clicked is gone, so focus moves to the switch.
    expect(document.activeElement).toBe(within(which).getByRole("button", { name: "Correct solution" }));
    const code = screen.getByRole("region", { name: "Correct solution" });
    expect(code.textContent).toContain("class Solution");
    expect(currentLine(code).textContent).toMatch(/Next line to run/);
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

  it("arrow keys step the run on screen, and each run keeps its own step", async () => {
    render(<ProblemPage problem={twoSum} />);
    await run();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /show the correct solution/i }));
    });
    const ref = await screen.findByRole("region", { name: "Correct solution's run" });
    const total = fixture.trace.steps.length;
    fireEvent.keyDown(document.body, { key: "ArrowRight" });
    expect(stepOf(ref)).toBe(`Step 2 of ${total}`);
    fireEvent.click(screen.getByRole("button", { name: "Your solution" }));
    const mine = screen.getByRole("region", { name: "Your solution's run" });
    expect(stepOf(mine)).toBe(`Step 1 of ${total}`);
    fireEvent.keyDown(document.body, { key: "ArrowRight" });
    fireEvent.keyDown(document.body, { key: "ArrowRight" });
    expect(stepOf(mine)).toBe(`Step 3 of ${total}`);
    fireEvent.click(screen.getByRole("button", { name: "Correct solution" }));
    expect(stepOf(screen.getByRole("region", { name: "Correct solution's run" }))).toBe(`Step 2 of ${total}`);
  });

  it("hides the Solution object's `self` from the variables", async () => {
    render(<ProblemPage problem={twoSum} />);
    await run();
    const mine = screen.getByRole("region", { name: "Your solution's run" });
    const slider = within(mine).getByRole("slider");
    const inMethod = fixture.trace.steps.findIndex((s) => s.functionName === "twoSum" && "self" in s.locals);
    fireEvent.change(slider, { target: { value: String(inMethod) } });
    fireEvent.click(screen.getByRole("button", { name: "Open Code Visualizer" }));
    const dialog = screen.getByRole("dialog", { name: /Code Visualizer/ });
    const names = [...dialog.querySelectorAll("table.vars th[scope='row']")].map((th) => th.textContent?.trim());
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

    it("shows `inline code` from the tutor as code", async () => {
      fetchHelp.mockImplementation(async (r) => ({ text: "Look at `range(2, n)` again.", source: "llm", level: r.level as number }));
      await runWrong();
      await act(async () => {
        fireEvent.click(within(help()).getByRole("button", { name: "Show a gentle hint" }));
      });
      const code = help().querySelector(".help-text code");
      expect(code?.textContent).toBe("range(2, n)");
      expect(help().textContent).not.toMatch(/`/);
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
