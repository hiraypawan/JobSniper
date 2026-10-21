import { WorkerEnv } from "@/lib/cf-types";
import {
  cleanWebsiteUrl,
  makeCompanyId,
  normalizeDomain,
} from "@/lib/domain";
import { FetcherResult, NormalizedCompanyInput } from "@/lib/types";
import { cachedFetchJson } from "@/workers/httpCache";

interface HnShowHit {
  objectID: string;
  title: string;
  url?: string | null;
  author?: string;
  points?: number;
  num_comments?: number;
  story_text?: string | null;
  created_at?: string;
}

interface GithubIndieItem {
  name: string;
  description: string | null;
  homepage: string | null;
  html_url: string;
  stargazers_count: number;
  created_at: string;
  language?: string | null;
  topics?: string[];
  owner?: {
    login?: string;
    avatar_url?: string;
  };
}

export async function fetchIndieShowHn(
  env: WorkerEnv,
  options: { forceLive?: boolean } = {}
): Promise<FetcherResult> {
  const started = Date.now();
  const forceLive = Boolean(options.forceLive);
  const companies: NormalizedCompanyInput[] = [];
  let hnSucceeded = false;

  // 1. Primary: Hacker News Algolia Public API — Show HN last 7 days
  try {
    const sevenDaysUnix = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60;
    const algoliaUrl = `https://hn.algolia.com/api/v1/search_by_date?tags=show_hn&numericFilters=created_at_i>${sevenDaysUnix},points>5&hitsPerPage=60`;

    const res = await cachedFetchJson<{ hits?: HnShowHit[] }>(
      env,
      "hn_show_7d",
      algoliaUrl,
      { ttlSeconds: 600, forceLive, timeoutMs: 4500 }
    );
    hnSucceeded = true;

    for (const hit of res.data.hits || []) {
      const cleanedTitle = (hit.title || "").replace(/^Show HN:\s*/i, "").trim();
      if (!cleanedTitle) continue;

      const [rawName, ...rest] = cleanedTitle.split(/\s+[–—:-]\s+/);
      const name = rawName.trim().slice(0, 48);
      if (!name) continue;

      const website =
        cleanWebsiteUrl(hit.url) ||
        `https://news.ycombinator.com/item?id=${hit.objectID}`;
      const domain = normalizeDomain(website, name);
      const companyId = makeCompanyId(domain);
      const tagline = rest.join(" — ").trim() || cleanedTitle;
      const plainStory = (hit.story_text || "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      const createdDate = hit.created_at
        ? hit.created_at.slice(0, 10)
        : new Date().toISOString().slice(0, 10);

      companies.push({
        id: companyId,
        name,
        source: "indie",
        batch: null,
        description:
          plainStory ||
          `${cleanedTitle} (${hit.points || 0} pts · ${hit.num_comments || 0} comments on Show HN)`,
        one_liner: tagline.slice(0, 130),
        website,
        location: "Remote / Indie",
        team_size: 2,
        is_remote: true,
        last_funding_date: createdDate,
        funding_amount: `Show HN (${hit.points || 0} pts)`,
        is_funded_last_12mo: true,
        tags: ["Show HN", "Indie Builder", "Early Launch"],
        founder_name: hit.author || null,
      });
    }
  } catch {
    // Supplement via live GitHub indie builders search below
  }

  // 2. Live Indie Builders feed from GitHub Search API (last 21 days, standalone tools/apps)
  try {
    const sinceDate = new Date(Date.now() - 21 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const ghHeaders: Record<string, string> = {
      Accept: "application/vnd.github+json",
    };
    if (env.GITHUB_TOKEN) {
      ghHeaders.Authorization = `Bearer ${env.GITHUB_TOKEN}`;
    }

    const ghUrl = `https://api.github.com/search/repositories?q=${encodeURIComponent(
      `created:>=${sinceDate} stars:15..600 language:TypeScript`
    )}&sort=stars&order=desc&per_page=30`;

    const ghRes = await cachedFetchJson<{ items?: GithubIndieItem[] }>(
      env,
      `indie_gh_ts_${sinceDate}`,
      ghUrl,
      { ttlSeconds: 600, forceLive, timeoutMs: 7000, headers: ghHeaders }
    );

    for (const item of ghRes.data.items || []) {
      const targetUrl = cleanWebsiteUrl(item.homepage) || item.html_url;
      const domain = normalizeDomain(targetUrl, item.name);
      const companyId = makeCompanyId(domain);
      const desc = (
        item.description || `${item.name} — indie TypeScript product build`
      ).trim();

      companies.push({
        id: companyId,
        name: item.name
          .replace(/[-_]+/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase()),
        source: "indie",
        batch: null,
        description: desc,
        one_liner: desc.slice(0, 120),
        website: targetUrl,
        logo_url: item.owner?.avatar_url || null,
        location: "Remote / Indie",
        team_size: 2,
        is_remote: true,
        last_funding_date: item.created_at.slice(0, 10),
        funding_amount: `Indie ★ ${item.stargazers_count}`,
        is_funded_last_12mo: true,
        tags: [
          "Indie Hacker",
          ...(item.language ? [item.language] : []),
          ...((item.topics || []).slice(0, 3)),
        ],
        tech_stack: item.language ? [item.language] : [],
        founder_name: item.owner?.login || null,
      });
    }
  } catch {
    // Ignore secondary fallback error
  }

  return {
    source: "indie",
    companies,
    durationMs: Date.now() - started,
    mode: hnSucceeded ? "live" : "live+fallback",
    note: `Synced ${companies.length} recent Show HN & indie builder launches`,
  };
}
