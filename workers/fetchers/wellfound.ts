import { WorkerEnv } from "@/lib/cf-types";
import {
  cleanWebsiteUrl,
  isDateWithinDays,
  makeCompanyId,
  normalizeDomain,
} from "@/lib/domain";
import {
  FetcherResult,
  NormalizedCompanyInput,
} from "@/lib/types";
import { cachedFetchText } from "@/workers/httpCache";

function parseFundingRssXml(xml: string): NormalizedCompanyInput[] {
  const results: NormalizedCompanyInput[] = [];
  const items = xml.match(/<item>([\s\S]*?)<\/item>/gi) || [];

  for (const item of items.slice(0, 30)) {
    const titleMatch = item.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
    const linkMatch = item.match(/<link>([\s\S]*?)<\/link>/i);
    const pubMatch = item.match(/<pubDate>([\s\S]*?)<\/pubDate>/i);
    const rawTitle = (titleMatch?.[1] || "").replace(/<[^>]+>/g, "").trim();
    const articleUrl = (linkMatch?.[1] || "").trim();
    if (!rawTitle || !articleUrl) continue;

    // Match funding headlines: "Acme AI Raises $4.2M in Seed Funding..."
    const fundingMatch = rawTitle.match(
      /^([A-Z0-9][A-Za-z0-9.\-&\s]{1,32}?)\s+(?:raises|secures|closes|lands|bags)\s+([\$€£]\d+(?:\.\d+)?\s*(?:M|Million|K|B)?(?:\s+(?:Pre-Seed|Seed|Series A))?)/i
    );
    if (!fundingMatch) continue;

    const companyName = fundingMatch[1].trim();
    const amount = fundingMatch[2].trim();
    if (/series [b-f]|billion|\$[5-9]\d\s*m|\$\d{3}\s*m/i.test(rawTitle)) {
      continue; // Keep team <50 seed/series A focus
    }

    const publishedAt = pubMatch?.[1] ? new Date(pubMatch[1].trim()) : null;
    if (!publishedAt || Number.isNaN(publishedAt.getTime())) continue;
    const pubIso = publishedAt.toISOString().slice(0, 10);

    const companyLink = Array.from(
      item.matchAll(/<a\b[^>]*href=["'](https?:\/\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)
    ).find((match) => {
      const anchorText = (match[2] || "").replace(/<[^>]+>/g, " ").trim().toLowerCase();
      return anchorText.includes(companyName.toLowerCase());
    })?.[1];
    if (!companyLink) continue;
    const companyWebsite = cleanWebsiteUrl(companyLink);
    if (!companyWebsite) continue;
    try {
      const host = new URL(companyWebsite).hostname.toLowerCase();
      if (["finsmes.com", "eu-startups.com", "techcrunch.com", "linkedin.com", "x.com", "twitter.com"].some((blocked) => host === blocked || host.endsWith(`.${blocked}`))) continue;
    } catch {
      continue;
    }

    const domain = normalizeDomain(companyWebsite, companyName);
    const companyId = makeCompanyId(domain);

    results.push({
      id: companyId,
      name: companyName,
      source: "wellfound",
      batch: null,
      description: `Funding report: ${rawTitle}`,
      one_liner: rawTitle,
      website: companyWebsite,
      location: null,
      team_size: null,
      is_remote: false,
      last_funding_date: pubIso,
      funding_amount: amount,
      is_funded_last_12mo: isDateWithinDays(pubIso, 365),
      tags: ["Funding News"],
    });
  }

  return results;
}

export async function fetchWellfoundFunded(
  env: WorkerEnv,
  options: { forceLive?: boolean } = {}
): Promise<FetcherResult> {
  const started = Date.now();
  const forceLive = Boolean(options.forceLive);
  const companies: NormalizedCompanyInput[] = [];
  let sourceAvailable = false;
  let anyLive = false;

  // 1. Try public startup funding RSS feeds (FinSMEs + EU-Startups + TechCrunch Funding)
  const rssUrls = [
    "https://www.finsmes.com/feed",
    "https://www.eu-startups.com/feed/",
    "https://techcrunch.com/category/startups/feed/",
  ];

  const feedCalls = await Promise.allSettled(
    rssUrls.map((url, i) =>
      cachedFetchText(env, `funding_rss_${i}`, url, {
        ttlSeconds: 900,
        forceLive,
        timeoutMs: 4000,
      })
    )
  );

  for (const res of feedCalls) {
    if (res.status === "fulfilled") {
      sourceAvailable = true;
      if (!res.value.fromCache) anyLive = true;
      companies.push(...parseFundingRssXml(res.value.text));
    }
  }


  return {
    source: "wellfound",
    companies,
    durationMs: Date.now() - started,
    mode: anyLive ? "live" : sourceAvailable ? "cached" : "unavailable",
    note: sourceAvailable
      ? `Parsed ${companies.length} funding reports from the RSS feeds`
      : "Funding feeds were unavailable; no synthetic company or job listings were added",
  };
}
