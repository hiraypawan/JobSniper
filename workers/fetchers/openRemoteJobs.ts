import { WorkerEnv } from "@/lib/cf-types";
import { makeCompanyId, makeJobId, normalizeDomain } from "@/lib/domain";
import { FetcherResult, NormalizedCompanyInput } from "@/lib/types";
import { cachedFetchJson } from "@/workers/httpCache";

interface RemotiveJob {
  id?: number;
  url?: string;
  title?: string;
  company_name?: string;
  company_logo?: string;
  category?: string;
  tags?: string[];
  publication_date?: string;
  candidate_required_location?: string;
  job_type?: string;
  description?: string;
}

interface JobicyJob {
  id?: number;
  url?: string;
  jobTitle?: string;
  companyName?: string;
  companyLogo?: string;
  jobIndustry?: string[];
  jobType?: string;
  jobGeo?: string;
  jobLevel?: string;
  jobExcerpt?: string;
  jobDescription?: string;
  pubDate?: string;
}

function cleanDescription(value: string | undefined): string {
  return (value || "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&#x27;/gi, "'")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1200);
}

function safeListingUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function normalizePostedDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const timestamp = Date.parse(raw);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString().slice(0, 10) : null;
}

/**
 * Include only remote listings whose source explicitly permits India, Asia, or
 * applicants worldwide. A generic "Remote" label is not enough to infer India
 * eligibility.
 */
function isIndiaEligibleLocation(location: string): boolean {
  return /\bindia\b|\bworldwide\b|\banywhere\b|\b(asia|asia pacific|apac)\b/i.test(location);
}

function groupJobs(
  source: "remotive" | "jobicy",
  roles: Array<{
    companyName: string;
    title: string;
    url: string;
    location: string;
    description: string;
    postedAt: string | null;
    category: string | null;
    logo: string | null;
  }>
): NormalizedCompanyInput[] {
  const grouped = new Map<string, NormalizedCompanyInput>();
  for (const role of roles) {
    const companyName = role.companyName.trim().slice(0, 100);
    const title = role.title.trim().slice(0, 120);
    if (!companyName || !title) continue;

    // These listings do not reliably include the employer's own website. Keep
    // it blank and use a clearly synthetic internal key rather than inventing a
    // domain or treating the job-board URL as the company's website.
    const domain = normalizeDomain("", `${source}-${companyName}`);
    const companyId = makeCompanyId(domain);
    let company = grouped.get(domain);
    if (!company) {
      company = {
        id: companyId,
        name: companyName,
        source,
        batch: null,
        description: `Remote roles listed on ${source === "remotive" ? "Remotive" : "Jobicy"}; the source does not provide a verified company website.`,
        one_liner: `Remote role: ${title}`,
        website: "",
        logo_url: role.logo,
        location: null,
        team_size: null,
        is_remote: true,
        last_funding_date: null,
        is_funded_last_12mo: false,
        hiring_page_url: role.url,
        hiring_provider: "other",
        open_roles_count: 0,
        tags: ["Remote role", source === "remotive" ? "Remotive" : "Jobicy"],
        jobs: [],
      };
      grouped.set(domain, company);
    }

    if ((company.jobs || []).length >= 5) continue;
    const jobId = makeJobId(companyId, title, role.url);
    company.jobs!.push({
      id: jobId,
      title,
      url: role.url,
      location: role.location.slice(0, 120),
      remote: true,
      department: role.category,
      description: role.description || null,
      posted_at: role.postedAt,
    });
    company.open_roles_count = company.jobs!.length;
    const previousNewestPost = company.jobs!
      .slice(0, -1)
      .reduce((latest, job) => (job.posted_at && job.posted_at > latest ? job.posted_at : latest), "");
    if (!company.hiring_page_url || (role.postedAt && role.postedAt >= previousNewestPost)) {
      company.hiring_page_url = role.url;
    }
    if (role.category && !company.tags!.includes(role.category)) {
      company.tags!.push(role.category);
    }
  }
  return Array.from(grouped.values()).slice(0, 50);
}

export function normalizeRemotiveJobs(payload: { jobs?: RemotiveJob[] }): NormalizedCompanyInput[] {
  const roles = (Array.isArray(payload.jobs) ? payload.jobs : []).flatMap((job) => {
    const location = (job.candidate_required_location || "").trim();
    const url = safeListingUrl(job.url);
    if (!url || !isIndiaEligibleLocation(location)) return [];
    return [{
      companyName: job.company_name || "",
      title: job.title || "",
      url,
      location,
      description: cleanDescription([
        job.description,
        job.tags?.length ? `Source-listed tags: ${job.tags.join(", ")}` : "",
      ].filter(Boolean).join(" ")),
      postedAt: normalizePostedDate(job.publication_date),
      category: job.category || null,
      logo: safeListingUrl(job.company_logo || undefined),
    }];
  });
  return groupJobs("remotive", roles);
}

export function normalizeJobicyJobs(payload: { jobs?: JobicyJob[] }): NormalizedCompanyInput[] {
  const roles = (Array.isArray(payload.jobs) ? payload.jobs : []).flatMap((job) => {
    const location = (job.jobGeo || "").trim();
    const url = safeListingUrl(job.url);
    if (!url || !isIndiaEligibleLocation(location)) return [];
    return [{
      companyName: job.companyName || "",
      title: job.jobTitle || "",
      url,
      location,
      description: cleanDescription([
        job.jobDescription || job.jobExcerpt,
        job.jobLevel ? `Source-listed level: ${job.jobLevel}` : "",
      ].filter(Boolean).join(" ")),
      postedAt: normalizePostedDate(job.pubDate),
      category: job.jobLevel || (Array.isArray(job.jobIndustry) ? job.jobIndustry[0] || null : null),
      logo: safeListingUrl(job.companyLogo),
    }];
  });
  return groupJobs("jobicy", roles);
}

async function fetchFeed<T>(
  env: WorkerEnv,
  source: "remotive" | "jobicy",
  url: string,
  options: { forceLive?: boolean },
  normalize: (payload: T) => NormalizedCompanyInput[]
): Promise<FetcherResult> {
  const started = Date.now();
  try {
    const result = await cachedFetchJson<T>(env, `open_remote_jobs_${source}_v1`, url, {
      ttlSeconds: 3600,
      forceLive: Boolean(options.forceLive),
      timeoutMs: 7000,
    });
    const companies = normalize(result.data);
    return {
      source,
      companies,
      durationMs: Date.now() - started,
      mode: result.fromCache ? "cached" : "live",
      note: `Read ${companies.reduce((count, company) => count + (company.jobs?.length || 0), 0)} India/Asia/worldwide-eligible roles; only source-listed location eligibility is included.`,
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      source,
      companies: [],
      durationMs: Date.now() - started,
      mode: "unavailable",
      note: "Public feed request failed; existing D1 records were kept.",
      error: detail.slice(0, 240),
    };
  }
}

export function fetchRemotiveJobs(
  env: WorkerEnv,
  options: { forceLive?: boolean } = {}
): Promise<FetcherResult> {
  return fetchFeed(
    env,
    "remotive",
    "https://remotive.com/api/remote-jobs?limit=50",
    options,
    normalizeRemotiveJobs
  );
}

export function fetchJobicyJobs(
  env: WorkerEnv,
  options: { forceLive?: boolean } = {}
): Promise<FetcherResult> {
  return fetchFeed(
    env,
    "jobicy",
    "https://jobicy.com/api/v2/remote-jobs?count=50&geo=anywhere",
    options,
    normalizeJobicyJobs
  );
}
