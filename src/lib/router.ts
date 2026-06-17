import { useSyncExternalStore } from "react";

export type RepoTab = "prs" | "insights" | "linear";

export type Route =
  | { name: "landing" }
  | { name: "home" }
  | { name: "callback" }
  | { name: "repo"; owner: string; repo: string; tab: RepoTab };

const VALID_TABS = new Set<RepoTab>(["prs", "insights", "linear"]);

function parseHash(): Route {
  const raw = window.location.hash; // e.g. "#/r/owner/repo/prs"
  // Strip leading "#" then split on "?"
  const path = raw.replace(/^#/, "").split("?")[0]; // e.g. "/r/owner/repo/prs"
  const segments = path.split("/").filter(Boolean); // remove empty strings from leading "/"

  // Empty or just "#/"
  if (segments.length === 0) {
    return { name: "home" };
  }

  // #/auth/callback (with optional trailing query/segments)
  if (segments[0] === "auth" && segments[1] === "callback") {
    return { name: "callback" };
  }

  // #/r/<owner>/<repo>[/<tab>]
  if (segments[0] === "r" && segments.length >= 3) {
    const owner = decodeURIComponent(segments[1]);
    const repo = decodeURIComponent(segments[2]);
    const rawTab = segments[3];
    const tab: RepoTab =
      rawTab && VALID_TABS.has(rawTab as RepoTab)
        ? (rawTab as RepoTab)
        : "prs";
    return { name: "repo", owner, repo, tab };
  }

  return { name: "home" };
}

// useSyncExternalStore compares snapshots by Object.is, so we must return a
// stable reference until the hash actually changes — otherwise parseHash()
// returns a fresh object every render and triggers an infinite loop (React #185).
let cachedHash: string | null = null;
let cachedRoute: Route = { name: "home" };

function getSnapshot(): Route {
  const raw = window.location.hash;
  if (raw !== cachedHash) {
    cachedHash = raw;
    cachedRoute = parseHash();
  }
  return cachedRoute;
}

function subscribe(callback: () => void): () => void {
  window.addEventListener("hashchange", callback);
  return () => window.removeEventListener("hashchange", callback);
}

export function useRoute(): Route {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function hrefFor(
  owner: string,
  repo: string,
  tab: RepoTab = "prs"
): string {
  return `#/r/${owner}/${repo}/${tab}`;
}

export function navTo(
  owner: string,
  repo: string,
  tab: RepoTab = "prs"
): void {
  window.location.hash = hrefFor(owner, repo, tab);
}

export function goHome(): void {
  window.location.hash = "#/";
}
