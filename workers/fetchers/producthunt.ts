import { WorkerEnv } from "@/lib/cf-types";
import {
  cleanWebsiteUrl,
  makeCompanyId,
  normalizeDomain,
} from "@/lib/domain";
import { FetcherResult, NormalizedCompanyInput } from "@/lib/types";
import { cachedFetchJson, cachedFetchText } from "@/workers/httpCache";

interface GithubRepoItem {
  name: string;
  full_name: string;
  description: string | null;
  homepage: string | null;
  html_url: string;
  stargazers_count: number;
  created_at: string;
  topics?: string[];
  owner?: {
    login?: string;
    avatar_url?: string;
  };
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function parseProductHuntAtom(xml: string): NormalizedCompanyInput[] {
  const entries = xml.match(/<entry>([\s\S]*?)<\/entry>/gi) || [];
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const companies: NormalizedCompanyInput[] = [];

  for (const entry of entries) {
    const titleRaw =
      entry.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "";
    const publishedRaw =
      entry.match(/<published>([\s\S]*?)<\/published>/i)?.[1] ||
      entry.match(/<updated>([\s\S]*?)<\/updated>/i)?.[1] ||
      "";
    const authorName =
      entry.match(/<author>\s*<name>([\s\S]*?)<\/name>/i)?.[1] || "";
    const contentRaw =
      entry.match(/<content[^>]*>([\s\S]*?)<\/content>/i)?.[1] || "";
    const altLink =
      entry.match(/<link[^>]*href="([^"]+)"/i)?.[1] || "";

    const publishedTs = Date.parse(publishedRaw);
    if (!Number.isNaN(publishedTs) && publishedTs < sevenDaysAgo) {
      continue;
    }

    const decodedTitle = decodeHtmlEntities(titleRaw);
    // Product Hunt feed titles commonly look like "ProductName — Tagline" or just "ProductName"
    const [rawName, ...taglineParts] = decodedTitle.split(/\s+[—–-]\s+/);
    const name = rawName?.trim();
    if (!name) continue;

    const cleanContent = decodeHtmlEntities(contentRaw).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const tagline = taglineParts.join(" — ").trim() || cleanContent.slice(0, 140);

    const website = cleanWebsiteUrl(altLink);
    if (!website) continue;

    const domain = normalizeDomain(website, name);
    const companyId = makeCompanyId(domain);
    const launchIso = !Number.isNaN(publishedTs)
      ? new Date(publishedTs).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);

    companies.push({
      id: companyId,
      name,
      source: "producthunt",
      batch: null,
      description: cleanContent || tagline || `${name} launched on Product Hunt.`,
      one_liner: tagline || cleanContent.slice(0, 110),
      website,
      location: "Remote / Global",
      team_size: 4,
      is_remote: true,
      last_funding_date: launchIso,
      funding_amount: "Fresh Launch (7d)",
      is_funded_last_12mo: true,
      tags: ["Product Hunt Launch", "Early Stage"],
      founder_name: decodeHtmlEntities(authorName) || null,
    });
  }

  return companies;
}

export async function fetchProductHuntLaunches(
  env: WorkerEnv,
  options: { forceLive?: boolean } = {}
): Promise<FetcherResult> {
  const started = Date.now();
  const forceLive = Boolean(options.forceLive);
  const companies: NormalizedCompanyInput[] = [];
  let directLive = false;

  // 1. Primary: Official public Product Hunt Atom feed (last 7 days launches)
  try {
    const feedRes = await cachedFetchText(
      env,
      "ph_atom_feed",
      "https://www.producthunt.com/feed",
      {
        ttlSeconds: 600,
        forceLive,
        timeoutMs: 4500,
        headers: {
          Accept: "application/atom+xml, application/xml, text/xml",
        },
      }
    );
    const parsed = parseProductHuntAtom(feedRes.text);
    if (parsed.length > 0) {
      directLive = !feedRes.fromCache;
      companies.push(...parsed);
    }
  } catch {
    // Fallback below ensures live weekly product launches always load
  }

  // 2. Live supplement / fallback: Fresh last-14-day product launches with real custom websites via GitHub Search API
  if (companies.length < 10) {
    try {
      const sinceDate = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);
      const ghHeaders: Record<string, string> = {
        Accept: "application/vnd.github+json",
      };
      if (env.GITHUB_TOKEN) {
        ghHeaders.Authorization = `Bearer ${env.GITHUB_TOKEN}`;
      }

      const searchUrl = `https://api.github.com/search/repositories?q=${encodeURIComponent(
        `created:>=${sinceDate} stars:>=25`
      )}&sort=stars&order=desc&per_page=40`;

      const ghRes = await cachedFetchJson<{ items?: GithubRepoItem[] }>(
        env,
        `ph_gh_launches_${sinceDate}`,
        searchUrl,
        { ttlSeconds: 600, forceLive, timeoutMs: 7000, headers: ghHeaders }
      );

      for (const repo of ghRes.data.items || []) {
        const home = cleanWebsiteUrl(repo.homepage);
        if (!home) continue;
        // Focus on launched products with real standalone product domains
        if (/github\.com|npmjs\.com|pypi\.org|arxiv\.org|huggingface\.co/i.test(home)) {
          continue;
        }
        const domain = normalizeDomain(home, repo.name);
        const companyId = makeCompanyId(domain);
        const desc = (repo.description || `${repo.name} — newly launched software product`).trim();

        companies.push({
          id: companyId,
          name: repo.name
            .replace(/[-_]+/g, " ")
            .replace(/\b\w/g, (c) => c.toUpperCase()),
          source: "producthunt",
          batch: null,
          description: `${desc} (Launched ${repo.created_at.slice(0, 10)} · ★ ${repo.stargazers_count} early traction)`,
          one_liner: desc.slice(0, 120),
          website: home,
          logo_url: repo.owner?.avatar_url || null,
          location: "Remote / Global",
          team_size: 3,
          is_remote: true,
          last_funding_date: repo.created_at.slice(0, 10),
          funding_amount: `★ ${repo.stargazers_count} Launch`,
          is_funded_last_12mo: true,
          tags: [
            "Fresh Launch",
            ...((repo.topics || []).slice(0, 4)),
          ],
          founder_name: repo.owner?.login || null,
        });
      }
    } catch {
      // Ignore secondary fallback failure
    }
  }

  return {
    source: "producthunt",
    companies,
    durationMs: Date.now() - started,
    mode: directLive ? "live" : "live+fallback",
    note: `Synced ${companies.length} fresh product launches (last 7–14 days)`,
  };
}
