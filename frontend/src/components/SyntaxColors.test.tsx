// The editor and the step-by-step code view color Python syntax. The colors
// are decoration only: screen readers get the plain text, and the editor is
// still a normal labeled textarea.
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import CodeView from "./CodeView";
import Editor from "./Editor";
import type { TraceStep } from "../types/trace";

const SRC = "def f(n):\n    for i in range(n):  # loop\n        print('hi', i)\n";

describe("Editor syntax colors", () => {
  it("draws colored code under the textarea, hidden from screen readers", () => {
    const { container, rerender } = render(
      <>
        <h2 id="h">Your solution</h2>
        <Editor code={SRC} onChange={() => {}} labelId="h" />
      </>,
    );
    const box = screen.getByRole("textbox", { name: "Your solution" }) as HTMLTextAreaElement;
    expect(box.value).toBe(SRC);
    const layer = container.querySelector(".editor-highlight")!;
    expect(layer.getAttribute("aria-hidden")).toBe("true");
    expect(layer.textContent).toBe(SRC + " "); // a trailing space keeps the last empty line's height
    const kw = [...layer.querySelectorAll(".tok-keyword")].map((e) => e.textContent);
    expect(kw).toEqual(["def", "for", "in"]);
    expect(layer.querySelector(".tok-function")?.textContent).toBe("f");
    expect(layer.querySelector(".tok-comment")?.textContent).toBe("# loop");
    expect(layer.querySelector(".tok-string")?.textContent).toBe("'hi'");

    rerender(
      <>
        <h2 id="h">Your solution</h2>
        <Editor code={"while x:\n"} onChange={() => {}} labelId="h" />
      </>,
    );
    expect(container.querySelector(".editor-highlight .tok-keyword")?.textContent).toBe("while");
  });
});

describe("CodeView syntax colors", () => {
  const step = { line: 2, event: "line" } as TraceStep;

  it("colors each line and keeps its text and the next-line label", () => {
    render(<CodeView source={SRC} step={step} />);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(3);
    const current = items[1]!;
    expect(current.getAttribute("aria-current")).toBe("step");
    const code = current.querySelector("code")!;
    expect(code.textContent).toBe("    for i in range(n):  # loop");
    expect([...code.querySelectorAll(".tok-keyword")].map((e) => e.textContent)).toEqual(["for", "in"]);
    expect(code.querySelector(".tok-builtin")?.textContent).toBe("range");
    expect(current.textContent).toMatch(/Next line to run/);
  });
});
