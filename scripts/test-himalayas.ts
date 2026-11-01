import { shouldRemoveHimalayasJob } from "@/workers/fetchers/himalayas";
import assert from "node:assert/strict";
import { parseHimalayasJob } from "@/workers/fetchers/himalayas";

const now = 1_800_000_000;
const applicationLink = "https://apply.example.com/a%2Fb?ref=Himalayas&x=1";
const base = {
  guid: "https://himalayas.app/companies/example/jobs/junior-engineer",
  companyName: "Example Co",
  companySlug: "example",
  title: "Junior Engineer",
  applicationLink,
  expiryDate: now + 100,
  pubDate: now - 200,
  locationRestrictions: ["India"],
  timezoneRestrictions: [5.5],
  seniority: ["Entry-level"],
  employmentType: "Full Time",
  excerpt: "Early career software role.",
};

const parsed = parseHimalayasJob(base, now);
assert(parsed);
assert.equal(parsed.applicationLink, applicationLink, "apply URL must remain unchanged");
assert.equal(parsed.indiaEligible, true);
assert.deepEqual(parsed.seniority, ["Entry-level"]);
assert.equal(parsed.companyName, "Example Co");
assert.equal(parsed.pubDate, now - 200);
assert.equal(parseHimalayasJob({ ...base, locationRestrictions: [], timezoneRestrictions: [5.5] }, now)?.indiaEligible, true);
assert.equal(parseHimalayasJob({ ...base, locationRestrictions: undefined, timezoneRestrictions: [5.5] }, now)?.indiaEligible, true);
assert.equal(parseHimalayasJob({ ...base, locationRestrictions: ["United States"], timezoneRestrictions: [5.5] }, now)?.indiaEligible, false);
assert.equal(parseHimalayasJob({ ...base, locationRestrictions: ["India"], timezoneRestrictions: [4, 6] }, now)?.indiaEligible, false);
assert.equal(parseHimalayasJob({ ...base, locationRestrictions: [""], timezoneRestrictions: [5.5] }, now)?.indiaEligible, false);
assert.equal(parseHimalayasJob({ ...base, locationRestrictions: null, timezoneRestrictions: [5.5] }, now)?.indiaEligible, false);
assert.equal(parseHimalayasJob({ ...base, timezoneRestrictions: undefined }, now)?.indiaEligible, false);
assert.equal(parseHimalayasJob({ ...base, timezoneRestrictions: ["5.5"] }, now)?.indiaEligible, false);
assert.equal(parseHimalayasJob({ ...base, expiryDate: now }, now), null, "expiry boundary is closed");
assert.equal(parseHimalayasJob({ ...base, expiryDate: now - 1 }, now), null);
assert.equal(parseHimalayasJob({ ...base, applicationLink: "javascript:alert(1)" }, now), null);
assert.equal(parseHimalayasJob({ ...base, applicationLink: " https://example.com " }, now), null);
assert.equal(parseHimalayasJob({ ...base, guid: "https://evil.example/companies/example/jobs/role" }, now), null);
assert.equal(parseHimalayasJob({ ...base, guid: "https://himalayas.app/companies/example/jobs/role?x=1" }, now), null);
assert.equal(parseHimalayasJob(null, now), null);

console.log("Himalayas parser fixtures passed; source remains disabled.");
// A partial page must never be treated as evidence of closure.
assert.equal(shouldRemoveHimalayasJob(now, null, now), true, "expiry boundary removes");
assert.equal(shouldRemoveHimalayasJob(now - 1, 200, now), true, "expiry overrides stale open response");
assert.equal(shouldRemoveHimalayasJob(now + 100, 410, now), true, "410 is explicitly closed");
assert.equal(shouldRemoveHimalayasJob(null, 410, now), true);
assert.equal(shouldRemoveHimalayasJob(now + 100, 200, now), false);
for (const status of [null, 404, 429, 500, 503]) {
  assert.equal(shouldRemoveHimalayasJob(now + 100, status, now), false, "unknown status retains");
}
assert.equal(shouldRemoveHimalayasJob(null, null, now), false);
assert.equal(shouldRemoveHimalayasJob(Number.NaN, null, now), false);
