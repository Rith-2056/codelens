import type { TraceStep } from "../types/trace";
import { sourceLines } from "./CodeView";
import { lineLabel } from "./stepInfo";

type Props = {
  source: string;
  step: TraceStep | undefined;
  index: number; // 0-based
  total: number;
  explanation?: string; // deterministic template text for this step
  lang?: string; // language of the explanation
};

export function narration({ source, step, index, total }: Props): string {
  if (!step) return "";
  const code = (sourceLines(source)[step.line - 1] ?? "").trim();
  const where = code ? `line ${step.line}, ${code}` : `line ${step.line}`;
  const error = step.error ? ` ${step.error.type}.` : "";
  // Avoid a stray period after code that already ends in ":" etc.
  const end = /[.:;,]$/.test(where) ? "" : ".";
  return `Step ${index + 1} of ${total}. ${lineLabel(step)}: ${where}${end}${error}`;
}

// Screen-reader narration of each step. The region stays mounted so that every
// change to its text is announced politely. It is empty when there is no
// trace; the app's status region explains why.
export default function Narrator(props: Props) {
  return (
    <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
      {narration(props)}
      {props.step && props.explanation ? (
        <span lang={props.lang}> {props.explanation}</span>
      ) : null}
    </div>
  );
}
