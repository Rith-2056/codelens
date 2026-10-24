import { useEffect, useRef } from "react";
import Home from "./pages/Home";
import NotFound from "./pages/NotFound";
import Playground from "./pages/Playground";
import ProblemList from "./pages/ProblemList";
import ProblemPage from "./pages/ProblemPage";
import { problemBySlug } from "./problems";
import { hrefFor, useRoute, type Route } from "./router";
import "./styles.css";

const NAV: { label: string; route: Route }[] = [
  { label: "Home", route: { page: "home" } },
  { label: "Problems", route: { page: "problems" } },
  { label: "Your code", route: { page: "playground" } },
];

/** Which nav entry is current: a problem page belongs to "Problems". */
function navPage(route: Route): string {
  return route.page === "problem" ? "problems" : route.page;
}

function titleFor(route: Route): string {
  switch (route.page) {
    case "home":
      return "CodeLens";
    case "problems":
      return "Problems · CodeLens";
    case "problem": {
      const p = problemBySlug(route.slug);
      return `${p ? p.title : "Not found"} · CodeLens`;
    }
    case "playground":
      return "Your code · CodeLens";
    case "notFound":
      return "Not found · CodeLens";
  }
}

// The app shell: a navigation bar and one page at a time, chosen by the URL
// hash. On every page change the title updates and keyboard focus moves to
// the new page's heading, so screen-reader users hear where they are.
export default function App() {
  const route = useRoute();
  const key = hrefFor(route);
  const first = useRef(true);

  useEffect(() => {
    document.title = titleFor(route);
    if (first.current) {
      first.current = false;
      return;
    }
    document.querySelector<HTMLElement>("main h1")?.focus();
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  let page;
  if (route.page === "home") page = <Home />;
  else if (route.page === "problems") page = <ProblemList />;
  else if (route.page === "problem") {
    const p = problemBySlug(route.slug);
    page = p ? <ProblemPage key={p.slug} problem={p} /> : <NotFound kind="problem" />;
  } else if (route.page === "playground") page = <Playground />;
  else page = <NotFound kind="page" />;

  return (
    <div className="app">
      <header className="app-header glass">
        <a className="brand" href={hrefFor({ page: "home" })} aria-label="CodeLens home">
          CodeLens
        </a>
        <nav aria-label="Main">
          {NAV.map((item) => (
            <a
              key={item.label}
              className="nav-link"
              href={hrefFor(item.route)}
              aria-current={navPage(item.route) === navPage(route) ? "page" : undefined}
            >
              {item.label}
            </a>
          ))}
        </nav>
      </header>
      <main className="page">{page}</main>
    </div>
  );
}
