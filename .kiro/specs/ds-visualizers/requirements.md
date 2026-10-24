# Requirements: ds-visualizers

## Introduction
Level 2 of CodeLens teaches interview patterns by showing the student's own
solution change real data structures. The old snapshot rules could not show
those structures: running the six Level 2 lessons through the tracer turned the
hash map with int keys, the set, the deque, the adjacency dict, and every
`TreeNode` into type-only placeholders, and a step held no call stack.

The shared contract was updated and frozen again on 2026-10-24 (see
`frontend/src/types/trace.ts` and `.kiro/steering/tech.md`). This spec covers
the tracer, the six Level 2 lessons, the visualizers, and explanations built
on that contract. Sources: `docs/plan.md` ("Learning path", "Level 2
features") and `.kiro/steering/`.

Owners: integrator (contract), trace-engineer (tracer, fixtures, worker),
ui-builder (lessons, visualizers), explainer (templates, API, shared value
helpers).

## Glossary
- **Tagged value**: a one-key object from the contract: `{"__set": [...]}`,
  `{"__dict": [[k, v], ...]}`, `{"__deque": [...]}`, or `{"__ref": id}`.
- **Heap object**: an entry `{id, type, fields}` in a step's `heap`, used for
  student-defined objects.
- **Ref**: `{"__ref": id}`, a value that points at a heap object.
- **Placeholder**: `{"__type__": name}` (or `{"__type__": name, "__len__": n}`
  for a container that was too long) for anything that is not shown.
- **Student-defined object**: an instance of a class created by the student's
  own code (for example `TreeNode`).
- **Stack**: the user frames that called the current frame, outermost first.

## Requirement 1: Contract (frozen, version 2026-10-24)
**User story:** As every workstream, I want one agreed shape for data
structures, so that the tracer, UI, and explainer can change independently.
1. `frontend/src/types/trace.ts` SHALL define the tagged value forms,
   `HeapObject`, `StackFrame`, and the `heap` and `stack` fields on
   `TraceStep`, exactly as frozen in `.kiro/steering/tech.md`.
2. Every snapshot value (in `locals`, `returnValue`, stack locals, or heap
   fields) SHALL be exactly one of: a primitive, a JSON array of snapshot
   values, a tagged value, or a placeholder. A dict SHALL always be a
   `__dict`, never a plain JSON object.
3. Every ref in a step SHALL resolve in that step's `heap`, and
   `heap[id].id` SHALL equal `id`.
4. Every step SHALL have `heap` and `stack`, possibly empty.
5. Only the integrator SHALL change the contract, and each change SHALL keep
   `npm run typecheck` green, because the contract-guard hooks re-run
   typecheck on every edit to `trace.ts`.

## Requirement 2: Snapshots of data structures
**User story:** As a student, I want to see my lists, dicts, sets, queues, and
tree nodes exactly as my code left them.
1. The tracer SHALL write:
   - values of exact type `list` and `tuple` as arrays
   - `dict` as `__dict`, in insertion order with non-string keys kept
   - `set` and `frozenset` as `__set`
   - `collections.deque` as `__deque`, front first
   - student-defined objects as `__ref` into `heap`
   Primitives stay inline as before.
2. A heap object SHALL keep the same id in every step of a run, and two names
   bound to it SHALL share one ref.
3. Heap ids SHALL be assigned deterministically (`o1`, `o2`, … in first-seen
   order), never from `id()`, so tracing the same program twice gives
   identical results.
4. `__set` items SHALL be sorted whenever every item is sortable without
   running student code, so their order does not depend on Python's string
   hash seed.
5. Containers nested past MAX_NEST_DEPTH, and containers that contain
   themselves, SHALL become placeholders. Heap objects that reference each
   other SHALL use refs. Neither case SHALL loop or crash.
6. The tracer SHALL NOT call `repr`, `str`, `__eq__`, `__hash__`,
   `__getattribute__`, `__getattr__`, properties, or any other method that
   student code can override. Objects whose class makes that impossible SHALL
   become placeholders.
7. Each step's `stack` SHALL list the calling user frames, outermost first,
   with functionName, frameId, line, and locals, and SHALL NOT repeat the
   current frame.

## Requirement 3: Limits
**User story:** As a student, I want longer interview-style programs to finish
and runaway loops to stop quickly.
1. MAX_STEPS SHALL be 2000. `len(steps)` SHALL never exceed MAX_STEPS.
2. The limit message SHALL state the number of steps actually in the trace.
3. `while True: pass` SHALL end with status `"limit"` in under 2 seconds, in
   CPython and in Pyodide.
4. When something is cut, `truncated` SHALL be true, and only then. Cuts
   include: container items beyond MAX_ITEMS, nesting beyond MAX_NEST_DEPTH,
   self-containing containers, heap objects beyond MAX_HEAP_OBJECTS per step,
   and a whole trace beyond TRACE_BYTE_CAP.
5. When the whole trace exceeds TRACE_BYTE_CAP, the run SHALL stop with status
   `"limit"` and a message that says the run produced too much data to show.
6. Every step, including `heap` and `stack`, SHALL serialize within
   STEP_BYTE_CAP.

## Requirement 4: Level 2 lessons
**User story:** As a student preparing for interviews, I want six short,
working examples of the core patterns, explained in plain language.
1. The lesson picker SHALL group lessons as Level 1 (loop, branch, function)
   and Level 2 (the six lessons in design.md), in that order.
2. Each Level 2 lesson SHALL show its title, the pattern name, and its problem
   statement in English and Spanish.
3. Titles, problem statements, and example data SHALL be written by us. They
   SHALL NOT be copied from LeetCode or any other site.
4. Each lesson SHALL have a fixture in `shared/fixtures/` generated by the
   tracer, and its source in `lessons.ts` SHALL match the fixture's `codeHash`.
5. Each lesson SHALL finish with status `"ok"` well under MAX_STEPS and print
   the expected output listed in design.md.

## Requirement 5: Explanations of structure changes
**User story:** As a student, I want each step to tell me what changed inside
my data structures.
1. Deterministic templates (English and Spanish) SHALL describe:
   - a dict key added, or its value changed
   - an item added to or removed from a set
   - a list item changed
   - an item added to or removed from either end of a deque
   - a field set on a heap object
   - a recursive call or return
2. The no-invented-number check SHALL accept numbers found in tagged values,
   heap fields, and stack locals, as well as in the existing fields. It SHALL
   NOT accept heap ids, `index`, or `depth`.
3. `/api/explain` SHALL accept steps with `heap` and `stack` within its
   payload cap.

## Requirement 6: Visualizers
**User story:** As a student, I want each data structure drawn the way
interview prep explains it, with changes marked.
1. The UI SHALL choose a visualizer from the data, not from the lesson, so a
   student's own solution gets the same views. Detection rules are in
   design.md.
2. Visualizers SHALL exist for:
   - hash map (`__dict`)
   - set (`__set`)
   - array cells with index pointers
   - queue (`__deque`)
   - graph (adjacency `__dict`)
   - binary tree (heap objects with left/right children)
   - call stack
3. Each visualizer SHALL mark changes since the previous step with text
   ("added", "removed", before → after, "front", "back", "visited"), never
   with color alone.
4. Two names that share a heap object SHALL be shown as the same object. Lists,
   dicts, sets, and deques are copied by value under the contract, so
   aliasing between them is not shown.

## Requirement 7: Accessibility and performance
**User story:** As a student using a screen reader or a shared Chromebook, I
want the new views to work for me.
1. Every diagram SHALL have a text alternative with the same information.
2. The step narration SHALL include the structure change for that step.
3. Everything SHALL work with the keyboard only, at 375 px width, and with
   `prefers-reduced-motion` (no required animation).
4. Each Level 2 lesson SHALL trace in under 1 second in Pyodide, and a
   2000-step trace SHALL finish inside the 3 s worker timeout.

## Requirement 8: Verification
1. Hypothesis properties (a)–(e) from the trace-engine spec SHALL hold under
   the new contract, with (a) comparing against the untraced namespace
   snapshotted with the same rules. A new property SHALL check that every ref
   resolves within its step.
2. The Pyodide check SHALL cover all nine lessons and produce output identical
   to CPython.
3. The Level 2 acceptance tests in `docs/plan.md` SHALL pass in the browser.
