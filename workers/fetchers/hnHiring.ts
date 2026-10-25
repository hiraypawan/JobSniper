import { WorkerEnv } from "@/lib/cf-types";
import {
  cleanWebsiteUrl,
  makeCompanyId,
  makeJobId,
  normalizeDomain,
} from "@/lib/domain";
import { FetcherResult, NormalizedCompanyInput } from "@/lib/types";
import { cachedFetchJson } from "@/workers/httpCache";

interface HnCommentNode {
  id: number;
  author?: string;
  text?: string;
  created_at?: string;
}

function stripHtmlPreserveLines(html: string): string {
  return html
    .replace(/<p>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<a[^>]*href="([^"]+)"[^>]*>[\s\S]*?<\/a>/gi, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"');
}

export async function fetchHnWhoIsHiring(
  env: WorkerEnv,
  options: { forceLive?: boolean } = {}
): Promise<FetcherResult> {
  const started = Date.now();
  const forceLive = Boolean(options.forceLive);
  const companies: NormalizedCompanyInput[] = [];
  let sourceAvailable = false;
  let anyLive = false;
  let fetchError: string | undefined;

  try {
    const searchRes = await cachedFetchJson<{
      hits?: { objectID: string; title: string; created_at: string }[];
    }>(
      env,
      "hn_whoishiring_story",
      "https://hn.algolia.com/api/v1/search_by_date?query=%22Ask%20HN:%20Who%20is%20hiring%22&tags=story,author_whoishiring&hitsPerPage=2",
      { ttlSeconds: 1800, forceLive, timeoutMs: 4500 }
    );
    sourceAvailable = true;
    if (!searchRes.fromCache) anyLive = true;

    const latestThread = searchRes.data.hits?.[0];
    if (latestThread?.objectID) {
      const threadRes = await cachedFetchJson<{ children?: HnCommentNode[] }>(
        env,
        `hn_whoishiring_items_${latestThread.objectID}`,
        `https://hn.algolia.com/api/v1/items/${latestThread.objectID}`,
        { ttlSeconds: 1800, forceLive, timeoutMs: 6500 }
      );
      sourceAvailable = true;
      if (!threadRes.fromCache) anyLive = true;

      for (const comment of (threadRes.data.children || []).slice(0, 80)) {
        if (!comment.text) continue;
        const plain = stripHtmlPreserveLines(comment.text);
        const lines = plain
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean);
        const header = lines[0];
        if (!header?.includes("|")) continue;

        const parts = header.split("|").map((part) => part.trim());
        const name = parts[0]?.slice(0, 48);
        if (!name || name.length < 2) continue;

        const urls = Array.from(header.matchAll(/https?:\/\/[^\s)|<>"]+/gi))
          .map((match) => cleanWebsiteUrl(match[0]))
          .filter(Boolean);
        const companyWebsite = urls.find((candidate) => {
          try {
            const host = new URL(candidate).hostname.toLowerCase();
            return !(
              /(^|\.)news\.ycombinator\.com$|(^|\.)linkedin\.com$|(^|\.)x\.com$|(^|\.)twitter\.com$/i.test(host) ||
              /(^|\.)greenhouse\.io$|(^|\.)ashbyhq\.com$|(^|\.)lever\.co$|(^|\.)workable\.com$/i.test(host)
            );
          } catch {
            return false;
          }
        });
        // Without an explicitly linked company site, do not publish a made-up
        // domain or use an arbitrary job-board URL as the company's website.
        if (!companyWebsite) continue;

        const headerDetails = parts.slice(1).join(" | ");
        const isRemote = /remote/i.test(headerDetails);
        const explicitLocation = [
          "India", "Bengaluru", "Bangalore", "Mumbai", "Pune", "New Delhi",
          "Delhi", "Noida", "Gurugram", "Gurgaon", "Hyderabad", "Chennai",
          "Kolkata", "Ahmedabad", "Jaipur", "Kochi", "Indore", "Chandigarh",
          "Asia", "APAC", "Worldwide", "Anywhere",
        ].find((candidate) => new RegExp(`\\b${candidate}\\b`, "i").test(headerDetails)) || null;
        const roleCandidate = parts.find((part) =>
          /engineer|developer|designer|researcher|recruiter|sales|marketing|product manager|operations|founding/i.test(part)
        );
        const domain = normalizeDomain(companyWebsite, name);
        const companyId = makeCompanyId(domain);
        const hnLink = `https://news.ycombinator.com/item?id=${comment.id}`;
        const roleUrl = hnLink;
        const jobs = roleCandidate
          ? [{
              id: makeJobId(companyId, roleCandidate, roleUrl),
              title: roleCandidate.slice(0, 80),
              url: roleUrl,
              location: explicitLocation || (isRemote ? "Remote" : null),
              remote: isRemote,
              department: null,
              description: lines.slice(1).join(" ").slice(0, 1200),
              posted_at: comment.created_at ? comment.created_at.slice(0, 10) : null,
            }]
          : [];

        companies.push({
          id: companyId,
          name,
          source: "hn_hiring",
          batch: null,
          description: lines.slice(1).join(" ").slice(0, 1000) || header,
          one_liner: header.slice(0, 140),
          website: companyWebsite,
          location: explicitLocation || (isRemote ? "Remote" : null),
          team_size: null,
          is_remote: isRemote,
          last_funding_date: null,
          funding_amount: null,
          is_funded_last_12mo: false,
          hiring_page_url: hnLink,
          hiring_provider: "other",
          open_roles_count: jobs.length,
          tags: ["HN Who is Hiring", ...(isRemote ? ["Remote"] : [])],
          founder_name: null,
          founder_email: null,
          jobs,
        });
      }
    }
  } catch (error) {
    // HN feed unavailable; return no invented fallback leads
    fetchError = error instanceof Error ? error.message : String(error);
  }

  return {
    source: "hn_hiring",
    companies,
    durationMs: Date.now() - started,
    mode: anyLive ? "live" : sourceAvailable ? "cached" : "unavailable",
    note: `Read ${companies.length} companies from the hiring thread`,
    ...(fetchError ? { error: fetchError.slice(0, 240) } : {}),
  };
}
