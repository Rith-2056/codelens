// The Level 2 practice problems. Titles, numbers, slugs, difficulty and method
// signatures match LeetCode so students practise in the format interviews use.
// The problem statements are our own words (never copied), in English and
// Spanish. Parameter names and examples come from shared/practice/problems.json,
// the same file the Python harness reads.
import type { JsonValue } from "./types/trace";
import practiceRaw from "../../shared/practice/problems.json?raw";

export type Difficulty = "Easy" | "Medium" | "Hard";

/** Interview patterns, in learning order: the problem list has one section per category. */
export const CATEGORIES = [
  "Arrays & Hashing",
  "Two Pointers",
  "Sliding Window",
  "Binary Search",
  "Stack",
  "Trees",
  "Graphs",
  "Dynamic Programming",
] as const;
export type Category = (typeof CATEGORIES)[number];

export type Example = { args: JsonValue[]; expected: JsonValue };

type PracticeData = { params: string[]; tree_params?: string[]; examples: Example[] };
const practiceData = JSON.parse(practiceRaw) as Record<string, PracticeData>;

type ProblemText = {
  slug: string;
  number: number;
  title: string;
  difficulty: Difficulty;
  /** The interview pattern this problem practises. */
  pattern: string;
  /** The section of the problem list it belongs to. */
  category: Category;
  /** The method name inside `class Solution`. */
  method: string;
  /** The method's def line, LeetCode-style, without the class line. */
  signature: string;
  statement: { en: string; es: string };
};

export type Problem = ProblemText & {
  /** Parameter names, in order. */
  params: readonly string[];
  /** Parameters given as a level-order list and built into a TreeNode. */
  treeParams: readonly string[];
  /** Our own example inputs with their correct answers. */
  examples: readonly Example[];
};

const texts: readonly ProblemText[] = [
  {
    slug: "two-sum",
    number: 1,
    title: "Two Sum",
    difficulty: "Easy",
    pattern: "Hash map",
    category: "Arrays & Hashing",
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
    category: "Arrays & Hashing",
    method: "containsDuplicate",
    signature: "def containsDuplicate(self, nums: List[int]) -> bool:",
    statement: {
      en: "Given a list of integers nums, return True if some value appears at least twice, and False if every value is different.",
      es: "Dada una lista de enteros nums, devuelve True si algún valor aparece al menos dos veces, y False si todos los valores son distintos.",
    },
  },
  {
    slug: "valid-anagram",
    number: 242,
    title: "Valid Anagram",
    difficulty: "Easy",
    pattern: "Counting with a hash map",
    category: "Arrays & Hashing",
    method: "isAnagram",
    signature: "def isAnagram(self, s: str, t: str) -> bool:",
    statement: {
      en: "Given two words s and t, return True if t uses exactly the same letters as s, each the same number of times, just possibly in a different order. Otherwise return False.",
      es: "Dadas dos palabras s y t, devuelve True si t usa exactamente las mismas letras que s, cada una el mismo número de veces, aunque quizá en otro orden. Si no, devuelve False.",
    },
  },
  {
    slug: "product-of-array-except-self",
    number: 238,
    title: "Product of Array Except Self",
    difficulty: "Medium",
    pattern: "Prefix and suffix products",
    category: "Arrays & Hashing",
    method: "productExceptSelf",
    signature: "def productExceptSelf(self, nums: List[int]) -> List[int]:",
    statement: {
      en: "Given a list of integers nums, build a new list where the item at each position is the product of every number in nums except the one at that position. Do it without dividing.",
      es: "Dada una lista de enteros nums, construye una lista nueva donde el elemento de cada posición sea el producto de todos los números de nums menos el de esa posición. Hazlo sin dividir.",
    },
  },
  {
    slug: "squares-of-a-sorted-array",
    number: 977,
    title: "Squares of a Sorted Array",
    difficulty: "Easy",
    pattern: "Two pointers from both ends",
    category: "Two Pointers",
    method: "sortedSquares",
    signature: "def sortedSquares(self, nums: List[int]) -> List[int]:",
    statement: {
      en: "Given a list of integers nums sorted from smallest to largest (it may contain negatives), return the square of every number, also sorted from smallest to largest.",
      es: "Dada una lista de enteros nums ordenada de menor a mayor (puede tener negativos), devuelve el cuadrado de cada número, también ordenados de menor a mayor.",
    },
  },
  {
    slug: "two-sum-ii-input-array-is-sorted",
    number: 167,
    title: "Two Sum II - Input Array Is Sorted",
    difficulty: "Medium",
    pattern: "Two pointers",
    category: "Two Pointers",
    method: "twoSum",
    signature: "def twoSum(self, numbers: List[int], target: int) -> List[int]:",
    statement: {
      en: "The list numbers is sorted from smallest to largest. Find the two different positions whose values add up to target, and return them counted from 1 (not 0), smaller position first. Exactly one answer exists. Try to use only a constant amount of extra memory.",
      es: "La lista numbers está ordenada de menor a mayor. Encuentra las dos posiciones distintas cuyos valores suman target y devuélvelas contando desde 1 (no desde 0), primero la menor. Siempre existe exactamente una respuesta. Intenta usar solo una cantidad constante de memoria extra.",
    },
  },
  {
    slug: "container-with-most-water",
    number: 11,
    title: "Container With Most Water",
    difficulty: "Medium",
    pattern: "Two pointers from both ends",
    category: "Two Pointers",
    method: "maxArea",
    signature: "def maxArea(self, height: List[int]) -> int:",
    statement: {
      en: "Each number in height is a vertical wall standing at that position. Pick two walls: the water they hold is the distance between them times the shorter wall. Return the most water any two walls can hold.",
      es: "Cada número de height es una pared vertical en esa posición. Elige dos paredes: el agua que retienen es la distancia entre ellas por la pared más baja. Devuelve la mayor cantidad de agua que pueden retener dos paredes.",
    },
  },
  {
    slug: "best-time-to-buy-and-sell-stock",
    number: 121,
    title: "Best Time to Buy and Sell Stock",
    difficulty: "Easy",
    pattern: "Sliding window",
    category: "Sliding Window",
    method: "maxProfit",
    signature: "def maxProfit(self, prices: List[int]) -> int:",
    statement: {
      en: "prices[i] is a stock's price on day i. You may buy on one day and sell on a later day. Return the largest profit you can make, or 0 if no trade makes money.",
      es: "prices[i] es el precio de una acción el día i. Puedes comprar un día y vender un día posterior. Devuelve la mayor ganancia posible, o 0 si ninguna operación da ganancia.",
    },
  },
  {
    slug: "maximum-average-subarray-i",
    number: 643,
    title: "Maximum Average Subarray I",
    difficulty: "Easy",
    pattern: "Sliding window",
    category: "Sliding Window",
    method: "findMaxAverage",
    signature: "def findMaxAverage(self, nums: List[int], k: int) -> float:",
    statement: {
      en: "Given a list of integers nums and a whole number k, look at every run of k numbers that sit next to each other. Return the largest average among those runs.",
      es: "Dada una lista de enteros nums y un número entero k, mira cada tramo de k números seguidos. Devuelve el mayor promedio entre esos tramos.",
    },
  },
  {
    slug: "minimum-size-subarray-sum",
    number: 209,
    title: "Minimum Size Subarray Sum",
    difficulty: "Medium",
    pattern: "Sliding window that grows and shrinks",
    category: "Sliding Window",
    method: "minSubArrayLen",
    signature: "def minSubArrayLen(self, target: int, nums: List[int]) -> int:",
    statement: {
      en: "Given a positive integer target and a list of positive integers nums, return the length of the shortest run of numbers next to each other whose sum is at least target, or 0 if there is none.",
      es: "Dado un entero positivo target y una lista de enteros positivos nums, devuelve la longitud del tramo más corto de números seguidos cuya suma sea al menos target, o 0 si no hay ninguno.",
    },
  },
  {
    slug: "binary-search",
    number: 704,
    title: "Binary Search",
    difficulty: "Easy",
    pattern: "Binary search",
    category: "Binary Search",
    method: "search",
    signature: "def search(self, nums: List[int], target: int) -> int:",
    statement: {
      en: "Given a list of different integers nums sorted from smallest to largest, and a number target, return the position of target in nums, or -1 if it is not there. Each check should cut the part you still search in half.",
      es: "Dada una lista de enteros distintos nums ordenada de menor a mayor y un número target, devuelve la posición de target en nums, o -1 si no está. Cada comprobación debe dividir a la mitad la parte en la que sigues buscando.",
    },
  },
  {
    slug: "search-insert-position",
    number: 35,
    title: "Search Insert Position",
    difficulty: "Easy",
    pattern: "Binary search for a position",
    category: "Binary Search",
    method: "searchInsert",
    signature: "def searchInsert(self, nums: List[int], target: int) -> int:",
    statement: {
      en: "Given a list of different integers nums sorted from smallest to largest and a number target, return the position of target if it is in nums, or else the position where it would go to keep the list sorted.",
      es: "Dada una lista de enteros distintos nums ordenada de menor a mayor y un número target, devuelve la posición de target si está en nums, o si no la posición donde iría para que la lista siga ordenada.",
    },
  },
  {
    slug: "find-minimum-in-rotated-sorted-array",
    number: 153,
    title: "Find Minimum in Rotated Sorted Array",
    difficulty: "Medium",
    pattern: "Binary search on a rotated list",
    category: "Binary Search",
    method: "findMin",
    signature: "def findMin(self, nums: List[int]) -> int:",
    statement: {
      en: "A sorted list of different integers was rotated: some numbers from its start were moved, in order, to its end. Given the rotated list nums, return its smallest number, cutting the search in half each time.",
      es: "Una lista ordenada de enteros distintos se rotó: algunos números del principio se movieron, en orden, al final. Dada la lista rotada nums, devuelve su número más pequeño, dividiendo la búsqueda a la mitad cada vez.",
    },
  },
  {
    slug: "valid-parentheses",
    number: 20,
    title: "Valid Parentheses",
    difficulty: "Easy",
    pattern: "Stack of open brackets",
    category: "Stack",
    method: "isValid",
    signature: "def isValid(self, s: str) -> bool:",
    statement: {
      en: "s is made only of the brackets ( ) [ ] { }. Return True if every opening bracket is closed by the same kind of bracket, and in the right order. Otherwise return False.",
      es: "s solo tiene los corchetes ( ) [ ] { }. Devuelve True si cada corchete que abre se cierra con uno del mismo tipo y en el orden correcto. Si no, devuelve False.",
    },
  },
  {
    slug: "daily-temperatures",
    number: 739,
    title: "Daily Temperatures",
    difficulty: "Medium",
    pattern: "Monotonic stack",
    category: "Stack",
    method: "dailyTemperatures",
    signature: "def dailyTemperatures(self, temperatures: List[int]) -> List[int]:",
    statement: {
      en: "temperatures[i] is the temperature on day i. For each day, return how many days you have to wait for a warmer day, or 0 if no warmer day comes.",
      es: "temperatures[i] es la temperatura del día i. Para cada día, devuelve cuántos días hay que esperar a un día más cálido, o 0 si no llega ninguno.",
    },
  },
  {
    slug: "maximum-depth-of-binary-tree",
    number: 104,
    title: "Maximum Depth of Binary Tree",
    difficulty: "Easy",
    pattern: "Recursion on a tree",
    category: "Trees",
    method: "maxDepth",
    signature: "def maxDepth(self, root: Optional[TreeNode]) -> int:",
    statement: {
      en: "Given the root of a binary tree, return how many nodes lie on the longest path from the root down to a leaf. An empty tree has depth 0.",
      es: "Dada la raíz de un árbol binario, devuelve cuántos nodos hay en el camino más largo desde la raíz hasta una hoja. Un árbol vacío tiene profundidad 0.",
    },
  },
  {
    slug: "same-tree",
    number: 100,
    title: "Same Tree",
    difficulty: "Easy",
    pattern: "Recursion on two trees",
    category: "Trees",
    method: "isSameTree",
    signature: "def isSameTree(self, p: Optional[TreeNode], q: Optional[TreeNode]) -> bool:",
    statement: {
      en: "Given the roots of two binary trees p and q, return True if they have exactly the same shape and the same value in every matching node. Otherwise return False.",
      es: "Dadas las raíces de dos árboles binarios p y q, devuelve True si tienen exactamente la misma forma y el mismo valor en cada nodo correspondiente. Si no, devuelve False.",
    },
  },
  {
    slug: "path-sum",
    number: 112,
    title: "Path Sum",
    difficulty: "Easy",
    pattern: "Recursion with a running total",
    category: "Trees",
    method: "hasPathSum",
    signature: "def hasPathSum(self, root: Optional[TreeNode], targetSum: int) -> bool:",
    statement: {
      en: "Given the root of a binary tree and a number targetSum, return True if some path from the root down to a leaf (a node with no children) has values adding up to targetSum.",
      es: "Dada la raíz de un árbol binario y un número targetSum, devuelve True si algún camino desde la raíz hasta una hoja (un nodo sin hijos) tiene valores que suman targetSum.",
    },
  },
  {
    slug: "flood-fill",
    number: 733,
    title: "Flood Fill",
    difficulty: "Easy",
    pattern: "Depth-first search on a grid",
    category: "Graphs",
    method: "floodFill",
    signature: "def floodFill(self, image: List[List[int]], sr: int, sc: int, color: int) -> List[List[int]]:",
    statement: {
      en: "image is a grid of numbers. Starting from the cell at row sr and column sc, change it and every cell connected to it up, down, left or right that has the same starting number to color. Return the grid.",
      es: "image es una cuadrícula de números. Empezando por la celda de la fila sr y la columna sc, cambia a color esa celda y cada celda conectada arriba, abajo, a la izquierda o a la derecha que tenga el mismo número inicial. Devuelve la cuadrícula.",
    },
  },
  {
    slug: "find-if-path-exists-in-graph",
    number: 1971,
    title: "Find if Path Exists in Graph",
    difficulty: "Easy",
    pattern: "Breadth-first search",
    category: "Graphs",
    method: "validPath",
    signature: "def validPath(self, n: int, edges: List[List[int]], source: int, destination: int) -> bool:",
    statement: {
      en: "A graph has n nodes labeled 0 to n - 1, and edges lists its two-way connections as pairs [u, v]. Return True if you can walk from node source to node destination along the edges, and False otherwise.",
      es: "Un grafo tiene n nodos numerados de 0 a n - 1, y edges enumera sus conexiones de doble sentido como pares [u, v]. Devuelve True si puedes ir del nodo source al nodo destination recorriendo las aristas, y False si no.",
    },
  },
  {
    slug: "number-of-islands",
    number: 200,
    title: "Number of Islands",
    difficulty: "Medium",
    pattern: "Flood fill to count islands",
    category: "Graphs",
    method: "numIslands",
    signature: "def numIslands(self, grid: List[List[str]]) -> int:",
    statement: {
      en: "grid is a map where \"1\" is land and \"0\" is water. An island is land cells connected up, down, left or right. Return how many islands there are.",
      es: "grid es un mapa donde \"1\" es tierra y \"0\" es agua. Una isla son celdas de tierra conectadas arriba, abajo, a la izquierda o a la derecha. Devuelve cuántas islas hay.",
    },
  },
  {
    slug: "climbing-stairs",
    number: 70,
    title: "Climbing Stairs",
    difficulty: "Easy",
    pattern: "1D dynamic programming",
    category: "Dynamic Programming",
    method: "climbStairs",
    signature: "def climbStairs(self, n: int) -> int:",
    statement: {
      en: "You are climbing a staircase with n steps, and each move climbs either 1 or 2 steps. Return how many different ways you can reach the top.",
      es: "Estás subiendo una escalera de n escalones, y en cada movimiento subes 1 o 2 escalones. Devuelve de cuántas formas distintas puedes llegar arriba.",
    },
  },
  {
    slug: "min-cost-climbing-stairs",
    number: 746,
    title: "Min Cost Climbing Stairs",
    difficulty: "Easy",
    pattern: "1D dynamic programming",
    category: "Dynamic Programming",
    method: "minCostClimbingStairs",
    signature: "def minCostClimbingStairs(self, cost: List[int]) -> int:",
    statement: {
      en: "cost[i] is what it costs to step on stair i. You start at stair 0 or 1, and after paying for a stair you climb 1 or 2 stairs. Return the least you can pay to get past the last stair.",
      es: "cost[i] es lo que cuesta pisar el escalón i. Empiezas en el escalón 0 o 1, y tras pagar un escalón subes 1 o 2. Devuelve lo mínimo que puedes pagar para pasar el último escalón.",
    },
  },
  {
    slug: "house-robber",
    number: 198,
    title: "House Robber",
    difficulty: "Medium",
    pattern: "1D dynamic programming: take it or skip it",
    category: "Dynamic Programming",
    method: "rob",
    signature: "def rob(self, nums: List[int]) -> int:",
    statement: {
      en: "nums[i] is the money in house i along a street. You may take money from any houses, but never from two houses next to each other. Return the most money you can take.",
      es: "nums[i] es el dinero de la casa i de una calle. Puedes tomar el dinero de cualquier casa, pero nunca de dos casas vecinas. Devuelve el máximo dinero que puedes tomar.",
    },
  },
  {
    slug: "maximum-subarray",
    number: 53,
    title: "Maximum Subarray",
    difficulty: "Medium",
    pattern: "Kadane's algorithm",
    category: "Dynamic Programming",
    method: "maxSubArray",
    signature: "def maxSubArray(self, nums: List[int]) -> int:",
    statement: {
      en: "Given a non-empty list of integers nums, return the largest sum of a run of one or more numbers next to each other.",
      es: "Dada una lista no vacía de enteros nums, devuelve la mayor suma de un tramo de uno o más números seguidos.",
    },
  },
];

export const problems: readonly Problem[] = texts.map((p) => {
  const data = practiceData[p.slug];
  if (!data) throw new Error(`no practice data for ${p.slug}`);
  return { ...p, params: data.params, treeParams: data.tree_params ?? [], examples: data.examples };
});

export function problemBySlug(slug: string): Problem | undefined {
  return problems.find((p) => p.slug === slug);
}
