# CodeLens

**Watch your code run, one step at a time.** CodeLens runs your own Python
(LeetCode-style `class Solution`) in the browser and shows every step: the
line that runs, what changed, and the data structures as they change. That
includes arrays with pointers, sliding windows, binary-search ranges, hash
maps, stacks, grids, trees and the call stack.

When a solution is wrong, Submit finds the smallest input that breaks it.
Then you can ask for help in three levels: a hint, an explanation, then a
possible fix.

Free, accessible (screen readers, keyboard, high contrast), in English and
Spanish, and it works without an AI key.

Built for Hackachusetts 2026, Civic Action track.

## Features
- **25 LeetCode problems in 8 groups:** Arrays & Hashing, Two Pointers,
  Sliding Window, Binary Search, Stack, Trees, Graphs, Dynamic Programming.
  They use LeetCode's real names and signatures; the statements and examples
  are our own.
- **Run and Submit:** Run checks one example. Submit also tries hundreds of
  small inputs and shows the smallest one that breaks your code, with the
  likely kind of mistake (off by one, missed edge case, wrong pointer, ...).
- **Code Visualizer:** a full-screen view of one run, with the code on the
  left and a view picked for the algorithm on the right. Play, pause, change
  the speed, or jump to any variable's next change.
- **AI help (optional):** a hint, an explanation, then a possible fix, from
  Gemini. Without a key it falls back to built-in text.
- **Your code page:** visualize any Python program.
- Your code and your Submit history are saved in this browser only.

## Requirements
| Tool | Version | Used for |
|---|---|---|
| Node.js | 24 or newer | The frontend, the API, and the Node tests (which run TypeScript directly) |
| Python | 3.12 or newer (tested on 3.13) | The tracer tests and generating fixtures |
| Internet | On the first page load | Python in the browser (Pyodide 0.29.5) loads from the jsDelivr CDN |

## Setup
```bash
git clone https://github.com/Rith-2056/codelens.git
```

```bash
cd codelens
```

Install the frontend and API packages:
```bash
npm --prefix frontend ci
```

```bash
npm --prefix api ci
```

Create the Python environment for the tests. The easiest way is
[uv](https://docs.astral.sh/uv/) (`brew install uv` on macOS):
```bash
uv venv .venv
```

```bash
uv pip install --python .venv/bin/python -r requirements-dev.txt
```

Without uv, use Python 3.12 or 3.13 directly, then run
`.venv/bin/pip install -r requirements-dev.txt`:
```bash
python3.13 -m venv .venv
```

Optional: turn on the pre-commit hook, which runs every check before each
commit:
```bash
git config core.hooksPath .githooks
```

## Run it
```bash
npm --prefix frontend run dev
```
Open the address Vite prints (usually http://localhost:5173).

**With AI help:** get a free key at https://aistudio.google.com/apikey, then
start the dev server with the key set:
```bash
GEMINI_API_KEY=your-key npm --prefix frontend run dev
```
The dev server answers `/api/explain` and `/api/help` itself, using the same
handlers as a deployment. The key stays on the server and is never sent to
the browser. Without it, the app uses built-in explanations and hints.

## Test it
Run everything (the same checks as the pre-commit hook):
```bash
scripts/check-all.sh
```
It runs pytest with Hypothesis, the Node tests, the typechecks, the
vitest component and accessibility tests, the production build, and a bundle
size check. It ends with "All checks green."

Optional live AI checks (they use your free quota):
```bash
GEMINI_API_KEY=your-key node --test api/live.check.mjs
```

## Build for production
```bash
npm --prefix frontend run build
```
The static site is written to `frontend/dist/`. `api/explain.ts` and
`api/help.ts` export Web-standard `POST` handlers meant to run as serverless
functions; set `GEMINI_API_KEY` in the host's environment.

## Project layout
| Path | What it is |
|---|---|
| `frontend/src/pages/` | Home, the problem list, a problem page, Your code, My sessions |
| `frontend/src/visualizer/` | The Code Visualizer, its control bar, and the logic that picks a view for each algorithm |
| `frontend/src/components/` | The editor, the code view, data-structure views, help |
| `frontend/src/py/` | `tracer.py` (records each step) and `practice.py` (checks, counterexample search) |
| `frontend/src/worker/` | Runs Pyodide in a Web Worker |
| `frontend/src/explain/` | Step explanations (English and Spanish) and the AI client |
| `api/` | Serverless handlers for the AI explanations and help |
| `shared/practice/` | Problem data and reference solutions |
| `shared/fixtures/` | Recorded runs, shown before Python has loaded |
| `tests/` | Python tests, including Hypothesis property tests |
| `.kiro/` | Kiro specs, steering docs and agent hooks |
| `docs/` | `PROGRESS.md` (the stage log) and `KIRO_WRITEUP.md` |

## Adding a problem
Follow the checklist in `.kiro/steering/problems.md`. Tests come first, and
the expected answers come from running the reference solution.

## How it was built
See `docs/KIRO_WRITEUP.md` for how Kiro was used (specs, hooks, steering),
and `docs/PROGRESS.md` for every stage and the tests written first for it.
