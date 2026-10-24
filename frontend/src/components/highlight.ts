// A small Python syntax highlighter for the editor and the step-by-step code
// view. It only colors text (keywords purple, strings green, ...); it never
// changes it, so each line's tokens join back to exactly that line.

export type TokenKind = "keyword" | "function" | "class" | "builtin" | "constant" | "self" | "string" | "number" | "comment";
export type Token = { text: string; kind: TokenKind | null };

const KEYWORDS = new Set(
  (
    "and as assert async await break class continue def del elif else except finally for from global if import in is " +
    "lambda nonlocal not or pass raise return try while with yield"
  ).split(" "),
);
const CONSTANTS = new Set(["True", "False", "None"]);
const SELF = new Set(["self", "cls"]);
const BUILTINS = new Set(
  (
    "abs all any bool chr dict divmod enumerate filter float frozenset input int isinstance iter len list map max min " +
    "next object ord pow print range reversed round set sorted str sum super tuple type zip deque defaultdict heapq"
  ).split(" "),
);

const STRING_START = /^(?:[rRbBuUfF]{1,2})?("""|'''|"|')/;
const NUMBER = /^(?:0[xX][\da-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d+)?[jJ]?|\.\d[\d_]*(?:[eE][+-]?\d+)?[jJ]?)/;
const NAME = /^[A-Za-z_À-￿][\wÀ-￿]*/;

/** Where a string that opens at `from` with `quote` ends (exclusive). */
function stringEnd(src: string, from: number, quote: string): number {
  const triple = quote.length === 3;
  let i = from;
  while (i < src.length) {
    const c = src[i]!;
    if (c === "\\") {
      i += 2;
      continue;
    }
    if (!triple && c === "\n") return i; // an unclosed string stops at the line end
    if (src.startsWith(quote, i)) return i + quote.length;
    i++;
  }
  return src.length;
}

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  // Runs of plain punctuation and spaces share a token; names never merge.
  const push = (text: string, kind: TokenKind | null, merge = false) => {
    const last = out[out.length - 1];
    if (merge && last && last.kind === null && !NAME.test(last.text)) last.text += text;
    else out.push({ text, kind });
  };
  let definer: "def" | "class" | null = null; // the keyword whose name comes next
  let i = 0;
  while (i < src.length) {
    const rest = src.slice(i, i + 400);
    const c = src[i]!;
    if (c === "#") {
      const end = src.indexOf("\n", i);
      const stop = end < 0 ? src.length : end;
      push(src.slice(i, stop), "comment");
      i = stop;
      continue;
    }
    const str = STRING_START.exec(rest);
    if (str) {
      const end = stringEnd(src, i + str[0].length, str[1]!);
      push(src.slice(i, end), "string");
      i = end;
      definer = null;
      continue;
    }
    const name = NAME.exec(rest);
    if (name) {
      const word = name[0];
      let kind: TokenKind | null;
      if (definer) kind = definer === "def" ? "function" : "class";
      else if (KEYWORDS.has(word)) kind = "keyword";
      else if (CONSTANTS.has(word)) kind = "constant";
      else if (SELF.has(word)) kind = "self";
      else if (BUILTINS.has(word)) kind = "builtin";
      else if (/^[A-Z]/.test(word)) kind = "class";
      else if (/^\s*\(/.test(src.slice(i + word.length, i + word.length + 40))) kind = "function";
      else kind = null;
      definer = word === "def" || word === "class" ? word : null;
      push(word, kind);
      i += word.length;
      continue;
    }
    const num = NUMBER.exec(rest);
    if (num) {
      push(num[0], "number");
      i += num[0].length;
      definer = null;
      continue;
    }
    if (c !== " " && c !== "\t") definer = null;
    push(c, null, true);
    i++;
  }
  return out;
}

/** The source's lines (split on "\n", CRLF normalized), each as colored tokens. */
export function highlightPython(source: string): Token[][] {
  const src = source.replace(/\r\n?/g, "\n");
  const lines: Token[][] = [[]];
  for (const tok of tokenize(src)) {
    tok.text.split("\n").forEach((part, k) => {
      if (k > 0) lines.push([]);
      if (part) lines[lines.length - 1]!.push({ text: part, kind: tok.kind });
    });
  }
  return lines;
}
