import { useMemo, useState } from "react";
import type { TraceResult, TraceStep } from "../types/trace";
import { explainStep, type Lang } from "../explain";
import CallStack from "./CallStack";
import { sourceLines } from "./CodeView";
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

export type Stepper = {
  steps: TraceStep[];
  /** The shown step's index (0-based). */
  i: number;
  step: TraceStep | undefined;
  /** True while the slider is moving, so the narrator waits for it to settle. */
  scrubbing: boolean;
  goTo: (n: number, fromScrubber?: boolean) => void;
};

/** Which step of a practice run is shown. Starts at step 1 whenever `traceId` changes.
 *  The page owns it, so the code panel and the step-through panel show the same step. */
export function useStepper(trace: TraceResult | null, traceId: string | null): Stepper {
  const steps = useMemo(() => (trace ? trace.steps.map(hideSolutionSelf) : []), [trace]);
  const [state, setState] = useState({ traceId, index: 0, scrubbing: false });
  const current = state.traceId === traceId ? state : { traceId, index: 0, scrubbing: false };
  const i = Math.min(current.index, Math.max(0, steps.length - 1));
  return {
    steps,
    i,
    step: steps[i],
    scrubbing: current.scrubbing,
    goTo: (n, fromScrubber = false) =>
      setState({ traceId, index: Math.max(0, Math.min(steps.length - 1, n)), scrubbing: fromScrubber }),
  };
}

type Props = {
  /** "Your solution" or "Correct solution". */
  label: string;
  /** The program that was traced (the solution plus the visible driver). */
  program: string;
  trace: TraceResult;
  lang: Lang;
  /** Changes whenever a new trace is shown, so per-trace state resets. */
  traceId: string;
  stepper: Stepper;
  /** Left/Right arrows step this run; only the run on screen listens. */
  active: boolean;
};

// One run you can step through: controls, what is happening, data
// structures, variables, call stack and output. The code with the next line
// is shown by the page next to it (see ProblemPage).
export default function StepViewer({ label, program, trace, lang, traceId, stepper, active }: Props) {
  const { steps, i, step, scrubbing, goTo } = stepper;
  const prevStep = useMemo(() => previousInFrame(steps, i), [steps, i]);
  const structures = useMemo(() => (step ? structuresFor(step.locals, prevStep?.locals) : []), [step, prevStep]);
  const names = useMemo(() => variableNames(steps), [steps]);
  const heap = step?.heap ?? {};
  const lineText = step ? (sourceLines(program)[step.line - 1] ?? "") : "";
  const template = step ? explainStep(i > 0 ? steps[i - 1] : undefined, step, lang, program) : undefined;

  return (
    <section className="viewer" aria-label={`${label}'s run`}>
      <h3 className="viewer-title">{label}'s run</h3>
      {!step ? (
        <p className="empty">{trace.message ?? "This run recorded no steps."}</p>
      ) : (
        <>
          <Timeline index={i} total={steps.length} onIndexChange={(n) => goTo(n)} globalKeys={active} />
          <Scrubber index={i} total={steps.length} line={step.line} onScrub={(n) => goTo(n, true)} />
          <JumpToChange key={traceId} steps={steps} index={i} names={names} onJump={(n) => goTo(n)} />
          {trace.message && <p className="hint">{trace.message}</p>}
          <h4 className="subheading">What is happening</h4>
          <Explanation steps={steps} index={i} lang={lang} code={program} codeHash={trace.codeHash} traceId={traceId} />
          <DataStructures items={structures} locals={step.locals} heap={heap} line={lineText} frames={framesOf(step)} />
          <h4 className="subheading">Variables</h4>
          <Variables current={step.locals} previous={prevStep?.locals} heap={heap} prevHeap={prevStep?.heap ?? {}} />
          <CallStack step={step} />
          <h4 className="subheading">Output so far</h4>
          {step.stdout ? <pre className="output">{step.stdout}</pre> : <p className="empty">Nothing printed yet.</p>}
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
