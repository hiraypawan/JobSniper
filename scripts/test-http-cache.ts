import assert from "node:assert/strict";
import { cachedFetchText } from "@/workers/httpCache";
import { fetchHimalayasFirstPage, storeHimalayasPage } from "@/workers/fetchers/himalayas";
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
    async batch(statements: Array<{ run(): Promise<{ meta: { changes: number } }> }>) {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      return results;
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
    // Exercise the dormant bounded fetch without touching the real API.
    const nowSeconds = Math.floor(Date.now() / 1000);
    const applicationLink = "https://apply.example.com/role?ref=himalayas";
    const activeJob = {
      guid: "https://himalayas.app/companies/example/jobs/junior",
      applicationLink, companyName: "Example", companySlug: "example",
      title: "Junior developer", expiryDate: nowSeconds + 3600,
      locationRestrictions: ["India"], timezoneRestrictions: [5.5],
    };
    let himalayasCalls = 0;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      himalayasCalls++;
      assert.equal(String(input), "https://himalayas.app/jobs/api?limit=20");
      assert.match(new Headers(init?.headers).get("User-Agent") || "", /JobSniper/);
      return new Response(JSON.stringify({
        jobs: [activeJob, { ...activeJob, expiryDate: nowSeconds - 1 }, null],
        nextCursor: "next-page",
      }), { status: 200 });
    }) as typeof fetch;
    const page = await fetchHimalayasFirstPage(env);
    assert.equal(page.fromCache, false);
    assert.equal(page.jobs.length, 1, "expired and invalid records are filtered");
    assert.equal(page.jobs[0].applicationLink, applicationLink);
    assert.equal(page.nextCursor, "next-page", "a bounded page preserves its continuation");
    const cachedPage = await fetchHimalayasFirstPage(env);
    assert.equal(cachedPage.fromCache, true);
    assert.equal(himalayasCalls, 1, "fresh page cache is reused");
    sqlite.exec("DELETE FROM http_cache WHERE cache_key = 'himalayas_first_page_v1'");
    await assert.rejects(fetchHimalayasFirstPage(env), /cooldown/);
    assert.equal(himalayasCalls, 1, "cache loss cannot bypass the daily reservation");

    // Exercise isolated storage with real SQLite. Missing jobs on a partial page
    // remain stored; expiry is the only automatic removal in this helper.
    const early = page.jobs[0];
    const retained = { ...early, guid: "https://himalayas.app/companies/example/jobs/retained", expiryDate: nowSeconds + 7200 };
    await storeHimalayasPage(env, [early, retained], nowSeconds);
    const countStored = () => (sqlite.prepare("SELECT COUNT(*) AS n FROM himalayas_source_jobs").get() as { n: number }).n;
    const stored = sqlite.prepare("SELECT payload FROM himalayas_source_jobs WHERE guid = ?").get(early.guid) as { payload: string };
    assert.equal(JSON.parse(stored.payload).applicationLink, applicationLink, "application link is unchanged in storage");
    assert.equal(countStored(), 2);
    await storeHimalayasPage(env, [], nowSeconds + 1);
    assert.equal(countStored(), 2, "absence from a partial page does not remove jobs");
    await storeHimalayasPage(env, [{ ...retained, title: "Updated" }], nowSeconds + 3600);
    assert.equal(countStored(), 1, "jobs are removed at their expiry boundary");
    const updated = sqlite.prepare("SELECT payload FROM himalayas_source_jobs WHERE guid = ?").get(retained.guid) as { payload: string };
    assert.equal(JSON.parse(updated.payload).title, "Updated", "existing records are updated");
    await assert.rejects(storeHimalayasPage(env, Array(21).fill(retained), nowSeconds), /Invalid Himalayas page/);
    console.log("HTTP cache and Himalayas storage tests passed.");
  } finally {
    globalThis.fetch = originalFetch;
    sqlite.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
