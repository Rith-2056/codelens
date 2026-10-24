import { useEffect, useRef, useState } from "react";
import type { TraceResult } from "../types/trace";
import type { Lang } from "../explain";
import Editor from "../components/Editor";
import StepViewer from "../components/StepViewer";
import { formatInput, resultMessage, type CheckResult } from "../components/practiceView";
import { scrollBox } from "../components/scrollBox";
import type { Problem } from "../problems";
import { checkPractice, preloadTracer, tracePractice } from "../worker/traceClient";

type Run = { program: string; trace: TraceResult; id: string };

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
// class Solution, our examples, a verdict for each run, your run step by step,
// and, only when you ask, the correct solution's run next to yours.
export default function ProblemPage({ problem }: { problem: Problem }) {
  const [lang, setLang] = useState<Lang>("en");
  const [code, setCode] = useState(() => starterCode(problem));
  const [example, setExample] = useState(0);
  const [running, setRunning] = useState(false);
  const [mine, setMine] = useState<Run | null>(null);
  const [verdict, setVerdict] = useState<CheckResult | null>(null);
  const [showRef, setShowRef] = useState(false);
  const [reference, setReference] = useState<Run | null>(null);
  const latest = useRef(0);

  useEffect(() => {
    preloadTracer().catch(() => {});
  }, []);

  const args = problem.examples[example]!.args;

  function clearRun() {
    latest.current++;
    setMine(null);
    setVerdict(null);
    setShowRef(false);
    setReference(null);
    setRunning(false);
  }

  async function run() {
    if (running) return;
    const ticket = ++latest.current;
    setRunning(true);
    setShowRef(false);
    setReference(null);
    try {
      const [check, traced] = await Promise.all([
        checkPractice(problem.slug, code, args),
        tracePractice(problem.slug, code, args),
      ]);
      if (ticket !== latest.current) return; // code or example changed meanwhile
      setVerdict(check);
      setMine({ ...traced, id: `mine-${++runCounter}` });
    } catch (err) {
      if (ticket !== latest.current) return;
      setVerdict({
        correct: false,
        got: null,
        expected: null,
        error: { type: "Python", message: `could not run (${err instanceof Error ? err.message : "unknown problem"})` },
      });
    } finally {
      if (ticket === latest.current) setRunning(false);
    }
  }

  async function revealReference() {
    setShowRef(true);
    const ticket = latest.current;
    const ref =
      example === 0
        ? await loadReference(problem.slug)
        : { ...(await tracePractice(problem.slug, null, args)), id: `ref-${problem.slug}-${example}` };
    if (ticket === latest.current) setReference(ref);
  }

  const message = verdict ? resultMessage(verdict) : null;

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
                aria-pressed={k === example}
                onClick={() => {
                  setExample(k);
                  clearRun();
                }}
              >
                {formatInput(problem.params, ex.args)}
              </button>
            ))}
          </div>
          <div className="toolbar">
            <button type="button" className="visualize-button" onClick={run} aria-disabled={running}>
              {running ? "Running…" : "Run"}
            </button>
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
        </section>
      </div>

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
