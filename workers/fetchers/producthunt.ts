import { WorkerEnv } from "@/lib/cf-types";
import {
  cleanWebsiteUrl,
  makeCompanyId,
  normalizeDomain,
} from "@/lib/domain";
import { FetcherResult, NormalizedCompanyInput } from "@/lib/types";
import { cachedFetchText } from "@/workers/httpCache";

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
    const publishedRaw = entry.match(/<published>([\s\S]*?)<\/published>/i)?.[1] || "";
    const contentRaw =
      entry.match(/<content[^>]*>([\s\S]*?)<\/content>/i)?.[1] || "";

    const publishedTs = Date.parse(publishedRaw);
    if (Number.isNaN(publishedTs) || publishedTs < sevenDaysAgo) continue;

    const decodedTitle = decodeHtmlEntities(titleRaw);
    // Feed titles usually read "ProductName: Tagline", sometimes just "ProductName".
    const [rawName, ...taglineParts] = decodedTitle.split(/\s+[\u2013\u2014-]\s+/);
    const name = rawName?.trim();
    if (!name) continue;

    const cleanContent = decodeHtmlEntities(contentRaw).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const tagline = taglineParts.join(": ").trim() || cleanContent.slice(0, 140);

    const links = Array.from(
      entry.matchAll(/<a\b[^>]*href=["'](https?:\/\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)
    ).map((match) => ({
      url: cleanWebsiteUrl(match[1]),
      text: decodeHtmlEntities((match[2] || "").replace(/<[^>]+>/g, " ")).toLowerCase(),
    }));
    const website = links.find(({ url, text }) => {
      if (!url || !text) return false;
      try {
        const host = new URL(url).hostname.toLowerCase();
        const blockedHost = [
          "producthunt.com", "linkedin.com", "x.com", "twitter.com",
          "github.com", "news.ycombinator.com", "greenhouse.io",
          "ashbyhq.com", "lever.co", "workable.com", "ph-files.imgix.net",
        ].some((blocked) => host === blocked || host.endsWith(`.${blocked}`));
        return !blockedHost && (/website|visit site|official site/i.test(text) || text.includes(name.toLowerCase()));
      } catch {
        return false;
      }
    })?.url;
    if (!website) continue;

    const domain = normalizeDomain(website, name);
    const companyId = makeCompanyId(domain);
    const listingHref = Array.from(entry.matchAll(/<link\b[^>]*href=["']([^"']+)["'][^>]*>/gi))
      .map((match) => match[1])
      .find((href) => {
        try {
          const parsed = new URL(href);
          return (parsed.hostname.toLowerCase() === "producthunt.com" || parsed.hostname.toLowerCase().endsWith(".producthunt.com")) && /\/posts\//i.test(parsed.pathname);
        } catch {
          return false;
        }
      });

    companies.push({
      id: companyId,
      name,
      source: "producthunt",
      batch: null,
      description: cleanContent || tagline || `${name} launched on Product Hunt.`,
      one_liner: tagline || cleanContent.slice(0, 110),
      website,
      location: null,
      team_size: null,
      is_remote: false,
      is_funded_last_12mo: false,
      tags: ["Product Hunt Launch"],
      founder_name: null,
      launch_date: new Date(publishedTs).toISOString(),
      launch_source: "Product Hunt",
      launch_url: listingHref || null,
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
  let feedAvailable = false;

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
    feedAvailable = true;
    directLive = !feedRes.fromCache;
    companies.push(...parseProductHuntAtom(feedRes.text));
  } catch {
    // Report the source as unavailable instead of substituting unrelated data.
  }


  return {
    source: "producthunt",
    companies,
    durationMs: Date.now() - started,
    mode: directLive ? "live" : feedAvailable ? "cached" : "unavailable",
    note: `Synced ${companies.length} launches from the last week`,
  };
}
