import { useSyncExternalStore } from "react";

export type Route = "prs" | "activity" | "insights" | "linear";

const VALID_ROUTES = new Set<Route>(["prs", "activity", "insights", "linear"]);

function getRoute(): Route {
  const hash = window.location.hash.replace(/^#\//, "");
  return VALID_ROUTES.has(hash as Route) ? (hash as Route) : "prs";
}

function subscribe(callback: () => void): () => void {
  window.addEventListener("hashchange", callback);
  return () => window.removeEventListener("hashchange", callback);
}

export function useRoute(): Route {
  return useSyncExternalStore(subscribe, getRoute, getRoute);
}
