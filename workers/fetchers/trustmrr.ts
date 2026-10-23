import { WorkerEnv } from "@/lib/cf-types";
import { cleanWebsiteUrl, makeCompanyId, normalizeDomain } from "@/lib/domain";
import { FetcherResult, NormalizedCompanyInput } from "@/lib/types";
import { cachedFetchJson, readD1Cache, writeD1Cache } from "@/workers/httpCache";

interface TrustMrrStartup {
  name?: unknown;
  slug?: unknown;
  description?: unknown;
  website?: unknown;
  websiteUrl?: unknown;
  website_url?: unknown;
  url?: unknown;
  sourceUrl?: unknown;
  source_url?: unknown;
  profileUrl?: unknown;
  profile_url?: unknown;
  listingUrl?: unknown;
  listing_url?: unknown;
  trustmrrUrl?: unknown;
  trustmrr_url?: unknown;
  listedAt?: unknown;
  listed_at?: unknown;
  listingDate?: unknown;
  listing_date?: unknown;
  publishedAt?: unknown;
  published_at?: unknown;
  createdAt?: unknown;
  created_at?: unknown;
  revenue?: {
    mrr?: unknown;
    last30Days?: unknown;
    last30days?: unknown;
    last_30_days?: unknown;
    total?: unknown;
  } | null;
}

interface TrustMrrResponse {
  data?: TrustMrrStartup[] | { startups?: TrustMrrStartup[]; results?: TrustMrrStartup[] };
  startups?: TrustMrrStartup[];
  results?: TrustMrrStartup[];
}

const LATEST_PAGE = 1;
const BACKFILL_PAGES_PER_SYNC = 4;
const PAGE_SIZE = 10;
const BACKFILL_CURSOR_KEY = "trustmrr_listing_backfill_cursor";

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asAmount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  if (typeof value !== "string") return null;
  const normalized = value.replace(/[,$\s]/g, "");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function listedAt(item: TrustMrrStartup): string | null {
  const raw = [
    item.listedAt,
    item.listed_at,
    item.listingDate,
    item.listing_date,
    item.publishedAt,
    item.published_at,
    item.createdAt,
    item.created_at,
  ].map(asText).find(Boolean);
  if (!raw) return null;
  const timestamp = Date.parse(raw);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function rowsFromResponse(response: TrustMrrResponse): TrustMrrStartup[] {
  if (Array.isArray(response.data)) return response.data;
  if (response.data && !Array.isArray(response.data)) {
    if (Array.isArray(response.data.startups)) return response.data.startups;
    if (Array.isArray(response.data.results)) return response.data.results;
  }
  if (Array.isArray(response.startups)) return response.startups;
  if (Array.isArray(response.results)) return response.results;
  return [];
}

export function normalizeTrustMrrStartup(item: TrustMrrStartup): NormalizedCompanyInput | null {
  const name = asText(item.name);
  const rawUrl = asText(item.url);
  const urlHost = (() => {
    try { return new URL(rawUrl).hostname.toLowerCase(); } catch { return ""; }
  })();
  const website = cleanWebsiteUrl(asText(item.website))
    || cleanWebsiteUrl(asText(item.websiteUrl))
    || cleanWebsiteUrl(asText(item.website_url))
    || (urlHost && urlHost !== "trustmrr.com" && !urlHost.endsWith(".trustmrr.com") ? cleanWebsiteUrl(rawUrl) : null);
  if (!name || !website) return null;

  const mrr = asAmount(item.revenue?.mrr);
  const last30 = asAmount(item.revenue?.last30Days ?? item.revenue?.last30days ?? item.revenue?.last_30_days);
  const total = asAmount(item.revenue?.total);
  // MRR alone misses one-time sales. Keep a listing if any explicit TrustMRR
  // revenue metric is positive, including receipts or lifetime revenue.
  if (![mrr, last30, total].some((amount) => amount !== null && amount > 0)) return null;

  const domain = normalizeDomain(website, name);
  const date = listedAt(item);
  const sourceUrl = [
    item.listingUrl, item.listing_url, item.trustmrrUrl, item.trustmrr_url,
    item.sourceUrl, item.source_url, item.profileUrl, item.profile_url,
    urlHost === "trustmrr.com" || urlHost.endsWith(".trustmrr.com") ? rawUrl : "",
  ]
    .map(asText)
    .find((url) => {
      try {
        const host = new URL(url).hostname.toLowerCase();
        return /^https?:\/\//i.test(url) && (host === "trustmrr.com" || host.endsWith(".trustmrr.com"));
      } catch {
        return false;
      }
    }) || null;
  const description = asText(item.description);
  return {
    id: makeCompanyId(domain),
    name,
    source: "trustmrr",
    batch: null,
    description: description || `${name} has public revenue evidence on TrustMRR.`,
    one_liner: description.slice(0, 130),
    website,
    location: null,
    team_size: null,
    is_remote: false,
    is_funded_last_12mo: false,
    tags: ["Indie Product", "Revenue evidence"],
    launch_date: date,
    launch_source: date ? "TrustMRR" : null,
    launch_url: sourceUrl,
    trustmrr_mrr: mrr,
    trustmrr_last30: last30,
    trustmrr_total: total,
  };
}

export async function fetchTrustMrrStartups(
  env: WorkerEnv,
  options: { forceLive?: boolean } = {}
): Promise<FetcherResult> {
  const started = Date.now();
  const apiKey = env.TRUSTMRR_API_KEY?.trim();
  if (!apiKey) {
    return {
      source: "trustmrr",
      companies: [],
      durationMs: Date.now() - started,
      mode: "unavailable",
      note: "Optional source not configured: set TRUSTMRR_API_KEY. API-key access/pricing has not been verified; do not purchase a plan for this integration.",
    };
  }

  try {
    const savedCursor = Number(await readD1Cache(env, BACKFILL_CURSOR_KEY));
    const firstBackfillPage = Number.isInteger(savedCursor) && savedCursor >= 2 ? savedCursor : 2;
    const pageNumbers = [
      LATEST_PAGE,
      ...Array.from({ length: BACKFILL_PAGES_PER_SYNC }, (_, index) => firstBackfillPage + index),
    ];
    const pages = await Promise.all(
      pageNumbers.map((page) => {
        const url = `https://trustmrr.com/api/v1/startups?limit=${PAGE_SIZE}&page=${page}&sort=listed-desc`;
        return cachedFetchJson<TrustMrrResponse>(
          env,
          `trustmrr_startups_listed_desc_${page}`,
          url,
          {
            ttlSeconds: 6 * 60 * 60,
            forceLive: Boolean(options.forceLive),
            timeoutMs: 7000,
            headers: { Authorization: `Bearer ${apiKey}` },
          }
        );
      })
    );
    await writeD1Cache(
      env,
      BACKFILL_CURSOR_KEY,
      String(firstBackfillPage + BACKFILL_PAGES_PER_SYNC),
      365 * 24 * 60 * 60,
      "text/plain"
    );
    const companies = pages
      .flatMap((page) => rowsFromResponse(page.data))
      .map(normalizeTrustMrrStartup)
      .filter((company): company is NormalizedCompanyInput => company !== null);
    const anyLive = pages.some((page) => !page.fromCache);
    return {
      source: "trustmrr",
      companies,
      durationMs: Date.now() - started,
      mode: anyLive ? "live" : "cached",
      note: `Checked the newest page and ${BACKFILL_PAGES_PER_SYNC} rotating history pages (${PAGE_SIZE} listings per page); retained products with positive source-reported MRR, last-30-day receipts, or lifetime revenue.`,
    };
  } catch (error) {
    return {
      source: "trustmrr",
      companies: [],
      durationMs: Date.now() - started,
      mode: "unavailable",
      note: "TrustMRR returned no usable result. Existing D1 records were kept.",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
