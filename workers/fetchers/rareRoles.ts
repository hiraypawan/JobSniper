import { WorkerEnv } from "@/lib/cf-types";
import { makeCompanyId, makeJobId, normalizeDomain } from "@/lib/domain";
import { FetcherResult, NormalizedCompanyInput } from "@/lib/types";
import { fetchWithResilience, readD1Cache, writeD1Cache } from "@/workers/httpCache";

const API_URL = "https://api.rareroles.com/api/jobs?sort=newest&limit=50";
const CACHE_KEY = "rareroles_jobs_v1";

function text(value: unknown, max = 200): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function listingUrl(value: unknown): string | null {
  try {
    const url = new URL(text(value, 2000));
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Preserve the source's fields per job; never infer an employer website. */
export function normalizeRareRolesJobs(payload: unknown): NormalizedCompanyInput[] {
  if (!payload || typeof payload !== "object" || !Array.isArray((payload as { jobs?: unknown }).jobs)) {
    throw new Error("RareRoles response is missing a jobs array");
  }
  const companies = new Map<string, NormalizedCompanyInput>();
  const jobs = (payload as { jobs: unknown[] }).jobs.slice(0, 50);
  for (const item of jobs) {
    if (!item || typeof item !== "object") continue;
    const job = item as Record<string, unknown>;
    const name = text(job.company, 100);
    const title = text(job.title, 120);
    const url = listingUrl(job.apply_url);
    const sourceId = text(job.id, 200);
    if (!name || !title || !url || !sourceId) continue;
    const location = text(job.location, 120);
    const workType = text(job.work_type, 50);
    const level = text(job.experience_level, 50);
    const department = text(job.department, 100);
    const remote = /^remote$/i.test(workType);
    const date = Date.parse(text(job.posted_date, 100));
    const postedAt = Number.isFinite(date) ? new Date(date).toISOString().slice(0, 10) : null;
    const sourceUrl = API_URL;
    const domain = normalizeDomain("", "rareroles-" + name);
    const companyId = makeCompanyId(domain);
    let company = companies.get(domain);
    if (!company) {
      company = {
        id: companyId, name, source: "rareroles", website: "",
        description: "Roles listed on RareRoles; the source does not provide a verified employer website.",
        one_liner: "Role: " + title, location: null, team_size: null,
        is_remote: remote, last_funding_date: null, is_funded_last_12mo: false,
        hiring_page_url: url, hiring_provider: "other", open_roles_count: 0,
        tags: ["RareRoles"], jobs: [],
      };
      companies.set(domain, company);
    }
    if (company.jobs!.length >= 5) continue;
    if (company.jobs!.some((existing) => existing.url === url)) continue;
    company.jobs!.push({
      id: makeJobId(companyId, title, url), title, url,
      location: location || null, remote, department: department || null,
      description: [level ? "Source-listed level: " + level + "." : "", "RareRoles listing: " + sourceUrl].filter(Boolean).join(" "),
      posted_at: postedAt,
    });
    company.is_remote = company.is_remote || remote;
    company.open_roles_count = company.jobs!.length;
  }
  return Array.from(companies.values());
}

async function lastSuccess(env: WorkerEnv): Promise<string | null> {
  try {
    const row = await env.DB.prepare("SELECT updated_at FROM http_cache WHERE cache_key = ?")
      .bind(CACHE_KEY).first<{ updated_at: string }>();
    return row?.updated_at || null;
  } catch {
    return null;
  }
}

export async function fetchRareRolesJobs(env: WorkerEnv): Promise<FetcherResult> {
  const started = Date.now();
  try {
    // Always honor the six-hour cache, including on force-sync, to limit upstream load.
    let raw = await readD1Cache(env, CACHE_KEY);
    const fromCache = raw !== null;
    if (raw === null) raw = (await fetchWithResilience(API_URL, { timeoutMs: 7000, headers: { Accept: "application/json" } })).text;
    const companies = normalizeRareRolesJobs(JSON.parse(raw) as unknown);
    if (!fromCache) await writeD1Cache(env, CACHE_KEY, raw, 21600);
    const at = await lastSuccess(env);
    return {
      source: "rareroles", companies, durationMs: Date.now() - started,
      mode: fromCache ? "cached" : "live",
      note: "RareRoles jobs retain source-stated locations and levels; employer websites are not inferred.",
      feedStatuses: [{ name: "RareRoles", url: API_URL, status: fromCache ? "cached" : "live", lastSuccessfulAt: at }],
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      source: "rareroles", companies: [], durationMs: Date.now() - started, mode: "unavailable",
      note: "RareRoles failed; existing D1 records were kept.", error: detail.slice(0, 240),
      feedStatuses: [{ name: "RareRoles", url: API_URL, status: /HTTP 403\b/i.test(detail) ? "blocked" : "unavailable", reason: detail.slice(0, 240), lastSuccessfulAt: await lastSuccess(env) }],
    };
  }
}
