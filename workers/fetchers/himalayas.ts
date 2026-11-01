// Parsing only: this module is not wired into sync or the public API.
// Enabling the source also requires closure checks, attribution, and a way to
// prevent onward feeds and JobPosting structured data.

export interface HimalayasJob {
  guid: string;
  applicationLink: string;
  companyName: string;
  companySlug: string;
  title: string;
  locationRestrictions: string[] | null;
  timezoneRestrictions: number[] | null;
  indiaEligible: boolean;
  seniority: string[];
  employmentType: string;
  excerpt: string;
  pubDate: number | null;
  expiryDate: number;
}

function strings(value: unknown): string[] | null {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) return null;
  return value.map((item: string) => item.trim()).filter(Boolean);
}

function validApplicationLink(value: unknown): value is string {
  if (typeof value !== "string" || value !== value.trim()) return false;
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password;
  } catch {
    return false;
  }
}

// The API says an empty country list means unrestricted; an absent or invalid
// timezone list is unknown, not evidence that India is eligible.
export function himalayasAllowsIndia(countries: string[] | null, timezones: number[] | null): boolean {
  const countryAllowed = countries !== null && (countries.length === 0 || countries.some((country) => /^india$/i.test(country)));
  return countryAllowed && timezones !== null && timezones.includes(5.5);
}

/**
 * Validate one feed record without changing its applicationLink. A future sync
 * must also check the single-job endpoint: a job can close before expiryDate.
 */
export function parseHimalayasJob(value: unknown, nowSeconds = Date.now() / 1000): HimalayasJob | null {
  if (!value || typeof value !== "object") return null;
  const job = value as Record<string, unknown>;
  if (typeof job.guid !== "string" || typeof job.companyName !== "string" ||
      typeof job.companySlug !== "string" || typeof job.title !== "string" ||
      !job.companyName.trim() || !job.companySlug.trim() || !job.title.trim() ||
      !validApplicationLink(job.applicationLink) ||
      typeof job.expiryDate !== "number" || !Number.isFinite(job.expiryDate) || job.expiryDate <= nowSeconds) return null;
  try {
    const guid = new URL(job.guid);
    if (guid.protocol !== "https:" || guid.hostname !== "himalayas.app" || guid.username || guid.password || guid.search || guid.hash ||
        !/^\/companies\/[^/]+\/jobs\/[^/]+\/?$/.test(guid.pathname)) return null;
  } catch {
    return null;
  }
  // locationRestrictions is documented as optional, so absence means the
  // documented unrestricted-country case. Malformed values remain unknown.
  const countries = job.locationRestrictions === undefined ? [] : strings(job.locationRestrictions);
  const timezones = Array.isArray(job.timezoneRestrictions) &&
    job.timezoneRestrictions.every((offset: unknown) => typeof offset === "number" && Number.isFinite(offset))
    ? job.timezoneRestrictions as number[] : null;
  return {
    guid: job.guid,
    applicationLink: job.applicationLink,
    companyName: job.companyName.trim(),
    companySlug: job.companySlug.trim(),
    title: job.title.trim(),
    locationRestrictions: countries,
    timezoneRestrictions: timezones,
    indiaEligible: himalayasAllowsIndia(countries, timezones),
    seniority: strings(job.seniority) || [],
    employmentType: typeof job.employmentType === "string" ? job.employmentType.trim() : "",
    excerpt: typeof job.excerpt === "string" ? job.excerpt.trim() : "",
    pubDate: typeof job.pubDate === "number" && Number.isFinite(job.pubDate) ? job.pubDate : null,
    expiryDate: job.expiryDate,
  };
}
