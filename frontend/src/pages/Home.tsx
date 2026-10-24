import { hrefFor } from "../router";

export default function Home() {
  return (
    <>
      <div className="page-head hero">
        <h1 tabIndex={-1}>CodeLens</h1>
        <p className="hero-lede">From your first loop to your first interview.</p>
        <p>
          CodeLens runs your own solution and shows the data structures change, step by step, so any student can prep
          for technical interviews for free.
        </p>
      </div>
      <div className="home-cards">
        <a className="home-card glass" href={hrefFor({ page: "problems" })}>
          <span className="home-card-title">Practice problems</span>
          <span className="home-card-text">
            Solve real interview problems, see your solution and a correct one run side by side, and find out exactly
            where yours goes wrong.
          </span>
        </a>
        <a className="home-card glass" href={hrefFor({ page: "playground" })}>
          <span className="home-card-title">Your own code</span>
          <span className="home-card-text">Write any Python program and watch it run, one line at a time.</span>
        </a>
      </div>
    </>
  );
}
