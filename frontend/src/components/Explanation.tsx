import { useEffect, useState } from "react";
import type { TraceStep } from "../types/trace";
import { explainStep, type Lang } from "../explain";
import { fetchExplanation, type Explanation as Fetched } from "../explain/client";
import { sourceLines } from "./CodeView";

type Props = {
  steps: readonly TraceStep[];
  index: number;
  lang: Lang;
  code: string; // the source the trace came from
  codeHash: string;
  traceId: number; // changes whenever a different trace is shown
};

// Wait this long on a step before asking the server, so holding an arrow key
// does not send a request per step.
const FETCH_DELAY_MS = 250;

// The source lines numbered prev.line and curr.line (or just curr.line), with
// up to 2 lines of context on each side, clamped to the program.
export function codeSlice(code: string, prev: TraceStep | undefined, curr: TraceStep): string {
  const lines = sourceLines(code);
  const wanted = new Set<number>();
  for (const line of prev ? [prev.line, curr.line] : [curr.line]) {
    for (let n = line - 2; n <= line + 2; n++) {
      if (n >= 1 && n <= lines.length) wanted.add(n);
    }
  }
  return [...wanted]
    .sort((a, b) => a - b)
    .map((n) => lines[n - 1] ?? "")
    .join("\n");
}

const SOURCE_LABEL: Record<Lang, Record<Fetched["source"], string>> = {
  en: { template: "Built-in explanation", llm: "AI tutor, checked against your trace" },
  es: { template: "Explicación integrada", llm: "Tutor de IA, comprobado con tu ejecución" },
};

// Not a live region: the Narrator already reads the template text for each
// step, so swapping in the AI text later is not announced a second time.
export default function Explanation({ steps, index, lang, code, codeHash, traceId }: Props) {
  const curr = steps[index];
  const prev = index > 0 ? steps[index - 1] : undefined;
  const key = `${traceId}:${index}:${lang}`;
  const [fetched, setFetched] = useState<{ key: string; value: Fetched } | null>(null);

  useEffect(() => {
    if (!curr) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetchExplanation(prev, curr, lang, codeSlice(code, prev, curr), {
        codeHash,
        stepIndex: index,
        signal: controller.signal,
      }).then(
        (value) => {
          // Only swap if the student is still on this trace, step and language.
          if (!controller.signal.aborted) setFetched({ key, value });
        },
        () => {}, // never rejects by contract; ignore just in case
      );
    }, FETCH_DELAY_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
    // `key` covers traceId, index and lang; the other inputs follow from them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!curr) return null;
  const current = fetched && fetched.key === key ? fetched.value : null;
  const text = current?.text ?? explainStep(prev, curr, lang);
  const source = current?.source ?? "template";

  return (
    <div className="explanation" lang={lang}>
      <p className="explanation-text">{text}</p>
      <p className="explanation-source">{SOURCE_LABEL[lang][source]}</p>
    </div>
  );
}
