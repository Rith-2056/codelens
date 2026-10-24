# Product: CodeLens

A free, accessible web app that takes a learner from their first loop to their
first interview by turning their own Python into step-by-step lessons. Built
for Hackachusetts 2026, Civic Action track.

## Pitch
"CodeLens runs your own solution and shows the data structures change, step by
step, so any student can prep for technical interviews for free."

## What it does
A student picks or edits a short Python program, clicks Visualize, then steps
forward and backward through accurate execution states. Before a value changes,
the student predicts the next value and gets graded. Every step comes with a
plain-language explanation grounded only in the real execution trace.

## Who it's for
- Intro CS students without access to a tutor or dedicated CS teacher
- Learners in library and after-school coding programs, often on shared
  school Chromebooks
- English learners (Spanish first)
- Students using screen readers
- Students preparing for their first technical interview without paid prep
  courses or coaching

## Learning path
- **Level 1, how code runs (3 lessons):** loop, branch, function.
- **Level 2, interview patterns (6 lessons):** hash map (two-sum style), set
  (contains-duplicate style), two pointers on a sorted array, BFS on a graph
  (adjacency dict, deque queue, visited set), max depth of a binary tree
  (recursion plus `TreeNode`), climbing stairs as 1D DP.
- Lesson titles and problem statements are our own plain-language writing; see
  the table in `docs/plan.md`.

## MVP features
1. Editor: syntax-highlighted Python with the three Level 1 lessons (loop,
   branch, function). Editing allowed.
2. Execution: real Python via Pyodide in a Web Worker; trace of snapshots;
   "Next line to run" highlight; Previous/Next stepping.
3. Visualization: variable table, array cells, before→after change markers
   (text, not color only).
4. Predict-then-reveal: ask for a changing variable's new value, grade from the
   next snapshot. No LLM needed.
5. Error explainer: highlight the failing line and explain simply (NameError,
   TypeError, IndexError, ZeroDivisionError, SyntaxError first).
6. Explanations: deterministic template text per step (English + Spanish);
   optional LLM text replaces it when available.
7. Accessibility: aria-live step narration, keyboard-only flow, high contrast.
8. Share link: code and step encoded in the URL; no database.

Should-have if time allows: language toggle, lessons tagged with Massachusetts
DLCS standards, simple recursion call-stack view (stop by 4 PM).

## Level 2 features (spec: `.kiro/specs/ds-visualizers`)
9. The six Level 2 lessons, grouped by level in the lesson picker, each with
   its problem statement.
10. Data-structure visualizers: hash map table, set, array cells with index
    pointers, queue, graph with visited markers, binary tree, call stack.
11. Snapshot contract v2: containers and objects shared by reference.

## Non-goals
No accounts, database, analytics, grading storage, multiplayer, package
installation, file access, or server-side code execution. No linked lists,
heaps, tries, or union-find. No online judging: no hidden test cases and no
pass/fail verdicts on submitted solutions.

## Definition of done (by 7:30 PM; submissions lock 8:00 PM)
- Public deployed URL that works with no account
- Public GitHub repo with `/.kiro` at the root (never in .gitignore)
- Public demo video under 3 minutes
- README, project description, and KIRO_USAGE.md on how Kiro was used

## Acceptance tests
- `numbers = [3, 1, 2]; total = 0; for n in numbers: total += n` shows total
  0 → 3 → 4 → 6, next line visible each step, backward stepping without
  re-running, predict accepts 4.
- `while True: pass` ends as status "limit" in under 2 seconds (MAX_STEPS =
  2000); editor stays usable.
- `print(x)` with x undefined highlights the failing line with a NameError
  explanation.
- With /api/explain offline, every step still has a deterministic explanation.
- Each Level 2 lesson shows its data structures changing step by step; the
  per-lesson checks are in `docs/plan.md`.
