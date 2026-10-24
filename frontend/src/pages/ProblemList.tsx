import { useMemo } from "react";
import { problems } from "../problems";
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
        <p>Real interview problems. Write your solution, see it run step by step, and find the input that breaks it.</p>
        <p className="problem-progress">
          {solved} of {problems.length} solved
        </p>
      </div>
      <ul className="problem-list" aria-label="LeetCode problems">
        {problems.map((p) => {
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
    </>
  );
}
