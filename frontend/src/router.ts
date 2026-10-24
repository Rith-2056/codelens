// Tiny hash router: #/ (home), #/problems, #/problems/<slug>, #/playground,
// #/sessions.
// Hash URLs work on any static host with no server rewrites, and a link to a
// problem page can be shared or bookmarked.
import { useEffect, useState } from "react";

export type Route =
  | { page: "home" }
  | { page: "problems" }
  | { page: "problem"; slug: string }
  | { page: "playground" }
  | { page: "sessions" }
  | { page: "notFound"; path: string };

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/, "") || "/";
  const parts = path.split("/").filter(Boolean);
  if (parts.length === 0) return { page: "home" };
  if (parts[0] === "problems" && parts.length === 1) return { page: "problems" };
  if (parts[0] === "problems" && parts.length === 2) return { page: "problem", slug: parts[1]! };
  if (parts[0] === "playground" && parts.length === 1) return { page: "playground" };
  if (parts[0] === "sessions" && parts.length === 1) return { page: "sessions" };
  return { page: "notFound", path };
}

export function hrefFor(route: Route): string {
  switch (route.page) {
    case "home":
      return "#/";
    case "problems":
      return "#/problems";
    case "problem":
      return `#/problems/${route.slug}`;
    case "playground":
      return "#/playground";
    case "sessions":
      return "#/sessions";
    case "notFound":
      return `#${route.path}`;
  }
}

/** The current route, updated whenever the hash changes. */
export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}
