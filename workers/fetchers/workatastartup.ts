import { WorkerEnv } from "@/lib/cf-types";
import {
  cleanWebsiteUrl,
  makeCompanyId,
  makeJobId,
  normalizeDomain,
  normalizeYcBatchCode,
} from "@/lib/domain";
import { FetcherResult, NormalizedCompanyInput } from "@/lib/types";
import { cachedFetchText } from "@/workers/httpCache";

interface YcHiringCompany {
  id: number;
  name: string;
  slug: string;
  website?: string;
  small_logo_thumb_url?: string;
  all_locations?: string;
  long_description?: string;
  one_liner?: string;
  team_size?: number | null;
  tags?: string[];
  industry?: string;
  batch?: string;
  regions?: string[];
  url?: string;
}

const RECENT_WAAS_BATCHES = new Set([
  "F26",
  "S26",
  "X26",
  "W26",
  "F25",
  "S25",
  "X25",
  "W25",
  "F24",
  "S24",
  "W24",
]);

function extractNextDataCompanies(html: string): NormalizedCompanyInput[] {
  const out: NormalizedCompanyInput[] = [];
  const match = html.match(
    /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i
  );
  if (!match) return out;
  try {
    const parsed = JSON.parse(match[1]);
    const rawList =
      parsed?.props?.pageProps?.companies ||
      parsed?.props?.pageProps?.initialCompanies ||
      [];
    if (!Array.isArray(rawList)) return out;

    for (const c of rawList) {
      if (!c?.name) continue;
      const website = cleanWebsiteUrl(c.website);
      if (!website) continue;
      const domain = normalizeDomain(website, c.name);
      const companyId = makeCompanyId(domain);
      const batchInfo = normalizeYcBatchCode(c.batch);
      const waasUrl = c.slug
        ? `https://www.workatastartup.com/companies/${c.slug}`
        : "https://www.workatastartup.com/companies";

      const rawJobs = Array.isArray(c.jobs) ? c.jobs : [];
      const jobs: NonNullable<NormalizedCompanyInput["jobs"]> = rawJobs.flatMap(
        (j: { title?: string; url?: string; location?: string; remote?: boolean }) => {
          const title = typeof j.title === "string" ? j.title.trim() : "";
          const jobUrl = cleanWebsiteUrl(j.url);
          if (!title || !jobUrl) return [];
          return [{
            id: makeJobId(companyId, title, jobUrl),
            title,
            url: jobUrl,
            location: j.location?.trim() || null,
            remote: j.remote === true,
            department: null,
          }];
        }
      );
      const location = c.location?.trim() || c.all_locations?.trim() || null;
      const isRemote = /remote/i.test(location || "") || jobs.some((job) => job.remote);

      out.push({
        id: companyId,
        name: c.name,
        source: "workatastartup",
        batch: batchInfo.shortCode,
        description: c.description || c.one_liner || `${c.name} is hiring on YC Work at a Startup.`,
        one_liner: c.one_liner || "",
        website,
        logo_url: c.logo_url || null,
        location,
        team_size: typeof c.team_size === "number" ? c.team_size : null,
        is_remote: isRemote,
        last_funding_date: null,
        is_funded_last_12mo: false,
        hiring_page_url: waasUrl,
        hiring_provider: "yc",
        open_roles_count: jobs.length,
        jobs,
      });
    }
  } catch {
    // fallback below handles cleanly
  }
  return out;
}

export async function fetchWorkAtAStartup(
  env: WorkerEnv,
  options: { forceLive?: boolean } = {}
): Promise<FetcherResult> {
  const started = Date.now();
  const forceLive = Boolean(options.forceLive);
  const companies: NormalizedCompanyInput[] = [];
  let fromCache = true;

  // 1. Attempt direct WorkAtAStartup public listing HTML/JSON parse first
  try {
    const directRes = await cachedFetchText(
      env,
      "waas_direct_html",
      "https://www.workatastartup.com/companies?demographic=any&hasEquity=any&hasSalary=any&industry=any&interviewProcess=any&jobType=fulltime&layout=list-compact&remote=true&sortBy=created_desc",
      { ttlSeconds: 600, forceLive, timeoutMs: 4500 }
    );
    if (!directRes.fromCache) fromCache = false;
    companies.push(...extractNextDataCompanies(directRes.text));
  } catch {
    // WorkAtAStartup requires Bookface session on some endpoints; enrich from live yc-oss hiring feed next
  }

  // 2. Pull live active hiring YC startups via yc-oss hiring feed (real-time WAAS mirror)
  try {
    const ghHeaders: Record<string, string> = {
      Accept: "application/vnd.github.raw+json",
      "X-GitHub-Api-Version": "2022-11-28",
    };
    if (env.GITHUB_TOKEN) {
      ghHeaders.Authorization = `Bearer ${env.GITHUB_TOKEN}`;
    }

    const res = await cachedFetchText(
      env,
      "waas_yc_hiring_feed",
      "https://api.github.com/repos/yc-oss/api/contents/companies/hiring.json?ref=gh-pages",
      { ttlSeconds: 600, forceLive, timeoutMs: 9000, headers: ghHeaders }
    );
    if (!res.fromCache) fromCache = false;

    const rawHiring = JSON.parse(res.text) as YcHiringCompany[];
    for (const item of rawHiring) {
      const batchInfo = normalizeYcBatchCode(item.batch);
      if (!batchInfo.shortCode || !RECENT_WAAS_BATCHES.has(batchInfo.shortCode)) {
        continue;
      }

      const loc = item.all_locations || "";
      const isRemote =
        /remote/i.test(loc) ||
        (item.regions || []).some((r) => /remote/i.test(r));

      // Keep the target feed focused on remote or smaller YC companies.
      if (!isRemote && (item.team_size || 0) > 25) {
        continue;
      }

      const website = cleanWebsiteUrl(item.website);
      if (!website) continue;
      const domain = normalizeDomain(website, item.name);
      const companyId = makeCompanyId(domain);
      const waasCompanyUrl = `https://www.workatastartup.com/companies/${item.slug}`;
      companies.push({
        id: companyId,
        name: item.name,
        source: "workatastartup",
        batch: batchInfo.shortCode,
        description:
          item.long_description?.trim() ||
          item.one_liner?.trim() ||
          `${item.name} is actively hiring early engineers via YC Work at a Startup.`,
        one_liner: item.one_liner?.trim() || "",
        website,
        yc_url: item.url || `https://www.ycombinator.com/companies/${item.slug}`,
        logo_url: item.small_logo_thumb_url || null,
        location: loc || null,
        team_size:
          typeof item.team_size === "number" && item.team_size > 0
            ? item.team_size
            : null,
        is_remote: isRemote,
        last_funding_date: null,
        funding_amount: null,
        is_funded_last_12mo: false,
        hiring_page_url: waasCompanyUrl,
        hiring_provider: "yc",
        open_roles_count: 0,
        tags: (item.tags || []).slice(0, 6),
        jobs: [],
      });
    }

    return {
      source: "workatastartup",
      companies,
      durationMs: Date.now() - started,
      mode: fromCache ? "cached" : "live",
      note: `Loaded ${companies.length} companies that are hiring right now`,
    };
  } catch (err) {
    return {
      source: "workatastartup",
      companies,
      durationMs: Date.now() - started,
      mode: "live+fallback",
      error: err instanceof Error ? err.message : "WAAS fetch error",
    };
  }
}
