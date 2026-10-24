# How Kiro was used to build CodeLens

> **Before you submit, fill in every `[YOU: ...]` with what you actually did.**
> Only claim Kiro features you really used. Each section points to the files
> in this repo that back it up, so judges can check.

CodeLens is a free, accessible web app that runs a student's own Python
(LeetCode-style `class Solution`) and shows every step: the line, what
changed, and the data structures (arrays with pointers, sliding windows,
binary-search ranges, hash maps, stacks, grids, trees, the call stack). When
a solution is wrong, it finds the smallest input that breaks it and offers
three levels of AI help. Track: **Civic Action** (free, equitable interview
prep for students without paid coaching).

## 1. Kiro tools

| Surface | Used for | Evidence |
|---|---|---|
| Kiro IDE: specs | Requirements → design → tasks for each workstream | `.kiro/specs/*` |
| Kiro IDE: agent hooks | 8 hooks that run tests, guard the frozen contract, review text, and log usage | `.kiro/hooks/*.json` |
| Kiro IDE: steering | 6 steering docs, always-on and file-matched | `.kiro/steering/*.md` |
| Kiro IDE: Vibe chat | Creating and testing hooks | `KIRO_USAGE.md` (2026-10-24 12:21) |
| Kiro CLI / Web / Crew | [YOU: say which you tried and how they differed, or delete this row] | |

[YOU: one or two sentences on how the surfaces compared for you, for
example IDE for spec work and CLI headless for running `scripts/check-all.sh`.]

## 2. Spec-driven development

Five specs live in `.kiro/specs/`, one per workstream: `trace-engine`,
`ds-visualizers`, `explain-service`, `timeline-ui` and `problem-catalog`.

**How each spec is structured**
- `requirements.md`: an introduction, a glossary, then numbered requirements.
  Each has a user story and acceptance criteria written as "WHEN … THE
  SYSTEM SHALL …" (for example problem-catalog R4.2: "WHEN a sliding window
  has no fixed size k, THE window band SHALL span from the left pointer to the
  right pointer").
- `design.md`: the data shapes, tables, limits and edge cases, for example the
  17-problem table with the visualization each one gets.
- `tasks.md`: checkbox tasks. Each names its owner, says which tests come
  first, and links back to `_Requirements: x.y_`.

**What it changed**
- **A frozen contract.** `frontend/src/types/trace.ts` (the trace format)
  was specified once in `ds-visualizers` R1 and marked FROZEN in
  `.kiro/steering/tech.md`. Because the tracer, the UI and the explainer
  agreed on one shape, they could be built in parallel without drifting
  apart. A hook enforces it (section 3).
- **Traceability.** Every task names the requirement it satisfies, and every
  requirement has tests. Finishing a task means its tests passed and
  `scripts/check-all.sh` was green.
- **Scope control.** problem-catalog fixed the 25 problems, categories and
  visualizations up front, so adding 17 problems was a checklist, not 17
  improvisations.

**Compared with vibe coding**
[YOU: your honest comparison. Something you saw directly: what went wrong
when you prompted without a spec, and what the spec prevented.]

## 3. Agent hooks (`.kiro/hooks/`)

| Hook | Trigger | What it automates |
|---|---|---|
| `pytest-on-save` | PostFileSave `frontend/src/py/`, `tests/` | Runs the tracer test suite; fails loudly |
| `contract-guard-on-save` | PostFileSave `trace.ts` | Warns, typechecks, regenerates every fixture from CPython |
| `contract-guard-on-agent-edit` | PostToolUse `fs_write`, `str_replace`, … | Same guard when the **agent** edits the contract |
| `lesson-check-on-save` | PostFileSave `lessons.ts` | Traces every lesson; fails if one isn't `ok` within 2000 steps |
| `practice-check-on-save` | PostFileSave `shared/practice/`, `practice.py` | Practice and counterexample tests, plus a stale-fixture check |
| `problem-text-review-on-save` | PostFileSave `problems.ts` | **Agent** review: own words, English and Spanish match, valid category |
| `tests-first-guard` | **PreToolUse** `fs_write`, `str_replace`, `fs_append` | Before the agent edits feature code, requires a failing test first |
| `kiro-usage-log` | **Stop** | The agent appends one line per task to `KIRO_USAGE.md` |

How they helped:
- The test hooks give feedback on save, before commit.
- The contract guard covers both saves and agent tool edits, so a frozen file
  can't change silently.
- `practice-check-on-save` fails if a reference solution disagrees with its
  examples. When a reference was broken on purpose, it exited 1 within about
  4 s.
- The git pre-commit hook (`.githooks/pre-commit`) runs the full suite as a
  backstop.

[YOU: one real moment a hook caught something for you.]

## 4. Steering (`.kiro/steering/`)

- `product.md`, `pedagogy.md`, `tech.md`, `structure.md`, `testing.md`: always
  included.
  - Pedagogy sets the tutor's voice, and "change is always shown with text,
    not only color".
  - Tech records the FROZEN trace contract and the AI model rules.
  - Testing makes TDD mandatory: red, then green, then all checks green.
- `problems.md`: **conditional** (`inclusion: fileMatch` on
  `shared/practice/**`, `problems.ts`, `practice.py`). It loads only while
  problem data is edited, and pulls in the spec with
  `#[[file:.kiro/specs/problem-catalog/design.md]]`. The always-on context
  stays small, and the detailed checklist shows up exactly when it's needed.

The strategy that made the biggest difference: [YOU: pick one and say why.
Candidates: testing.md's "never weaken a test", the frozen-contract note in
tech.md, or the file-matched problems.md.]

## 5. MCP

[YOU: say what you connected, or that you didn't. If you add one now, for
example a browser-automation MCP server so Kiro can open the app and check
the visualizer, configure it in `.kiro/settings/mcp.json` and describe what
it let Kiro do.]

## 6. Property-based testing

`tests/test_tracer_properties.py` uses Hypothesis to generate whole Python
programs and checks these properties of every trace:
- (a) the final locals match an untraced run of the same program
- (b) step indices count up, within MAX_STEPS
- (c) every line number is valid
- (d) every step fits its byte cap, and `truncated` is set exactly when data
  was dropped
- (e) tracing is deterministic
- (i) every `__ref` resolves in the heap
- (ii) the stack depth matches an independent `sys.settrace` oracle
- (iii) the JSON output is byte-identical across `PYTHONHASHSEED` values

The counterexample search is property-style too: for every problem, the
reference must pass every one of the 20 to 400 small inputs.

[YOU: a bug PBT found that unit tests missed. The hash-seed property is a good
candidate: set order must not depend on Python's hash seed.]

## 7. Kiro powers

[YOU: list any powers you installed and what they gave you, or say none.]

## Results
- 25 LeetCode problems in 8 pattern groups, each with a reference solution,
  a counterexample search and a visualization.
- 700 automated tests (301 pytest, 142 node, 257 vitest), all green on every
  commit.
- AI help through Gemini (free tier) that falls back to built-in text, so the
  app works with no key and offline.
