# Pedagogy

CodeLens teaches by showing a learner their own program's real execution, one
accurate step at a time, on a path from their first loop to their first
interview. Every teaching choice below protects trust in that trace and keeps
the experience usable for the target learners.

## Grounded in the real trace
- Explanations describe only what actually happened in the recorded snapshots.
- Never reference or hint at future values. The highlighted line has NOT run
  yet; say so ("Next line to run").
- Deterministic template text is the source of truth. Optional LLM text only
  replaces it when available and only if it passes the no-invented-number check.

## From first loop to first interview
- Level 1 (loop, branch, function) teaches how code runs. Level 2 (hash map,
  set, two pointers, BFS, tree recursion, 1D DP) teaches interview patterns.
- In Level 2, show the data structure, not just the variables: the student
  should see the key land in the hash map, the pointers move inward, the queue
  drain, and the call stack grow and shrink.
- Name the pattern in plain words and tie it to what changed on screen ("the
  set remembers every number seen so far").
- Students run their own solution. CodeLens checks it against a correct
  reference and, when it is wrong, finds the smallest input that shows the
  difference, then shows both runs side by side. There are no hidden test
  suites, scores, or leaderboards: the student always sees the exact input.
- Help comes in three levels, and the student chooses when to go further: a
  gentle hint, then a targeted explanation, then a possible fix. Never jump
  straight to corrected code.
- Name the kind of mistake (off-by-one, missed edge case, wrong pointer
  update, ...) so students learn to recognise their own patterns.

## Names are LeetCode's, words are ours
- Practice problems use LeetCode's real titles, numbers, and `class Solution`
  method signatures, so students practise in the format interviews use.
- Write every problem statement, example, and explanation ourselves, in plain
  language. Never copy LeetCode's problem text or examples.

## Predict-then-reveal
- Before a step that changes a variable, ask the student to predict the new
  value, then grade it from the next snapshot. No LLM needed.
- Grade from real data only. Accept the correct value; give a gentle, specific
  nudge when wrong rather than just "incorrect".

## Plain language, two languages
- One or two short sentences per step, patient-beginner-tutor tone.
- Full English and Spanish support; Spanish is a first-class language, not an
  afterthought. Language toggle is a should-have.

## Errors are teaching moments
- On an exception, highlight the failing line and explain it simply.
- Prioritize the errors beginners hit first: NameError, TypeError, IndexError,
  ZeroDivisionError, SyntaxError.
- Frame errors as normal and fixable, not as failure.

## Accessibility is a requirement, not a feature
- aria-live narration announces each step for screen readers, including what
  changed inside a data structure ("seen: added key 9").
- Full keyboard-only flow; no mouse required.
- High contrast; convey change with text markers (before→after, "added",
  "removed", "front", "back", "visited"), never color alone.
- Every diagram (graph, tree, queue) has a text alternative with the same
  information, such as a table or nested list.
- Assume shared school Chromebooks: keep it fast and lightweight, show
  precomputed fixture traces instantly while Python loads.

## Safe to explore
- Editing code is encouraged; students learn by changing and re-running.
- Infinite loops and errors never break the app: MAX_STEPS (2000) guards
  runaway loops, and the editor stays usable after a limit or timeout.
- Share links let a student or teacher revisit the exact code and step without
  any account or saved data.
