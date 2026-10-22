import { Company, PitchSettings } from "./types";

export type AIProvider = "gemini" | "openrouter";

export interface AIPitchResult {
  classicSpecDm: string;
  roleHookDm: string;
  linkedinNote: string;
  emailSubject: string;
  emailBody: string;
}

/**
 * Structured AI error surfaced to the UI instead of silently swallowing failures.
 * Every fetch rejection, status error, JSON parse error, or timeout becomes an
 * AIError with provider + status so the drawer can render an inline error box.
 */
export class AIError extends Error {
  readonly status: number | undefined;
  readonly provider: string;
  readonly retryable: boolean;

  constructor(
    message: string,
    opts: { status?: number; provider: string; retryable?: boolean } = {
      provider: "unknown",
    }
  ) {
    super(message);
    this.name = "AIError";
    this.status = opts.status;
    this.provider = opts.provider;
    this.retryable = opts.retryable ?? false;
  }
}

const GEMINI_KEY_STORAGE = "startupsniper_gemini_api_key";
const OPENROUTER_KEY_STORAGE = "startupsniper_openrouter_api_key";

// Format hints validated on Save (AC4).
export const GEMINI_KEY_REGEX = /^AIza[^\s]+$/;
export const OPENROUTER_KEY_REGEX = /^sk-or-[^\s]+$/;

export function validateApiKey(
  provider: AIProvider,
  key: string
): { valid: boolean; hint?: string } {
  const trimmed = key.trim();
  if (!trimmed) return { valid: false, hint: "Key is empty" };
  if (provider === "gemini") {
    if (!GEMINI_KEY_REGEX.test(trimmed)) {
      return {
        valid: false,
        hint: 'Invalid Gemini key — it should start with "AIza..."',
      };
    }
    return { valid: true };
  }
  if (!OPENROUTER_KEY_REGEX.test(trimmed)) {
    return {
      valid: false,
      hint: 'Invalid OpenRouter key — it should start with "sk-or-..."',
    };
  }
  return { valid: true };
}

/** OpenRouter model catalog (current). First 404 triggers fallback to the next. */
export const OPENROUTER_MODELS: string[] = [
  "google/gemini-1.5-flash-latest",
  "google/gemini-pro-1.5",
  "openai/gpt-4o-mini",
];

export const GEMINI_MODEL = "gemini-1.5-flash";
export const AI_REQUEST_TIMEOUT_MS = 8000;
const MAX_429_RETRIES = 2;

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fetchWithTimeout(
  url: string,
  opts: RequestInit,
  ms: number = AI_REQUEST_TIMEOUT_MS
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    fetch(url, { ...opts, signal: controller.signal })
      .then(resolve)
      .catch((err) => {
        // AbortError DOMException name is "AbortError"
        if (err instanceof Error && err.name === "AbortError") {
          reject(
            new AIError(`Request timed out after ${ms}ms`, {
              provider: "unknown",
              retryable: true,
            })
          );
        } else {
          reject(err);
        }
      })
      .finally(() => clearTimeout(timer));
  });
}

async function readBodyText(res: Response): Promise<string> {
  return res.text().catch(() => "");
}

async function callGemini(
  apiKey: string,
  prompt: string
): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 1500,
      },
    }),
  });

  if (res.status === 429) {
    const retryAfter = res.headers.get("retry-after");
    const backoffMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 2000;
    throw new AIError(`Gemini API error: 429 rate limited`, {
      status: 429,
      provider: "gemini",
      retryable: true,
    });
    // backoff handled by caller via callWithBackoff; message carries no delay,
    // callWithBackoff uses fixed schedule. Keep the error retryable.
  }

  if (!res.ok) {
    const text = await readBodyText(res);
    throw new AIError(`Gemini API error: ${res.status} ${text}`, {
      status: res.status,
      provider: "gemini",
      retryable: res.status >= 500,
    });
  }

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

async function callOpenRouter(apiKey: string, prompt: string): Promise<string> {
  let lastError: unknown;
  for (const model of OPENROUTER_MODELS) {
    try {
      const res = await fetchWithTimeout(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
            "HTTP-Referer": "https://jobsniper.pages.dev",
            "X-Title": "StartupSniper",
          },
          body: JSON.stringify({
            model,
            messages: [{ role: "user", content: prompt }],
            temperature: 0.7,
            max_tokens: 1500,
          }),
        }
      );

      if (res.status === 404) {
        const text = await readBodyText(res);
        console.debug(
          "[aiPitches] OpenRouter model 404, trying fallback",
          model,
          text
        );
        lastError = new AIError(
          `OpenRouter model not found: ${model}`,
          { status: 404, provider: "openrouter", retryable: true }
        );
        continue;
      }

      if (res.status === 429) {
        throw new AIError(`OpenRouter API error: 429 rate limited`, {
          status: 429,
          provider: "openrouter",
          retryable: true,
        });
      }

      if (!res.ok) {
        const text = await readBodyText(res);
        throw new AIError(`OpenRouter API error: ${res.status} ${text}`, {
          status: res.status,
          provider: "openrouter",
          retryable: res.status >= 500,
        });
      }

      const data = await res.json();
      if (model !== OPENROUTER_MODELS[0]) {
        console.debug("[aiPitches] OpenRouter fallback model succeeded:", model);
      }
      return data.choices?.[0]?.message?.content || "";
    } catch (err) {
      if (err instanceof AIError && !err.retryable) throw err;
      lastError = err;
      // 404 falls through to next model; anything else re-throws below
      if (!(err instanceof AIError) || err.status === 404) continue;
      throw err;
    }
  }
  throw lastError;
}

/**
 * Run a provider call with exponential backoff on 429 (and retryable 404 model fallback
 * is already handled inside callOpenRouter).
 */
async function callWithBackoff(fn: () => Promise<string>): Promise<string> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err) {
      if (
        err instanceof AIError &&
        err.retryable &&
        err.status === 429 &&
        attempt < MAX_429_RETRIES
      ) {
        const delayMs = [2000, 5000][attempt] ?? 5000;
        console.debug(
          "[aiPitches] rate limited, retrying in",
          delayMs,
          "ms (attempt",
          attempt + 1,
          ")"
        );
        await sleep(delayMs);
        attempt++;
        continue;
      }
      throw err;
    }
  }
}

/**
 * Robust JSON extraction: strips markdown fences, trims, then falls back to
 * extracting the first balanced `{...}` object before JSON.parse.
 * Throws AIError with a clear message when no parseable object exists.
 */
export function extractJson(text: string): unknown {
  let cleaned = text.replace(/```json/g, "").replace(/```/g, "").trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    // fall through to balanced-brace extraction
  }

  const start = cleaned.indexOf("{");
  if (start === -1) {
    throw new AIError("AI response did not contain a JSON object", {
      provider: "unknown",
    });
  }

  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      continue;
    }
    if (inString) {
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(cleaned.slice(start, i + 1));
        } catch {
          throw new AIError("AI response contained malformed JSON", {
            provider: "unknown",
          });
        }
      }
    }
  }

  throw new AIError("AI response contained no complete JSON object", {
    provider: "unknown",
  });
}

/**
 * Resolve an API key for a provider.
 * Priority: dedicated localStorage slot (set by PitchSettingsModal) →
 * pitchSettings api keys (hydrated from startupsniper_pitch_settings_v1).
 */
export function getApiKey(
  provider: AIProvider,
  settings?: PitchSettings | null
): string | null {
  if (typeof window === "undefined") return null;
  try {
    const stored =
      provider === "gemini"
        ? localStorage.getItem(GEMINI_KEY_STORAGE)
        : localStorage.getItem(OPENROUTER_KEY_STORAGE);
    if (stored) {
      console.debug("[aiPitches] getApiKey", provider, "source=localStorage");
      return stored;
    }
    const settingsKey =
      provider === "gemini"
        ? settings?.geminiApiKey
        : settings?.openrouterApiKey;
    if (settingsKey) {
      console.debug("[aiPitches] getApiKey", provider, "source=pitchSettings");
      return settingsKey;
    }
    console.debug("[aiPitches] getApiKey", provider, "source=none");
    return null;
  } catch {
    return null;
  }
}

export function setApiKey(provider: AIProvider, key: string): void {
  if (typeof window === "undefined") return;
  try {
    if (provider === "gemini") {
      localStorage.setItem(GEMINI_KEY_STORAGE, key);
    } else {
      localStorage.setItem(OPENROUTER_KEY_STORAGE, key);
    }
  } catch {
    // ignore quota errors
  }
}

export function clearApiKey(provider: AIProvider): void {
  if (typeof window === "undefined") return;
  try {
    if (provider === "gemini") {
      localStorage.removeItem(GEMINI_KEY_STORAGE);
    } else {
      localStorage.removeItem(OPENROUTER_KEY_STORAGE);
    }
  } catch {
    // ignore
  }
}

/**
 * Lightweight auth check used by the "Test Key" button (AC4).
 * Gemini: lists models (GET). OpenRouter: /auth/key (GET).
 */
export async function testApiKey(
  provider: AIProvider,
  apiKey: string
): Promise<{ ok: boolean; message: string }> {
  try {
    if (provider === "gemini") {
      const res = await fetchWithTimeout(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(
          apiKey
        )}`,
        { method: "GET" }
      );
      if (!res.ok) {
        const text = await readBodyText(res);
        return {
          ok: false,
          message: `Gemini test failed: ${res.status} ${text}`,
        };
      }
      return { ok: true, message: "Gemini key is valid ✓" };
    } else {
      const res = await fetchWithTimeout(
        "https://openrouter.ai/api/v1/auth/key",
        {
          method: "GET",
          headers: { Authorization: `Bearer ${apiKey}` },
        }
      );
      if (!res.ok) {
        const text = await readBodyText(res);
        return {
          ok: false,
          message: `OpenRouter test failed: ${res.status} ${text}`,
        };
      }
      return { ok: true, message: "OpenRouter key is valid ✓" };
    }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Key test failed",
    };
  }
}

/**
 * Analytics-lite: records when AI generation is attempted and whether it
 * succeeded. Stored in localStorage only, no external endpoint.
 */
export function recordAIGeneration(provider: AIProvider, ok: boolean): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      "startupsniper_last_ai_generation_at",
      String(Date.now())
    );
    if (ok) {
      const countKey = "startupsniper_ai_success_count";
      const prev = Number(localStorage.getItem(countKey) || "0");
      localStorage.setItem(countKey, String(prev + 1));
    }
  } catch {
    // ignore storage errors
  }
}

/* ------------------------------------------------------------------ */
/* Proxy vs direct fetching                                           */
/* ------------------------------------------------------------------ */

/** Raised when the /api/ai proxy is not deployed (404) — try direct fetch. */
class ProxyMissing extends AIError {
  constructor() {
    super("AI proxy endpoint not found (404)", {
      status: 404,
      provider: "openrouter",
      retryable: false,
    });
  }
}

async function viaProxy(
  provider: AIProvider,
  prompt: string,
  clientApiKey: string | null
): Promise<string> {
  const res = await fetchWithTimeout("/api/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider, prompt, task: "generation", apiKey: clientApiKey }),
  });

  if (res.status === 404) throw new ProxyMissing();

  if (!res.ok) {
    let body: { error?: string; status?: number } | null = null;
    try {
      body = (await res.json()) as { error?: string; status?: number };
    } catch {
      // ignore
    }
    throw new AIError(
      body?.error || `AI proxy error: ${res.status}`,
      {
        status: body?.status ?? res.status,
        provider,
        retryable: res.status === 429 || res.status >= 500,
      }
    );
  }

  const data = (await res.json()) as {
    ok?: boolean;
    text?: string;
    error?: string;
  };
  if (!data?.ok || !data.text) {
    throw new AIError(data?.error || "Empty response from AI proxy", {
      provider,
    });
  }
  return data.text;
}

async function callDirect(
  provider: AIProvider,
  apiKey: string,
  prompt: string
): Promise<string> {
  return provider === "gemini"
    ? callWithBackoff(() => callGemini(apiKey, prompt))
    : callWithBackoff(() => callOpenRouter(apiKey, prompt));
}

/**
 * Fetch AI-generated text: prefers the same-origin /api/ai proxy (server key
 * or forwarded client key — never exposes the key to third parties from the
 * browser), falling back to a direct browser fetch when the proxy is not
 * deployed or not configured.
 */
export async function fetchAIText(
  provider: AIProvider,
  prompt: string,
  clientApiKey: string | null
): Promise<string> {
  try {
    return await viaProxy(provider, prompt, clientApiKey);
  } catch (proxyErr) {
    if (clientApiKey) {
      console.debug(
        "[aiPitches] proxy unavailable, falling back to direct fetch",
        provider,
        proxyErr instanceof Error ? proxyErr.message : String(proxyErr)
      );
      return callDirect(provider, clientApiKey, prompt);
    }
    throw proxyErr;
  }
}

export async function generateAIPitches(
  company: Company,
  settings: PitchSettings,
  provider: AIProvider
): Promise<AIPitchResult> {
  const apiKey = getApiKey(provider, settings);
  if (!apiKey) {
    throw new AIError(`No ${provider === "gemini" ? "Gemini" : "OpenRouter"} API key saved. Add it in “My 5d Offer” settings.`, {
      provider,
    });
  }

  const founderFirst = company.founder_name
    ? company.founder_name.split(/[\s,(&/]+/)[0].trim()
    : "Founder";

  const cohortPhrase = company.batch
    ? `YC ${company.batch}`
    : company.funding_amount
      ? `just raised ${company.funding_amount}`
      : company.source === "producthunt"
        ? "launching on Product Hunt"
        : company.source === "indie"
          ? "on Hacker News"
          : "scaling fast";

  const topRole = company.jobs?.[0]?.title || null;

  const prompt = `You are an expert B2B outbound copywriter. Write 4 cold outreach formats for this startup. Sound like a real founder writing to another founder — natural, human, helpful, no hype, no buzzwords, no overly salesy language. Be specific and concise.

Company: ${company.name}
Domain: ${company.domain}
Batch/Cohort: ${cohortPhrase}
One-liner: ${company.one_liner}
Description: ${company.description}
Open Roles: ${company.open_roles_count || 0}
Top Role: ${topRole || "N/A"}
Hiring Provider: ${company.hiring_provider || "N/A"}
Founder Name: ${company.founder_name || "N/A"}
Founder Twitter: ${company.founder_twitter || "N/A"}
Founder LinkedIn: ${company.founder_linkedin || "N/A"}
Founder Email: ${company.founder_email || "N/A"}
Remote: ${company.is_remote ? "Yes" : "No"}
Team Size: ${company.team_size || "N/A"}
Tags: ${(company.tags || []).join(", ")}

User preferences:
- Sender name: ${settings.senderName || "not set"}
- Custom tool idea: ${settings.customToolIdea || "auto-detect based on their industry"}
- Similar company proof: ${settings.similarCompanyProof || "auto-detect"}
- Delivery turnaround: ${settings.deliveryDays || 5} days
- Demo offer: ${settings.demoOffer || "45 sec Loom demo"}

Return ONLY a raw JSON object (no markdown code blocks) with these exact keys:
- "classicSpecDm": A concise DM pitch (under 200 chars)
- "roleHookDm": A role-based hook DM referencing an open role (under 200 chars)
- "linkedinNote": A LinkedIn connection note (under 300 chars)
- "emailSubject": A cold email subject line (under 60 chars)
- "emailBody": A cold email body (short, human, under 200 words)

Personalize each format specifically to this company. Do not wrap in markdown.`;

  console.debug("[aiPitches] generateAIPitches start", provider, company.name, "hasKey=", Boolean(apiKey));

  const response = await callWithBackoff(() => fetchAIText(provider, prompt, apiKey));

  let parsed: unknown;
  try {
    parsed = extractJson(response);
  } catch (err) {
    console.debug("[aiPitches] JSON parse failed", provider, company.name, String(err), "raw=", response.slice(0, 500));
    throw new AIError("AI returned invalid JSON — showing template pitch instead.", {
      provider,
      retryable: false,
    });
  }

  const p = parsed as Partial<AIPitchResult>;
  console.debug("[aiPitches] generateAIPitches success", provider, company.name);
  recordAIGeneration(provider, true);

  return {
    classicSpecDm: p.classicSpecDm || "",
    roleHookDm: p.roleHookDm || "",
    linkedinNote: p.linkedinNote || "",
    emailSubject: p.emailSubject || "",
    emailBody: p.emailBody || "",
  };
}
