# Pedagogy

CodeLens teaches by showing a beginner their own program's real execution, one
accurate step at a time. Every teaching choice below protects trust in that
trace and keeps the experience usable for the target learners.

## Grounded in the real trace
- Explanations describe only what actually happened in the recorded snapshots.
- Never reference or hint at future values. The highlighted line has NOT run
  yet; say so ("Next line to run").
- Deterministic template text is the source of truth. Optional LLM text only
  replaces it when available and only if it passes the no-invented-number check.

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
- aria-live narration announces each step for screen readers.
- Full keyboard-only flow; no mouse required.
- High contrast; convey change with text markers (before→after), never color
  alone.
- Assume shared school Chromebooks: keep it fast and lightweight, show
  precomputed fixture traces instantly while Python loads.

## Safe to explore
- Editing code is encouraged; students learn by changing and re-running.
- Infinite loops and errors never break the app: MAX_STEPS guards runaway
  loops, and the editor stays usable after a limit or timeout.
- Share links let a student or teacher revisit the exact code and step without
  any account or saved data.
