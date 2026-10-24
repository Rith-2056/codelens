---
inclusion: fileMatch
fileMatchPattern: ["shared/practice/**", "frontend/src/problems.ts", "frontend/src/py/practice.py"]
---
# Adding or changing a practice problem

Loaded only when problem data is being edited. The full design is in
#[[file:.kiro/specs/problem-catalog/design.md]].

## Checklist (tests first; see testing.md)
1. Add the slug, in category order, to `SLUGS` in `tests/test_practice.py`
   and to the table in `frontend/src/problems.test.ts`. Run them: red.
2. `shared/practice/problems.json`: `method`, `params`, `tree_params` (for
   trees given as level-order lists), `compare` (`exact`, `same-items` or
   `close`), and at least 3 examples. Expected answers come from running the
   reference solution, never typed by hand.
3. `shared/practice/<slug>.py`: a correct `class Solution`. Use the variable
   names the visualizer recognizes, because students compare their run with
   this one:
   - two pointers: `left`, `right`
   - binary search: `left`, `mid`, `right`
   - sliding window: `window`, plus `k` when the size is fixed
   - DP: a list named `dp`, or a recurrence like `ways[i] = ways[i - 1] ...`
4. `frontend/src/py/practice.py`: a generator of 20 to about 400 small inputs
   that are valid under LeetCode's rules, and a size key (smallest first).
   The reference must finish the whole search in its 1.5 s budget.
5. `frontend/src/problems.ts`: LeetCode's real number, title, slug and
   difficulty; a `pattern`; a `category` from `CATEGORIES`; and a statement in
   our own words in English and Spanish.
6. Run `.venv/bin/python frontend/src/py/gen_fixtures.py --all`; every
   reference run must stay under 2000 steps.
7. Plant a realistic beginner bug in `tests/test_counterexample.py` and check
   that the search finds the smallest failing input.
8. Run `scripts/check-all.sh`.

## Never
- Copy LeetCode's statements, examples or constraints text.
- Add a problem whose answer is not plain data (a list, number, bool, string,
  or a tree given as a list), because the harness compares plain data only.
