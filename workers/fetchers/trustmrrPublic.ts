import { WorkerEnv } from "@/lib/cf-types";
import { cleanWebsiteUrl, makeCompanyId, normalizeDomain } from "@/lib/domain";
import { FetcherResult, NormalizedCompanyInput } from "@/lib/types";
import { cachedFetchText, readD1Cache, writeD1Cache } from "@/workers/httpCache";

const ORIGIN = "https://trustmrr.com";
const ROBOTS_KEY = "trustmrr_public_robots";
const CURSOR_KEY = "trustmrr_public_scrape_cursor";
const LISTING_PATHS = ["/recently-added", "/?sort_by=mrr"];
const DETAILS_PER_SYNC = 3;
const LISTING_TTL = 6 * 60 * 60;
const DETAIL_TTL = 24 * 60 * 60;

interface LinkCandidate {
  slug: string;
  url: string;
  name: string;
  listedAt: string | null;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_match, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&nbsp;/gi, " ");
}

function textFromHtml(html: string): string[] {
  const text = decodeEntities(
    html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<(?:br|\/p|\/div|\/section|\/h[1-6]|\/li|\/tr|\/td)\b[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  );
  return text.split(/[\r\n]+/).map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean);
}

function attributes(tag: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const match of tag.matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/gs)) {
    result[match[1].toLowerCase()] = decodeEntities(match[3]);
  }
  return result;
}

function metaContent(html: string, key: string): string {
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = attributes(match[0]);
    if ((attrs.property || attrs.name || "").toLowerCase() === key.toLowerCase()) {
      return attrs.content || "";
    }
  }
  return "";
}

function parseDate(value: string): string | null {
  const timestamp = Date.parse(value.trim());
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function dateFromListingContext(context: string): string | null {
  for (const match of context.matchAll(/\bdatetime\s*=\s*(["'])(.*?)\1/gi)) {
    const date = parseDate(decodeEntities(match[2]));
    if (date) return date;
  }
  const text = textFromHtml(context).join(" ");
  if (!/\b(?:listed|added|published|joined)\b/i.test(text)) return null;
  const relative = text.match(/\b(\d+)\s*(minute|hour|day|week|month|year)s?\s+ago\b/i);
  if (relative) {
    const units: Record<string, number> = {
      minute: 60_000,
      hour: 3_600_000,
      day: 86_400_000,
      week: 604_800_000,
      month: 2_592_000_000,
      year: 31_536_000_000,
    };
    const unit = relative[2].toLowerCase();
    return new Date(Date.now() - Number(relative[1]) * units[unit]).toISOString();
  }
  if (/\byesterday\b/i.test(text)) return new Date(Date.now() - 86_400_000).toISOString();
  if (/\btoday\b/i.test(text)) return new Date().toISOString();
  const absolute = text.match(/\b(?:\d{4}-\d{2}-\d{2}(?:[T ][\d:.+-]+Z?)?|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},?\s+\d{4})\b/i);
  return absolute ? parseDate(absolute[0]) : null;
}

export function parseTrustMrrListingLinks(html: string): LinkCandidate[] {
  const links: LinkCandidate[] = [];
  for (const match of html.matchAll(/<a\b[^>]*href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi)) {
    let parsed: URL;
    try {
      parsed = new URL(decodeEntities(match[2]), ORIGIN);
    } catch {
      continue;
    }
    if (parsed.hostname.toLowerCase() !== "trustmrr.com" || !/^\/startup\/[^/]+\/?$/i.test(parsed.pathname)) continue;
    const slug = parsed.pathname.split("/").filter(Boolean).at(-1) || "";
    if (!slug) continue;
    const name = textFromHtml(match[3]).join(" ").slice(0, 100) || slug.replace(/-/g, " ");
    const index = match.index ?? 0;
    const context = html.slice(Math.max(0, index - 450), Math.min(html.length, index + match[0].length + 450));
    links.push({
      slug,
      url: `${ORIGIN}/startup/${encodeURIComponent(slug)}`,
      name,
      listedAt: dateFromListingContext(context),
    });
  }
  const known = new Set(links.map((link) => link.slug));
  for (const match of html.matchAll(/(?:https?:\/\/trustmrr\.com)?\/startup\/([a-z0-9][a-z0-9-]{0,100})(?=[/?#\"'\\&,]|$)/gi)) {
    const slug = match[1];
    if (known.has(slug)) continue;
    const index = match.index ?? 0;
    const context = html.slice(Math.max(0, index - 450), Math.min(html.length, index + match[0].length + 450));
    links.push({
      slug,
      url: `${ORIGIN}/startup/${encodeURIComponent(slug)}`,
      name: slug.replace(/-/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()),
      listedAt: dateFromListingContext(context),
    });
    known.add(slug);
  }
  return links.slice(0, 200);
}

function parseMoney(value: string): number | null {
  const cleaned = value.trim().replace(/,/g, "");
  if (!cleaned || /^(?:n\/?a|none|unknown|--?)$/i.test(cleaned)) return null;
  const match = cleaned.match(/(?:\$|USD\s*)?\s*(\d+(?:\.\d+)?)\s*([kmb])?/i);
  if (!match) return null;
  const multiplier = ({ k: 1_000, m: 1_000_000, b: 1_000_000_000 } as Record<string, number>)[(match[2] || "").toLowerCase()] || 1;
  const amount = Number(match[1]) * multiplier;
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

function metricFromLines(lines: string[], patterns: RegExp[]): number | null {
  for (let index = 0; index < lines.length; index++) {
    if (!patterns.some((pattern) => pattern.test(lines[index]))) continue;
    const inline = lines[index].match(/[:\-]\s*(.+)$/)?.[1];
    const ownAmount = inline ? parseMoney(inline) : null;
    if (ownAmount !== null) return ownAmount;
    for (let next = index + 1; next < Math.min(lines.length, index + 3); next++) {
      const amount = parseMoney(lines[next]);
      if (amount !== null) return amount;
      if (/\b(?:mrr|arr|revenue|growth|listed|launched|updated)\b/i.test(lines[next])) break;
    }
  }
  return null;
}

function structuredMetric(html: string, field: string): number | null {
  const safeField = field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = html.match(new RegExp(`["']${safeField}["']\\s*:\\s*(?:["']([^"']+)["']|(\\d+(?:\\.\\d+)?))`, "i"));
  return match ? parseMoney(match[1] || match[2]) : null;
}

function sourceListingDate(html: string): string | null {
  for (const field of ["listedAt", "listed_at", "listingDate", "listing_date", "publishedAt", "published_at", "createdAt", "created_at"]) {
    const safeField = field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = html.match(new RegExp(`["']${safeField}["']\\s*:\\s*["']([^"']+)["']`, "i"));
    const date = match ? parseDate(match[1]) : null;
    if (date) return date;
  }
  return null;
}

export function parseTrustMrrPublicProduct(candidate: LinkCandidate, html: string): NormalizedCompanyInput | null {
  const lines = textFromHtml(html);
  const title = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || metaContent(html, "og:title");
  const name = (textFromHtml(title).join(" ").replace(/\s*[|\u2013-]\s*TrustMRR\s*$/i, "").trim() || candidate.name).slice(0, 100);
  const mrr = structuredMetric(html, "mrr") ?? metricFromLines(lines, [/^mrr\b/i, /monthly recurring revenue/i, /^monthly revenue\b/i]);
  const last30 = structuredMetric(html, "last30Days")
    ?? structuredMetric(html, "last30DaysRevenue")
    ?? metricFromLines(lines, [/last\s*30\s*days?(?:\s+revenue)?/i, /last30days/i, /revenue\s+(?:in\s+)?last\s+30/i]);
  const total = structuredMetric(html, "total")
    ?? structuredMetric(html, "totalRevenue")
    ?? structuredMetric(html, "lifetimeRevenue")
    ?? metricFromLines(lines, [/lifetime revenue/i, /total revenue/i, /all[- ]time revenue/i]);
  if (![mrr, last30, total].some((value) => value !== null && value > 0)) return null;

  let website: string | null = null;
  for (const match of html.matchAll(/<a\b[^>]*href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi)) {
    const attrs = attributes(match[0]);
    const href = decodeEntities(match[2]);
    const label = `${textFromHtml(match[3]).join(" ")} ${attrs.title || ""} ${attrs["aria-label"] || ""}`.toLowerCase();
    const cleaned = cleanWebsiteUrl(href);
    if (!cleaned) continue;
    try {
      const host = new URL(cleaned).hostname.toLowerCase().replace(/^www\./, "");
      if (host === "trustmrr.com" || host.endsWith(".trustmrr.com") || /(^|\.)(x\.com|twitter\.com|linkedin\.com|github\.com|instagram\.com)$/.test(host)) continue;
      if (attrs.rel?.toLowerCase() === "nofollow" && !/website|visit|official|home/i.test(label)) continue;
      if (/website|visit site|official site|homepage/i.test(label)) {
        website = cleaned;
        break;
      }
    } catch {
      // Ignore malformed external links.
    }
  }
  if (!website) return null;

  const domain = normalizeDomain(website, name);
  const description = metaContent(html, "og:description") || metaContent(html, "description");
  const date = sourceListingDate(html) || candidate.listedAt;
  return {
    id: makeCompanyId(domain),
    name,
    source: "trustmrr",
    batch: null,
    description: description || `${name} has revenue metrics published on TrustMRR.`,
    one_liner: (description || "").slice(0, 130),
    website,
    location: null,
    team_size: null,
    is_remote: false,
    is_funded_last_12mo: false,
    tags: ["Indie Product", "TrustMRR revenue evidence"],
    launch_date: date,
    launch_source: date ? "TrustMRR" : null,
    launch_url: candidate.url,
    trustmrr_mrr: mrr,
    trustmrr_last30: last30,
    trustmrr_total: total,
  };
}

export function isTrustMrrPathAllowedByRobots(path: string, robots: string): boolean {
  const applicable: Array<{ allow: boolean; rule: string }> = [];
  for (const block of robots.split(/\n\s*\n/)) {
    const lines = block.split(/\r?\n/).map((raw) => raw.split("#", 1)[0].trim()).filter(Boolean);
    const agents = lines
      .filter((line) => /^user-agent\s*:/i.test(line))
      .map((line) => line.split(":", 2)[1].trim());
    if (!agents.includes("*")) continue;
    for (const line of lines) {
      const match = line.match(/^(allow|disallow)\s*:\s*(.*)$/i);
      if (match?.[2]) applicable.push({ allow: match[1].toLowerCase() === "allow", rule: match[2].trim() });
    }
  }
  let winner: { allow: boolean; specificity: number } | null = null;
  for (const rule of applicable) {
    const pattern = rule.rule.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\\*/g, ".*").replace(/\\\$/g, "$");
    if (!new RegExp(`^${pattern}`, "i").test(path)) continue;
    const specificity = rule.rule.replace(/[\*$]/g, "").length;
    if (!winner || specificity > winner.specificity || (specificity === winner.specificity && rule.allow)) {
      winner = { allow: rule.allow, specificity };
    }
  }
  return winner?.allow ?? true;
}

export async function fetchTrustMrrPublicPages(
  env: WorkerEnv,
  options: { forceLive?: boolean } = {}
): Promise<FetcherResult> {
  const started = Date.now();
  try {
    const robots = await cachedFetchText(env, ROBOTS_KEY, `${ORIGIN}/robots.txt`, {
      ttlSeconds: 24 * 60 * 60,
      forceLive: Boolean(options.forceLive),
      timeoutMs: 4500,
      headers: { Accept: "text/plain,*/*" },
    });
    const permittedPaths = LISTING_PATHS.filter((path) => isTrustMrrPathAllowedByRobots(path, robots.text));
    if (!permittedPaths.length) {
      return {
        source: "trustmrr",
        companies: [],
        durationMs: Date.now() - started,
        mode: "unavailable",
        note: "Public TrustMRR pages are not crawlable under robots.txt; no page scraping was attempted.",
      };
    }

    const listingPages = await Promise.all(permittedPaths.map((path) =>
      cachedFetchText(env, `trustmrr_public_listing_${path.replace(/[^a-z0-9]+/gi, "_")}`, `${ORIGIN}${path}`, {
        ttlSeconds: LISTING_TTL,
        forceLive: Boolean(options.forceLive),
        timeoutMs: 6000,
        headers: { Accept: "text/html,application/xhtml+xml" },
      })
    ));
    const candidates = new Map<string, LinkCandidate>();
    for (const page of listingPages) {
      for (const candidate of parseTrustMrrListingLinks(page.text)) {
        if (!candidates.has(candidate.slug)) candidates.set(candidate.slug, candidate);
      }
    }
    const rows = Array.from(candidates.values()).filter((candidate) => {
      const path = new URL(candidate.url).pathname;
      return isTrustMrrPathAllowedByRobots(path, robots.text);
    });
    if (!rows.length) {
      return {
        source: "trustmrr",
        companies: [],
        durationMs: Date.now() - started,
        mode: listingPages.some((page) => !page.fromCache) ? "live" : "cached",
        note: "TrustMRR public pages loaded, but no robots-permitted server-rendered startup links were found; the scraper fails closed rather than inventing listings.",
      };
    }

    const cursor = Number(await readD1Cache(env, CURSOR_KEY));
    const start = Number.isInteger(cursor) && cursor >= 0 ? cursor % rows.length : 0;
    const selected = Array.from({ length: Math.min(DETAILS_PER_SYNC, rows.length) }, (_, index) => rows[(start + index) % rows.length]);
    await writeD1Cache(env, CURSOR_KEY, String((start + selected.length) % rows.length), 30 * 24 * 60 * 60, "text/plain");
    const details = await Promise.all(selected.map((candidate) => cachedFetchText(
      env,
      `trustmrr_public_detail_${candidate.slug}`,
      candidate.url,
      {
        ttlSeconds: DETAIL_TTL,
        forceLive: Boolean(options.forceLive),
        timeoutMs: 6000,
        headers: { Accept: "text/html,application/xhtml+xml" },
      }
    )));
    const companies = details.map((detail, index) => parseTrustMrrPublicProduct(selected[index], detail.text)).filter((company): company is NormalizedCompanyInput => company !== null);
    const anyLive = listingPages.some((page) => !page.fromCache) || details.some((page) => !page.fromCache);
    return {
      source: "trustmrr",
      companies,
      durationMs: Date.now() - started,
      mode: anyLive ? "live" : "cached",
      note: `Public-page fallback checked ${selected.length} startup profiles (D1 cached); retained only explicit positive MRR, last-30-day, or lifetime revenue fields.`,
    };
  } catch (error) {
    return {
      source: "trustmrr",
      companies: [],
      durationMs: Date.now() - started,
      mode: "unavailable",
      note: "TrustMRR public-page fallback failed; no revenue was inferred.",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
