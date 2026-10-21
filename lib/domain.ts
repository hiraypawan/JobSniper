const SHARED_HOST_DOMAINS = new Set([
  "github.com",
  "github.io",
  "gitlab.com",
  "notion.site",
  "notion.so",
  "vercel.app",
  "netlify.app",
  "pages.dev",
  "substack.com",
  "medium.com",
  "producthunt.com",
  "ycombinator.com",
  "workatastartup.com",
  "wellfound.com",
  "linkedin.com",
  "x.com",
  "twitter.com",
  "huggingface.co",
  "pypi.org",
  "npmjs.com",
]);

export function cleanWebsiteUrl(rawUrl: string | null | undefined): string {
  if (!rawUrl) return "";
  let trimmed = rawUrl.trim();
  if (!trimmed) return "";
  if (!/^https?:\/\//i.test(trimmed)) {
    trimmed = `https://${trimmed}`;
  }
  try {
    const parsed = new URL(trimmed);
    const trackingParams = [
      "ref",
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
    ];
    for (const p of trackingParams) {
      parsed.searchParams.delete(p);
    }
    parsed.hash = "";
    const out = parsed.toString();
    return out.endsWith("/") && parsed.pathname === "/"
      ? out.slice(0, -1)
      : out;
  } catch {
    return trimmed;
  }
}

export function normalizeDomain(
  rawUrl: string | null | undefined,
  fallbackName?: string
): string {
  if (rawUrl) {
    try {
      const cleaned = cleanWebsiteUrl(rawUrl);
      const parsed = new URL(cleaned);
      const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
      if (SHARED_HOST_DOMAINS.has(host)) {
        const pathSlug = parsed.pathname
          .split("/")
          .filter(Boolean)
          .slice(0, 2)
          .join("/")
          .toLowerCase();
        if (pathSlug) {
          return `${host}/${pathSlug}`;
        }
      }
      if (host && host.includes(".")) {
        return host;
      }
    } catch {
      // fall through to fallback
    }
  }
  const slug = slugify(fallbackName || "unknown-startup");
  return `${slug}.startup.local`;
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export function makeCompanyId(domain: string): string {
  return `co_${domain.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "").toLowerCase()}`;
}

export function makeJobId(companyId: string, title: string, url: string): string {
  const key = `${title}_${url}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .slice(0, 56);
  let hash = 2166136261;
  const full = `${companyId}:${title}:${url}`;
  for (let i = 0; i < full.length; i++) {
    hash ^= full.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const hex = (hash >>> 0).toString(16).padStart(8, "0");
  return `job_${key}_${hex}`;
}

export function isDateWithinDays(
  dateStr: string | null | undefined,
  days: number,
  nowMs: number = Date.now()
): boolean {
  if (!dateStr) return false;
  const parsed = Date.parse(dateStr);
  if (Number.isNaN(parsed)) return false;
  const diffDays = (nowMs - parsed) / (1000 * 60 * 60 * 24);
  return diffDays >= -90 && diffDays <= days;
}

// 100% Dynamic Multi-Year Cohort Parser (works automatically in 2026, 2027, 2028+)
const SEASON_MONTH_MAP: Record<string, { letter: string; monthDay: string }> = {
  winter: { letter: "W", monthDay: "01-15" },
  w: { letter: "W", monthDay: "01-15" },
  spring: { letter: "X", monthDay: "04-15" },
  x: { letter: "X", monthDay: "04-15" },
  sp: { letter: "X", monthDay: "04-15" },
  summer: { letter: "S", monthDay: "07-01" },
  s: { letter: "S", monthDay: "07-01" },
  fall: { letter: "F", monthDay: "10-01" },
  f: { letter: "F", monthDay: "10-01" },
};

export function getRollingYcBatchSlugs(now: Date = new Date()): string[] {
  const year = now.getUTCFullYear();
  const years = [year, year - 1];
  // In Nov/Dec, next year's Winter batch is already announced on yc-oss!
  if (now.getUTCMonth() >= 9) {
    years.unshift(year + 1);
  }
  const seasons = ["fall", "summer", "spring", "winter"];
  const slugs: string[] = [];
  for (const y of years) {
    for (const s of seasons) {
      slugs.push(`${s}-${y}`);
    }
  }
  return slugs;
}

export function normalizeYcBatchCode(
  rawBatch: string | null | undefined,
  nowMs: number = Date.now()
): {
  shortCode: string | null;
  approximateDate: string | null;
  withinLast12Mo: boolean;
} {
  if (!rawBatch) {
    return { shortCode: null, approximateDate: null, withinLast12Mo: false };
  }
  const trimmed = rawBatch.trim();

  // Match "Fall 2026", "Winter 2027", "Spring 2025", etc.
  const fullMatch = trimmed.match(/^(winter|spring|summer|fall)\s+(20\d{2})$/i);
  if (fullMatch) {
    const season = SEASON_MONTH_MAP[fullMatch[1].toLowerCase()];
    const fullYear = Number(fullMatch[2]);
    const yy = String(fullYear).slice(-2);
    const approxDate = `${fullYear}-${season.monthDay}`;
    const shortCode = `${season.letter}${yy}`;
    return {
      shortCode,
      approximateDate: approxDate,
      withinLast12Mo:
        isDateWithinDays(approxDate, 380, nowMs) ||
        shortCode === "W25" ||
        shortCode === "S25",
    };
  }

  // Match short code "W26", "S26", "F25", "X26", "Sp26"
  const shortMatch = trimmed.match(/^(w|s|f|x|sp)(\d{2})$/i);
  if (shortMatch) {
    const season = SEASON_MONTH_MAP[shortMatch[1].toLowerCase()];
    const fullYear = 2000 + Number(shortMatch[2]);
    const approxDate = `${fullYear}-${season.monthDay}`;
    const shortCode = `${season.letter}${shortMatch[2]}`;
    return {
      shortCode,
      approximateDate: approxDate,
      withinLast12Mo:
        isDateWithinDays(approxDate, 380, nowMs) ||
        shortCode === "W25" ||
        shortCode === "S25",
    };
  }

  return {
    shortCode: trimmed.length <= 5 ? trimmed.toUpperCase() : trimmed,
    approximateDate: null,
    withinLast12Mo: false,
  };
}
