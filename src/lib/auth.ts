import { loadLastRepo } from "./storage";

/**
 * GitHub OAuth Web Application Flow (browser side).
 *
 * The user clicks "Sign in", we redirect to GitHub's authorize page, GitHub
 * redirects back with a `code`, and we POST that code to our Cloudflare Worker,
 * which swaps it for a user access token (the secret-bearing exchange can't run
 * in the browser). The resulting token behaves exactly like the old PAT and is
 * stored in localStorage via the Settings object.
 */

const CLIENT_ID = import.meta.env.VITE_GH_CLIENT_ID;
const WORKER_URL = import.meta.env.VITE_AUTH_WORKER_URL;

// Same read scope the dashboard's GraphQL queries need: PR/commit reads + viewer.
const SCOPE = "repo read:user";

const STATE_KEY = "pr-dashboard.oauth-state";
const AUTHORIZE_URL = "https://github.com/login/oauth/authorize";

export function authConfigured(): boolean {
  return Boolean(CLIENT_ID && WORKER_URL);
}

function randomState(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** The exact origin+path GitHub must redirect back to (hash route for the SPA). */
function redirectUri(): string {
  return `${window.location.origin}${window.location.pathname}#/auth/callback`;
}

/** Redirect the browser to GitHub's authorize page. Does not return. */
export function beginLogin(): void {
  if (!authConfigured()) {
    throw new Error("OAuth not configured (missing VITE_GH_CLIENT_ID / VITE_AUTH_WORKER_URL)");
  }
  const state = randomState();
  sessionStorage.setItem(STATE_KEY, state);
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: redirectUri(),
    scope: SCOPE,
    state,
  });
  window.location.assign(`${AUTHORIZE_URL}?${params.toString()}`);
}

/** True when the current URL looks like the OAuth callback (has code+state). */
function isCallback(): boolean {
  return callbackParams() !== null;
}

/**
 * GitHub appends `?code=&state=` to the redirect_uri. With a hash route the URL
 * looks like `…/#/auth/callback?code=…&state=…`, so the query lives inside the
 * hash, not window.location.search. Parse whichever carries it.
 */
function callbackParams(): URLSearchParams | null {
  const hash = window.location.hash;
  const qIndex = hash.indexOf("?");
  const fromHash = qIndex >= 0 ? new URLSearchParams(hash.slice(qIndex + 1)) : null;
  if (fromHash?.get("code")) return fromHash;
  const fromSearch = new URLSearchParams(window.location.search);
  if (fromSearch.get("code")) return fromSearch;
  return null;
}

/** Strip OAuth params from the URL and land back on the appropriate route. */
function cleanUrl(): void {
  const last = loadLastRepo();
  const hash = last ? `#/r/${last.owner}/${last.repo}/prs` : "#/";
  const clean = `${window.location.origin}${window.location.pathname}${hash}`;
  window.history.replaceState(null, "", clean);
}

/**
 * If the current load is an OAuth callback, verify state, exchange the code for
 * a token via the Worker, and return it. Returns null when this isn't a
 * callback. Throws on CSRF/state mismatch or a failed exchange.
 */
export async function handleCallback(): Promise<string | null> {
  if (!isCallback()) return null;
  const params = callbackParams()!;
  const code = params.get("code")!;
  const returnedState = params.get("state");
  const savedState = sessionStorage.getItem(STATE_KEY);
  sessionStorage.removeItem(STATE_KEY);

  if (!savedState || returnedState !== savedState) {
    cleanUrl();
    throw new Error("OAuth state mismatch — possible CSRF, aborting sign-in.");
  }

  let token: string;
  try {
    const res = await fetch(`${WORKER_URL}/exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const data = (await res.json()) as { access_token?: string; error?: string };
    if (!res.ok || !data.access_token) {
      throw new Error(data.error ?? `exchange failed (HTTP ${res.status})`);
    }
    token = data.access_token;
  } finally {
    cleanUrl();
  }
  return token;
}
