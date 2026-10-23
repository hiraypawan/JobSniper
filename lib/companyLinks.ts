function isSyntheticDomain(domain: string): boolean {
  const normalized = domain.toLowerCase();
  return normalized.endsWith(".invalid") || normalized.endsWith(".startup.local");
}

export function isUsableSourceWebsite(website: string | null | undefined, domain: string): boolean {
  if (!website?.trim() || isSyntheticDomain(domain)) return false;
  try {
    const url = new URL(website);
    const hostname = url.hostname.toLowerCase();
    const isSyntheticHost =
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname.endsWith(".local") ||
      hostname.endsWith(".invalid");
    return ["http:", "https:"].includes(url.protocol) &&
      hostname.includes(".") &&
      !isSyntheticHost;
  } catch {
    return false;
  }
}

function googleSearch(query: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

export function officialWebsiteSearchUrl(companyName: string): string {
  return googleSearch(`${companyName} official website`);
}

export function linkedinSearchUrl(companyName: string, founderName?: string | null): string {
  const query = founderName ? `${founderName} ${companyName}` : companyName;
  const type = founderName ? "people" : "companies";
  return `https://www.linkedin.com/search/results/${type}/?keywords=${encodeURIComponent(query)}`;
}

export function businessEmailSearchUrl(
  companyName: string,
  domain: string,
  website?: string | null
): string {
  let sourceDomain = "";
  if (website && isUsableSourceWebsite(website, domain)) {
    try {
      sourceDomain = new URL(website).hostname.replace(/^www\./i, "");
    } catch {
      // Fall back to a name-only search below.
    }
  } else if (domain && !isSyntheticDomain(domain)) {
    sourceDomain = domain.split("/")[0].replace(/^www\./i, "");
  }
  const query = sourceDomain
    ? `site:${sourceDomain} contact email`
    : `${companyName} official contact email`;
  return googleSearch(query);
}
