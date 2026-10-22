import { callGemini, callOpenRouter, AIError, AIProvider } from "@/lib/aiPitches";

export interface AIProxyRequest {
  provider: AIProvider;
  prompt: string;
  task: string;
  apiKey?: string; // optional client key (BYOK fallback when no server key)
}

export interface AIProxyEnv {
  GEMINI_API_KEY?: string;
  OPENROUTER_API_KEY?: string;
}

function jsonResponse(
  data: unknown,
  status: number = 200,
  extraHeaders: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      ...extraHeaders,
    },
  });
}

/**
 * POST /api/ai proxy.
 * - If the server has a key for the provider (env GEMINI_API_KEY / OPENROUTER_API_KEY),
 *   it is used and never leaves the server (shared team key, AC7).
 * - Otherwise the client key forwarded in the request body is used (BYOK via proxy,
 *   hides key from third-party network logs and bypasses CORS/adblock).
 * - If neither is configured: HTTP 400 so the client can fall back to direct fetch
 *   or show the "no key" banner.
 */
export async function handleAiRequest(
  request: Request,
  env: AIProxyEnv = {}
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return jsonResponse({ ok: true });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  let body: AIProxyRequest;
  try {
    body = (await request.json()) as AIProxyRequest;
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const { provider, prompt, task, apiKey } = body;
  if (!provider || !prompt) {
    return jsonResponse({ error: "provider and prompt are required" }, 400);
  }

  const serverKey =
    provider === "gemini" ? env.GEMINI_API_KEY : env.OPENROUTER_API_KEY;
  const key = serverKey || apiKey;

  if (!key) {
    return jsonResponse(
      {
        error: `No ${provider} API key configured. Set OPENROUTER_API_KEY/GEMINI_API_KEY on the server, or save a key in “My 5d Offer” settings.`,
        status: 400,
        provider,
      },
      400
    );
  }

  const startedAt = Date.now();
  try {
    const text =
      provider === "gemini"
        ? await callGemini(key, prompt)
        : await callOpenRouter(key, prompt);
    console.debug(
      "[api/ai] proxy success",
      provider,
      task,
      `in ${Date.now() - startedAt}ms`
    );
    return jsonResponse({ ok: true, text, provider, task });
  } catch (err) {
    if (err instanceof AIError) {
      console.debug("[api/ai] proxy error", provider, err.status, err.message);
      // 401/403 → bad key; 404 → model fallback already exhausted; 429/5xx → retryable
      const status =
        err.status === 401 || err.status === 403
          ? 401
          : err.status === 404
            ? 404
            : err.status && err.status >= 500
              ? 502
              : 400;
      return jsonResponse(
        { ok: false, error: err.message, status, provider, retryable: err.retryable },
        status
      );
    }
    console.debug("[api/ai] proxy error", provider, String(err));
    return jsonResponse(
      { ok: false, error: err instanceof Error ? err.message : "Proxy request failed", status: undefined, provider },
      502
    );
  }
}
