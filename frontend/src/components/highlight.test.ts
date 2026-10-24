import { describe, expect, it } from "vitest";
import { lessons } from "../lessons";
import { highlightPython, type Token } from "./highlight";

const refs = import.meta.glob("../../../shared/practice/*.py", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

/** The tokens of one line as "kind:text" (plain text as just "text"), whitespace dropped. */
function show(line: Token[]): string[] {
  return line.filter((t) => t.text.trim() !== "").map((t) => (t.kind ? `${t.kind}:${t.text.trim()}` : t.text.trim()));
}

const last = <T,>(xs: T[]): T | undefined => xs[xs.length - 1];
const kindOf = (source: string, text: string, line = 0) => highlightPython(source)[line]!.find((t) => t.text === text)?.kind;

describe("highlightPython", () => {
  it("keeps every character: each line's tokens join back to the line", () => {
    const sources = [...lessons.map((l) => l.source), ...Object.values(refs), "s = '''a\n# not a comment\nb'''\nx = 1  # done\n", ""];
    for (const src of sources) {
      const lines = highlightPython(src);
      expect(lines.map((l) => l.map((t) => t.text).join(""))).toEqual(src.replace(/\r\n?/g, "\n").split("\n"));
    }
  });

  it("colors loops, branches and other keywords as keywords", () => {
    expect(show(highlightPython("for n in numbers:")[0]!)).toEqual(["keyword:for", "n", "keyword:in", "numbers", ":"]);
    expect(kindOf("while lo < hi:", "while")).toBe("keyword");
    for (const kw of ["if", "elif", "else", "return", "break", "continue", "not", "and", "or", "pass", "import", "from", "lambda"]) {
      expect(kindOf(`${kw} x`, kw), kw).toBe("keyword");
    }
  });

  it("marks def and class, and the names they define", () => {
    const src = "class Solution:\n    def twoSum(self, nums: List[int], target: int) -> List[int]:\n";
    const [cls, fn] = highlightPython(src);
    expect(show(cls!)).toEqual(["keyword:class", "class:Solution", ":"]);
    expect(show(fn!).slice(0, 4)).toEqual(["keyword:def", "function:twoSum", "(", "self:self"]);
    expect(kindOf(src, "List", 1)).toBe("class");
    expect(kindOf(src, "int", 1)).toBe("builtin");
  });

  it("colors calls: built-ins as built-ins, other calls as functions", () => {
    const line = "for i, v in enumerate(nums): print(len(seen), helper(v))";
    expect(kindOf(line, "enumerate")).toBe("builtin");
    expect(kindOf(line, "print")).toBe("builtin");
    expect(kindOf(line, "len")).toBe("builtin");
    expect(kindOf(line, "helper")).toBe("function");
    expect(kindOf(line, "nums")).toBeNull();
  });

  it("colors strings, numbers, constants and comments", () => {
    const line = `x = f"a#b" + 'it\\'s' + 3.5 + 1_000 + 0x1f + x1  # note`;
    const kinds = show(highlightPython(line)[0]!);
    expect(kinds).toContain(`string:f"a#b"`);
    expect(kinds).toContain(`string:'it\\'s'`);
    expect(kinds).toContain("number:3.5");
    expect(kinds).toContain("number:1_000");
    expect(kinds).toContain("number:0x1f");
    expect(kinds).toContain("x1"); // a digit inside a name is not a number
    expect(last(kinds)).toBe("comment:# note");
    expect(kindOf("seen = None or True or False", "None")).toBe("constant");
    expect(kindOf("seen = None or True or False", "True")).toBe("constant");
  });

  it("keeps a triple-quoted string a string across lines", () => {
    const lines = highlightPython('s = """one\n# two\nthree""" + x');
    expect(last(lines[0]!)).toEqual({ text: '"""one', kind: "string" });
    expect(lines[1]).toEqual([{ text: "# two", kind: "string" }]);
    expect(lines[2]![0]).toEqual({ text: 'three"""', kind: "string" });
    expect(kindOf('s = """one\n# two\nthree""" + x', "x", 2)).toBeNull();
  });

  it("an unclosed string ends at the end of its line", () => {
    const lines = highlightPython('s = "oops\nx = 2');
    expect(last(lines[0]!)).toEqual({ text: '"oops', kind: "string" });
    expect(kindOf('s = "oops\nx = 2', "2", 1)).toBe("number");
  });
});
