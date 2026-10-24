import { useEffect, useState } from "react";
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
  structureNote?: string; // the step's top structure change, e.g. "seen: added key 9 with value 1."
  delayMs?: number; // wait this long for the step to settle before speaking (scrubber)
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

type Spoken = { text: string; note: string; explanation: string; lang?: string };

// Screen-reader narration of each step. The region stays mounted so that every
// change to its text is announced politely. It is empty when there is no
// trace; the app's status region explains why. While the step scrubber is
// being dragged, the text only updates once it has settled for delayMs.
export default function Narrator(props: Props) {
  const next: Spoken = {
    text: narration(props),
    // The explanation templates already describe structure changes; the note
    // is only a fallback so the change is never left unspoken.
    note: props.step && props.structureNote && !props.explanation ? props.structureNote : "",
    explanation: props.step && props.explanation ? props.explanation : "",
    lang: props.lang,
  };
  const [shown, setShown] = useState<Spoken>(next);
  const delay = props.delayMs ?? 0;
  const key = `${next.text}\u0000${next.note}\u0000${next.explanation}\u0000${next.lang ?? ""}`;

  useEffect(() => {
    if (delay <= 0) {
      setShown(next);
      return;
    }
    const timer = window.setTimeout(() => setShown(next), delay);
    return () => window.clearTimeout(timer);
    // `key` covers every field of `next`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, delay]);

  return (
    <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
      {shown.text}
      {shown.note ? ` ${shown.note}` : null}
      {shown.explanation ? <span lang={shown.lang}> {shown.explanation}</span> : null}
    </div>
  );
}
