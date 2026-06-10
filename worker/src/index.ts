/**
 * Cloudflare Worker: GitHub OAuth code -> access_token exchange.
 *
 * The browser SPA cannot do this exchange itself: it requires the OAuth
 * client_secret, and GitHub's token endpoint sends no CORS headers. This Worker
 * is the only server-side piece. It is stateless, holds only the client_secret
 * (as an encrypted env secret), and never touches GitHub *data* — it just swaps
 * a short-lived `code` for a user access token and hands it back to the SPA.
 */

interface Env {
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  ALLOWED_ORIGIN: string;
}

function corsHeaders(env: Env): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(body: unknown, status: number, env: Env): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(env) },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(env) });
    }

    const url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== "/exchange") {
      return json({ error: "not_found" }, 404, env);
    }

    let code: unknown;
    try {
      ({ code } = (await request.json()) as { code?: unknown });
    } catch {
      return json({ error: "invalid_json" }, 400, env);
    }
    if (typeof code !== "string" || code.length === 0) {
      return json({ error: "missing_code" }, 400, env);
    }

    const ghRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        client_id: env.GITHUB_CLIENT_ID,
        client_secret: env.GITHUB_CLIENT_SECRET,
        code,
      }),
    });

    const data = (await ghRes.json()) as {
      access_token?: string;
      error?: string;
      error_description?: string;
    };

    if (data.error || !data.access_token) {
      return json(
        { error: data.error ?? "exchange_failed", error_description: data.error_description },
        400,
        env,
      );
    }

    return json({ access_token: data.access_token }, 200, env);
  },
};
