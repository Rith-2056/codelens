import type { TraceStep } from "../types/trace";
import { sourceLines } from "./CodeView";
import { lineLabel } from "./stepInfo";

type Props = {
  source: string;
  step: TraceStep | undefined;
  index: number; // 0-based
  total: number;
};

export function narration({ source, step, index, total }: Props): string {
  if (!step) return "There are no steps to show.";
  const code = (sourceLines(source)[step.line - 1] ?? "").trim();
  const where = code ? `line ${step.line}, ${code}` : `line ${step.line}`;
  const error = step.error ? ` ${step.error.type}.` : "";
  // Avoid a stray period after code that already ends in ":" etc.
  const end = /[.:;,]$/.test(where) ? "" : ".";
  return `Step ${index + 1} of ${total}. ${lineLabel(step)}: ${where}${end}${error}`;
}

// Screen-reader narration. The region stays mounted so that every change to
// its text is announced politely.
export default function Narrator(props: Props) {
  return (
    <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
      {narration(props)}
    </div>
  );
}
