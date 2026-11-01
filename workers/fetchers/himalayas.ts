import { WorkerEnv } from "@/lib/cf-types";
import { cachedFetchJson } from "@/workers/httpCache";

// Dormant parser and fetch helper: not wired into sync or the public API.
// Enabling the source also requires closure checks, attribution, and a way to
// prevent onward feeds and JobPosting structured data.

export interface HimalayasJob {
  guid: string;
  applicationLink: string;
  companyName: string;
  companySlug: string;
  title: string;
  locationRestrictions: string[] | null;
  timezoneRestrictions: number[] | null;
  indiaEligible: boolean;
  seniority: string[];
  employmentType: string;
  excerpt: string;
  pubDate: number | null;
  expiryDate: number;
}

function strings(value: unknown): string[] | null {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string" && item.trim().length > 0)) return null;
  return value.map((item: string) => item.trim());
}

function validApplicationLink(value: unknown): value is string {
  if (typeof value !== "string" || value !== value.trim()) return false;
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password;
  } catch {
    return false;
  }
}

// The API says an empty country list means unrestricted; an absent or invalid
// timezone list is unknown, not evidence that India is eligible.
export function himalayasAllowsIndia(countries: string[] | null, timezones: number[] | null): boolean {
  const countryAllowed = countries !== null && (countries.length === 0 || countries.some((country) => /^india$/i.test(country)));
  return countryAllowed && timezones !== null && timezones.includes(5.5);
}

/**
 * Validate one feed record without changing its applicationLink. A future sync
 * must also check the single-job endpoint: a job can close before expiryDate.
 */
export function parseHimalayasJob(value: unknown, nowSeconds = Date.now() / 1000): HimalayasJob | null {
  if (!value || typeof value !== "object") return null;
  const job = value as Record<string, unknown>;
  if (typeof job.guid !== "string" || typeof job.companyName !== "string" ||
      typeof job.companySlug !== "string" || typeof job.title !== "string" ||
      !job.companyName.trim() || !job.companySlug.trim() || !job.title.trim() ||
      !validApplicationLink(job.applicationLink) ||
      typeof job.expiryDate !== "number" || !Number.isFinite(job.expiryDate) || job.expiryDate <= nowSeconds) return null;
  try {
    const guid = new URL(job.guid);
    if (guid.protocol !== "https:" || guid.hostname !== "himalayas.app" || guid.username || guid.password || guid.search || guid.hash ||
        !/^\/companies\/[^/]+\/jobs\/[^/]+\/?$/.test(guid.pathname)) return null;
  } catch {
    return null;
  }
  // locationRestrictions is documented as optional, so absence means the
  // documented unrestricted-country case. Malformed values remain unknown.
  const countries = job.locationRestrictions === undefined ? [] : strings(job.locationRestrictions);
  const timezones = Array.isArray(job.timezoneRestrictions) &&
    job.timezoneRestrictions.every((offset: unknown) => typeof offset === "number" && Number.isFinite(offset))
    ? job.timezoneRestrictions as number[] : null;
  return {
    guid: job.guid,
    applicationLink: job.applicationLink,
    companyName: job.companyName.trim(),
    companySlug: job.companySlug.trim(),
    title: job.title.trim(),
    locationRestrictions: countries,
    timezoneRestrictions: timezones,
    indiaEligible: himalayasAllowsIndia(countries, timezones),
    seniority: strings(job.seniority) || [],
    employmentType: typeof job.employmentType === "string" ? job.employmentType.trim() : "",
    excerpt: typeof job.excerpt === "string" ? job.excerpt.trim() : "",
    pubDate: typeof job.pubDate === "number" && Number.isFinite(job.pubDate) ? job.pubDate : null,
    expiryDate: job.expiryDate,
  };
}
// A limited feed page is not an authoritative inventory. Only a known
// expiry or the single-job endpoint's explicit 410 proves a listing closed.
// Treat 404, rate limits, network errors, and all other responses as unknown.
export function shouldRemoveHimalayasJob(
  expiryDate: number | null,
  singleJobStatus: number | null,
  nowSeconds = Date.now() / 1000
): boolean {
  return (expiryDate !== null && Number.isFinite(expiryDate) && expiryDate <= nowSeconds) ||
    singleJobStatus === 410;
}
// This bounded first-page fetch is deliberately not connected to sync yet.
// It is not a complete inventory and cannot justify deleting missing jobs.
export async function fetchHimalayasFirstPage(env: WorkerEnv): Promise<{
  jobs: HimalayasJob[];
  nextCursor: string | null;
  fromCache: boolean;
}> {
  const result = await cachedFetchJson<unknown>(
    env,
    "himalayas_first_page_v1",
    "https://himalayas.app/jobs/api?limit=20",
    {
      ttlSeconds: 86400,
      minIntervalMs: 86460000,
      forceLive: false,
      timeoutMs: 7000,
      headers: { "User-Agent": "JobSniper/1.0 (+https://github.com/hiraypawan/JobSniper)" },
    }
  );
  if (!result.data || typeof result.data !== "object") throw new Error("Invalid Himalayas feed");
  const payload = result.data as Record<string, unknown>;
  if (!Array.isArray(payload.jobs)) throw new Error("Invalid Himalayas jobs array");
  const jobs = payload.jobs.flatMap((value: unknown) => {
    const job = parseHimalayasJob(value);
    return job ? [job] : [];
  });
  return {
    jobs,
    nextCursor: typeof payload.nextCursor === "string" ? payload.nextCursor : null,
    fromCache: result.fromCache,
  };
}

// Dormant isolated storage: no sync or public route calls this yet. Keeping
// these rows outside the shared jobs table avoids accidentally exporting them.
// A page is partial: never remove records merely absent from it.
export async function storeHimalayasPage(
  env: WorkerEnv,
  jobs: HimalayasJob[],
  nowSeconds = Date.now() / 1000
): Promise<void> {
  if (!Number.isFinite(nowSeconds) || jobs.length > 20) throw new Error("Invalid Himalayas page");
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS himalayas_source_jobs (
      guid TEXT PRIMARY KEY,
      expiry_date REAL NOT NULL,
      payload TEXT NOT NULL
    )`
  ).run();
  const validJobs = jobs.flatMap((job) => {
    const parsed = parseHimalayasJob(job, nowSeconds);
    return parsed ? [parsed] : [];
  });
  const statements = [
    env.DB.prepare("DELETE FROM himalayas_source_jobs WHERE expiry_date <= ?").bind(nowSeconds),
    ...validJobs.map((job) => env.DB.prepare(
      `INSERT INTO himalayas_source_jobs (guid, expiry_date, payload) VALUES (?, ?, ?)
       ON CONFLICT(guid) DO UPDATE SET expiry_date = excluded.expiry_date, payload = excluded.payload`
    ).bind(job.guid, job.expiryDate, JSON.stringify(job))),
  ];
  await env.DB.batch(statements);
}

// Check a single source listing without interpreting an incomplete feed as an
// inventory. Fail closed on malformed URLs, network errors, redirects or any
// response other than the documented 410; expiry alone is sufficient.
export async function checkHimalayasJobClosure(
  job: Pick<HimalayasJob, "guid" | "expiryDate">,
  nowSeconds = Date.now() / 1000,
  fetcher: typeof fetch = fetch
): Promise<boolean> {
  if (shouldRemoveHimalayasJob(job.expiryDate, null, nowSeconds)) return true;
  let path: string;
  try {
    const guid = new URL(job.guid);
    if (guid.protocol !== "https:" || guid.hostname !== "himalayas.app" ||
        guid.port || guid.username || guid.password || guid.search || guid.hash ||
        !/^\/companies\/[^/]+\/jobs\/[^/]+\/?$/.test(guid.pathname)) return false;
    path = guid.pathname;
  } catch {
    return false;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetcher(`https://himalayas.app/jobs/api${path}`, {
      headers: { "User-Agent": "JobSniper/1.0 (+https://github.com/hiraypawan/JobSniper)" },
      redirect: "error",
      signal: controller.signal,
    });
    return shouldRemoveHimalayasJob(job.expiryDate, response.status, nowSeconds);
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}
