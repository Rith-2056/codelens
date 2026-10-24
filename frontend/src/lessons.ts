import type { TraceResult } from "./types/trace";
// `?raw` gives the file's text as a string (typed by vite/client), so this
// works without `resolveJsonModule`.
import loopFixtureText from "../../shared/fixtures/loop.json?raw";
import branchFixtureText from "../../shared/fixtures/branch.json?raw";
import functionFixtureText from "../../shared/fixtures/function.json?raw";
import pairSumFixtureText from "../../shared/fixtures/pair-sum.json?raw";
import anyRepeatsFixtureText from "../../shared/fixtures/any-repeats.json?raw";
import sortedPairFixtureText from "../../shared/fixtures/sorted-pair.json?raw";
import networkHopsFixtureText from "../../shared/fixtures/network-hops.json?raw";
import treeHeightFixtureText from "../../shared/fixtures/tree-height.json?raw";
import stairsFixtureText from "../../shared/fixtures/stairs.json?raw";

export type LessonId =
  | "loop"
  | "branch"
  | "function"
  | "pair-sum"
  | "any-repeats"
  | "sorted-pair"
  | "network-hops"
  | "tree-height"
  | "stairs";

export type Lesson = {
  id: LessonId;
  title: string; // shown as the code panel heading
  short: string; // shown on the lesson picker button
  // Must match the source the fixture was traced from byte for byte
  // (trailing newline included), so the codeHash matches.
  source: string;
  fixture: TraceResult; // precomputed trace, shown before Python has loaded
  level: 1 | 2; // the picker groups lessons by level
  pattern?: string; // Level 2: the technique the lesson teaches, e.g. "Hash map"
  statement?: { en: string; es: string }; // Level 2: the problem statement
};

function parseFixture(name: string, text: string): TraceResult {
  const data: unknown = JSON.parse(text);
  if (
    typeof data !== "object" ||
    data === null ||
    !Array.isArray((data as { steps?: unknown }).steps)
  ) {
    throw new Error(`Fixture ${name} is not a TraceResult`);
  }
  return data as TraceResult;
}

export const loopLesson: Lesson = {
  id: "loop",
  title: "Loop: adding up a list",
  short: "Loop",
  source: "numbers = [3, 1, 2]\ntotal = 0\nfor n in numbers:\n    total += n\n",
  level: 1,
  fixture: parseFixture("loop.json", loopFixtureText),
};

export const branchLesson: Lesson = {
  id: "branch",
  title: "Branch: choosing with if / else",
  short: "Branch",
  source:
    'temperature = 30\nif temperature > 25:\n    advice = "Wear a T-shirt"\nelse:\n    advice = "Bring a jacket"\nprint(advice)\n',
  level: 1,
  fixture: parseFixture("branch.json", branchFixtureText),
};

export const functionLesson: Lesson = {
  id: "function",
  title: "Function: calling add(a, b)",
  short: "Function",
  source:
    "def add(a, b):\n    result = a + b\n    return result\n\ntotal = add(2, 3)\nprint(total)\n",
  level: 1,
  fixture: parseFixture("function.json", functionFixtureText),
};

// Level 2: interview patterns. Sources, titles, and statements come from
// .kiro/specs/ds-visualizers/design.md; each source must match
// frontend/src/py/gen_fixtures.py byte for byte.

export const pairSumLesson: Lesson = {
  id: "pair-sum",
  title: "Pair that adds up",
  short: "Pair that adds up",
  level: 2,
  pattern: "Hash map",
  statement: {
    en: "You have a list of numbers and a target number. Find the positions of two different numbers that add up to the target. You can assume exactly one pair works.",
    es: "Tienes una lista de números y un número objetivo. Encuentra las posiciones de dos números distintos que sumen el objetivo. Puedes suponer que hay exactamente un par que funciona.",
  },
  source:
    "nums = [4, 9, 2, 7]\n" +
    "target = 11\n" +
    "seen = {}\n" +
    "answer = None\n" +
    "for i, n in enumerate(nums):\n" +
    "    need = target - n\n" +
    "    if need in seen:\n" +
    "        answer = [seen[need], i]\n" +
    "        break\n" +
    "    seen[n] = i\n" +
    "print(answer)\n",
  fixture: parseFixture("pair-sum.json", pairSumFixtureText),
};

export const anyRepeatsLesson: Lesson = {
  id: "any-repeats",
  title: "Any repeats?",
  short: "Any repeats?",
  level: 2,
  pattern: "Set",
  statement: {
    en: "You have a list of numbers. Find out whether any number shows up more than once.",
    es: "Tienes una lista de números. Averigua si algún número aparece más de una vez.",
  },
  source:
    "nums = [5, 1, 8, 1, 3]\n" +
    "seen = set()\n" +
    "has_repeat = False\n" +
    "for n in nums:\n" +
    "    if n in seen:\n" +
    "        has_repeat = True\n" +
    "        break\n" +
    "    seen.add(n)\n" +
    "print(has_repeat)\n",
  fixture: parseFixture("any-repeats.json", anyRepeatsFixtureText),
};

export const sortedPairLesson: Lesson = {
  id: "sorted-pair",
  title: "Pair in a sorted list",
  short: "Pair in a sorted list",
  level: 2,
  pattern: "Two pointers",
  statement: {
    en: "The numbers are sorted from smallest to largest. Find two of them that add up to the target by starting one pointer at each end and moving the pointers toward each other.",
    es: "Los números están ordenados de menor a mayor. Encuentra dos que sumen el objetivo: empieza con un puntero en cada extremo y acércalos entre sí.",
  },
  source:
    "nums = [1, 3, 4, 6, 8, 11]\n" +
    "target = 10\n" +
    "left = 0\n" +
    "right = len(nums) - 1\n" +
    "pair = None\n" +
    "while left < right:\n" +
    "    total = nums[left] + nums[right]\n" +
    "    if total == target:\n" +
    "        pair = [nums[left], nums[right]]\n" +
    "        break\n" +
    "    elif total < target:\n" +
    "        left += 1\n" +
    "    else:\n" +
    "        right -= 1\n" +
    "print(pair)\n",
  fixture: parseFixture("sorted-pair.json", sortedPairFixtureText),
};

export const networkHopsLesson: Lesson = {
  id: "network-hops",
  title: "Hops through a network",
  short: "Hops through a network",
  level: 2,
  pattern: "BFS",
  statement: {
    en: "People in a small network are connected as friends. Starting from one person, find how many friend-to-friend hops it takes to reach each other person.",
    es: "Las personas de una pequeña red están conectadas como amigas. Empezando por una persona, averigua cuántos saltos de amigo en amigo hacen falta para llegar a cada una de las demás.",
  },
  source:
    "from collections import deque\n" +
    "\n" +
    "graph = {\n" +
    '    "A": ["B", "C"],\n' +
    '    "B": ["A", "D"],\n' +
    '    "C": ["A", "D"],\n' +
    '    "D": ["B", "C", "E"],\n' +
    '    "E": ["D"],\n' +
    "}\n" +
    'visited = {"A"}\n' +
    'queue = deque(["A"])\n' +
    'hops = {"A": 0}\n' +
    "while queue:\n" +
    "    person = queue.popleft()\n" +
    "    for friend in graph[person]:\n" +
    "        if friend not in visited:\n" +
    "            visited.add(friend)\n" +
    "            hops[friend] = hops[person] + 1\n" +
    "            queue.append(friend)\n" +
    "print(hops)\n",
  fixture: parseFixture("network-hops.json", networkHopsFixtureText),
};

export const treeHeightLesson: Lesson = {
  id: "tree-height",
  title: "How tall is the tree?",
  short: "How tall is the tree?",
  level: 2,
  pattern: "Recursion on a binary tree",
  statement: {
    en: "A tree starts at one root node, and each node can have a left child and a right child. Find how many nodes are on the longest path from the root down to the bottom.",
    es: "Un árbol empieza en un nodo raíz, y cada nodo puede tener un hijo izquierdo y un hijo derecho. Averigua cuántos nodos hay en el camino más largo desde la raíz hasta abajo.",
  },
  source:
    "class TreeNode:\n" +
    "    def __init__(self, val, left=None, right=None):\n" +
    "        self.val = val\n" +
    "        self.left = left\n" +
    "        self.right = right\n" +
    "\n" +
    "\n" +
    "def max_depth(node):\n" +
    "    if node is None:\n" +
    "        return 0\n" +
    "    left = max_depth(node.left)\n" +
    "    right = max_depth(node.right)\n" +
    "    return 1 + max(left, right)\n" +
    "\n" +
    "\n" +
    "root = TreeNode(1, TreeNode(2, TreeNode(4)), TreeNode(3, None, TreeNode(5, TreeNode(6))))\n" +
    "print(max_depth(root))\n",
  fixture: parseFixture("tree-height.json", treeHeightFixtureText),
};

export const stairsLesson: Lesson = {
  id: "stairs",
  title: "Ways up the stairs",
  short: "Ways up the stairs",
  level: 2,
  pattern: "1D dynamic programming",
  statement: {
    en: "You climb a staircase by taking either 1 or 2 steps at a time. Count how many different ways you can reach the top of a staircase with n steps.",
    es: "Subes una escalera dando pasos de 1 o de 2 escalones. Cuenta de cuántas formas distintas puedes llegar arriba de una escalera de n escalones.",
  },
  source:
    "n = 6\n" +
    "ways = [0] * (n + 1)\n" +
    "ways[0] = 1\n" +
    "ways[1] = 1\n" +
    "for i in range(2, n + 1):\n" +
    "    ways[i] = ways[i - 1] + ways[i - 2]\n" +
    "print(ways[n])\n",
  fixture: parseFixture("stairs.json", stairsFixtureText),
};

// Level 1 first, then Level 2, each in teaching order.
export const lessons: readonly Lesson[] = [
  loopLesson,
  branchLesson,
  functionLesson,
  pairSumLesson,
  anyRepeatsLesson,
  sortedPairLesson,
  networkHopsLesson,
  treeHeightLesson,
  stairsLesson,
];

export function lessonById(id: LessonId): Lesson {
  return lessons.find((l) => l.id === id) ?? loopLesson;
}
