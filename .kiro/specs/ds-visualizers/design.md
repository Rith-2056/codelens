# Design: ds-visualizers

## Overview
Four pieces, one per workstream:
- **Contract** (integrator, done): frozen version 2026-10-24 in
  `frontend/src/types/trace.ts`. It adds the tagged `__set`, `__dict`,
  `__deque`, and `__ref` values, plus `heap` and `stack` on every step.
- **Tracer** (trace-engineer): `frontend/src/py/tracer.py` emits those forms,
  fills `heap` and `stack`, and raises MAX_STEPS to 2000.
- **Visualizers** (ui-builder): `frontend/src/components/visualizers/` draws
  each structure, chosen from the data.
- **Explanations** (explainer): `frontend/src/explain/` describes structure
  changes and owns the shared value helpers the UI also uses.

Why the contract changed: we ran the six Level 2 lessons through the old
tracer with MAX_STEPS raised to 2000. They print the right output, but the
structures the lessons are about become placeholders:
- `seen` in the hash-map lesson (int keys)
- `seen` in the set lesson
- `graph`, `visited`, and `queue` in the BFS lesson
- every `TreeNode`

A step also held only the current frame, so recursion had no call stack.

## Contract (frozen, version 2026-10-24)
The source of truth is `frontend/src/types/trace.ts`, mirrored in
`.kiro/steering/tech.md`. Summary:

```ts
type JsonValue = null | boolean | number | string | JsonValue[] | { [k: string]: JsonValue };

type SetValue   = { __set: JsonValue[] };               // sorted when possible
type DictValue  = { __dict: [JsonValue, JsonValue][] }; // insertion order, non-string keys kept
type DequeValue = { __deque: JsonValue[] };             // front first
type RefValue   = { __ref: string };                    // points into heap

type HeapObject = { id: string; type: string; fields: Record<string, JsonValue> };
type StackFrame = { functionName: string; frameId: string; line: number; locals: Record<string, JsonValue> };

// TraceStep keeps every earlier field; locals stays the current frame's locals.
// New on every step:
//   heap: Record<string, HeapObject>;
//   stack: StackFrame[];   // all active user frames, outermost first; last = current frame
```

How Python values map to snapshot values:

| Python value | Snapshot value |
|---|---|
| `None`, `bool`, `int` (abs ≤ 2**53), finite `float`, `str` (≤ MAX_STR_LEN chars) | inline primitive, as before |
| `list`, `tuple` | JSON array of snapshot values |
| `dict` | `{"__dict": [[k, v], ...]}` in insertion order; keys are snapshot values, so `{4: 0}` stays `[[4, 0]]` |
| `set`, `frozenset` | `{"__set": [...]}`, sorted when possible (see below) |
| `collections.deque` | `{"__deque": [...]}`, front first |
| instance of a student-defined class that passes the safety check | `{"__ref": "o1"}`, with `heap["o1"] = {id: "o1", type: "TreeNode", fields: {...}}` |
| container with more than MAX_ITEMS items | `{"__type__": "<name>", "__len__": n}` |
| functions, classes, modules, generators, unsafe objects, anything over a cap | `{"__type__": "<name>"}` |

What this means for consumers:
- **Copied by value:** lists, dicts, sets, and deques are copied at each step.
  Two names bound to one list show as two equal arrays. Only heap objects have
  identity.
- **Nested inline:** containers nest inside each other (the BFS graph is a
  `__dict` whose values are arrays), so nesting and self-containing
  containers need caps.
- **No plain-object dicts:** a dict is always a `__dict`. A plain JSON object
  in a snapshot is therefore always a tagged value or a placeholder.
- **No version field:** consumers tell shapes apart by their tags. `heap` and
  `stack` are required on every step, possibly empty. The worker's timeout
  result has `steps: []`, so it needed no change.
- **Fixtures:** `shared/fixtures/loop.json` already has the new shape (empty
  `heap` and `stack` on every step). `branch.json` and `function.json` are
  regenerated in task 3; `function.json` gets a non-empty `stack` inside
  `add`.

## Tracer

### Values
- Use exact type checks only, as in the table.
- **Nesting:** containers inside containers are written inline up to
  MAX_NEST_DEPTH (4). Anything deeper becomes a placeholder.
- **Cycles:** a container that is already on the current serialization path
  becomes a placeholder.
- **Over MAX_ITEMS:** a container becomes the `__len__` placeholder.
- In all three cases, `truncated` is set.
- **Set order:** sort when every item is an exact primitive, or a tuple of
  exact primitives. Use a key of (rank, value), with ranks None < bool <
  number < str, compared element by element for tuples. Sorting then never
  calls student code, and the order is the same under any `PYTHONHASHSEED`.
  Otherwise keep iteration order ("sorted when possible").
- **Dict keys** are snapshot values (primitives, tuples as arrays). A key that
  can't be shown becomes a placeholder.

### Heap
- **Ids:** one table per run maps `id(obj) → "o<n>"` in first-seen order. The
  tracer keeps a reference to every object in the table until the run ends,
  so a Python `id` is never reused for another object mid-run, and an object
  keeps its id across steps.
- **What goes in:** each step's `heap` holds every heap object reachable from
  the stack locals (outermost first), the current locals, `returnValue`, and
  other heap objects' fields, visited in that order. Objects that refer to
  each other just use refs.
- **Cap:** at most MAX_HEAP_OBJECTS (200) per step. Further objects become
  placeholders, and `truncated` is set.
- **Safety check for student-defined objects:**
  - The class's `__module__`, read from its own `__dict__` mapping, must be
    `"__main__"`.
  - Reject the class if any class in its MRO other than `object` defines
    `__getattribute__`, `__getattr__`, or `__slots__`.
  - Reject it if the first `__dict__` entry found by walking the MRO (each
    class's own `__dict__` mapping) is not a `types.GetSetDescriptorType`,
    which a student `__dict__` property would be.
  - Read the instance dict with `object.__getattribute__(obj, "__dict__")`,
    require exact type `dict`, and keep `str` keys that don't start with `__`
    as `fields`.

### Stack
For each step, walk `frame.f_back` through user frames that the tracer has
state for. Emit them outermost first as `{functionName, frameId, line,
locals}`, with line `f_lineno or 1`, clamped to the program. The current frame
is the last entry (its locals equal `TraceStep.locals`), so `len(stack)` is the
number of active user frames and equals `TraceStep.depth + 1`.

### Caps

| Name | Value | Notes |
|---|---|---|
| MAX_STEPS | 2000 | was 300 |
| MAX_ITEMS | 20 | per container; was 10 |
| MAX_STR_LEN | 200 | unchanged |
| MAX_NEST_DEPTH | 4 | inline container nesting |
| MAX_HEAP_OBJECTS | 200 | per step |
| STDOUT_BYTE_CAP | 4000 | unchanged |
| STEP_BYTE_CAP | 16000 | now covers `heap` and `stack` |
| TRACE_BYTE_CAP | 3,000,000 | compact JSON of the whole result |

- **Step byte cap fallback**, in this order:
  1. empty the stack frames' locals
  2. replace each heap object's fields with placeholders
  3. replace every value in locals with its placeholder, then empty `heap`
     (refs are gone by then, so nothing dangles)
  4. the earlier stdout stage
- **Trace byte cap:** keep a running byte count. When the next step would
  exceed it, stop with status `"limit"`, `truncated: true`, and the message
  "Stopped because this run made too much data to show. Try a smaller input."
- **Limit message:** "Stopped after {len(steps)} steps. Is there a loop that
  never ends?" This fixes the old mismatch where the message said 300 but the
  trace held 299 steps. The reserved slot for the terminal exception step
  stays.

## Level 2 lessons
Sources must match byte for byte in `frontend/src/lessons.ts` and
`frontend/src/py/gen_fixtures.py`. Each file ends with a newline. Step counts
were measured with the tracer before the contract change. The new value forms
only change snapshots, so the counts should not change.

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

## Shared value helpers (explainer owns, UI imports)
`frontend/src/explain/snapshot.ts`, pure functions:
- `kindOf(v)` returns `"primitive" | "placeholder" | "array" | "set" | "dict"
  | "deque" | "ref"`.
- `resolveRef(v, heap)` and `describeShort(v, heap, lang)`, e.g. "dict with 2
  keys" or "TreeNode(val=2)".
- `diffValue(prev, curr)` compares one variable's value across two steps:
  - dict key added, changed, or removed
  - set item added or removed
  - array item changed at an index
  - deque push or pop at the front or back
- `diffHeap(prevHeap, currHeap)` reports field changes per heap id.

Containers are matched by variable name in the same frame; heap objects are
matched by id. The UI's change markers and the explanation templates use the
same helpers, so they always agree.

## Visualizers
`frontend/src/components/visualizers/`. A **Data structures** panel under the
variable table shows one visualizer per local in the current frame whose value
is a tagged value, a ref, or an array, in local order. A second name for the
same heap object shows "same object as `x`" instead of drawing it again.
Detection works on the data alone:

| Visualizer | Chosen when | Shows | Change markers |
|---|---|---|---|
| Graph | a `__dict` with ≥ 2 entries whose keys are primitives and whose every value is an array or `__set` holding only keys of that dict | nodes and edges (SVG, circular layout in key order) | per-node text badges taken from other locals: "visited" (in a `__set` local), "in queue" (in a `__deque` local), "← person" (a local equal to the key) |
| Hash map | any other `__dict` | key \| value table | "added", `old → new`, "removed" |
| Set | `__set` | chips in snapshot order | "added", "removed" |
| Queue | `__deque` | strip with "front" and "back" labels | "added at back", "removed from front" (and the reverse) |
| Array | array of primitives | indexed cells, plus pointer markers | `old → new` per cell. Pointer markers: an int local in the same frame named `i`, `j`, `k`, `l`, `r`, `lo`, `hi`, `left`, `right`, `mid`, `start`, `end`, `slow`, or `fast` whose value is a valid index of the array gets an arrow under that cell, labeled with its name. |
| Grid | an array whose items are all arrays of primitives (a 2D list, e.g. a DP table) | table of cells with row and column indexes | `old → new` per cell |
| Tree | heap objects with `left` and `right` fields that are `null` or refs to heap objects of the same `type` | layered SVG tree; label = `val` field, else the first primitive field | nodes referenced by the current locals or any stack frame get a text badge (`node in max_depth`) |
| Call stack | always (the module frame is always there) | one card per frame, outermost at the bottom, current frame on top and highlighted, each with its locals (refs as `describeShort`) | "called", "returned <value>" |
| Fallback | anything else (nested arrays, heap objects that aren't trees, placeholders) | type name plus items or fields as a list | `old → new` |

Accessibility:
- Each SVG visualizer has a text alternative, visible or behind a "Show as
  text" toggle:
  - Graph: an adjacency list with the badges.
  - Tree: a nested list.
  - Call stack: an ordered list.
- The narrator adds the top structure change for the step.
- No animation is required. Any transition is disabled under
  `prefers-reduced-motion`.

## Explanations
- New template cases, in English and Spanish, built from `diffValue` and
  `diffHeap`:
  - dict key added or changed
  - set add/remove
  - array item changed
  - deque push/pop at either end
  - heap object field set
  - recursive call ("max_depth calls itself again on the left child")
  - recursive return
- Templates use only values present in prev/curr, their heaps, and their
  stacks, and never state stack depth as a number.
- `inventedNumbers` already walks arrays, so it covers tagged values. Its
  sources now also include heap fields and stack locals. Heap ids, `index`,
  and `depth` stay excluded.
- `/api/explain`:
  - sends `heap` and `stack` to the LLM
  - removes stack locals first if the payload cap is reached
  - keeps MAX_PAYLOAD_BYTES at 40000, which fits two STEP_BYTE_CAP steps

## Rollout
1. **Task 1 is done.** `trace.ts`, `tech.md`, and `loop.json` have the new
   shape, and typecheck passes. The tracer still emits the old shape, so until
   task 2 lands:
   - `test_loop_lesson_equals_fixture` and `test_lesson_equals_fixture[loop]`
     fail
   - `gen_fixtures.py --check` and `pyodide-check.mjs` report loop as out of
     date
2. **Task 2 changes dicts** from plain JSON objects to `__dict`. Wave-1/2 code
   renders a plain object as key/value pairs, so a student dict would show a
   single `__dict` key. Tasks 2, 3, 4 and 5 merge together, so the app never
   shows raw tags.
3. **Tasks 6–7** add the visualizers on top. Task 8 checks acceptance and
   a11y on the merged result.

## Testing
**Tracer:**
- unit tests for each value form
- nesting and cycle caps
- dict key order and int keys
- heap id stability across steps
- shared refs between two names
- objects that reference each other
- set order identical across `PYTHONHASHSEED` values (subprocess runs)
- hostile classes (`__getattribute__`, `__eq__`, `__hash__`, a `__dict__`
  property, `__slots__`) are never invoked and become placeholders
- stack order, with the current frame last
- each cap and its `truncated` flag
- `while True` limit under 2 s

**Properties:** Hypothesis (a)–(e) under the new contract, plus "every ref
resolves within its step". The program strategy adds dict/set/list mutation
and one small class.

**Fixtures:** `gen_fixtures.py --check` covers nine lessons. The Pyodide check
compares all nine with CPython byte for byte and times each one.

**UI and explainer:** pure functions (detection, layout, `diffValue`,
`diffHeap`, templates) get `node --test` suites, as in waves 1 and 2. The UI
is checked in the browser against the acceptance tests in `docs/plan.md`.

## Risks
- **List aliasing isn't visible.** Containers are copied by value, so
  `b = a; b.append(1)` shows two lists that both changed, with no "same
  list" marker. Showing it would need a contract change; the Level 2 lessons
  don't depend on it.
- **Pyodide speed:** containers are serialized inline on every step.
  - Measure a 2000-step loop that mutates a 20-item list and dict.
  - If it doesn't fit in the 3 s timeout, either cache unchanged snapshots
    (compare shallow contents) or raise TRACE_TIMEOUT_MS. That decision
    belongs to trace-engineer and integrator.
- **Trace size:** 2000 steps can be several MB, which matters for the worker
  message and memory on Chromebooks. TRACE_BYTE_CAP bounds it.
- **Detection on student code:** heuristics can misfire on students' own
  solutions. The fallback view is always correct, so prefer the fallback over a
  wrong diagram.
- **Dict shape change:** every reader of dict values (Variables, Arrays,
  change markers, explainer values and number check) moves to `__dict` in the
  same merge as task 2.
