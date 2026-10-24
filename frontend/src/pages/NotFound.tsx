import { hrefFor } from "../router";

export default function NotFound({ kind }: { kind: "problem" | "page" }) {
  const isProblem = kind === "problem";
  return (
    <div className="page-head">
      <h1 tabIndex={-1}>{isProblem ? "Problem not found" : "Page not found"}</h1>
      <p>
        {isProblem ? "There is no problem at this address. " : "Nothing lives at this address. "}
        <a href={hrefFor(isProblem ? { page: "problems" } : { page: "home" })}>
          {isProblem ? "Back to the problems" : "Back to the home page"}
        </a>
      </p>
    </div>
  );
}
