import assert from "node:assert/strict";
import { cachedFetchText } from "@/workers/httpCache";
import type { WorkerEnv } from "@/lib/cf-types";

// Run the reservation SQL against real SQLite, without making network requests.
const { DatabaseSync } = eval("require")("node:sqlite") as {
  DatabaseSync: new (name: string) => {
    exec(sql: string): void;
    prepare(sql: string): {
      get(...args: unknown[]): unknown;
      run(...args: unknown[]): { changes: number | bigint };
    };
    close(): void;
  };
};

async function main() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("CREATE TABLE http_cache (cache_key TEXT PRIMARY KEY, payload TEXT NOT NULL, content_type TEXT, expires_at INTEGER NOT NULL, updated_at TEXT)");
  const db = {
    prepare(sql: string) {
      let args: unknown[] = [];
      const statement = {
        bind(...values: unknown[]) { args = values; return statement; },
        async first() { return sqlite.prepare(sql).get(...args) || null; },
        async run() {
          const result = sqlite.prepare(sql).run(...args);
          return { meta: { changes: Number(result.changes) } };
        },
      };
      return statement;
    },
  };
  const env = { DB: db } as unknown as WorkerEnv;
  const originalFetch = globalThis.fetch;
  let calls = 0;
  let fail = false;
  globalThis.fetch = (async () => {
    calls++;
    return new Response(fail ? "unavailable" : "ok", { status: fail ? 503 : 200 });
  }) as typeof fetch;
  try {
    const options = { forceLive: true, minIntervalMs: 21660000, ttlSeconds: 21600 };
    const concurrent = await Promise.allSettled([
      cachedFetchText(env, "source-a", "https://example.com/feed", options),
      cachedFetchText(env, "source-a", "https://example.com/feed", options),
    ]);
    assert.equal(concurrent.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(concurrent.filter((result) => result.status === "rejected").length, 1);
    assert.equal(calls, 1, "concurrent cold starts make at most one request");
    const cached = await cachedFetchText(env, "source-a", "https://example.com/feed", { ...options, forceLive: false });
    assert.equal(cached.fromCache, true);
    assert.equal(calls, 1, "fresh cache is reused");
    await assert.rejects(cachedFetchText(env, "source-a", "https://example.com/feed", options), /cooldown/);
    assert.equal(calls, 1, "force does not bypass the reservation");

    fail = true;
    await assert.rejects(cachedFetchText(env, "source-b", "https://example.com/feed", options), /503/);
    assert.equal(calls, 2, "rate-limited requests are not retried");
    await assert.rejects(cachedFetchText(env, "source-b", "https://example.com/feed", options), /cooldown/);
    assert.equal(calls, 2, "a failed request still retains its reservation");

    const broken = { DB: { prepare() { throw new Error("D1 unavailable"); } } } as unknown as WorkerEnv;
    await assert.rejects(cachedFetchText(broken, "source-c", "https://example.com/feed", options), /D1 unavailable/);
    assert.equal(calls, 2, "D1 failure does not permit an unreserved fetch");
    console.log("HTTP cache cooldown tests passed.");
  } finally {
    globalThis.fetch = originalFetch;
    sqlite.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
