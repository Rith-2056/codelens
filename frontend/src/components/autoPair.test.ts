// IDE-style brackets and quotes in the editor. `|` marks the caret; `[...]`
// in a case name is a selection.
import { describe, expect, it } from "vitest";
import { autoPair } from "./autoPair";

/** Apply `key` to text with a caret `|` (or a selection between two `|`), and show the result the same way. */
function press(key: string, before: string): string | null {
  const a = before.indexOf("|");
  const b = before.indexOf("|", a + 1);
  const value = before.replace(/\|/g, "");
  const start = a;
  const end = b < 0 ? a : b - 1;
  const r = autoPair(key, value, start, end);
  if (!r) return null;
  const v = r.value;
  return r.selStart === r.selEnd ? v.slice(0, r.selStart) + "|" + v.slice(r.selStart) : v.slice(0, r.selStart) + "|" + v.slice(r.selStart, r.selEnd) + "|" + v.slice(r.selEnd);
}

describe("autoPair", () => {
  it("typing an opening bracket adds the closing one, caret inside", () => {
    expect(press("(", "print|")).toBe("print(|)");
    expect(press("[", "x = |")).toBe("x = [|]");
    expect(press("{", "seen = |\n")).toBe("seen = {|}\n");
    expect(press("[", "f(|)")).toBe("f([|])"); // before a closing bracket
  });

  it("does not pair when the caret is right before a word (you are wrapping it by hand)", () => {
    expect(press("(", "|nums")).toBeNull();
    expect(press("[", "x|y")).toBeNull();
  });

  it("typing a closing bracket that is already there just steps over it", () => {
    expect(press(")", "print(x|)")).toBe("print(x)|");
    expect(press("]", "[1, 2|]")).toBe("[1, 2]|");
    expect(press(")", "print(x|")).toBeNull(); // nothing to step over: type it normally
  });

  it("quotes pair up, step over their closing quote, and never pair after a letter (it's)", () => {
    expect(press('"', "s = |")).toBe('s = "|"');
    expect(press("'", "print(|)")).toBe("print('|')");
    expect(press('"', 's = "abc|"')).toBe('s = "abc"|');
    expect(press("'", "it|")).toBeNull();
  });

  it("with text selected, brackets and quotes wrap it and keep it selected", () => {
    expect(press("(", "x = |a + b|")).toBe("x = (|a + b|)");
    expect(press('"', "|hi|")).toBe('"|hi|"');
  });

  it("Backspace inside an empty pair removes both halves", () => {
    expect(press("Backspace", "print(|)")).toBe("print|");
    expect(press("Backspace", "x = [|]")).toBe("x = |");
    expect(press("Backspace", 's = "|"')).toBe("s = |");
    expect(press("Backspace", "print(x|)")).toBeNull(); // not empty: normal Backspace
    expect(press("Backspace", "x = 1|")).toBeNull(); // end of the text: normal Backspace
  });

  it("Enter between brackets puts the closing one on its own line, indented to match", () => {
    expect(press("Enter", "    seen = {|}")).toBe("    seen = {\n        |\n    }");
    expect(press("Enter", "x = [|]")).toBe("x = [\n    |\n]");
    expect(press("Enter", "x = 1|")).toBeNull(); // the editor's normal Enter handles this
  });

  it("ignores other keys", () => {
    expect(press("a", "x|")).toBeNull();
    expect(press("Tab", "x|")).toBeNull();
  });
});
