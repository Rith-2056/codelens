import { useMemo } from "react";
import { CATEGORIES, problems } from "../problems";
import { hrefFor } from "../router";
import { loadSessions } from "../sessions";

type Progress = "solved" | "tried";

/** Solved once any Submit was accepted; tried when only wrong Submits are saved. */
function progressBySlug(): Map<string, Progress> {
  const out = new Map<string, Progress>();
  for (const s of loadSessions()) {
    if (s.outcome === "accepted") out.set(s.slug, "solved");
    else if (!out.has(s.slug)) out.set(s.slug, "tried");
  }
  return out;
}

export default function ProblemList() {
  const progress = useMemo(progressBySlug, []);
  const solved = problems.filter((p) => progress.get(p.slug) === "solved").length;
  return (
    <>
      <div className="page-head">
        <h1 tabIndex={-1}>Problems</h1>
        <p>Real interview problems, grouped by pattern. Write your solution, see it run step by step, and find the input that breaks it.</p>
        <p className="problem-progress">
          {solved} of {problems.length} solved
        </p>
      </div>
      {CATEGORIES.map((category) => {
        const inCategory = problems.filter((p) => p.category === category);
        const done = inCategory.filter((p) => progress.get(p.slug) === "solved").length;
        const id = `cat-${category.toLowerCase().replace(/[^a-z]+/g, "-")}`;
        return (
          <section key={category} className="problem-group" aria-labelledby={id}>
            <div className="problem-group-head">
              <h2 id={id}>{category}</h2>
              <span className="problem-group-count">
                {done > 0 ? `${done} of ${inCategory.length} solved` : `${inCategory.length} problems`}
              </span>
            </div>
            <ul className="problem-list">
              {inCategory.map((p) => {
                const state = progress.get(p.slug);
                return (
                  <li key={p.slug} className="problem-row glass">
                    <a className="problem-link" href={hrefFor({ page: "problem", slug: p.slug })}>
                      {p.number}. {p.title}
                    </a>
                    <span className={`progress-badge${state ? ` progress-${state}` : ""}`}>
                      {state === "solved" ? "✓ Solved" : state === "tried" ? "Tried" : ""}
                    </span>
                    <span className={`difficulty difficulty-${p.difficulty.toLowerCase()}`}>{p.difficulty}</span>
                    <span className="problem-pattern">{p.pattern}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </>
  );
}
