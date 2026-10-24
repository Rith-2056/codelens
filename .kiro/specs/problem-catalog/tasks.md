# Tasks: problem-catalog

- [x] 1. Tests first for the catalog
  - `tests/test_practice.py`: the 25 slugs in category order.
    `tests/test_counterexample.py`: planted bugs for 4 new problems.
  - `frontend/src/problems.test.ts`: numbers, names, difficulties and
    categories; methods.
  - `frontend/src/pages/ProblemList.test.tsx`: sections per category, in order.
  - Ran them: red for the expected reasons.
  - _Requirements: 1.1–1.4, 2.1, 3.3_
- [x] 2. Problem data and reference solutions
  - `problems.json` entries. Expected answers are computed by running the
    references, never typed by hand.
  - 17 `.py` references.
  - Statements in en/es, written in our own words.
  - _Requirements: 2.1–2.4_
- [x] 3. Generators and sizes in `practice.py`
  - _Requirements: 3.1–3.2_
- [x] 4. Variable-width sliding window band (test first)
  - _Requirements: 4.2_
- [x] 5. Regenerate fixtures (`gen_fixtures.py --all`); every run under 2000 steps
  - _Requirements: 4.5_
- [x] 6. Hook `practice-check-on-save`, and steering updates
  - _Requirements: 5.2_
- [x] 7. `scripts/check-all.sh` green; browser check; log in `docs/PROGRESS.md`
  - _Requirements: 5.1_
