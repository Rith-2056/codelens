import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import CodeView from "../components/CodeView";
import Editor from "../components/Editor";
import LessonPicker from "../components/LessonPicker";
import Narrator from "../components/Narrator";
import RunStatus, { statusMessage } from "../components/RunStatus";
import { canVisualize, initialRunState, runReducer, traceOf } from "../components/runState";
import { previousInFrame } from "../components/stepInfo";
import { structuresFor, topStructureChange } from "../components/structures";
import ChangeList from "../visualizer/ChangeList";
import CodeVisualizer from "../visualizer/CodeVisualizer";
import ControlBar from "../visualizer/ControlBar";
import { stepChanges } from "../visualizer/focus";
import { explainStep, type Lang } from "../explain";
import { lessonById, lessons, type LessonId } from "../lessons";
import { clearDraft, loadDraft, saveDraft } from "../drafts";

const DRAFT = "playground";

/** The lesson and code you left the page with, if any. */
function restoredState(lessonId: LessonId) {
  const start = initialRunState(lessonId);
  try {
    const saved = JSON.parse(loadDraft(DRAFT) ?? "null") as { lessonId?: unknown; code?: unknown } | null;
    if (!saved || typeof saved.code !== "string") return start;
    const lesson = lessons.find((l) => l.id === saved.lessonId);
    const picked = lesson ? runReducer(start, { type: "pickLesson", lessonId: lesson.id }) : start;
    return runReducer(picked, { type: "edit", code: saved.code });
  } catch {
    return start;
  }
}
import { onTracerStatus, preloadTracer, runTrace } from "../worker/traceClient";

type Mode = "edit" | "step";

// The playground: visualize any Python program, starting from the Level 1
// examples. (This was the whole app before pages existed.) Same layout as a
// problem page: lessons and the step-through on the left, the code and its
// output on the right.
export default function Playground() {
  const [state, dispatch] = useReducer(runReducer, "loop", restoredState);
  const [mode, setMode] = useState<Mode>("step");
  const [lang, setLang] = useState<Lang>("en");
  // True while the step scrubber is moving, so the narrator waits for it to settle.
  const [scrubbing, setScrubbing] = useState(false);
  const runCounter = useRef(0);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const editToggleRef = useRef<HTMLButtonElement>(null);
  const editorHadFocus = useRef(false);
  const focusEditorNext = useRef(false);
  /** The Code Visualizer is open (a full-screen view over this page). */
  const [visualizing, setVisualizing] = useState(false);
  const openWhenTraced = useRef(false);
  const openerRef = useRef<HTMLButtonElement>(null);
  const wasVisualizing = useRef(false);

  // Start loading Python as soon as the page opens; fixtures work meanwhile.
  useEffect(() => {
    const unsubscribe = onTracerStatus((status) => dispatch({ type: "tracerStatus", status }));
    preloadTracer().catch(() => dispatch({ type: "tracerStatus", status: "error" }));
    return unsubscribe;
  }, []);

  const lesson = lessonById(state.lessonId);
  const edited = state.code !== lesson.source;

  // Your code is saved in this browser as you type (see drafts.ts).
  useEffect(() => {
    if (edited) saveDraft(DRAFT, JSON.stringify({ lessonId: state.lessonId, code: state.code }));
    else clearDraft(DRAFT);
  }, [edited, state.lessonId, state.code]);
  const traced = traceOf(state.phase);
  const steps = traced?.trace.steps ?? [];
  const index = Math.min(state.stepIndex, Math.max(0, steps.length - 1));
  const step = steps[index];
  const showEditor = mode === "edit" || !traced || steps.length === 0;
  const busy = state.inFlight !== null;
  const visualizeOk = canVisualize(state);

  // A finished run switches to stepping. (A fixture restored by undoing an
  // edit does not, so the editor never vanishes mid-typing.)
  const traceId = traced?.traceId;
  const fromRun = traced !== null && !traced.fromFixture;
  useEffect(() => {
    if (traceId !== undefined && fromRun) setMode("step");
  }, [traceId, fromRun]);

  // Keep keyboard focus when the editor is swapped for the step view and back.
  useEffect(() => {
    if (!showEditor && editorHadFocus.current) {
      editorHadFocus.current = false;
      editToggleRef.current?.focus();
    }
    if (showEditor && focusEditorNext.current) {
      focusEditorNext.current = false;
      editorRef.current?.focus();
    }
  }, [showEditor]);

  function pickLesson(id: LessonId) {
    if (edited && !window.confirm(`Replace your code with the ${lessonById(id).short} lesson? Your changes will be lost.`)) {
      return;
    }
    dispatch({ type: "pickLesson", lessonId: id });
    setMode("step");
  }

  function visualize() {
    if (!visualizeOk) return;
    const runId = ++runCounter.current;
    const code = state.code;
    dispatch({ type: "visualize", runId, code });
    runTrace(code).then(
      (result) => dispatch({ type: "runFinished", runId, result }),
      (err: unknown) =>
        dispatch({
          type: "runFailed",
          runId,
          message: `Python stopped working (${err instanceof Error ? err.message : "unknown problem"}). Reload the page to try again.`,
        }),
    );
  }

  function toggleMode() {
    if (mode === "step" || !traced) {
      focusEditorNext.current = true;
      setMode("edit");
    } else {
      setMode("step");
    }
  }

  function goToStep(i: number, fromScrubber = false) {
    setScrubbing(fromScrubber);
    dispatch({ type: "setStep", index: i });
  }

  // Only the shown step is diffed, so long traces (2000 steps) stay fast.
  const prevStep = useMemo(() => previousInFrame(steps, index), [steps, index]);
  const structures = useMemo(
    () => (step ? structuresFor(step.locals, prevStep?.locals) : []),
    [step, prevStep],
  );
  const heap = step?.heap ?? {};

  const status = statusMessage(state);
  const errorIndex = state.phase.name === "error" ? steps.length - 1 : -1;
  const template =
    step && traced ? explainStep(index > 0 ? steps[index - 1] : undefined, step, lang, traced.code) : undefined;

  const stepping = !showEditor && traced !== null && step !== undefined;

  // "Open Code Visualizer" with new code: it opens once that code is traced.
  useEffect(() => {
    if (traceId !== undefined && openWhenTraced.current) {
      openWhenTraced.current = false;
      if (steps.length > 0) setVisualizing(true);
    }
  }, [traceId, steps.length]);

  // Back from the visualizer: focus returns to the button that opened it.
  useEffect(() => {
    if (wasVisualizing.current && !visualizing) openerRef.current?.focus();
    wasVisualizing.current = visualizing;
  }, [visualizing]);

  function openVisualizer() {
    if (traced && steps.length > 0 && traced.code === state.code) {
      setMode("step");
      setVisualizing(true);
    } else if (visualizeOk) {
      openWhenTraced.current = true;
      visualize();
    }
  }

  return (
    <>
      <div className="workspace workspace-playground">
        <section className="panel ws-problem" aria-labelledby="playground-title">
          <h1 id="playground-title" className="problem-title" tabIndex={-1}>
            Your code
          </h1>
          <p className="hint">Write any Python program, then watch it run one step at a time.</p>
          <LessonPicker lessons={lessons} current={state.lessonId} onPick={pickLesson} lang={lang} />
        </section>

        <section className="panel ws-code" aria-labelledby="code-heading">
          <div className="panel-head">
            <h2 id="code-heading">{edited ? `Your code (from the ${lesson.short} lesson)` : lesson.title}</h2>
            <div className="toolbar">
              {traced && steps.length > 0 && (
                <button type="button" className="tool-button" ref={editToggleRef} onClick={toggleMode}>
                  {showEditor ? "Show steps" : "Edit code"}
                </button>
              )}
              {edited && (
                <button type="button" className="tool-button" onClick={() => pickLesson(state.lessonId)}>
                  Reset code
                </button>
              )}
              <button
                type="button"
                className="visualize-button"
                onClick={visualize}
                aria-disabled={!visualizeOk}
                aria-describedby="run-status"
              >
                {busy ? "Running…" : "Visualize"}
              </button>
              <button type="button" className="tool-button open-visualizer" ref={openerRef} onClick={openVisualizer} aria-disabled={busy}>
                Open Code Visualizer
              </button>
            </div>
          </div>

          <div id="run-status">
            <RunStatus message={status} />
          </div>

          {showEditor ? (
            <div onFocus={() => (editorHadFocus.current = true)} onBlur={() => (editorHadFocus.current = false)}>
              <Editor
                ref={editorRef}
                code={state.code}
                onChange={(code) => dispatch({ type: "edit", code })}
                labelId="code-heading"
              />
            </div>
          ) : (
            traced && <CodeView source={traced.code} step={step} />
          )}
        </section>

        <section className="panel ws-tests" aria-labelledby="output-heading">
          <h2 id="output-heading">Output</h2>
          {stepping ? (
            step.stdout ? (
              <pre className="output">{step.stdout}</pre>
            ) : (
              <p className="empty">Nothing printed yet.</p>
            )
          ) : (
            <p className="empty">What your program prints shows here as you step through it.</p>
          )}
        </section>

        <section className="panel ws-visual" aria-labelledby="visual-heading">
          <div className="panel-head">
            <h2 id="visual-heading">Step through</h2>
            <div className="lang-toggle" role="group" aria-label="Explanation language">
              <button type="button" className="lang-button" aria-pressed={lang === "en"} onClick={() => setLang("en")} lang="en">
                English
              </button>
              <button type="button" className="lang-button" aria-pressed={lang === "es"} onClick={() => setLang("es")} lang="es">
                Español
              </button>
            </div>
          </div>
          {stepping ? (
            <>
              <ControlBar
                index={index}
                total={steps.length}
                line={step.line}
                description={template ?? ""}
                onIndexChange={goToStep}
                globalKeys={!visualizing}
              />
              {errorIndex >= 0 && (
                // Stays mounted (aria-disabled at the error) so focus is not lost.
                <button
                  type="button"
                  className="tool-button jump-button"
                  aria-disabled={index === errorIndex}
                  onClick={() => goToStep(errorIndex)}
                >
                  {index === errorIndex ? "At the error" : "Go to the error"} (step {errorIndex + 1})
                </button>
              )}
              {traced.trace.truncated && (
                <p className="hint">Some values or output were too long, so CodeLens shortened them.</p>
              )}
              <h3 className="subheading">What changed</h3>
              <ChangeList changes={stepChanges(step, prevStep)} />
              <p className="hint viewer-more">
                Lists, pointers, hash maps and every variable are drawn in the Code Visualizer.{" "}
                <button type="button" className="link-button" onClick={openVisualizer}>
                  Show details in the Code Visualizer
                </button>
              </p>
            </>
          ) : (
            <p className="empty">
              {traced && steps.length > 0
                ? "Choose Show steps to step through your code here."
                : "Click Visualize to run your code and step through it here."}
            </p>
          )}
        </section>
      </div>
      {visualizing && traced && steps.length > 0 && (
        <CodeVisualizer
          key={String(traced.traceId)}
          title="Your code"
          runLabel={edited ? `Your code (from the ${lesson.short} lesson)` : lesson.title}
          program={traced.code}
          steps={steps}
          codeHash={traced.trace.codeHash}
          traceId={String(traced.traceId)}
          index={index}
          onIndexChange={goToStep}
          lang={lang}
          onClose={() => setVisualizing(false)}
        />
      )}
      <Narrator
        source={traced?.code ?? ""}
        step={showEditor || visualizing ? undefined : step}
        index={index}
        total={steps.length}
        explanation={template}
        lang={lang}
        structureNote={showEditor ? undefined : topStructureChange(structures, heap)}
        delayMs={scrubbing ? 600 : 0}
      />
    </>
  );
}
