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

export function linkedinCompanySearchUrl(companyName: string, domain?: string | null): string {
  const domainHint = domain && !isSyntheticDomain(domain)
    ? ` ${domain.split("/")[0].replace(/^www\./i, "")}`
    : "";
  // LinkedIn's own search forces a sign-in wall on some mobile browsers. Use
  // public web search for company pages instead; direct sourced URLs still go
  // straight to LinkedIn and can be claimed by its iOS/Android app links.
  return googleSearch(`site:linkedin.com/company/ "${companyName}"${domainHint}`);
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
