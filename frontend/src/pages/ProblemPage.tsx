import { useState } from "react";
import type { Lang } from "../explain";
import { scrollBox } from "../components/scrollBox";
import type { Problem } from "../problems";

// One LeetCode problem: the statement in our own words and the class Solution
// signature. Writing, checking and visualizing a solution come next.
export default function ProblemPage({ problem }: { problem: Problem }) {
  const [lang, setLang] = useState<Lang>("en");
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
      <section className="panel glass" aria-labelledby="statement-heading">
        <div className="explain-head">
          <h2 id="statement-heading">The problem</h2>
          <div className="lang-toggle" role="group" aria-label="Problem language">
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
    </>
  );
}
