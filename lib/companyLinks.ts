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
    // Publisher and social profiles are sources, not verified company websites.
    const sourceHosts = ["news.ycombinator.com", "mercurynews.com", "grnh.se", "finsmes.com", "eu-startups.com", "techcrunch.com", "linkedin.com", "facebook.com", "instagram.com", "twitter.com", "x.com", "reddit.com"];
    const isSourceHost = sourceHosts.some((host) => hostname === host || hostname.endsWith(`.${host}`));
    return ["http:", "https:"].includes(url.protocol) &&
      hostname.includes(".") &&
      !isSyntheticHost && !isSourceHost;
  } catch {
    return false;
  }
}
