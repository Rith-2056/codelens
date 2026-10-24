import { problems } from "../problems";
import { hrefFor } from "../router";

export default function ProblemList() {
  return (
    <>
      <div className="page-head">
        <h1 tabIndex={-1}>Problems</h1>
        <p>Real interview problems. Write your solution, then watch it run next to a correct one.</p>
      </div>
      <ul className="problem-list" aria-label="LeetCode problems">
        {problems.map((p) => (
          <li key={p.slug} className="problem-row glass">
            <a className="problem-link" href={hrefFor({ page: "problem", slug: p.slug })}>
              {p.number}. {p.title}
            </a>
            <span className={`difficulty difficulty-${p.difficulty.toLowerCase()}`}>{p.difficulty}</span>
            <span className="problem-pattern">{p.pattern}</span>
          </li>
        ))}
      </ul>
    </>
  );
}
