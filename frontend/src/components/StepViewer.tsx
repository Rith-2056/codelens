import { useMemo, useState } from "react";
import type { TraceResult, TraceStep } from "../types/trace";
import { explainStep, type Lang } from "../explain";
import Narrator from "./Narrator";
import { hideSolutionSelf } from "./practiceView";
import { previousInFrame } from "./stepInfo";
import { structuresFor, topStructureChange } from "./structures";
import ControlBar from "../visualizer/ControlBar";
import ChangeList from "../visualizer/ChangeList";
import { firstRealStep, stepChanges } from "../visualizer/focus";

export type Stepper = {
  steps: TraceStep[];
  /** The shown step's index (0-based). */
  i: number;
  step: TraceStep | undefined;
  /** True while the slider is moving, so the narrator waits for it to settle. */
  scrubbing: boolean;
  /** Where the run opens: its first real line (see firstRealStep). */
  start: number;
  goTo: (n: number, fromScrubber?: boolean) => void;
};

/** Which step of a practice run is shown. Opens at the first line inside the
 *  solution method whenever `traceId` changes (the class and def lines before
 *  it stay reachable). The page owns it, so the code panel and the
 *  step-through panel show the same step. */
export function useStepper(trace: TraceResult | null, traceId: string | null, program = "", method?: string): Stepper {
  const steps = useMemo(() => (trace ? trace.steps.map(hideSolutionSelf) : []), [trace]);
  const start = useMemo(() => firstRealStep(steps, program, method), [steps, program, method]);
  const [state, setState] = useState({ traceId, index: start, scrubbing: false });
  const current = state.traceId === traceId ? state : { traceId, index: start, scrubbing: false };
  const i = Math.min(current.index, Math.max(0, steps.length - 1));
  return {
    steps,
    i,
    step: steps[i],
    scrubbing: current.scrubbing,
    start,
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
  stepper: Stepper;
  /** Left/Right arrows step this run; only the run on screen listens. */
  active: boolean;
  onOpenVisualizer: () => void;
};

// The workspace's compact Step through panel: the control bar with the
// step's sentence, and what changed. Data structures and all variables are
// in the Code Visualizer, one click away.
export default function StepViewer({ label, program, trace, lang, stepper, active, onOpenVisualizer }: Props) {
  const { steps, i, step, scrubbing, goTo } = stepper;
  const prevStep = useMemo(() => previousInFrame(steps, i), [steps, i]);
  const structures = useMemo(() => (step ? structuresFor(step.locals, prevStep?.locals) : []), [step, prevStep]);
  const template = step ? explainStep(i > 0 ? steps[i - 1] : undefined, step, lang, program) : "";

  return (
    <section className="viewer" aria-label={`${label}'s run`}>
      <h3 className="viewer-title">{label}'s run</h3>
      {!step ? (
        <p className="empty">{trace.message ?? "This run recorded no steps."}</p>
      ) : (
        <>
          <ControlBar index={i} total={steps.length} line={step.line} start={stepper.start} description={template} onIndexChange={goTo} globalKeys={active} />
          {trace.message && <p className="hint">{trace.message}</p>}
          <h4 className="subheading">What changed</h4>
          <ChangeList changes={stepChanges(step, prevStep)} />
          <p className="hint viewer-more">
            Lists, pointers, hash maps and every variable are drawn in the Code Visualizer.{" "}
            <button type="button" className="link-button" onClick={onOpenVisualizer}>
              Show details in the Code Visualizer
            </button>
          </p>
          {active && (
            <Narrator
              source={program}
              step={step}
              index={i}
              total={steps.length}
              explanation={template}
              lang={lang}
              structureNote={topStructureChange(structures, step.heap ?? {})}
              delayMs={scrubbing ? 600 : 0}
            />
          )}
        </>
      )}
    </section>
  );
}
