import { useEffect, useMemo, useRef } from "react";
import type { TraceStep } from "../types/trace";
import { highlightPython } from "./highlight";
import Highlighted from "./Highlighted";
import { scrollBox } from "./scrollBox";
import { lineLabel } from "./stepInfo";

type Props = {
  source: string;
  step: TraceStep | undefined;
  /** Small labels on other lines, e.g. the loop header: "loop, pass 2". */
  marks?: ReadonlyMap<number, string>;
  /** Scroll the next line into view as the steps move (the visualizer's code panel). */
  follow?: boolean;
};

export function sourceLines(source: string): string[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

// Read-only code with line numbers. The current step's line carries a text
// label ("Next line to run"), so the highlight never relies on color alone.
// Syntax colors are decoration; the text is the same with or without them.
export default function CodeView({ source, step, marks, follow = false }: Props) {
  const lines = sourceLines(source);
  const colored = useMemo(() => highlightPython(source), [source]);
  const boxRef = useRef<HTMLDivElement>(null);
  const line = step?.line;
  useEffect(() => {
    if (!follow || line === undefined) return;
    const el = boxRef.current?.querySelector<HTMLElement>("[aria-current='step']");
    el?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [follow, line]);
  const label = step ? lineLabel(step) : "";
  const isError = step?.event === "exception";
  return (
    <div className="code-view" ref={boxRef} {...scrollBox("Program code")}>
      <ol className="code-lines">
        {lines.map((text, i) => {
          const n = i + 1;
          const current = step !== undefined && step.line === n;
          const cls = current
            ? `code-line current${isError ? " error" : ""}`
            : "code-line";
          return (
            <li
              key={n}
              className={cls}
              aria-current={current ? "step" : undefined}
            >
              <span className="gutter" aria-hidden="true">
                {current ? "▶" : ""}
              </span>
              <span className="ln">
                <span className="sr-only">Line </span>
                {n}
              </span>
              <code className="code-text">{text === "" ? " " : <Highlighted tokens={colored[i] ?? []} />}</code>
              {!current && marks?.has(n) && <span className="line-mark">{marks.get(n)}</span>}
              {current && <span className="line-label">{label}</span>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
