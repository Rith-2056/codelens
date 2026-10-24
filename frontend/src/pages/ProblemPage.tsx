import { useEffect, useRef, useState } from "react";
import type { JsonValue, TraceResult } from "../types/trace";
import type { Lang } from "../explain";
import Editor from "../components/Editor";
import HelpPanel from "../components/HelpPanel";
import StepViewer from "../components/StepViewer";
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
// The correct solution's run shows next to yours only when you ask.
export default function ProblemPage({ problem }: { problem: Problem }) {
  const [lang, setLang] = useState<Lang>("en");
  const [code, setCode] = useState(() => takePendingCode(problem.slug) ?? starterCode(problem));
  const [selected, setSelected] = useState<Selected>({ kind: "example", index: 0 });
  const [failing, setFailing] = useState<JsonValue[] | null>(null);
  const [running, setRunning] = useState(false);
  const [mine, setMine] = useState<Run | null>(null);
  const [message, setMessage] = useState<Message | null>(null);
  /** The input that went wrong and what happened on it: what the help is about. */
  const [failure, setFailure] = useState<{ args: JsonValue[]; check: CheckResult; id: number } | null>(null);
  const [showRef, setShowRef] = useState(false);
  const [reference, setReference] = useState<Run | null>(null);
  const latest = useRef(0);

  useEffect(() => {
    preloadTracer().catch(() => {});
  }, []);

  const args = selected.kind === "failing" && failing ? failing : problem.examples[selected.kind === "example" ? selected.index : 0]!.args;

  function clearRun() {
    latest.current++;
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
    setShowRef(false);
    setReference(null);
    setFailure(null);
    return ticket;
  }

  function failed(ticket: number, err: unknown) {
    if (ticket !== latest.current) return;
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

  async function revealReference() {
    setShowRef(true);
    const ticket = latest.current;
    const ref =
      selected.kind === "example" && selected.index === 0
        ? await loadReference(problem.slug)
        : { ...(await tracePractice(problem.slug, null, args)), id: `ref-${problem.slug}-${++runCounter}` };
    if (ticket === latest.current) setReference(ref);
  }

  return (
    <>
      <div className="page-head">
        <h1 tabIndex={-1}>
          {problem.number}. {problem.title}
        </h1>
        <p className="problem-meta">
          <span className={`difficulty difficulty-${problem.difficulty.toLowerCase()}`}>{problem.difficulty}</span>
          <span className="problem-pattern">{problem.pattern}</span>
        </p>
      </div>

      <div className="problem-top">
        <section className="panel" aria-labelledby="statement-heading">
          <div className="explain-head">
            <h2 id="statement-heading">The problem</h2>
            <div className="lang-toggle" role="group" aria-label="Language">
              <button type="button" className="lang-button" aria-pressed={lang === "en"} onClick={() => setLang("en")} lang="en">
                English
              </button>
              <button type="button" className="lang-button" aria-pressed={lang === "es"} onClick={() => setLang("es")} lang="es">
                Español
              </button>
            </div>
          </div>
          <p className="problem-statement" lang={lang}>
            {problem.statement[lang]}
          </p>
          <h3 className="subheading">Write your answer in this shape</h3>
          <pre className="signature" {...scrollBox("Solution signature")}>
            <code>{`class Solution:\n    ${problem.signature}`}</code>
          </pre>
        </section>

        <section className="panel" aria-labelledby="solution-heading">
          <h2 id="solution-heading">Your solution</h2>
          <Editor
            code={code}
            onChange={(next) => {
              setCode(next);
              clearRun();
            }}
            labelId="solution-heading"
          />
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
          <div className="toolbar">
            <button type="button" className="tool-button" onClick={run} aria-disabled={running}>
              Run
            </button>
            <button type="button" className="visualize-button" onClick={submit} aria-disabled={running}>
              Submit
            </button>
            {running && (
              <span className="hint" role="status">
                Checking…
              </span>
            )}
            {mine && !showRef && (
              <button type="button" className="tool-button" onClick={revealReference}>
                Show the correct solution
              </button>
            )}
          </div>
          {message && (
            <div className={`run-status tone-${message.tone}`} role="status" aria-label="Result">
              {message.text}
            </div>
          )}
          {failure && (
            <p className="mistake-note" role="note" aria-label="Likely mistake">
              <strong>Likely mistake: {MISTAKES[mistakeOf(failure.args, failure.check)].label}.</strong>{" "}
              {MISTAKES[mistakeOf(failure.args, failure.check)].tip}
            </p>
          )}
        </section>
      </div>

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

      {mine && (
        <div className={showRef ? "viewers viewers-two" : "viewers"}>
          <StepViewer key={mine.id} label="Your solution" program={mine.program} trace={mine.trace} lang={lang} traceId={mine.id} />
          {showRef &&
            (reference ? (
              <StepViewer
                key={reference.id}
                label="Correct solution"
                program={reference.program}
                trace={reference.trace}
                lang={lang}
                traceId={reference.id}
              />
            ) : (
              <p className="hint" role="status">
                Loading the correct solution…
              </p>
            ))}
        </div>
      )}
    </>
  );
}
