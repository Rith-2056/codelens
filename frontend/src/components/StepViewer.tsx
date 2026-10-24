import { useMemo, useState, type KeyboardEvent } from "react";
import type { TraceResult } from "../types/trace";
import { explainStep, type Lang } from "../explain";
import CallStack from "./CallStack";
import CodeView, { sourceLines } from "./CodeView";
import DataStructures from "./DataStructures";
import Explanation from "./Explanation";
import JumpToChange from "./JumpToChange";
import Narrator from "./Narrator";
import Scrubber from "./Scrubber";
import Timeline from "./Timeline";
import Variables from "./Variables";
import { variableNames } from "./jump";
import { hideSolutionSelf } from "./practiceView";
import { previousInFrame } from "./stepInfo";
import { framesOf, structuresFor, topStructureChange } from "./structures";

type Props = {
  /** "Your solution" or "Correct solution". */
  label: string;
  /** The program that was traced (the solution plus the visible driver). */
  program: string;
  trace: TraceResult;
  lang: Lang;
  /** Changes whenever a new trace is shown, so per-trace state resets. */
  traceId: string;
};

// One run you can step through: code with the next line, controls, variables,
// data structures, call stack, output and an explanation. A page can show two
// side by side, so arrow keys step only the viewer that has keyboard focus.
export default function StepViewer({ label, program, trace, lang, traceId }: Props) {
  const steps = useMemo(() => trace.steps.map(hideSolutionSelf), [trace]);
  const [index, setIndex] = useState(0);
  const [scrubbing, setScrubbing] = useState(false);
  const i = Math.min(index, Math.max(0, steps.length - 1));
  const step = steps[i];
  const prevStep = useMemo(() => previousInFrame(steps, i), [steps, i]);
  const structures = useMemo(() => (step ? structuresFor(step.locals, prevStep?.locals) : []), [step, prevStep]);
  const names = useMemo(() => variableNames(steps), [steps]);
  const heap = step?.heap ?? {};
  const lineText = step ? (sourceLines(program)[step.line - 1] ?? "") : "";
  const template = step ? explainStep(i > 0 ? steps[i - 1] : undefined, step, lang, program) : undefined;

  function goTo(n: number, fromScrubber = false) {
    setScrubbing(fromScrubber);
    setIndex(Math.max(0, Math.min(steps.length - 1, n)));
  }

  function onKeyDown(e: KeyboardEvent<HTMLElement>) {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const t = e.target as Element;
    if (t.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])")) return;
    e.preventDefault();
    goTo(i + (e.key === "ArrowLeft" ? -1 : 1));
  }

  return (
    <section className="viewer panel" aria-label={`${label}'s run`} onKeyDown={onKeyDown}>
      <h3 className="viewer-title">{label}</h3>
      {!step ? (
        <p className="empty">{trace.message ?? "This run recorded no steps."}</p>
      ) : (
        <>
          <CodeView source={program} step={step} />
          <Timeline index={i} total={steps.length} onIndexChange={(n) => goTo(n)} globalKeys={false} />
          <Scrubber index={i} total={steps.length} line={step.line} onScrub={(n) => goTo(n, true)} />
          <JumpToChange key={traceId} steps={steps} index={i} names={names} onJump={(n) => goTo(n)} />
          {trace.message && <p className="hint">{trace.message}</p>}
          <h4 className="subheading">Variables</h4>
          <Variables current={step.locals} previous={prevStep?.locals} heap={heap} prevHeap={prevStep?.heap ?? {}} />
          <DataStructures items={structures} locals={step.locals} heap={heap} line={lineText} frames={framesOf(step)} />
          <CallStack step={step} />
          <h4 className="subheading">Output so far</h4>
          {step.stdout ? <pre className="output">{step.stdout}</pre> : <p className="empty">Nothing printed yet.</p>}
          <h4 className="subheading">What is happening</h4>
          <Explanation steps={steps} index={i} lang={lang} code={program} codeHash={trace.codeHash} traceId={traceId} />
          <Narrator
            source={program}
            step={step}
            index={i}
            total={steps.length}
            explanation={template}
            lang={lang}
            structureNote={topStructureChange(structures, heap)}
            delayMs={scrubbing ? 600 : 0}
          />
        </>
      )}
    </section>
  );
}
