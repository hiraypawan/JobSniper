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
