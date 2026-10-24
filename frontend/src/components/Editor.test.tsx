// The editor behaves like a code editor: brackets and quotes pair up, Tab
// indents, Enter keeps the indentation. (autoPair.test.ts covers every rule.)
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import Editor from "./Editor";

function Harness({ initial }: { initial: string }) {
  const [code, setCode] = useState(initial);
  return (
    <>
      <h2 id="h">Your solution</h2>
      <Editor code={code} onChange={setCode} labelId="h" />
    </>
  );
}

const box = () => screen.getByRole("textbox", { name: "Your solution" }) as HTMLTextAreaElement;
const frame = () => new Promise((r) => requestAnimationFrame(() => r(null)));
async function type(key: string) {
  fireEvent.keyDown(box(), { key });
  await frame();
}
function caretAt(n: number) {
  box().focus();
  box().setSelectionRange(n, n);
}

afterEach(cleanup);

describe("Editor", () => {
  it("adds the closing bracket and puts the caret inside", async () => {
    render(<Harness initial="print" />);
    caretAt(5);
    await type("(");
    expect(box().value).toBe("print()");
    expect(box().selectionStart).toBe(6);
    await type(")"); // steps over the one that is already there
    expect(box().value).toBe("print()");
    expect(box().selectionStart).toBe(7);
  });

  it("Backspace in an empty pair removes both; Enter in braces opens an indented line", async () => {
    render(<Harness initial={"seen = {}"} />);
    caretAt(8);
    await type("Enter");
    expect(box().value).toBe("seen = {\n    \n}");
    expect(box().selectionStart).toBe(13);
    cleanup();
    render(<Harness initial="x = []" />);
    caretAt(5);
    await type("Backspace");
    expect(box().value).toBe("x = ");
  });

  it("keeps the old behaviors: Enter after a colon indents one level", async () => {
    render(<Harness initial={"for x in nums:"} />);
    caretAt(14);
    await type("Enter");
    expect(box().value).toBe("for x in nums:\n    ");
  });
});
