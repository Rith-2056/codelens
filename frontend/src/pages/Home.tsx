import { hrefFor } from "../router";

// The landing page: what CodeLens does in one line, one obvious first step,
// and how it works in three steps.
export default function Home() {
  return (
    <>
      <div className="page-head hero">
        <h1 tabIndex={-1}>Watch your code run, one step at a time.</h1>
        <p className="hero-lede">
          CodeLens runs your Python and draws the lists, pointers, hash maps and trees as they change, so you can see why
          an algorithm works and exactly where yours goes wrong. Free, in your browser.
        </p>
        <div className="hero-actions">
          <a className="visualize-button hero-cta" href={hrefFor({ page: "problem", slug: "two-sum" })}>
            Start with Two Sum
          </a>
          <a className="tool-button hero-secondary" href={hrefFor({ page: "problems" })}>
            Browse all problems
          </a>
        </div>
      </div>

      <ol className="how-steps" aria-label="How CodeLens works">
        <li className="glass">
          <span className="how-number" aria-hidden="true">1</span>
          <span className="how-title">Write your solution</span>
          <span className="how-text">Pick an interview problem and solve it in Python, LeetCode style.</span>
        </li>
        <li className="glass">
          <span className="how-number" aria-hidden="true">2</span>
          <span className="how-title">Run or Submit</span>
          <span className="how-text">Submit tries hundreds of small inputs and shows the smallest one that breaks your code.</span>
        </li>
        <li className="glass">
          <span className="how-number" aria-hidden="true">3</span>
          <span className="how-title">Step through it</span>
          <span className="how-text">The Code Visualizer shows each line run and what it changed, with hints if you are stuck.</span>
        </li>
      </ol>

      <a className="home-card glass" href={hrefFor({ page: "playground" })}>
        <span className="home-card-title">Or visualize your own code</span>
        <span className="home-card-text">Write any Python program and watch it run, one line at a time.</span>
      </a>
    </>
  );
}
