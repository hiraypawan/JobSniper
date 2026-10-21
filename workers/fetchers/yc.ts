import { WorkerEnv } from "@/lib/cf-types";
import {
  cleanWebsiteUrl,
  getRollingYcBatchSlugs,
  makeCompanyId,
  makeJobId,
  normalizeDomain,
  normalizeYcBatchCode,
} from "@/lib/domain";
import { FetcherResult, NormalizedCompanyInput } from "@/lib/types";
import { cachedFetchText } from "@/workers/httpCache";

interface YcOssCompany {
  id: number;
  name: string;
  slug: string;
  small_logo_thumb_url?: string;
  website?: string;
  all_locations?: string;
  long_description?: string;
  one_liner?: string;
  team_size?: number | null;
  industry?: string;
  subindustry?: string;
  launched_at?: number;
  tags?: string[];
  isHiring?: boolean;
  batch?: string;
  status?: string;
  regions?: string[];
  url?: string;
}

function inferRolesForYcStartup(company: YcOssCompany): string[] {
  const blob = [
    company.one_liner || "",
    company.long_description || "",
    ...(company.tags || []),
    company.industry || "",
  ]
    .join(" ")
    .toLowerCase();

  const roles: string[] = [];
  if (/ai|agent|llm|ml|vision|robotics|voice/.test(blob)) {
    roles.push("Founding AI / Systems Engineer");
  } else {
    roles.push("Founding Full-Stack Engineer");
  }

  if ((company.team_size || 0) >= 4) {
    if (/b2b|saas|sales|enterprise|fintech/.test(blob)) {
      roles.push("Founding GTM & Growth Lead");
    } else {
      roles.push("Product Engineer (Frontend / Design)");
    }
  }
  return roles;
}

async function fetchBatchList(
  env: WorkerEnv,
  batchSlug: string,
  forceLive: boolean
): Promise<{ items: YcOssCompany[]; fromCache: boolean }> {
  const ghApiUrl = `https://api.github.com/repos/yc-oss/api/contents/batches/${batchSlug}.json?ref=gh-pages`;
  const ghHeaders: Record<string, string> = {
    Accept: "application/vnd.github.raw+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (env.GITHUB_TOKEN) {
    ghHeaders.Authorization = `Bearer ${env.GITHUB_TOKEN}`;
  }

  try {
    const res = await cachedFetchText(
      env,
      `yc_batch_${batchSlug}`,
      ghApiUrl,
      {
        ttlSeconds: 600,
        forceLive,
        timeoutMs: 8000,
        headers: ghHeaders,
      }
    );
    return {
      items: JSON.parse(res.text) as YcOssCompany[],
      fromCache: res.fromCache,
    };
  } catch {
    // Fallback to yc-oss GitHub Pages CDN URL
    const pagesUrl = `https://yc-oss.github.io/api/batches/${batchSlug}.json`;
    const res = await cachedFetchText(
      env,
      `yc_pages_${batchSlug}`,
      pagesUrl,
      {
        ttlSeconds: 600,
        forceLive,
        timeoutMs: 8000,
      }
    );
    return {
      items: JSON.parse(res.text) as YcOssCompany[],
      fromCache: res.fromCache,
    };
  }
}

export async function fetchYcCompanies(
  env: WorkerEnv,
  options: { forceLive?: boolean } = {}
): Promise<FetcherResult> {
  const started = Date.now();
  const forceLive = Boolean(options.forceLive);
  const dynamicBatchSlugs = getRollingYcBatchSlugs();

  try {
    const results = await Promise.allSettled(
      dynamicBatchSlugs.map((slug) => fetchBatchList(env, slug, forceLive))
    );

    const companies: NormalizedCompanyInput[] = [];
    let anyLive = false;
    let succeededBatches = 0;

    for (const r of results) {
      if (r.status !== "fulfilled") continue;
      succeededBatches++;
      if (!r.value.fromCache) anyLive = true;

      for (const raw of r.value.items) {
        if (!raw.name) continue;
        if (raw.status && raw.status.toLowerCase() === "inactive") continue;

        const website =
          cleanWebsiteUrl(raw.website) ||
          raw.url ||
          `https://www.ycombinator.com/companies/${raw.slug}`;
        const domain = normalizeDomain(website, raw.name);
        const companyId = makeCompanyId(domain);
        const batchInfo = normalizeYcBatchCode(raw.batch);

        const locationStr = raw.all_locations?.trim() || null;
        const isRemote =
          Boolean(
            locationStr && /remote/i.test(locationStr)
          ) ||
          Boolean(
            (raw.regions || []).some((reg) => /remote/i.test(reg))
          );

        const ycJobsUrl = `https://www.ycombinator.com/companies/${raw.slug}/jobs`;
        const isHiring = Boolean(raw.isHiring);
        const inferredTitles = isHiring ? inferRolesForYcStartup(raw) : [];

        const jobs = inferredTitles.map((title) => ({
          id: makeJobId(companyId, title, ycJobsUrl),
          title,
          url: ycJobsUrl,
          location: isRemote ? "Remote / Hybrid" : locationStr,
          remote: isRemote,
          department: "Engineering / Core Team",
          posted_at: batchInfo.approximateDate,
        }));

        const descriptionText =
          raw.long_description?.trim() ||
          raw.one_liner?.trim() ||
          `${raw.name} (${batchInfo.shortCode || "YC"}) startup.`;

        companies.push({
          id: companyId,
          name: raw.name.trim(),
          source: "yc",
          batch: batchInfo.shortCode,
          description: descriptionText,
          one_liner: raw.one_liner?.trim() || descriptionText.slice(0, 120),
          website,
          yc_url:
            raw.url || `https://www.ycombinator.com/companies/${raw.slug}`,
          logo_url: raw.small_logo_thumb_url || null,
          location: locationStr,
          team_size:
            typeof raw.team_size === "number" && raw.team_size > 0
              ? raw.team_size
              : null,
          is_remote: isRemote,
          last_funding_date: batchInfo.approximateDate,
          funding_amount: "$500K YC Standard Deal",
          is_funded_last_12mo: batchInfo.withinLast12Mo,
          hiring_page_url: isHiring ? ycJobsUrl : null,
          hiring_provider: isHiring ? "yc" : null,
          open_roles_count: jobs.length,
          tags: Array.from(
            new Set(
              [
                ...(raw.tags || []),
                raw.industry || "",
                raw.subindustry || "",
              ].filter(Boolean)
            )
          ).slice(0, 6),
          jobs,
        });
      }
    }

    if (succeededBatches === 0) {
      throw new Error("All YC batch endpoints failed");
    }

    return {
      source: "yc",
      companies,
      durationMs: Date.now() - started,
      mode: anyLive ? "live" : "cached",
      note: `Synced ${companies.length} startups across ${succeededBatches} recent YC cohorts (W25–F26)`,
    };
  } catch (err) {
    return {
      source: "yc",
      companies: [],
      durationMs: Date.now() - started,
      mode: "live+fallback",
      error: err instanceof Error ? err.message : "YC fetch error",
    };
  }
}
