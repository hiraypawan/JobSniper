import { WorkerEnv } from "@/lib/cf-types";
import { cleanWebsiteUrl, makeJobId } from "@/lib/domain";
import { HiringProvider, JobPosting } from "@/lib/types";
import { fetchWithResilience } from "@/workers/httpCache";

export interface EnrichmentOutcome {
  hiring_page_url: string | null;
  hiring_provider: HiringProvider;
  open_roles_count: number;
  jobs: JobPosting[];
  jobsVerified: boolean;
  tech_stack: string[];
  checkedLive: boolean;
}

interface AtsMatch {
  provider: HiringProvider;
  slug: string;
  boardUrl: string;
}

export function detectAtsFromUrl(rawUrl: string): AtsMatch | null {
  const url = rawUrl.trim();
  const ghMatch = url.match(
    /(?:boards|job-boards)\.greenhouse\.io\/([a-zA-Z0-9_-]+)/i
  );
  if (ghMatch) {
    return {
      provider: "greenhouse",
      slug: ghMatch[1],
      boardUrl: `https://boards.greenhouse.io/${ghMatch[1]}`,
    };
  }

  const leverMatch = url.match(/jobs\.lever\.co\/([a-zA-Z0-9_-]+)/i);
  if (leverMatch) {
    return {
      provider: "lever",
      slug: leverMatch[1],
      boardUrl: `https://jobs.lever.co/${leverMatch[1]}`,
    };
  }

  const ashbyMatch = url.match(/jobs\.ashbyhq\.com\/([a-zA-Z0-9.%_-]+)/i);
  if (ashbyMatch) {
    return {
      provider: "ashby",
      slug: decodeURIComponent(ashbyMatch[1]),
      boardUrl: `https://jobs.ashbyhq.com/${ashbyMatch[1]}`,
    };
  }

  const workableMatch = url.match(/apply\.workable\.com\/([a-zA-Z0-9_-]+)/i);
  if (workableMatch) {
    return {
      provider: "workable",
      slug: workableMatch[1],
      boardUrl: `https://apply.workable.com/${workableMatch[1]}`,
    };
  }

  if (/breezy\.hr/i.test(url)) {
    return { provider: "breezy", slug: "", boardUrl: url };
  }
  if (/recruitee\.com/i.test(url)) {
    return { provider: "recruitee", slug: "", boardUrl: url };
  }
  if (/app\.dover\.com/i.test(url)) {
    return { provider: "dover", slug: "", boardUrl: url };
  }
  if (/ycombinator\.com\/companies\/[^/]+\/jobs|workatastartup\.com/i.test(url)) {
    return { provider: "yc", slug: "", boardUrl: url };
  }

  return null;
}

function normalizeJobDescription(raw?: string | null): string | null {
  if (!raw) return null;
  const text = raw
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_match, code: string) => {
      const point = Number(code);
      return Number.isInteger(point) && point >= 0 && point <= 0x10ffff
        ? String.fromCodePoint(point)
        : " ";
    })
    .replace(/\s+/g, " ")
    .trim();
  return text ? text.slice(0, 2400) : null;
}

function sniffTechStackFromHtml(html: string): string[] {
  const stack: string[] = [];
  if (/__NEXT_DATA__|\/_next\/static/i.test(html)) stack.push("Next.js");
  if (/data-wf-domain|webflow\.com/i.test(html)) stack.push("Webflow");
  if (/framerusercontent\.com|framer\.com/i.test(html)) stack.push("Framer");
  if (/js\.stripe\.com/i.test(html)) stack.push("Stripe");
  if (/supabase\.co/i.test(html)) stack.push("Supabase");
  if (/posthog\.com/i.test(html)) stack.push("PostHog");
  if (/intercom\.io|widget\.intercom/i.test(html)) stack.push("Intercom");
  if (/clerk\.dev|clerk\.com/i.test(html)) stack.push("Clerk");
  return stack;
}

function extractSocialAndCareerSignals(
  html: string,
  baseWebsite: string
): {
  careerLinks: string[];
  atsMatch: AtsMatch | null;
  stack: string[];
} {
  const hrefRegex = /href=["']([^"'#]+)["']/gi;
  const careerLinks: string[] = [];
  let atsMatch: AtsMatch | null = null;
  let m: RegExpExecArray | null;

  while ((m = hrefRegex.exec(html)) !== null) {
    const rawHref = m[1].trim();
    if (!rawHref) continue;
    let resolved: string;
    try {
      resolved = new URL(rawHref, baseWebsite).toString();
    } catch {
      continue;
    }

    const ats = detectAtsFromUrl(resolved);
    if (ats && !atsMatch) {
      atsMatch = ats;
      careerLinks.unshift(ats.boardUrl);
    }
    if (/\/(careers|jobs|hiring|join|join-us|open-positions|work-with-us)(\/|$|\?)/i.test(resolved)) {
      careerLinks.push(resolved);
    }
  }

  return {
    careerLinks: Array.from(new Set(careerLinks)),
    atsMatch,
    stack: sniffTechStackFromHtml(html),
  };
}

export async function fetchAtsOpenRoles(
  companyId: string,
  ats: AtsMatch
): Promise<JobPosting[]> {
  // 1. Greenhouse Public Boards API: https://boards-api.greenhouse.io/v1/boards/{board}/jobs
  if (ats.provider === "greenhouse" && ats.slug) {
    const { text } = await fetchWithResilience(
      `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(ats.slug)}/jobs?content=true`,
      { timeoutMs: 4500, headers: { Accept: "application/json" } }
    );
    const data = JSON.parse(text) as {
      jobs?: {
        id: number;
        title: string;
        absolute_url: string;
        updated_at?: string;
        content?: string;
        location?: { name?: string };
      }[];
    };
    return (data.jobs || []).slice(0, 25).map((j) => {
      const loc = j.location?.name || null;
      return {
        id: makeJobId(companyId, j.title, j.absolute_url),
        company_id: companyId,
        title: j.title,
        url: j.absolute_url,
        location: loc,
        remote: Boolean(loc && /remote|anywhere|distributed/i.test(loc)),
        description: normalizeJobDescription(j.content),
        posted_at: j.updated_at ? j.updated_at.slice(0, 10) : null,
      };
    });
  }

  // 2. Lever Public Postings API: https://api.lever.co/v0/postings/{company}
  if (ats.provider === "lever" && ats.slug) {
    const { text } = await fetchWithResilience(
      `https://api.lever.co/v0/postings/${encodeURIComponent(ats.slug)}?mode=json`,
      { timeoutMs: 4500, headers: { Accept: "application/json" } }
    );
    const postings = JSON.parse(text) as {
      id: string;
      text: string;
      hostedUrl: string;
      descriptionPlain?: string;
      workplaceType?: string;
      createdAt?: number;
      categories?: { location?: string; team?: string };
    }[];
    if (!Array.isArray(postings)) return [];
    return postings.slice(0, 25).map((p) => {
      const loc = p.categories?.location || null;
      const isRemote =
        p.workplaceType === "remote" ||
        Boolean(loc && /remote|anywhere/i.test(loc));
      return {
        id: makeJobId(companyId, p.text, p.hostedUrl),
        company_id: companyId,
        title: p.text,
        url: p.hostedUrl,
        location: loc,
        remote: isRemote,
        description: normalizeJobDescription(p.descriptionPlain),
        department: p.categories?.team || null,
        posted_at: p.createdAt
          ? new Date(p.createdAt).toISOString().slice(0, 10)
          : null,
      };
    });
  }

  // 3. Ashby Public Job Board API: https://api.ashbyhq.com/posting-api/job-board/{company}
  if (ats.provider === "ashby" && ats.slug) {
    const { text } = await fetchWithResilience(
      `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(ats.slug)}`,
      { timeoutMs: 4500, headers: { Accept: "application/json" } }
    );
    const data = JSON.parse(text) as {
      jobs?: {
        id: string;
        title: string;
        jobUrl?: string;
        location?: string;
        isRemote?: boolean;
        department?: string;
        descriptionPlain?: string;
        descriptionHtml?: string;
        publishedAt?: string;
      }[];
    };
    return (data.jobs || []).slice(0, 25).map((j) => {
      const jobUrl = j.jobUrl || `${ats.boardUrl}/${j.id}`;
      return {
        id: makeJobId(companyId, j.title, jobUrl),
        company_id: companyId,
        title: j.title,
        url: jobUrl,
        location: j.location || null,
        remote:
          Boolean(j.isRemote) ||
          Boolean(j.location && /remote|anywhere/i.test(j.location)),
        department: j.department || null,
        description: normalizeJobDescription(j.descriptionPlain || j.descriptionHtml),
        posted_at: j.publishedAt ? j.publishedAt.slice(0, 10) : null,
      };
    });
  }

  // 4. Workable Public API
  if (ats.provider === "workable" && ats.slug) {
    const { text } = await fetchWithResilience(
      `https://apply.workable.com/api/v3/accounts/${encodeURIComponent(ats.slug)}/jobs`,
      {
        method: "POST",
        body: JSON.stringify({ query: "", location: [], department: [], worktype: [] }),
        timeoutMs: 4500,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
      }
    );
    const data = JSON.parse(text) as {
      results?: {
        shortcode: string;
        title: string;
        description?: string;
        remote?: boolean;
        location?: { city?: string; country?: string };
        published?: string;
      }[];
    };
    return (data.results || []).slice(0, 25).map((r) => {
      const url = `https://apply.workable.com/${ats.slug}/j/${r.shortcode}/`;
      const loc = [r.location?.city, r.location?.country]
        .filter(Boolean)
        .join(", ");
      return {
        id: makeJobId(companyId, r.title, url),
        company_id: companyId,
        title: r.title,
        url,
        location: loc || null,
        remote: Boolean(r.remote),
        description: normalizeJobDescription(r.description),
        posted_at: r.published ? r.published.slice(0, 10) : null,
      };
    });
  }

  return [];
}

export async function detectCompanyHiringAndSignals(
  _env: WorkerEnv,
  company: {
    id: string;
    name: string;
    website: string;
    hiring_page_url: string | null;
    hiring_provider: HiringProvider;
    open_roles_count: number;
    existingJobs?: JobPosting[];
  }
): Promise<EnrichmentOutcome> {
  const cleanSite = cleanWebsiteUrl(company.website);
  let atsMatch = company.hiring_page_url
    ? detectAtsFromUrl(company.hiring_page_url)
    : null;
  let hiringPageUrl = company.hiring_page_url;
  let stack: string[] = [];
  let checkedLive = false;

  // Step 1: Fetch company homepage HTML to find /careers, /jobs, /hiring links & social handles
  if (cleanSite && !/ycombinator\.com|news\.ycombinator\.com/i.test(cleanSite)) {
    try {
      const homeRes = await fetchWithResilience(cleanSite, { timeoutMs: 3500 });
      checkedLive = true;
      const signals = extractSocialAndCareerSignals(homeRes.text, cleanSite);
      stack = signals.stack;

      if (signals.atsMatch) {
        atsMatch = signals.atsMatch;
        hiringPageUrl = signals.atsMatch.boardUrl;
      } else if (signals.careerLinks.length > 0) {
        hiringPageUrl = signals.careerLinks[0];
        // Also inspect the discovered /careers page once if no direct ATS board link was on homepage
        try {
          const careerHtml = await fetchWithResilience(hiringPageUrl, {
            timeoutMs: 3000,
          });
          const nested = extractSocialAndCareerSignals(
            careerHtml.text,
            hiringPageUrl
          );
          if (nested.atsMatch) {
            atsMatch = nested.atsMatch;
            hiringPageUrl = nested.atsMatch.boardUrl;
          }
        } catch {
          // Keep discovered /careers link
        }
      }
    } catch {
      // Homepage unreachable or firewalled; continue gracefully
    }
  }

  // Only these public ATS APIs return actual job listings. A successful empty
  // response is still authoritative and must clear roles that have since closed.
  if (
    atsMatch &&
    atsMatch.provider &&
    new Set(["greenhouse", "lever", "ashby", "workable"]).has(atsMatch.provider)
  ) {
    try {
      const liveJobs = await fetchAtsOpenRoles(company.id, atsMatch);
      checkedLive = true;
      return {
        hiring_page_url: atsMatch.boardUrl,
        hiring_provider: atsMatch.provider,
        open_roles_count: liveJobs.length,
        jobs: liveJobs,
        jobsVerified: true,
        tech_stack: stack,
        checkedLive,
      };
    } catch {
      // Preserve existing known ATS roles if the live board is unreachable.
    }
  }

  const fallbackJobs = company.existingJobs || [];
  const finalProvider: HiringProvider =
    atsMatch?.provider ||
    company.hiring_provider ||
    (hiringPageUrl ? "other" : null);

  return {
    hiring_page_url: hiringPageUrl,
    hiring_provider: finalProvider,
    open_roles_count: Math.max(company.open_roles_count || 0, fallbackJobs.length),
    jobs: fallbackJobs,
    jobsVerified: false,
    tech_stack: stack,
    checkedLive,
  };
}
