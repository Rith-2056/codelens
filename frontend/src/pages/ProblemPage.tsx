import { useEffect, useRef, useState } from "react";
import type { JsonValue, TraceResult } from "../types/trace";
import type { Lang } from "../explain";
import CodeView from "../components/CodeView";
import Editor from "../components/Editor";
import HelpPanel from "../components/HelpPanel";
import StepViewer, { useStepper } from "../components/StepViewer";
import CodeVisualizer from "../visualizer/CodeVisualizer";
import {
  counterexampleMessage,
  formatInput,
  passedMessage,
  resultMessage,
  type CheckResult,
  type Message,
} from "../components/practiceView";
import { formatValue } from "../components/values";
import { MISTAKES, classifyMistake } from "../components/mistakes";
import { addSession, takePendingCode } from "../sessions";
import { clearDraft, loadDraft, saveDraft } from "../drafts";
import { scrollBox } from "../components/scrollBox";
import type { Problem } from "../problems";
import { checkPractice, findCounterexample, preloadTracer, tracePractice } from "../worker/traceClient";

type Run = { program: string; trace: TraceResult; id: string };
/** The input the next Run uses: one of our examples, or the failing input Submit found. */
type Selected = { kind: "example"; index: number } | { kind: "failing" };

// Reference runs for each problem's first example, bundled as lazy chunks so
// the main bundle stays small; other examples are traced by Python on demand.
const referenceFixtures = import.meta.glob("../../../shared/fixtures/practice/*.json", {
  query: "?raw",
  import: "default",
}) as Record<string, () => Promise<string>>;

async function loadReference(slug: string): Promise<Run | null> {
  const load = referenceFixtures[`../../../shared/fixtures/practice/${slug}.json`];
  if (!load) return null;
  const data = JSON.parse(await load()) as { program: string; trace: TraceResult };
  return { ...data, id: `ref-${slug}-0` };
}

function starterCode(problem: Problem): string {
  return `class Solution:\n    ${problem.signature}\n        # Write your solution here.\n        pass\n`;
}

let runCounter = 0;

// One LeetCode problem: the statement (our own words), an editor for your
// class Solution, our examples, and two ways to check it:
// - Run: one input, with a verdict and your run step by step;
// - Submit: CodeLens searches small inputs for one that proves the solution
//   wrong and, if it finds one, shows it and steps through your run on it.
// The correct solution's run shows only when you ask; then you switch
// between the two runs.
//
// Layout (wide screens): the problem and the step-through on the left, the
// code and the tests on the right, so the highlighted line and the variables
// are on screen together. In the DOM (and on phones) the order is problem,
// code, tests, step-through.
export default function ProblemPage({ problem }: { problem: Problem }) {
  const [lang, setLang] = useState<Lang>("en");
  const [code, setCode] = useState(() => takePendingCode(problem.slug) ?? loadDraft(problem.slug) ?? starterCode(problem));
  const [selected, setSelected] = useState<Selected>({ kind: "example", index: 0 });
  const [failing, setFailing] = useState<JsonValue[] | null>(null);
  const [running, setRunning] = useState(false);
  const [mine, setMine] = useState<Run | null>(null);
  const [message, setMessage] = useState<Message | null>(null);
  /** The input that went wrong and what happened on it: what the help is about. */
  const [failure, setFailure] = useState<{ args: JsonValue[]; check: CheckResult; id: number } | null>(null);
  const [showRef, setShowRef] = useState(false);
  const [reference, setReference] = useState<Run | null>(null);
  /** Which run is on screen once the correct solution is shown. */
  const [view, setView] = useState<"mine" | "ref">("mine");
  /** After a run the code panel shows the run's code; Edit code brings the editor back. */
  const [editing, setEditing] = useState(false);
  const latest = useRef(0);
  const resultRef = useRef<HTMLDivElement>(null);
  const refSwitch = useRef<HTMLButtonElement>(null);
  const focusSwitch = useRef(false);
  const mineStepper = useStepper(mine?.trace ?? null, mine?.id ?? null, mine?.program, problem.method);
  const refStepper = useStepper(reference?.trace ?? null, reference?.id ?? null, reference?.program, problem.method);
  const viewingRef = showRef && view === "ref";
  /** The Code Visualizer is open (a full-screen view over this page). */
  const [visualizing, setVisualizing] = useState(false);
  const openWhenTraced = useRef(false);
  const openerRef = useRef<HTMLButtonElement>(null);
  const wasVisualizing = useRef(false);

  useEffect(() => {
    preloadTracer().catch(() => {});
  }, []);

  // The tests panel can be short: bring each new result into view.
  useEffect(() => {
    if (message) resultRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [message]);

  // Your code is saved in this browser as you type (see drafts.ts).
  useEffect(() => {
    if (code === starterCode(problem)) clearDraft(problem.slug);
    else saveDraft(problem.slug, code);
  }, [code, problem]);

  // "Show the correct solution" disappears once pressed, so focus moves to
  // the switch that replaces it instead of falling to the page.
  useEffect(() => {
    if (showRef && focusSwitch.current) {
      focusSwitch.current = false;
      refSwitch.current?.focus();
    }
  }, [showRef]);

  // "Open Code Visualizer" before any run: it opens once the run is traced.
  useEffect(() => {
    if (mine && openWhenTraced.current) {
      openWhenTraced.current = false;
      setVisualizing(true);
    }
  }, [mine]);

  // Back from the visualizer: focus returns to the button that opened it.
  useEffect(() => {
    if (wasVisualizing.current && !visualizing) openerRef.current?.focus();
    wasVisualizing.current = visualizing;
  }, [visualizing]);

  const args = selected.kind === "failing" && failing ? failing : problem.examples[selected.kind === "example" ? selected.index : 0]!.args;

  function clearRun() {
    latest.current++;
    openWhenTraced.current = false;
    setMine(null);
    setMessage(null);
    setFailure(null);
    setShowRef(false);
    setReference(null);
    setRunning(false);
  }

  /** Start a request; returns a ticket that is stale once the code or input changes. */
  function begin(): number {
    const ticket = ++latest.current;
    setRunning(true);
    setEditing(false);
    setView("mine");
    setShowRef(false);
    setReference(null);
    setFailure(null);
    return ticket;
  }

  function failed(ticket: number, err: unknown) {
    if (ticket !== latest.current) return;
    openWhenTraced.current = false;
    setMessage({ tone: "error", text: `Python could not run your code (${err instanceof Error ? err.message : "unknown problem"}).` });
  }

  async function traceMine(ticket: number, input: JsonValue[]) {
    const traced = await tracePractice(problem.slug, code, input);
    if (ticket === latest.current) setMine({ ...traced, id: `mine-${++runCounter}` });
  }

  async function run() {
    if (running) return;
    const ticket = begin();
    try {
      const check = await checkPractice(problem.slug, code, args);
      if (ticket !== latest.current) return; // code or input changed meanwhile
      setMessage(resultMessage(check));
      if (!check.correct) setFailure({ args, check, id: ticket });
      await traceMine(ticket, args);
    } catch (err) {
      failed(ticket, err);
    } finally {
      if (ticket === latest.current) setRunning(false);
    }
  }

  function mistakeOf(input: JsonValue[], check: CheckResult) {
    return classifyMistake({ slug: problem.slug, args: input, got: check.got, expected: check.expected, error: check.error, code });
  }

  /** Every Submit is saved in this browser (see sessions.ts). */
  function saveWrong(input: JsonValue[], check: CheckResult) {
    addSession({
      slug: problem.slug,
      title: problem.title,
      code,
      outcome: "wrong",
      input: formatInput(problem.params, input),
      got: check.error ? null : formatValue(check.got),
      expected: formatValue(check.expected),
      error: check.error,
      category: mistakeOf(input, check),
    });
  }

  async function submit() {
    if (running) return;
    const ticket = begin();
    try {
      const search = await findCounterexample(problem.slug, code);
      if (ticket !== latest.current) return;
      if (search.found) {
        setFailing(search.args);
        setSelected({ kind: "failing" });
        setMessage(counterexampleMessage(problem.params, { ...search, correct: false }));
        setFailure({ args: search.args, check: { ...search, correct: false }, id: ticket });
        saveWrong(search.args, { ...search, correct: false });
        await traceMine(ticket, search.args);
        return;
      }
      const checks = await Promise.all(problem.examples.map((ex) => checkPractice(problem.slug, code, ex.args)));
      if (ticket !== latest.current) return;
      const bad = checks.findIndex((c) => !c.correct);
      if (bad >= 0) {
        setSelected({ kind: "example", index: bad });
        setMessage(resultMessage(checks[bad]!));
        setFailure({ args: problem.examples[bad]!.args, check: checks[bad]!, id: ticket });
        saveWrong(problem.examples[bad]!.args, checks[bad]!);
        await traceMine(ticket, problem.examples[bad]!.args);
        return;
      }
      setMessage(passedMessage(search, problem.examples.length));
      addSession({
        slug: problem.slug,
        title: problem.title,
        code,
        outcome: "accepted",
        input: `${search.tried} small inputs and ${problem.examples.length} examples`,
        got: null,
        expected: null,
        error: null,
        category: null,
      });
    } catch (err) {
      failed(ticket, err);
    } finally {
      if (ticket === latest.current) setRunning(false);
    }
  }

  function openVisualizer() {
    if (mine) setVisualizing(true);
    else {
      openWhenTraced.current = true;
      void run();
    }
  }

  async function revealReference() {
    focusSwitch.current = true;
    setShowRef(true);
    setView("ref");
    const ticket = latest.current;
    const ref =
      selected.kind === "example" && selected.index === 0
        ? await loadReference(problem.slug)
        : { ...(await tracePractice(problem.slug, null, args)), id: `ref-${problem.slug}-${++runCounter}` };
    if (ticket === latest.current) setReference(ref);
  }

  const codeHeading = viewingRef ? "Correct solution" : "Your solution";
  const shown = viewingRef && reference ? { run: reference, stepper: refStepper, label: "Correct solution" } : mine ? { run: mine, stepper: mineStepper, label: "Your solution" } : null;
  const runSwitch = (focusTarget: boolean) => (
    <div className="segmented" role="group" aria-label="Which run to show">
      <button type="button" aria-pressed={view === "mine"} onClick={() => setView("mine")}>
        Your solution
      </button>
      <button type="button" ref={focusTarget ? refSwitch : undefined} aria-pressed={view === "ref"} onClick={() => setView("ref")}>
        Correct solution
      </button>
    </div>
  );

  return (
    <div className="workspace">
      <section className="panel ws-problem" aria-labelledby="problem-title">
        <div className="explain-head">
          <div>
            <h1 id="problem-title" className="problem-title" tabIndex={-1}>
              {problem.number}. {problem.title}
            </h1>
            <p className="problem-meta">
              <span className={`difficulty difficulty-${problem.difficulty.toLowerCase()}`}>{problem.difficulty}</span>
              <span className="problem-pattern">{problem.pattern}</span>
            </p>
          </div>
          <div className="lang-toggle" role="group" aria-label="Language">
            <button type="button" className="lang-button" aria-pressed={lang === "en"} onClick={() => setLang("en")} lang="en">
              English
            </button>
            <button type="button" className="lang-button" aria-pressed={lang === "es"} onClick={() => setLang("es")} lang="es">
              Español
            </button>
          </div>
        </div>
        <h2 className="subheading" id="statement-heading">
          The problem
        </h2>
        <p className="problem-statement" lang={lang}>
          {problem.statement[lang]}
        </p>
        <h3 className="subheading" id="examples-heading">
          Examples
        </h3>
        <ol className="example-list" aria-label="Examples">
          {problem.examples.map((ex, k) => (
            <li key={k}>
              <pre className="example-io" {...scrollBox(`Example ${k + 1}`)}>
                <code>
                  <span className="example-key">Input:</span> {formatInput(problem.params, ex.args)}
                  {"\n"}
                  <span className="example-key">Output:</span> {formatValue(ex.expected)}
                </code>
              </pre>
            </li>
          ))}
        </ol>
      </section>

      <section className="panel ws-code" aria-labelledby="solution-heading">
        <div className="panel-head">
          <h2 id="solution-heading">{codeHeading}</h2>
          <div className="toolbar">
            {showRef && runSwitch(true)}
            {mine && !viewingRef && (
              <button type="button" className="tool-button" onClick={() => setEditing(!editing)}>
                {editing ? "Show steps" : "Edit code"}
              </button>
            )}
            {mine && !showRef && (
              <button type="button" className="tool-button" onClick={revealReference}>
                Show the correct solution
              </button>
            )}
            <button type="button" className="visualize-button open-visualizer" ref={openerRef} onClick={openVisualizer} aria-disabled={running}>
              Open Code Visualizer
            </button>
          </div>
        </div>
        {viewingRef ? (
          reference ? (
            <CodeView source={reference.program} step={refStepper.step} />
          ) : (
            <p className="hint" role="status">
              Loading the correct solution…
            </p>
          )
        ) : mine && !editing ? (
          <CodeView source={mine.program} step={mineStepper.step} />
        ) : (
          <Editor
            code={code}
            onChange={(next) => {
              setCode(next);
              clearRun();
            }}
            labelId="solution-heading"
          />
        )}
      </section>

      <section className="panel ws-tests" aria-labelledby="tests-heading">
        <div className="panel-head">
          <h2 id="tests-heading">Test your solution</h2>
          <div className="toolbar">
            {running && (
              <span className="hint" role="status">
                Checking…
              </span>
            )}
            <button type="button" className="tool-button" onClick={run} aria-disabled={running}>
              Run
            </button>
            <button type="button" className="visualize-button" onClick={submit} aria-disabled={running}>
              Submit
            </button>
          </div>
        </div>
        <p className="hint tests-hint">
          Run checks the selected example. Submit also tries hundreds of small inputs to find one that breaks your code.
        </p>
        <div className="examples" role="group" aria-label="Examples">
          {problem.examples.map((ex, k) => (
            <button
              key={k}
              type="button"
              className="example-button"
              aria-pressed={selected.kind === "example" && selected.index === k}
              onClick={() => {
                setSelected({ kind: "example", index: k });
                clearRun();
              }}
            >
              {formatInput(problem.params, ex.args)}
            </button>
          ))}
          {failing && (
            <button
              type="button"
              className="example-button example-failing"
              aria-pressed={selected.kind === "failing"}
              onClick={() => {
                setSelected({ kind: "failing" });
                clearRun();
              }}
            >
              Failing input: {formatInput(problem.params, failing)}
            </button>
          )}
        </div>
        {message && (
          <div ref={resultRef} className={`run-status tone-${message.tone}`} role="status" aria-label="Result">
            {message.text}
          </div>
        )}
        {failure && (
          <p className="mistake-note" role="note" aria-label="Likely mistake">
            <strong>Likely mistake: {MISTAKES[mistakeOf(failure.args, failure.check)].label}.</strong>{" "}
            {MISTAKES[mistakeOf(failure.args, failure.check)].tip}
          </p>
        )}
        {failure && (
          <HelpPanel
            key={failure.id}
            request={{
              lang,
              problem: { title: problem.title, statement: problem.statement[lang], signature: problem.signature },
              code,
              input: formatInput(problem.params, failure.args),
              got: failure.check.error ? null : formatValue(failure.check.got),
              expected: formatValue(failure.check.expected),
              error: failure.check.error,
            }}
          />
        )}
      </section>

      <section className="panel ws-visual" aria-labelledby="visual-heading">
        <h2 id="visual-heading">Step through</h2>
        {!mine ? (
          <ol className="how-to" aria-label="How to use this page">
            <li>
              <strong>Write</strong> your solution in the code panel. It is saved in this browser as you type.
            </li>
            <li>
              <strong>Run</strong> it on an example, or <strong>Submit</strong> to search for an input that breaks it.
            </li>
            <li>
              <strong>Step through</strong> the run here, or open the Code Visualizer to see every list and pointer move.
            </li>
          </ol>
        ) : (
          <>
            <div hidden={viewingRef}>
              <StepViewer
                key={mine.id}
                label="Your solution"
                program={mine.program}
                trace={mine.trace}
                lang={lang}
                stepper={mineStepper}
                active={!viewingRef && !visualizing}
                onOpenVisualizer={openVisualizer}
              />
            </div>
            {showRef && reference && (
              <div hidden={!viewingRef}>
                <StepViewer
                  key={reference.id}
                  label="Correct solution"
                  program={reference.program}
                  trace={reference.trace}
                  lang={lang}
                  stepper={refStepper}
                  active={viewingRef && !visualizing}
                  onOpenVisualizer={openVisualizer}
                />
              </div>
            )}
          </>
        )}
      </section>

      {visualizing && shown && (
        <CodeVisualizer
          key={shown.run.id}
          title={problem.title}
          runLabel={shown.label}
          program={shown.run.program}
          steps={shown.stepper.steps}
          codeHash={shown.run.trace.codeHash}
          traceId={shown.run.id}
          index={shown.stepper.i}
          start={shown.stepper.start}
          onIndexChange={shown.stepper.goTo}
          lang={lang}
          onClose={() => setVisualizing(false)}
          headerExtra={showRef ? runSwitch(false) : undefined}
        />
      )}
    </div>
  );
}
