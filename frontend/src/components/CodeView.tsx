import { useMemo } from "react";
import type { TraceStep } from "../types/trace";
import { highlightPython } from "./highlight";
import Highlighted from "./Highlighted";
import { scrollBox } from "./scrollBox";
import { lineLabel } from "./stepInfo";

type Props = { source: string; step: TraceStep | undefined };

export function sourceLines(source: string): string[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

// Read-only code with line numbers. The current step's line carries a text
// label ("Next line to run"), so the highlight never relies on color alone.
// Syntax colors are decoration; the text is the same with or without them.
export default function CodeView({ source, step }: Props) {
  const lines = sourceLines(source);
  const colored = useMemo(() => highlightPython(source), [source]);
  const label = step ? lineLabel(step) : "";
  const isError = step?.event === "exception";
  return (
    <div className="code-view" {...scrollBox("Program code")}>
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
              {current && <span className="line-label">{label}</span>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
