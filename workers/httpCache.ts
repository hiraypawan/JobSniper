import { WorkerEnv } from "@/lib/cf-types";

export interface FetchCacheOptions {
  ttlSeconds?: number;
  forceLive?: boolean;
  timeoutMs?: number;
  headers?: Record<string, string>;
  method?: "GET" | "POST";
  body?: string;
}

const DEFAULT_UA =
  "Mozilla/5.0 (compatible; StartupSniper/1.0; +https://github.com/hiraypawan/JobSniper)";

export async function readD1Cache(
  env: WorkerEnv,
  cacheKey: string
): Promise<string | null> {
  try {
    const row = await env.DB.prepare(
      "SELECT payload, expires_at FROM http_cache WHERE cache_key = ?"
    )
      .bind(cacheKey)
      .first<{ payload: string; expires_at: number }>();

    if (row && row.expires_at > Date.now()) {
      return row.payload;
    }
  } catch {
    // Table may not exist yet or transient error
  }

  if (env.CACHE) {
    try {
      const kvVal = await env.CACHE.get(cacheKey, "text");
      if (kvVal) return kvVal;
    } catch {
      // Optional KV fallback ignore
    }
  }

  return null;
}

export async function writeD1Cache(
  env: WorkerEnv,
  cacheKey: string,
  payload: string,
  ttlSeconds: number = 900,
  contentType: string = "application/json"
): Promise<void> {
  const nowIso = new Date().toISOString();
  const expiresAt = Date.now() + ttlSeconds * 1000;
  try {
    await env.DB.prepare(
      `INSERT INTO http_cache (cache_key, payload, content_type, expires_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(cache_key) DO UPDATE SET
         payload = excluded.payload,
         content_type = excluded.content_type,
         expires_at = excluded.expires_at,
         updated_at = excluded.updated_at`
    )
      .bind(cacheKey, payload, contentType, expiresAt, nowIso)
      .run();
  } catch {
    // Ignore cache write errors so sync never crashes
  }
}

export async function fetchWithResilience(
  url: string,
  options: FetchCacheOptions = {}
): Promise<{ text: string; status: number }> {
  const timeoutMs = options.timeoutMs ?? 6000;
  const maxAttempts = 2;
  let lastError: unknown = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        method: options.method || "GET",
        body: options.body,
        headers: {
          "User-Agent": DEFAULT_UA,
          ...(options.headers || {}),
        },
        redirect: "follow",
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (response.status === 429 || response.status === 503) {
        lastError = new Error(`HTTP ${response.status} on ${url}`);
        if (attempt < maxAttempts - 1) {
          await new Promise((r) => setTimeout(r, 350 * (attempt + 1)));
          continue;
        }
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} on ${url}`);
      }

      const text = await response.text();
      return { text, status: response.status };
    } catch (err) {
      clearTimeout(timer);
      lastError = err;
      if (attempt < maxAttempts - 1) {
        await new Promise((r) => setTimeout(r, 250));
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`Failed fetching ${url}`);
}

export async function cachedFetchText(
  env: WorkerEnv,
  cacheKey: string,
  url: string,
  options: FetchCacheOptions = {}
): Promise<{ text: string; fromCache: boolean }> {
  const ttlSeconds = options.ttlSeconds ?? 300;
  if (!options.forceLive) {
    const hit = await readD1Cache(env, cacheKey);
    if (hit !== null) {
      return { text: hit, fromCache: true };
    }
  }

  const { text } = await fetchWithResilience(url, options);
  await writeD1Cache(env, cacheKey, text, ttlSeconds, "text/plain");
  return { text, fromCache: false };
}

export async function cachedFetchJson<T>(
  env: WorkerEnv,
  cacheKey: string,
  url: string,
  options: FetchCacheOptions = {}
): Promise<{ data: T; fromCache: boolean }> {
  const { text, fromCache } = await cachedFetchText(env, cacheKey, url, {
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.headers || {}),
    },
  });
  return { data: JSON.parse(text) as T, fromCache };
}
