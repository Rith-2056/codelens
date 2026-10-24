# CodeLens: build plan (Hackachusetts 2026, Civic Action track)

## Pitch
CodeLens runs your own solution and shows the data structures change, step by step, so any student can prep for technical interviews for free.

## Goal
A free, accessible web app that takes a learner from their first loop to their first interview. A student picks or edits a short Python program, clicks Visualize, steps forward and backward through accurate execution states, predicts the next value before it is revealed, and reads a plain-language explanation grounded only in the real trace. Level 1 teaches how code runs. Level 2 teaches common interview patterns by showing the data structures change as the student's own solution runs.

## Users
- Intro CS students without access to a tutor or dedicated CS teacher
- Learners in library and after-school coding programs, often on shared school Chromebooks
- English learners (Spanish first)
- Students using screen readers
- Students preparing for their first technical interview without paid prep courses or coaching

## Learning path: from your first loop to your first interview

### Level 1: How code runs (3 lessons)
Loop, branch, function. Sources live in `frontend/src/lessons.ts` and `frontend/src/py/gen_fixtures.py`.

### Level 2: Interview patterns (6 lessons)
**Update 2026-10-24:** the practice problems now use LeetCode's real titles, numbers and `class Solution` signatures (Two Sum, Contains Duplicate, Two Sum II - Input Array Is Sorted, Find if Path Exists in Graph, Maximum Depth of Binary Tree, Climbing Stairs); see `frontend/src/problems.ts`. Problem statements and examples stay in our own words: never copy LeetCode's problem text or examples. The table below is the original lesson plan.

| # | Lesson | Pattern | Data structures shown | Problem statement |
|---|---|---|---|---|
| 1 | Pair that adds up | Hash map | dict (number → position) | You have a list of numbers and a target number. Find the positions of two different numbers that add up to the target. You can assume exactly one pair works. |
| 2 | Any repeats? | Set | set | You have a list of numbers. Find out whether any number shows up more than once. |
| 3 | Pair in a sorted list | Two pointers | list with `left` / `right` markers | The numbers are sorted from smallest to largest. Find two of them that add up to the target by starting one pointer at each end and moving the pointers toward each other. |
| 4 | Hops through a network | Breadth-first search | adjacency dict as a graph, deque as a queue, visited set | People in a small network are connected as friends. Starting from one person, find how many friend-to-friend hops it takes to reach each other person. |
| 5 | How tall is the tree? | Recursion on a binary tree | `TreeNode` objects as a tree, call stack | A tree starts at one root node, and each node can have a left child and a right child. Find how many nodes are on the longest path from the root down to the bottom. |
| 6 | Ways up the stairs | 1D dynamic programming | list as a DP table with an `i` marker | You climb a staircase by taking either 1 or 2 steps at a time. Count how many different ways you can reach the top of a staircase with n steps. |

## Definition of done (by 7:30 PM, submissions lock 8:00 PM)
- Public deployed URL that works with no account
- Public GitHub repo with `/.kiro` at the root (never in .gitignore)
- Public demo video under 3 minutes
- README, project description, and KIRO_USAGE.md write-up of how Kiro was used

## MVP features
1. Editor: syntax-highlighted Python, the three Level 1 lessons (loop, branch, function). Editing allowed.
2. Execution: real Python via Pyodide in a Web Worker; trace of snapshots; "Next line to run" highlight; Previous/Next.
3. Visualization: variable table, array cells, before→after change markers (text, not color only).
4. Predict-then-reveal: before a step that changes a variable, ask the student for the new value; grade it from the next snapshot. No LLM needed.
5. Error explainer: on an exception, highlight the failing line and explain it simply (NameError, TypeError, IndexError, ZeroDivisionError, SyntaxError first).
6. Explanations: deterministic template text for every step (English and Spanish); optional LLM text from /api/explain replaces it when available.
7. Accessibility: aria-live narration of each step, keyboard-only flow, high contrast.
8. Share link: code and step encoded in the URL; no database.

Should-have if time allows: language toggle, lessons tagged with Massachusetts DLCS standards, simple recursion call-stack view (stop by 4 PM).

## Level 2 features (spec: `.kiro/specs/ds-visualizers`)
9. Level 2 lessons: the six interview-pattern lessons above, grouped by level in the lesson picker, each showing its problem statement.
10. Data-structure visualizers: hash map table, set, array cells with index pointers (two pointers, DP table), queue, graph with visited markers, binary tree, and a call stack for recursion. Every change has a text marker and every diagram has a text alternative.
11. Snapshot contract (frozen, version 2026-10-24): tagged set, dict, and deque values (dicts keep insertion order and int keys), student-defined objects such as `TreeNode` in a per-step heap by reference, and a call stack on every step.

## Practice features (added 2026-10-24)
12. Pages: home, the LeetCode problem list, one page per problem, and a playground for any Python program. Hash URLs, so a problem page can be bookmarked or shared.
13. Glassy iOS-style look that stays WCAG AA (checked by `frontend/src/theme.test.ts` and axe).
14. Your solution next to a correct one: both traced and visualized side by side.
15. Counterexample search: when a solution is wrong, CodeLens (in Pyodide, in the browser) finds the smallest input where it differs from the reference.
16. Three levels of AI help from Gemini (hint, targeted explanation, possible fix), grounded in the counterexample and the two traces.
17. Mistake categories (off-by-one, missed edge case, wrong pointer update, ...) and debugging sessions saved in the browser.

## Non-goals
No accounts, database, analytics, grading, multiplayer, package installation, file access, or server-side code execution. No linked lists, heaps, tries, or union-find. No hidden test suites, scores, or leaderboards: when CodeLens says a solution is wrong it always shows the input that proves it. Saved debugging sessions stay in the student's own browser.

## Acceptance tests
- `numbers = [3, 1, 2]; total = 0; for n in numbers: total += n` shows total 0 → 3 → 4 → 6, next line visible at every step, backward stepping without re-running, predict accepts 4.
- `while True: pass` ends as status "limit" in under 2 seconds (MAX_STEPS = 2000); editor stays usable.
- `print(x)` with x undefined ends with the failing line highlighted and a NameError explanation.
- With /api/explain offline, every step still has a deterministic explanation.
- Pair that adds up: the hash map grows from empty to `{4: 0}` to `{4: 0, 9: 1}` (int keys shown as numbers) and the program prints `[1, 2]`.
- Pair in a sorted list: `left` and `right` are drawn under the array cells and move inward until the program prints `[4, 6]`.
- Hops through a network: the graph, the queue (front and back labeled), and the visited set update each step, ending with hops `{'A': 0, 'B': 1, 'C': 1, 'D': 2, 'E': 3}`.
- How tall is the tree?: the tree is drawn from the `TreeNode` objects, the call stack grows and shrinks with each `max_depth` call, and the program prints `4`.

## Architecture
- Vite + React + TypeScript static site in `frontend/`.
- Web Worker (`frontend/src/worker/trace.worker.ts`) loads Pyodide and runs `frontend/src/py/tracer.py`.
- `tracer.py` is plain Python, also imported directly by pytest in CPython for testing.
- Optional serverless function `api/explain.ts` holds the LLM key. Never run student code on a server.
- Preload the worker on page open; show precomputed fixture traces instantly while Python loads.

## Folder layout
```
codelens/
  .kiro/steering/   .kiro/specs/   .kiro/hooks/
  docs/plan.md
  frontend/src/components/   (Editor, Timeline, Variables, Arrays, Explanation, Predict, Narrator)
  frontend/src/components/visualizers/   (HashMap, Set, Queue, Graph, Tree, CallStack)
  frontend/src/worker/trace.worker.ts  traceClient.ts
  frontend/src/py/tracer.py  gen_fixtures.py
  frontend/src/types/trace.ts      (FROZEN contract)
  frontend/src/lessons.ts          (Level 1 + Level 2 lessons)
  frontend/src/explain/            (deterministic templates, en + es; client.ts)
  api/explain.ts
  shared/fixtures/*.json           (precomputed traces, one per lesson)
  tests/test_tracer.py  tests/test_tracer_properties.py
  README.md  KIRO_USAGE.md  LICENSE
```

## FROZEN shared contract (version 2026-10-24)
Source of truth: `frontend/src/types/trace.ts`, mirrored in `.kiro/steering/tech.md`. Owned by the integrator.
```ts
type JsonValue = null | boolean | number | string | JsonValue[] | { [k: string]: JsonValue };

// Tagged JsonValue forms (each is a one-key object, so it is already a JsonValue):
type SetValue   = { __set: JsonValue[] };               // sorted when possible
type DictValue  = { __dict: [JsonValue, JsonValue][] }; // keeps insertion order and non-string keys
type DequeValue = { __deque: JsonValue[] };             // front first
type RefValue   = { __ref: string };                    // points into heap

type HeapObject = { id: string; type: string; fields: Record<string, JsonValue> };

type StackFrame = {
  functionName: string;
  frameId: string;
  line: number;
  locals: Record<string, JsonValue>;
};

type TraceStep = {
  index: number;
  line: number;
  event: "call" | "line" | "return" | "exception";
  functionName: string;
  frameId: string;
  depth: number;
  locals: Record<string, JsonValue>;   // current frame only
  stdout: string;            // cumulative
  returnValue?: JsonValue;
  error?: { type: string; message: string };
  heap: Record<string, HeapObject>;
  stack: StackFrame[];       // all active user frames, outermost first; last = current frame
};

type TraceResult = {
  steps: TraceStep[];
  status: "ok" | "error" | "limit" | "timeout";
  message?: string;
  truncated: boolean;
  codeHash: string;
};
```

## Tracer rules
- Use `sys.settrace` for call, line, return, exception events. Line events fire BEFORE the line runs: the UI says "Next line to run".
- Compile with filename `codelens_user.py`; record only frames from that filename.
- Snapshot locals without running student code, using the contract's value forms: lists and tuples as arrays, sets as `__set`, dicts as `__dict`, deques as `__deque`, and instances of classes defined in the student's code as `__ref` into `heap`; anything else becomes a type-only placeholder. Never call arbitrary repr.
- Capture stdout with a byte cap.
- MAX_STEPS = 2000 is the main infinite-loop guard. Raise the limit as a subclass of BaseException (not Exception) so student `except Exception` cannot swallow it. The limit message states the number of steps actually recorded.
- Replace `input()` with a stub that raises a friendly error.
- SyntaxError becomes a single error state; runtime exceptions end the trace with a terminal error step.
- Worker timeout (~3 s) is only a backstop for slow C-level calls; after a timeout, start a fresh worker in the background.

## Explanation rules
- Deterministic templates first, built from the diff between previous and current snapshot, including changes inside data structures (a key added, an item appended or removed, a pointer moved, a recursive call).
- LLM prompt: patient beginner tutor, one or two sentences, in the requested language, only values present in the snapshots, never future values, say the highlighted line has not run yet, decline unrelated requests.
- Server-side check: if the LLM reply contains a number not in the snapshots or code slice, discard it and use the template.
- Cache by codeHash + step index + language. Cap payload size, rate-limit, 5 s timeout, do not log code.

## Property-based tests (Hypothesis)
- Final locals equal the namespace from running the same program untraced.
- Indices contiguous from 0; len(steps) <= MAX_STEPS.
- Every line within the program's line range; depth never negative.
- Every step JSON-serializes under the byte cap; truncated is true whenever something was cut.
- Tracing the same program twice gives identical results.

## Workstreams and file ownership
- trace-engineer: frontend/src/py/, frontend/src/worker/, tests/, shared/fixtures/
- ui-builder: frontend/src/components/, frontend/src/App.tsx, frontend/src/lessons.ts, styles
- explainer: frontend/src/explain/, api/
- integrator (human): frontend/src/types/trace.ts, merges, deploy, README, KIRO_USAGE.md

## Schedule gates
- Mocked end-to-end (fixture traces in UI) by 12:30
- Real Pyodide traces for all 3 lessons + preview deploy by 2:30
- Predict, error explainer, narrator, explanations by 4:00
- Feature freeze 5:00; video and write-up 5:00–6:15; submit by 7:45
