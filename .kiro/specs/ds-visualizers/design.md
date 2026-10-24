# Design: ds-visualizers

## Overview
Four pieces, one per workstream:
- **Contract v2** (integrator): `frontend/src/types/trace.ts` gains `objects`,
  `stack`, and `version`.
- **Tracer v2** (trace-engineer): `frontend/src/py/tracer.py` snapshots
  containers and student-defined objects by reference, records the call stack,
  and raises MAX_STEPS to 2000.
- **Visualizers** (ui-builder): `frontend/src/components/visualizers/` draws
  each structure, chosen from the data.
- **Explanations** (explainer): `frontend/src/explain/` describes structure
  changes and owns the shared object helpers the UI also uses.

Why a contract change: running the six Level 2 lessons through the v1 tracer
(with MAX_STEPS raised to 2000) produces the right output, but the structures
the lessons are about become placeholders: `seen` in the hash-map lesson (int
keys), `seen` in the set lesson, and `graph`, `visited`, `queue`, and every
`TreeNode`. v1 also copies containers by value, so it cannot show that two
names share one list, and a step only holds the current frame, so recursion has
no call stack.

## Contract v2
Additive to v1, except that container and object values become refs.

```ts
export type JsonValue =
  | null | boolean | number | string | JsonValue[] | { [k: string]: JsonValue };

/** A snapshot value is a primitive, a placeholder {"__type__": name}, or a ref {"__ref__": id}. */
export type Ref = { __ref__: string };

export type ObjectSnapshot =
  | { kind: "list" | "tuple" | "set" | "deque"; type: string; len: number; items: JsonValue[] }
  | { kind: "dict"; type: string; len: number; entries: [JsonValue, JsonValue][] }
  | { kind: "object"; type: string; fields: Record<string, JsonValue> };

export type StackFrame = {
  frameId: string;
  functionName: string;
  line: number;
  depth: number;
  locals: Record<string, JsonValue>;
};

export type TraceStep = {
  // all v1 fields, unchanged:
  index: number; line: number; event: "call" | "line" | "return" | "exception";
  functionName: string; frameId: string; depth: number;
  locals: Record<string, JsonValue>; stdout: string;
  returnValue?: JsonValue; error?: { type: string; message: string };
  // v2:
  objects: Record<string, ObjectSnapshot>; // everything reachable from locals, stack, returnValue
  stack: StackFrame[];                      // calling user frames, outermost first; excludes the current frame
};

export type TraceResult = {
  steps: TraceStep[];
  status: "ok" | "error" | "limit" | "timeout";
  message?: string;
  truncated: boolean;
  codeHash: string;
  version: 2;
};
```

Notes:
- `type` is the Python type name (`"list"`, `"frozenset"`, `"deque"`,
  `"TreeNode"`). `kind` is what the UI switches on.
- `len` is the real length. If `items`/`entries` are shorter, the container
  was cut at MAX_ITEMS.
- Dict keys are snapshot values, so int keys (`{4: 0}`) stay numbers. This is
  why `entries` is a list of pairs, not a JSON object.
- Placeholders keep their v1 shape. The v1 `__len__` placeholder for long
  containers is no longer produced.
- The worker's timeout result (`traceClient.ts`) must add `version: 2` in the
  same commit as the type change, or the contract-guard typecheck fails.

## Tracer v2

### Object model
- **Ids:** one table per run maps `id(obj) → "o<n>"` in first-seen order. The
  tracer keeps a reference to every object in the table until the run ends,
  so a Python `id` is never reused for a different object during the run.
- **Traversal per step:** `stack` frames (outermost first, each frame's locals
  in insertion order), then the current frame's locals, then `returnValue`.
  Inside a container, visit items in their own order. Each object is
  snapshotted at most once per step, so cycles terminate.
- **Kinds (exact type checks only):**

| Python value | Snapshot |
|---|---|
| `None`, `bool`, `int` (abs ≤ 2**53), finite `float`, `str` (≤ MAX_STR_LEN chars) | inline, as in v1 |
| `list`, `tuple` | ref → `{kind: "list"/"tuple", items}` |
| `dict` | ref → `{kind: "dict", entries}` (keys and values are snapshot values) |
| `set`, `frozenset` | ref → `{kind: "set", items}`, primitives sorted by (rank, value) with numbers < strings < others, non-primitives after them in iteration order |
| `collections.deque` | ref → `{kind: "deque", items}` (front first) |
| instance of a class whose `__module__` is `"__main__"` and that passes the safety check | ref → `{kind: "object", fields}` |
| functions, classes, modules, generators, other objects, anything over a cap | placeholder `{"__type__": name}` |

- **Safety check for student-defined objects:** read the class's own
  `__dict__` mapping (never attribute lookup). Reject the class if any class in
  its MRO other than `object` defines `__getattribute__`, `__getattr__`, or
  `__slots__`, or if the first `__dict__` entry found by walking the MRO
  (each class's own `__dict__` mapping) is not a
  `types.GetSetDescriptorType`, which a student `__dict__` property would be. Read the instance dict with
  `object.__getattribute__(obj, "__dict__")`, require exact type `dict`, and
  keep `str` keys not starting with `__`.
- **Set order:** sort keys use only exact primitive types, so sorting never
  calls student code, and the order is the same under any `PYTHONHASHSEED`.

### Stack
For each step, walk `frame.f_back` through user frames that the tracer has
state for, and emit them outermost first with their v1 frame state and a locals
snapshot. The module frame is the first entry whenever the current frame is a
function.

### Caps

| Name | Value | Notes |
|---|---|---|
| MAX_STEPS | 2000 | was 300 |
| MAX_ITEMS | 20 | per container; was 10 |
| MAX_STR_LEN | 200 | unchanged |
| MAX_OBJECTS | 60 | per step; further objects become placeholders |
| STDOUT_BYTE_CAP | 4000 | unchanged |
| STEP_BYTE_CAP | 16000 | now covers `objects` and `stack` |
| TRACE_BYTE_CAP | 3,000,000 | compact JSON of the whole result |

- **Step byte cap fallback, in order:** empty the stack frames' locals; cut
  every object to its first 5 items; then turn every ref into a placeholder
  and empty `objects`; then the v1 stages.
- **Trace byte cap:** keep a running byte count. When the next step would
  exceed it, stop with status `"limit"`, `truncated: true`, and the message
  "Stopped because this run made too much data to show. Try a smaller input."
- **Limit message:** "Stopped after {len(steps)} steps. Is there a loop that
  never ends?" This fixes the v1 mismatch where the message said 300 but the
  trace held 299 steps. The reserved slot for the terminal exception step
  stays.

## Level 2 lessons
Sources must match byte for byte in `frontend/src/lessons.ts` and
`frontend/src/py/gen_fixtures.py`. Each file ends with a newline. Step counts
were measured with the current (v1) tracer; v2 only changes snapshots, so the
counts should not change.

| id | Title (en / es) | Pattern | Steps | Prints |
|---|---|---|---|---|
| `pair-sum` | Pair that adds up / Pareja que suma | Hash map | 20 | `[1, 2]` |
| `any-repeats` | Any repeats? / ¿Hay repetidos? | Set | 19 | `True` |
| `sorted-pair` | Pair in a sorted list / Pareja en una lista ordenada | Two pointers | 33 | `[4, 6]` |
| `network-hops` | Hops through a network / Saltos en una red | BFS | 61 | `{'A': 0, 'B': 1, 'C': 1, 'D': 2, 'E': 3}` |
| `tree-height` | How tall is the tree? / ¿Qué tan alto es el árbol? | Recursion on a binary tree | 104 | `4` |
| `stairs` | Ways up the stairs / Formas de subir la escalera | 1D dynamic programming | 18 | `13` |

Problem statements (ours; English text also in `docs/plan.md`):

1. **pair-sum.**
   - en: You have a list of numbers and a target number. Find the positions of
     two different numbers that add up to the target. You can assume exactly
     one pair works.
   - es: Tienes una lista de números y un número objetivo. Encuentra las
     posiciones de dos números distintos que sumen el objetivo. Puedes suponer
     que hay exactamente un par que funciona.
2. **any-repeats.**
   - en: You have a list of numbers. Find out whether any number shows up more
     than once.
   - es: Tienes una lista de números. Averigua si algún número aparece más de
     una vez.
3. **sorted-pair.**
   - en: The numbers are sorted from smallest to largest. Find two of them that
     add up to the target by starting one pointer at each end and moving the
     pointers toward each other.
   - es: Los números están ordenados de menor a mayor. Encuentra dos que sumen
     el objetivo: empieza con un puntero en cada extremo y acércalos entre sí.
4. **network-hops.**
   - en: People in a small network are connected as friends. Starting from one
     person, find how many friend-to-friend hops it takes to reach each other
     person.
   - es: Las personas de una pequeña red están conectadas como amigas.
     Empezando por una persona, averigua cuántos saltos de amigo en amigo hacen
     falta para llegar a cada una de las demás.
5. **tree-height.**
   - en: A tree starts at one root node, and each node can have a left child
     and a right child. Find how many nodes are on the longest path from the
     root down to the bottom.
   - es: Un árbol empieza en un nodo raíz, y cada nodo puede tener un hijo
     izquierdo y un hijo derecho. Averigua cuántos nodos hay en el camino más
     largo desde la raíz hasta abajo.
6. **stairs.**
   - en: You climb a staircase by taking either 1 or 2 steps at a time. Count
     how many different ways you can reach the top of a staircase with n steps.
   - es: Subes una escalera dando pasos de 1 o de 2 escalones. Cuenta de
     cuántas formas distintas puedes llegar arriba de una escalera de n
     escalones.

```python
# pair-sum
nums = [4, 9, 2, 7]
target = 11
seen = {}
answer = None
for i, n in enumerate(nums):
    need = target - n
    if need in seen:
        answer = [seen[need], i]
        break
    seen[n] = i
print(answer)
```

```python
# any-repeats
nums = [5, 1, 8, 1, 3]
seen = set()
has_repeat = False
for n in nums:
    if n in seen:
        has_repeat = True
        break
    seen.add(n)
print(has_repeat)
```

```python
# sorted-pair
nums = [1, 3, 4, 6, 8, 11]
target = 10
left = 0
right = len(nums) - 1
pair = None
while left < right:
    total = nums[left] + nums[right]
    if total == target:
        pair = [nums[left], nums[right]]
        break
    elif total < target:
        left += 1
    else:
        right -= 1
print(pair)
```

```python
# network-hops
from collections import deque

graph = {
    "A": ["B", "C"],
    "B": ["A", "D"],
    "C": ["A", "D"],
    "D": ["B", "C", "E"],
    "E": ["D"],
}
visited = {"A"}
queue = deque(["A"])
hops = {"A": 0}
while queue:
    person = queue.popleft()
    for friend in graph[person]:
        if friend not in visited:
            visited.add(friend)
            hops[friend] = hops[person] + 1
            queue.append(friend)
print(hops)
```

```python
# tree-height
class TreeNode:
    def __init__(self, val, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right


def max_depth(node):
    if node is None:
        return 0
    left = max_depth(node.left)
    right = max_depth(node.right)
    return 1 + max(left, right)


root = TreeNode(1, TreeNode(2, TreeNode(4)), TreeNode(3, None, TreeNode(5, TreeNode(6))))
print(max_depth(root))
```

```python
# stairs
n = 6
ways = [0] * (n + 1)
ways[0] = 1
ways[1] = 1
for i in range(2, n + 1):
    ways[i] = ways[i - 1] + ways[i - 2]
print(ways[n])
```

`lessons.ts` gains `level: 1 | 2`, `pattern?: string`, and
`statement?: { en: string; es: string }`.

## Shared object helpers (explainer owns, UI imports)
`frontend/src/explain/objects.ts`, pure functions:
- `isRef(v)` and `resolve(v, objects)`
- `describeShort(v, objects, lang)`, e.g. "dict with 2 keys" or
  "TreeNode(val=2)"
- `diffObjects(prev, curr)`, which returns changes per id: key added, value
  changed, set item added or removed, list item changed at an index, deque push
  or pop at the front or back, field changed

The UI's change markers and the explanation templates use the same diff, so
they always agree.

## Visualizers
`frontend/src/components/visualizers/`. A **Data structures** panel under the
variable table shows one visualizer for each local in the current frame whose
value is a ref, in local order. A second name for the same object shows "same
object as `x`" instead of drawing it again. Detection works on the data alone:

| Visualizer | Chosen when | Shows | Change markers |
|---|---|---|---|
| Graph | a dict with ≥ 2 entries whose keys are primitives and whose every value is a list, tuple, or set holding only keys of that dict | nodes and edges (SVG, circular layout in key order) | per-node text badges taken from other locals: "visited" (in a set local), "in queue" (in a deque local), "← person" (a local equal to the key) |
| Hash map | any other dict | key \| value table | "added", `old → new` |
| Set | kind `set` | sorted chips | "added", "removed" |
| Queue | kind `deque` | strip with "front" and "back" labels | "added at back", "removed from front" (and the reverse) |
| Array | list or tuple of primitives | indexed cells (wave 1), plus pointer markers | `old → new` per cell. Pointer markers: an int local in the same frame whose name appears inside `<listname>[...]` in the source and whose value is a valid index gets an arrow labeled with its name (`left`, `right`, `i`). On the highlighted line, `name[v ± k]` gets a "used by next line" marker. |
| Tree | student objects with `left` and `right` fields that are `None` or refs to objects of the same type | layered SVG tree; label = `val` field, else the first primitive field | nodes referenced by the current frame or any stack frame get a text badge (`node in max_depth`) |
| Call stack | `stack` is non-empty | frames outermost first, each with its locals (refs as `describeShort`), current frame marked "running" | "called", "returned <value>" |
| Fallback | anything else | type name plus fields or items as a list | `old → new` |

Accessibility:
- Each SVG visualizer has a text alternative, visible or behind a "Show as
  text" toggle:
  - Graph: an adjacency list with the badges.
  - Tree: a nested list.
  - Call stack: an ordered list.
- The narrator adds the top structure change for the step from `diffObjects`.
- No animation is required. Any transition is disabled under
  `prefers-reduced-motion`.

## Explanations
- New template cases, in English and Spanish, built from `diffObjects`:
  - key added
  - value changed
  - set add/remove
  - list item changed
  - deque push/pop at either end
  - object field set
  - recursive call ("max_depth calls itself again on the left child")
  - recursive return
- Templates use only values present in prev/curr and their objects, and never
  state stack depth as a number.
- `inventedNumbers` sources now include object items, entries, fields, `len`,
  and stack locals. Object ids, `index`, and `depth` stay excluded.
- `/api/explain`:
  - sends `objects` and `stack` to the LLM
  - removes stack locals first if the payload cap is reached
  - keeps MAX_PAYLOAD_BYTES at 40000, which fits two STEP_BYTE_CAP steps

## Rollout
1. Task 1 lands the types, plus the one-line `version: 2` in `traceClient.ts`,
   in a single change so the contract-guard typecheck passes. The tracer still
   emits v1 at this point; nothing reads `version` yet.
2. Tasks 2–3 (tracer, fixtures) and 4–7 (explainer, UI) are built in parallel
   against the regenerated fixtures. They merge together, so the app never
   shows raw refs.
3. Task 8 runs acceptance and a11y checks on the merged result.

## Testing
**Tracer:**
- unit tests per kind
- aliasing (two names, one ref)
- cycles
- id stability across steps
- set order identical across `PYTHONHASHSEED` values (subprocess runs)
- hostile classes (`__getattribute__`, `__eq__`, `__hash__`, a `__dict__`
  property, `__slots__`) are never invoked and become placeholders
- each cap and its `truncated` flag
- `while True` limit under 2 s

**Properties:** Hypothesis (a)–(e) under v2, plus "every ref resolves within
its step". The program strategy adds dict/set/list mutation and one small
class.

**Fixtures:** `gen_fixtures.py --check` covers nine lessons. The Pyodide check
compares all nine with CPython byte for byte and times each one.

**UI and explainer:** pure functions (detection, layout, `diffObjects`,
templates) get `node --test` suites, as in waves 1 and 2. The UI is checked in
the browser against the acceptance tests in `docs/plan.md`.

## Risks
- **Pyodide speed:** snapshotting objects on every step costs up to
  MAX_OBJECTS × MAX_ITEMS per step.
  - Measure a 2000-step loop that mutates a 20-item list and dict.
  - If it doesn't fit in the 3 s timeout, either reuse unchanged snapshots
    (compare shallow contents) or raise TRACE_TIMEOUT_MS. That decision belongs
    to trace-engineer and integrator.
- **Trace size:** 2000 steps can be several MB, which matters for the worker
  message and memory on Chromebooks. TRACE_BYTE_CAP bounds it.
- **Detection on student code:** heuristics can misfire on students' own
  solutions. The fallback view is always correct, so prefer the fallback over a
  wrong diagram.
- **Contract break:** v2 changes what `locals` values mean. Everything that
  reads values (Variables, Arrays, change markers, explainer, number check,
  fixtures) moves to v2 in the same merge.
