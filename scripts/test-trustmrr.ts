import assert from "node:assert/strict";
import { WorkerEnv } from "@/lib/cf-types";
import { fetchTrustMrrStartups } from "@/workers/fetchers/trustmrr";
import { normalizeTrustMrrStartup } from "@/workers/fetchers/trustmrr";
import {
  isTrustMrrPathAllowedByRobots,
  parseTrustMrrListingLinks,
  parseTrustMrrPublicProduct,
} from "@/workers/fetchers/trustmrrPublic";

const oneTimeSales = normalizeTrustMrrStartup({
  name: "One-time Sales Product",
  website: "https://onesales.example",
  listedAt: "2026-10-22T09:30:00Z",
  listingUrl: "https://trustmrr.com/startups/one-time-sales-product",
  revenue: { mrr: 0, last30Days: 125, total: 825 },
});
assert.ok(oneTimeSales, "receipts/lifetime revenue count even when MRR is zero");
assert.equal(oneTimeSales.trustmrr_mrr, 0);
assert.equal(oneTimeSales.trustmrr_last30, 125);
assert.equal(oneTimeSales.trustmrr_total, 825);
assert.equal(oneTimeSales.launch_date, "2026-10-22T09:30:00.000Z");
assert.equal(oneTimeSales.launch_url, "https://trustmrr.com/startups/one-time-sales-product");

const lifetimeOnly = normalizeTrustMrrStartup({
  name: "Lifetime Only Product",
  website: "https://lifetime.example",
  revenue: { mrr: 0, last30Days: 0, total: "$1,234" },
});
assert.ok(lifetimeOnly, "positive lifetime revenue is surfaced independently");
assert.equal(lifetimeOnly.trustmrr_total, 1234);
assert.equal(lifetimeOnly.launch_date, null, "missing listing time is not invented");

assert.equal(
  normalizeTrustMrrStartup({
    name: "No Revenue Evidence",
    website: "https://zero.example",
    revenue: { mrr: 0, last30Days: 0, total: 0 },
  }),
  null,
  "zero revenue in all explicit fields is not surfaced as an earning product"
);

const listingLinks = parseTrustMrrListingLinks(`
  <div class="startup-card">
    <a href="/startup/public-revenue-product">Public Revenue Product</a>
    <span>Listed 2 days ago</span>
  </div>
`);
assert.equal(listingLinks.length, 1);
assert.equal(listingLinks[0].url, "https://trustmrr.com/startup/public-revenue-product");
assert.ok(listingLinks[0].listedAt, "relative listing time from the source is retained");

const publicPageProduct = parseTrustMrrPublicProduct(listingLinks[0], `
  <html><head><meta property="og:description" content="A source-listed product." /></head>
  <body>
    <h1>Public Revenue Product</h1>
    <div>MRR</div><div>$0</div>
    <div>Last 30 Days Revenue</div><div>$125</div>
    <div>Total Revenue</div><div>$825</div>
    <a href="https://public-revenue.example" aria-label="Official website">Visit</a>
  </body></html>
`);
assert.ok(publicPageProduct, "public scrape retains explicit one-time receipts with zero MRR");
assert.equal(publicPageProduct.trustmrr_mrr, 0);
assert.equal(publicPageProduct.trustmrr_last30, 125);
assert.equal(publicPageProduct.trustmrr_total, 825);
assert.equal(publicPageProduct.launch_url, listingLinks[0].url);
assert.equal(publicPageProduct.launch_date, listingLinks[0].listedAt);
assert.equal(
  parseTrustMrrPublicProduct(listingLinks[0], `<h1>Zero Product</h1><div>MRR</div><div>$0</div><a href="https://zero.example" aria-label="Official website">Visit</a>`),
  null,
  "public pages with no positive revenue are excluded"
);

assert.equal(
  isTrustMrrPathAllowedByRobots("/recently-added", "User-agent: *\nDisallow: /startup/"),
  true
);
assert.equal(
  isTrustMrrPathAllowedByRobots("/startup/product", "User-agent: *\nDisallow: /startup/"),
  false
);
assert.equal(
  isTrustMrrPathAllowedByRobots("/startup/product", "User-agent: *\nDisallow: /\nAllow: /startup/"),
  true,
  "more-specific allow rules take precedence"
);

async function testCachedPublicFallback(): Promise<void> {
  const cache = new Map<string, { payload: string; expires_at: number }>();
  const DB = {
    prepare(sql: string) {
      let values: unknown[] = [];
      const statement = {
        bind(...bound: unknown[]) { values = bound; return statement; },
        async first() {
          const entry = cache.get(String(values[0]));
          return entry && entry.expires_at > Date.now() ? entry : null;
        },
        async all() { return { results: [], success: true }; },
        async run() {
          if (sql.includes("INSERT INTO http_cache")) {
            cache.set(String(values[0]), {
              payload: String(values[1]),
              expires_at: Number(values[3]),
            });
          }
          return { success: true, meta: { changes: 1 } };
        },
      };
      return statement;
    },
  } as unknown as WorkerEnv["DB"];
  const originalFetch = globalThis.fetch;
  let networkRequests = 0;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    networkRequests++;
    const url = new URL(String(input));
    if (url.pathname === "/robots.txt") return new Response("User-agent: *\nAllow: /\n");
    if (url.pathname === "/recently-added" || url.searchParams.has("sort_by")) {
      return new Response(`<div><a href="/startup/public-revenue-product">Public Revenue Product</a><span>Listed 2 days ago</span></div>`);
    }
    if (url.pathname === "/startup/public-revenue-product") {
      return new Response(`<h1>Public Revenue Product</h1><meta property="og:description" content="Source details" /><div>MRR</div><div>$0</div><div>Last 30 Days Revenue</div><div>$125</div><div>Total Revenue</div><div>$825</div><a href="https://public-revenue.example" aria-label="Official website">Visit</a>`);
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;

  try {
    const env = { DB } as WorkerEnv;
    const first = await fetchTrustMrrStartups(env);
    assert.equal(first.mode, "live");
    assert.equal(first.companies.length, 1);
    assert.equal(first.companies[0].trustmrr_mrr, 0);
    assert.equal(first.companies[0].trustmrr_last30, 125);
    assert.equal(first.companies[0].trustmrr_total, 825);
    const firstRequestCount = networkRequests;
    const second = await fetchTrustMrrStartups(env);
    assert.equal(second.companies.length, 1);
    assert.equal(second.mode, "cached");
    assert.equal(networkRequests, firstRequestCount, "D1 HTTP cache prevents repeated upstream requests");
  } finally {
    globalThis.fetch = originalFetch;
  }
}

testCachedPublicFallback().then(() => {
  console.log("TrustMRR API, public scrape, revenue, robots and cache checks passed.");
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
