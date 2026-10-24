import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import CallStack from "./components/CallStack";
import CodeView, { sourceLines } from "./components/CodeView";
import DataStructures from "./components/DataStructures";
import Editor from "./components/Editor";
import Explanation from "./components/Explanation";
import JumpToChange from "./components/JumpToChange";
import LessonPicker from "./components/LessonPicker";
import Narrator from "./components/Narrator";
import RunStatus, { statusMessage } from "./components/RunStatus";
import Scrubber from "./components/Scrubber";
import Timeline from "./components/Timeline";
import Variables from "./components/Variables";
import { canVisualize, initialRunState, runReducer, traceOf } from "./components/runState";
import { variableNames } from "./components/jump";
import { previousInFrame } from "./components/stepInfo";
import { structuresFor, topStructureChange } from "./components/structures";
import { explainStep, type Lang } from "./explain";
import { lessonById, lessons, type LessonId } from "./lessons";
import { onTracerStatus, preloadTracer, runTrace } from "./worker/traceClient";
import "./styles.css";

type Mode = "edit" | "step";

export default function App() {
  const [state, dispatch] = useReducer(runReducer, "loop", initialRunState);
  const [mode, setMode] = useState<Mode>("step");
  const [lang, setLang] = useState<Lang>("en");
  // True while the step scrubber is moving, so the narrator waits for it to settle.
  const [scrubbing, setScrubbing] = useState(false);
  const runCounter = useRef(0);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const editToggleRef = useRef<HTMLButtonElement>(null);
  const editorHadFocus = useRef(false);
  const focusEditorNext = useRef(false);

  // Start loading Python as soon as the page opens; fixtures work meanwhile.
  useEffect(() => {
    const unsubscribe = onTracerStatus((status) => dispatch({ type: "tracerStatus", status }));
    preloadTracer().catch(() => dispatch({ type: "tracerStatus", status: "error" }));
    return unsubscribe;
  }, []);

  const lesson = lessonById(state.lessonId);
  const edited = state.code !== lesson.source;
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
  const names = useMemo(() => variableNames(steps), [steps]);
  const heap = step?.heap ?? {};
  const lineText = step && traced ? (sourceLines(traced.code)[step.line - 1] ?? "") : "";

  const status = statusMessage(state);
  const errorIndex = state.phase.name === "error" ? steps.length - 1 : -1;
  const template =
    step && traced ? explainStep(index > 0 ? steps[index - 1] : undefined, step, lang, traced.code) : undefined;

  return (
    <div className="app">
      <header className="app-header">
        <h1>CodeLens</h1>
        <p>Watch your Python program run, one step at a time.</p>
      </header>
      <main className="layout">
        <section className="panel" aria-labelledby="code-heading">
          <h2 id="code-heading">{edited ? `Your code (from the ${lesson.short} lesson)` : lesson.title}</h2>
          <LessonPicker lessons={lessons} current={state.lessonId} onPick={pickLesson} lang={lang} />

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
          </div>

          <div id="run-status">
            <RunStatus message={status} />
          </div>

          {showEditor ? (
            <div
              onFocus={() => (editorHadFocus.current = true)}
              onBlur={() => (editorHadFocus.current = false)}
            >
              <Editor
                ref={editorRef}
                code={state.code}
                onChange={(code) => dispatch({ type: "edit", code })}
                labelId="code-heading"
              />
            </div>
          ) : (
            traced && (
              <>
                <CodeView source={traced.code} step={step} />
                <Timeline index={index} total={steps.length} onIndexChange={(i) => goToStep(i)} />
                <Scrubber
                  index={index}
                  total={steps.length}
                  line={step?.line ?? 1}
                  onScrub={(i) => goToStep(i, true)}
                />
                <JumpToChange
                  key={traced.traceId}
                  steps={steps}
                  index={index}
                  names={names}
                  onJump={(i) => goToStep(i)}
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
                <p className="hint">Tip: use the Left and Right arrow keys to step, or the slider for long runs.</p>
              </>
            )
          )}
        </section>

        <section className="panel" aria-labelledby="vars-heading">
          <h2 id="vars-heading">Variables</h2>
          {!showEditor && traced && step ? (
            <>
              <p className="hint">Values right now, before the highlighted line runs.</p>
              <Variables current={step.locals} previous={prevStep?.locals} heap={heap} prevHeap={prevStep?.heap ?? {}} />
              <DataStructures items={structures} locals={step.locals} heap={heap} line={lineText} />
              <CallStack step={step} />

              <h3 className="subheading">Output so far</h3>
              {step.stdout ? (
                <pre className="output">{step.stdout}</pre>
              ) : (
                <p className="empty">Nothing printed yet.</p>
              )}

              <div className="explain-head">
                <h3 className="subheading" id="explain-heading">
                  What is happening
                </h3>
                <div className="lang-toggle" role="group" aria-label="Explanation language">
                  <button type="button" className="lang-button" aria-pressed={lang === "en"} onClick={() => setLang("en")} lang="en">
                    English
                  </button>
                  <button type="button" className="lang-button" aria-pressed={lang === "es"} onClick={() => setLang("es")} lang="es">
                    Español
                  </button>
                </div>
              </div>
              <Explanation
                steps={steps}
                index={index}
                lang={lang}
                code={traced.code}
                codeHash={traced.trace.codeHash}
                traceId={traced.traceId}
              />
            </>
          ) : (
            <p className="empty">
              {traced && steps.length > 0
                ? "Choose Show steps to see the variables."
                : "Click Visualize to run your code and see its variables here."}
            </p>
          )}
        </section>
      </main>
      <Narrator
        source={traced?.code ?? ""}
        step={showEditor ? undefined : step}
        index={index}
        total={steps.length}
        explanation={template}
        lang={lang}
        structureNote={showEditor ? undefined : topStructureChange(structures, heap)}
        delayMs={scrubbing ? 600 : 0}
      />
    </div>
  );
}
