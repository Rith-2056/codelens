import { forwardRef, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { highlightPython } from "./highlight";
import Highlighted from "./Highlighted";

type Props = {
  code: string;
  onChange: (code: string) => void;
  labelId: string; // id of the visible heading that names the editor
};

const INDENT = "    ";

// Insert text at the cursor. execCommand keeps the browser's undo history and
// fires a normal input event; the fallback updates React state directly.
function insertText(el: HTMLTextAreaElement, text: string, onChange: (v: string) => void) {
  el.focus();
  let ok = false;
  try {
    ok = document.execCommand("insertText", false, text);
  } catch {
    ok = false;
  }
  if (!ok) {
    const { selectionStart: s, selectionEnd: e, value } = el;
    const next = value.slice(0, s) + text + value.slice(e);
    onChange(next);
    requestAnimationFrame(() => {
      el.selectionStart = el.selectionEnd = s + text.length;
    });
  }
}

// A plain, accessible code editor: a monospace <textarea> with a line-number
// gutter. Tab indents; Esc then Tab (or Shift+Tab) leaves the field, so the
// keyboard is never trapped. Syntax colors come from a copy of the code drawn
// under the textarea (whose own text is transparent); screen readers and
// forced-colors mode use the textarea's text.
const Editor = forwardRef<HTMLTextAreaElement, Props>(function Editor(
  { code, onChange, labelId },
  ref,
) {
  const gutterRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLPreElement>(null);
  const colored = useMemo(() => highlightPython(code), [code]);
  const [tabEscapes, setTabEscapes] = useState(false);
  const lineCount = code.split("\n").length;

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    const el = e.currentTarget;
    if (e.key === "Escape") {
      setTabEscapes(true);
      return;
    }
    if (e.key === "Tab") {
      if (tabEscapes || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) {
        setTabEscapes(false);
        return; // let the browser move focus
      }
      e.preventDefault();
      insertText(el, INDENT, onChange);
      return;
    }
    if (tabEscapes) setTabEscapes(false);
    if (e.key === "Enter" && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey) {
      // Keep the current line's indentation, one level deeper after ":".
      const before = el.value.slice(0, el.selectionStart);
      const line = before.slice(before.lastIndexOf("\n") + 1);
      const indent = /^[ \t]*/.exec(line)?.[0] ?? "";
      const extra = /:\s*$/.test(line) ? INDENT : "";
      if (indent || extra) {
        e.preventDefault();
        insertText(el, "\n" + indent + extra, onChange);
      }
    }
  }

  return (
    <div className="editor">
      <div className="editor-gutter" ref={gutterRef} aria-hidden="true">
        {Array.from({ length: lineCount }, (_, i) => (
          <div key={i}>{i + 1}</div>
        ))}
      </div>
      <div className="editor-field">
        <pre className="editor-highlight" ref={layerRef} aria-hidden="true">
          {colored.map((line, k) => (
            <span key={k}>
              {k > 0 && "\n"}
              <Highlighted tokens={line} />
            </span>
          ))}
          {/* keeps a last empty line as tall as the textarea's */ " "}
        </pre>
        <textarea
          ref={ref}
          className="editor-input"
          value={code}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => setTabEscapes(false)}
          onScroll={(e) => {
            const { scrollTop, scrollLeft } = e.currentTarget;
            if (gutterRef.current) gutterRef.current.scrollTop = scrollTop;
            if (layerRef.current) {
              layerRef.current.scrollTop = scrollTop;
              layerRef.current.scrollLeft = scrollLeft;
            }
          }}
          aria-labelledby={labelId}
          aria-describedby="editor-help"
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          autoCorrect="off"
          wrap="off"
          rows={Math.min(Math.max(lineCount, 8), 20)}
        />
      </div>
      <p id="editor-help" className="hint editor-help">
        {tabEscapes
          ? "Press Tab now to leave the editor."
          : "Tab adds 4 spaces. To leave the editor, press Esc, then Tab."}
      </p>
    </div>
  );
});

export default Editor;
