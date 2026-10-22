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
  let sourceAvailable = false;
  let anyLive = false;

  // 1. Hacker News Algolia API, Show HN posts from the last 7 days
  try {
    const sevenDaysUnix = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60;
    const algoliaUrl = `https://hn.algolia.com/api/v1/search_by_date?tags=show_hn&numericFilters=created_at_i>${sevenDaysUnix},points>5&hitsPerPage=60`;

    const res = await cachedFetchJson<{ hits?: HnShowHit[] }>(
      env,
      "hn_show_7d",
      algoliaUrl,
      { ttlSeconds: 600, forceLive, timeoutMs: 4500 }
    );
    sourceAvailable = true;
    if (!res.fromCache) anyLive = true;

    for (const hit of res.data.hits || []) {
      const cleanedTitle = (hit.title || "").replace(/^Show HN:\s*/i, "").trim();
      if (!cleanedTitle) continue;

      // Titles come as "Name - Tagline" or "Name: Tagline". Dashes are written as
      // escapes here so the source never contains the characters themselves.
      const [rawName, ...rest] = cleanedTitle.split(/\s+[\u2013\u2014:-]\s+/);
      const name = rawName.trim().slice(0, 48);
      if (!name) continue;

      const website = cleanWebsiteUrl(hit.url);
      if (!website) continue;
      try {
        const host = new URL(website).hostname.toLowerCase();
        if (["news.ycombinator.com", "github.com", "linkedin.com", "x.com", "twitter.com"].some((blocked) => host === blocked || host.endsWith(`.${blocked}`))) continue;
      } catch {
        continue;
      }
      const domain = normalizeDomain(website, name);
      const companyId = makeCompanyId(domain);
      const tagline = rest.join(": ").trim() || cleanedTitle;
      const plainStory = (hit.story_text || "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();

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
        location: null,
        team_size: null,
        is_remote: false,
        is_funded_last_12mo: false,
        tags: ["Show HN", "Indie Builder"],
        founder_name: null,
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
    sourceAvailable = true;
    if (!ghRes.fromCache) anyLive = true;

    for (const item of ghRes.data.items || []) {
      const targetUrl = cleanWebsiteUrl(item.homepage);
      if (!targetUrl) continue;
      try {
        const host = new URL(targetUrl).hostname.toLowerCase();
        if (["github.com", "gitlab.com", "bitbucket.org", "codeberg.org"].some((blocked) => host === blocked || host.endsWith(`.${blocked}`))) continue;
      } catch {
        continue;
      }
      const domain = normalizeDomain(targetUrl, item.name);
      const companyId = makeCompanyId(domain);
      const desc = (item.description || item.name).trim();

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
        location: null,
        team_size: null,
        is_remote: false,
        is_funded_last_12mo: false,
        tags: [
          "Indie Hacker",
          ...(item.language ? [item.language] : []),
          ...((item.topics || []).slice(0, 3)),
        ],
        tech_stack: item.language ? [item.language] : [],
        founder_name: null,
      });
    }
  } catch {
    // Ignore secondary fallback error
  }

  return {
    source: "indie",
    companies,
    durationMs: Date.now() - started,
    mode: anyLive ? "live" : sourceAvailable ? "cached" : "unavailable",
    note: `Loaded ${companies.length} recent Show HN posts and GitHub projects with linked websites`,
  };
}
