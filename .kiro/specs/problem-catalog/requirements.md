# Requirements: problem-catalog

## Introduction
CodeLens had 8 practice problems in one flat list. Students prepare for
interviews by pattern ("today I'll do sliding window"), so the list should be
grouped by pattern, and each pattern needs enough problems to practise it.
This spec adds 17 problems (25 in total) in eight categories. Each one gets a
visualization the Code Visualizer already knows how to draw (see
`.kiro/specs/ds-visualizers/` and `frontend/src/visualizer/focus.ts`).

Sources: `.kiro/steering/product.md`, `.kiro/steering/pedagogy.md`,
`.kiro/steering/testing.md`.

## Glossary
- **Problem**: an entry in `shared/practice/problems.json` with a reference
  solution `shared/practice/<slug>.py` and a text entry in
  `frontend/src/problems.ts`.
- **Category**: one of Arrays & Hashing, Two Pointers, Sliding Window, Binary
  Search, Stack, Trees, Graphs, Dynamic Programming.
- **Generator**: the small-input generator for the counterexample search
  (`frontend/src/py/practice.py`).

## Requirement 1: Grouped problem list
**User story:** As a student, I want problems grouped by pattern, so that I
can practise one pattern at a time.
1. THE problem list SHALL show one section per category, in the order above,
   each with a heading and the problems in that category.
2. Each problem SHALL have exactly one category.
3. WHEN a category has problems I solved, its heading SHALL show "N of M solved".
4. THE Solved / Tried badges from saved sessions SHALL keep working.

## Requirement 2: Seventeen more problems
**User story:** As a student, I want 2 to 4 problems per pattern, so that I can
practise it until it sticks.
1. THE catalog SHALL contain these 25 problems, using LeetCode's real names,
   numbers, slugs and difficulties:
   - Arrays & Hashing: 1, 217, 242, 238
   - Two Pointers: 977, 167, 11
   - Sliding Window: 121, 643, 209
   - Binary Search: 704, 35, 153
   - Stack: 20, 739
   - Trees: 104, 100, 112
   - Graphs: 733, 1971, 200
   - Dynamic Programming: 70, 746, 198, 53
2. Every statement SHALL be in our own words, in English and Spanish. No text
   SHALL be copied from LeetCode, and examples SHALL be our own (not
   LeetCode's).
3. Every problem SHALL have at least 3 examples, whose expected answers come
   from running the reference solution.
4. Every reference solution SHALL give the expected answer for every example.

## Requirement 3: Counterexample search for every problem
1. Every problem SHALL have a generator of at least 20 and at most about 400
   small inputs that are valid under LeetCode's rules, sorted smallest first.
2. THE reference solution SHALL have no counterexample, and the search SHALL
   finish within its 1.5 s budget.
3. WHEN a planted beginner bug is submitted for a new problem, THE search SHALL
   find the smallest failing input (tested for at least four new problems).

## Requirement 4: Visualizations
1. Two-pointer, sliding-window and binary-search problems SHALL show their
   index variables above the list cells.
2. WHEN a sliding window has no fixed size `k`, THE window band SHALL span
   from the left pointer to the right pointer.
3. DP problems SHALL show the table filling in, with the cell just written
   and the cells it read.
4. Tree and grid problems SHALL show the tree or grid with the call stack
   (recursion).
5. Every new problem's reference run SHALL stay within 2000 steps.

## Requirement 5: Process
1. Every change SHALL follow `.kiro/steering/testing.md`: tests first, then
   all of `scripts/check-all.sh` green.
2. Saving practice data SHALL run the practice checks automatically (agent
   hook `practice-check-on-save`).
