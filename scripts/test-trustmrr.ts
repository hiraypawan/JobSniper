import assert from "node:assert/strict";
import { normalizeTrustMrrStartup } from "@/workers/fetchers/trustmrr";

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

console.log("TrustMRR evidence and listing-date checks passed.");
