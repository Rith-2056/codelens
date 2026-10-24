// The Level 2 practice problems. Titles, numbers, slugs, difficulty and method
// signatures match LeetCode so students practise in the format interviews use.
// The problem statements are our own words (never copied), in English and
// Spanish.

export type Difficulty = "Easy" | "Medium" | "Hard";

export type Problem = {
  slug: string;
  number: number;
  title: string;
  difficulty: Difficulty;
  /** The interview pattern this problem practises. */
  pattern: string;
  /** The method name inside `class Solution`. */
  method: string;
  /** The method's def line, LeetCode-style, without the class line. */
  signature: string;
  statement: { en: string; es: string };
};

export const problems: readonly Problem[] = [
  {
    slug: "two-sum",
    number: 1,
    title: "Two Sum",
    difficulty: "Easy",
    pattern: "Hash map",
    method: "twoSum",
    signature: "def twoSum(self, nums: List[int], target: int) -> List[int]:",
    statement: {
      en: "Given a list of integers nums and an integer target, return the indices of the two different positions whose values add up to target. Exactly one such pair exists, and you may return the two indices in any order.",
      es: "Dada una lista de enteros nums y un entero target, devuelve los índices de las dos posiciones distintas cuyos valores suman target. Siempre existe exactamente un par así, y puedes devolver los dos índices en cualquier orden.",
    },
  },
  {
    slug: "contains-duplicate",
    number: 217,
    title: "Contains Duplicate",
    difficulty: "Easy",
    pattern: "Set",
    method: "containsDuplicate",
    signature: "def containsDuplicate(self, nums: List[int]) -> bool:",
    statement: {
      en: "Given a list of integers nums, return True if some value appears at least twice, and False if every value is different.",
      es: "Dada una lista de enteros nums, devuelve True si algún valor aparece al menos dos veces, y False si todos los valores son distintos.",
    },
  },
  {
    slug: "two-sum-ii-input-array-is-sorted",
    number: 167,
    title: "Two Sum II - Input Array Is Sorted",
    difficulty: "Medium",
    pattern: "Two pointers",
    method: "twoSum",
    signature: "def twoSum(self, numbers: List[int], target: int) -> List[int]:",
    statement: {
      en: "The list numbers is sorted from smallest to largest. Find the two different positions whose values add up to target, and return them counted from 1 (not 0), smaller position first. Exactly one answer exists. Try to use only a constant amount of extra memory.",
      es: "La lista numbers está ordenada de menor a mayor. Encuentra las dos posiciones distintas cuyos valores suman target y devuélvelas contando desde 1 (no desde 0), primero la menor. Siempre existe exactamente una respuesta. Intenta usar solo una cantidad constante de memoria extra.",
    },
  },
  {
    slug: "find-if-path-exists-in-graph",
    number: 1971,
    title: "Find if Path Exists in Graph",
    difficulty: "Easy",
    pattern: "Breadth-first search",
    method: "validPath",
    signature: "def validPath(self, n: int, edges: List[List[int]], source: int, destination: int) -> bool:",
    statement: {
      en: "A graph has n nodes labeled 0 to n - 1, and edges lists its two-way connections as pairs [u, v]. Return True if you can walk from node source to node destination along the edges, and False otherwise.",
      es: "Un grafo tiene n nodos numerados de 0 a n - 1, y edges enumera sus conexiones de doble sentido como pares [u, v]. Devuelve True si puedes ir del nodo source al nodo destination recorriendo las aristas, y False si no.",
    },
  },
  {
    slug: "maximum-depth-of-binary-tree",
    number: 104,
    title: "Maximum Depth of Binary Tree",
    difficulty: "Easy",
    pattern: "Recursion on a tree",
    method: "maxDepth",
    signature: "def maxDepth(self, root: Optional[TreeNode]) -> int:",
    statement: {
      en: "Given the root of a binary tree, return how many nodes lie on the longest path from the root down to a leaf. An empty tree has depth 0.",
      es: "Dada la raíz de un árbol binario, devuelve cuántos nodos hay en el camino más largo desde la raíz hasta una hoja. Un árbol vacío tiene profundidad 0.",
    },
  },
  {
    slug: "climbing-stairs",
    number: 70,
    title: "Climbing Stairs",
    difficulty: "Easy",
    pattern: "1D dynamic programming",
    method: "climbStairs",
    signature: "def climbStairs(self, n: int) -> int:",
    statement: {
      en: "You are climbing a staircase with n steps, and each move climbs either 1 or 2 steps. Return how many different ways you can reach the top.",
      es: "Estás subiendo una escalera de n escalones, y en cada movimiento subes 1 o 2 escalones. Devuelve de cuántas formas distintas puedes llegar arriba.",
    },
  },
];

export function problemBySlug(slug: string): Problem | undefined {
  return problems.find((p) => p.slug === slug);
}
