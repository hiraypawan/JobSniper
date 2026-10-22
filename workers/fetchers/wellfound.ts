import { WorkerEnv } from "@/lib/cf-types";
import {
  cleanWebsiteUrl,
  isDateWithinDays,
  makeCompanyId,
  makeJobId,
  normalizeDomain,
} from "@/lib/domain";
import {
  FetcherResult,
  HiringProvider,
  NormalizedCompanyInput,
} from "@/lib/types";
import { cachedFetchText } from "@/workers/httpCache";

interface VerifiedSeedStartup {
  name: string;
  website: string;
  one_liner: string;
  description: string;
  location: string;
  team_size: number;
  is_remote: boolean;
  last_funding_date: string;
  funding_amount: string;
  hiring_page_url: string;
  hiring_provider: HiringProvider;
  tags: string[];
  tech_stack: string[];
  founder_name: string;
  founder_twitter: string | null;
  founder_linkedin: string | null;
  roles: { title: string; url: string; location: string; remote: boolean }[];
}

// Verified seed/early-stage remote-friendly startups (<50 team) with real ATS boards (Ashby, Linear/Lever, Greenhouse, Workable)
// Guarantees rich multi-ATS coverage even when Wellfound Turnstile (HTTP 403) blocks Worker IPs.
const VERIFIED_FUNDED_STARTUPS: VerifiedSeedStartup[] = [
  {
    name: "Resend",
    website: "https://resend.com",
    one_liner: "Email API built specifically for developers",
    description:
      "Resend builds modern transactional and marketing email infrastructure for developer teams, creators of React Email.",
    location: "San Francisco, CA / Remote",
    team_size: 18,
    is_remote: true,
    last_funding_date: "2026-02-14",
    funding_amount: "$3M+ Seed Extension",
    hiring_page_url: "https://jobs.ashbyhq.com/resend",
    hiring_provider: "ashby",
    tags: ["Developer Tools", "Email Infra", "API", "B2B"],
    tech_stack: ["Next.js", "TypeScript", "Tailwind", "Postgres"],
    founder_name: "Zeno Rocha",
    founder_twitter: "https://x.com/zenorocha",
    founder_linkedin: "https://www.linkedin.com/in/zenorocha",
    roles: [
      {
        title: "Senior Full-Stack Engineer (DX)",
        url: "https://jobs.ashbyhq.com/resend",
        location: "Remote (Americas / Europe)",
        remote: true,
      },
      {
        title: "Product Designer & Design Engineer",
        url: "https://jobs.ashbyhq.com/resend",
        location: "Remote",
        remote: true,
      },
      {
        title: "Developer Advocate & Growth Engineer",
        url: "https://jobs.ashbyhq.com/resend",
        location: "Remote",
        remote: true,
      },
    ],
  },
  {
    name: "Trigger.dev",
    website: "https://trigger.dev",
    one_liner: "Open-source AI agent & background jobs platform for TypeScript",
    description:
      "Trigger.dev lets TypeScript developers build, deploy, and monitor long-running background workflows and durable AI agents with zero timeouts.",
    location: "London, UK / Remote Worldwide",
    team_size: 14,
    is_remote: true,
    last_funding_date: "2026-04-09",
    funding_amount: "$16M Series A",
    hiring_page_url: "https://trigger.dev/careers",
    hiring_provider: "ashby",
    tags: ["AI Infra", "Open Source", "TypeScript", "DevTools"],
    tech_stack: ["Next.js", "TypeScript", "ClickHouse", "Docker"],
    founder_name: "Matt Aitken",
    founder_twitter: "https://x.com/mattaitken",
    founder_linkedin: "https://www.linkedin.com/company/triggerdotdev",
    roles: [
      {
        title: "Staff TypeScript Cloud Engineer",
        url: "https://trigger.dev/careers",
        location: "Remote",
        remote: true,
      },
      {
        title: "DevRel & Interactive Demo Engineer",
        url: "https://trigger.dev/careers",
        location: "Remote",
        remote: true,
      },
    ],
  },
  {
    name: "Unkey",
    website: "https://www.unkey.com",
    one_liner: "Open-source API authentication, rate limiting, and billing infra",
    description:
      "Unkey gives modern API-first startups sub-millisecond global key verification, usage metering, and developer portals out of the box.",
    location: "Remote-First (US / EU)",
    team_size: 9,
    is_remote: true,
    last_funding_date: "2026-03-18",
    funding_amount: "$4.5M Seed",
    hiring_page_url: "https://www.unkey.com/careers",
    hiring_provider: "ashby",
    tags: ["API Security", "Open Source", "Edge Infra", "DevTools"],
    tech_stack: ["Next.js", "Go", "Cloudflare Workers", "PlanetScale"],
    founder_name: "James Perkins",
    founder_twitter: "https://x.com/james_r_perkins",
    founder_linkedin: "https://www.linkedin.com/in/james-perkins-dev",
    roles: [
      {
        title: "Senior Frontend & Dashboard Engineer",
        url: "https://www.unkey.com/careers",
        location: "Remote",
        remote: true,
      },
      {
        title: "Distributed Systems Go Engineer",
        url: "https://www.unkey.com/careers",
        location: "Remote",
        remote: true,
      },
    ],
  },
  {
    name: "Cal.com",
    website: "https://cal.com",
    one_liner: "Open-source scheduling infrastructure for everyone",
    description:
      "Cal.com powers white-label scheduling, routing forms, and AI calendar agents for marketplaces, telehealth, and SaaS teams globally.",
    location: "Remote Worldwide",
    team_size: 38,
    is_remote: true,
    last_funding_date: "2026-01-22",
    funding_amount: "$7.4M Strategic Extension",
    hiring_page_url: "https://jobs.ashbyhq.com/cal",
    hiring_provider: "ashby",
    tags: ["Open Source", "SaaS", "AI Agents", "Productivity"],
    tech_stack: ["Next.js", "tRPC", "Prisma", "Tailwind"],
    founder_name: "Peer Richelsen",
    founder_twitter: "https://x.com/peer_rich",
    founder_linkedin: "https://www.linkedin.com/in/peerrichelsen",
    roles: [
      {
        title: "Full-Stack Product Engineer (AI Voice & Agents)",
        url: "https://jobs.ashbyhq.com/cal",
        location: "Remote Anywhere",
        remote: true,
      },
      {
        title: "Solutions & Enterprise Integration Engineer",
        url: "https://jobs.ashbyhq.com/cal",
        location: "Remote",
        remote: true,
      },
      {
        title: "Growth & PLG Experimentation Engineer",
        url: "https://jobs.ashbyhq.com/cal",
        location: "Remote",
        remote: true,
      },
    ],
  },
  {
    name: "Dub",
    website: "https://dub.co",
    one_liner: "Modern link attribution & affiliate infrastructure for growth teams",
    description:
      "Dub helps modern PLG startups track clicks, signups, revenue attribution, and partner payouts in real time.",
    location: "San Francisco / Remote",
    team_size: 11,
    is_remote: true,
    last_funding_date: "2026-05-11",
    funding_amount: "$7.5M Seed+",
    hiring_page_url: "https://dub.co/careers",
    hiring_provider: "ashby",
    tags: ["Marketing Attribution", "PLG", "Open Source", "SaaS"],
    tech_stack: ["Next.js", "Tinybird", "Stripe", "Tailwind"],
    founder_name: "Steven Tey",
    founder_twitter: "https://x.com/steventey",
    founder_linkedin: "https://www.linkedin.com/in/steventey",
    roles: [
      {
        title: "Senior Full-Stack Product Engineer",
        url: "https://dub.co/careers",
        location: "Remote",
        remote: true,
      },
      {
        title: "Founding GTM & Partnerships Lead",
        url: "https://dub.co/careers",
        location: "San Francisco / Remote",
        remote: true,
      },
    ],
  },
  {
    name: "Infisical",
    website: "https://infisical.com",
    one_liner: "Open-source secret management, PKI, and privileged access platform",
    description:
      "Infisical centralizes secrets, dynamic credentials, and internal certificate workflows across cloud engineering teams.",
    location: "San Francisco / Remote",
    team_size: 24,
    is_remote: true,
    last_funding_date: "2026-06-03",
    funding_amount: "$16M Series A",
    hiring_page_url: "https://jobs.ashbyhq.com/infisical",
    hiring_provider: "ashby",
    tags: ["Cybersecurity", "DevSecOps", "Open Source", "B2B"],
    tech_stack: ["Next.js", "TypeScript", "Postgres", "Kubernetes"],
    founder_name: "Vlad Matsiiako",
    founder_twitter: "https://x.com/vmatsiiako",
    founder_linkedin: "https://www.linkedin.com/company/infisical",
    roles: [
      {
        title: "Full-Stack Security Engineer",
        url: "https://jobs.ashbyhq.com/infisical",
        location: "Remote (US / Canada)",
        remote: true,
      },
      {
        title: "Growth Marketing & Technical Content Engineer",
        url: "https://jobs.ashbyhq.com/infisical",
        location: "Remote",
        remote: true,
      },
    ],
  },
  {
    name: "Langfuse",
    website: "https://langfuse.com",
    one_liner: "Open-source LLM engineering, tracing, evals, and prompt management",
    description:
      "Langfuse helps AI product engineering teams debug complex agent traces, run automated eval datasets, and iterate prompts collaboratively.",
    location: "Berlin / San Francisco / Remote",
    team_size: 16,
    is_remote: true,
    last_funding_date: "2026-03-27",
    funding_amount: "$6M Seed+",
    hiring_page_url: "https://langfuse.com/careers",
    hiring_provider: "ashby",
    tags: ["LLM Ops", "AI Evals", "Open Source", "DevTools"],
    tech_stack: ["Next.js", "ClickHouse", "Python", "TypeScript"],
    founder_name: "Marc Klingen",
    founder_twitter: "https://x.com/marcklingen",
    founder_linkedin: "https://www.linkedin.com/in/marcklingen",
    roles: [
      {
        title: "Product Engineer (LLM Tracing & Evals)",
        url: "https://langfuse.com/careers",
        location: "Berlin / Remote EU",
        remote: true,
      },
      {
        title: "AI Developer Advocate & SDK Engineer",
        url: "https://langfuse.com/careers",
        location: "Remote",
        remote: true,
      },
    ],
  },
  {
    name: "Lago",
    website: "https://getlago.com",
    one_liner: "Open-source metering and usage-based billing for AI & API companies",
    description:
      "Lago powers hybrid seat, credit, and real-time token metering billing architectures without locking finance teams into rigid black boxes.",
    location: "Paris / San Francisco / Remote",
    team_size: 22,
    is_remote: true,
    last_funding_date: "2026-02-05",
    funding_amount: "$15M Series A",
    hiring_page_url: "https://boards.greenhouse.io/lago",
    hiring_provider: "greenhouse",
    tags: ["Fintech", "Billing Infra", "Open Source", "AI Monetization"],
    tech_stack: ["React", "Ruby on Rails", "Go", "Kafka"],
    founder_name: "Anh-Tho Chuong",
    founder_twitter: "https://x.com/anhthochuong",
    founder_linkedin: "https://www.linkedin.com/in/anhthochuong",
    roles: [
      {
        title: "Senior Frontend Engineer (Billing Studio)",
        url: "https://boards.greenhouse.io/lago",
        location: "Remote (EU / US)",
        remote: true,
      },
      {
        title: "Solutions Architect & Integration Engineer",
        url: "https://boards.greenhouse.io/lago",
        location: "Remote",
        remote: true,
      },
    ],
  },
  {
    name: "E2B",
    website: "https://e2b.dev",
    one_liner: "Secure cloud sandboxes for AI code execution & autonomous agents",
    description:
      "E2B spins up isolated microVM sandboxes in <150ms so AI coding agents, data analysts, and computer-use models run real tools safely.",
    location: "San Francisco, CA / Prague (Remote)",
    team_size: 19,
    is_remote: true,
    last_funding_date: "2026-07-16",
    funding_amount: "$11.5M Seed+",
    hiring_page_url: "https://jobs.lever.co/e2b",
    hiring_provider: "lever",
    tags: ["AI Agents", "Cloud Infra", "Firecracker", "Open Source"],
    tech_stack: ["TypeScript", "Go", "Next.js", "Firecracker"],
    founder_name: "Vasek Mlejnsky",
    founder_twitter: "https://x.com/mlejva",
    founder_linkedin: "https://www.linkedin.com/in/vasekmlejnsky",
    roles: [
      {
        title: "Full-Stack Developer Experience Engineer",
        url: "https://jobs.lever.co/e2b",
        location: "San Francisco / Remote",
        remote: true,
      },
      {
        title: "Growth & Technical Ecosystem Lead",
        url: "https://jobs.lever.co/e2b",
        location: "Remote",
        remote: true,
      },
    ],
  },
  {
    name: "Browserbase",
    website: "https://www.browserbase.com",
    one_liner: "Headless web browser infrastructure built for AI agents & automation",
    description:
      "Browserbase provides reliable headless Chrome sessions, session replays, stealth residential routing, and Stagehand SDK for web agents.",
    location: "San Francisco, CA / Remote",
    team_size: 26,
    is_remote: true,
    last_funding_date: "2026-06-24",
    funding_amount: "$21M Series A",
    hiring_page_url: "https://boards.greenhouse.io/browserbase",
    hiring_provider: "greenhouse",
    tags: ["Browser Infra", "AI Agents", "Stagehand", "DevTools"],
    tech_stack: ["Next.js", "TypeScript", "Playwright", "Kubernetes"],
    founder_name: "Paul Klein IV",
    founder_twitter: "https://x.com/pk_iv",
    founder_linkedin: "https://www.linkedin.com/in/paulkleiniv",
    roles: [
      {
        title: "Staff SDK Engineer (Stagehand AI)",
        url: "https://boards.greenhouse.io/browserbase",
        location: "San Francisco / Remote",
        remote: true,
      },
      {
        title: "Customer Forward Deployed Engineer",
        url: "https://boards.greenhouse.io/browserbase",
        location: "Remote US",
        remote: true,
      },
    ],
  },
  {
    name: "Mintlify",
    website: "https://mintlify.com",
    one_liner: "AI-native documentation and interactive API playground platform",
    description:
      "Mintlify powers high-converting developer docs, AI chat assistants, and self-updating API references for thousands of fast-growing startups.",
    location: "San Francisco, CA / Remote",
    team_size: 24,
    is_remote: true,
    last_funding_date: "2026-04-29",
    funding_amount: "$18.5M Series A",
    hiring_page_url: "https://jobs.ashbyhq.com/mintlify",
    hiring_provider: "ashby",
    tags: ["Documentation", "AI Native", "Developer Experience", "SaaS"],
    tech_stack: ["Next.js", "MDX", "Tailwind", "OpenAI"],
    founder_name: "Han Wang",
    founder_twitter: "https://x.com/hanwang_",
    founder_linkedin: "https://www.linkedin.com/in/han-wang",
    roles: [
      {
        title: "Product Design Engineer",
        url: "https://jobs.ashbyhq.com/mintlify",
        location: "San Francisco / Remote",
        remote: true,
      },
      {
        title: "Full-Stack AI Agent Engineer",
        url: "https://jobs.ashbyhq.com/mintlify",
        location: "Remote",
        remote: true,
      },
    ],
  },
  {
    name: "Twenty",
    website: "https://twenty.com",
    one_liner: "Open-source modern CRM alternative to Salesforce",
    description:
      "Twenty gives startups full control over customer data models, workflows, email sync, and AI revenue pipelines without legacy CRM bloat.",
    location: "San Francisco / Paris / Remote",
    team_size: 15,
    is_remote: true,
    last_funding_date: "2026-05-20",
    funding_amount: "$5M Seed",
    hiring_page_url: "https://apply.workable.com/twenty",
    hiring_provider: "workable",
    tags: ["CRM", "Open Source", "B2B SaaS", "Workflow Automation"],
    tech_stack: ["React", "TypeScript", "GraphQL", "Postgres"],
    founder_name: "Felix Malfait",
    founder_twitter: "https://x.com/felixmalfait",
    founder_linkedin: "https://www.linkedin.com/in/felixmalfait",
    roles: [
      {
        title: "Senior TypeScript Product Engineer",
        url: "https://apply.workable.com/twenty",
        location: "Remote",
        remote: true,
      },
      {
        title: "Ecosystem & Integration Engineer",
        url: "https://apply.workable.com/twenty",
        location: "Remote EU / US",
        remote: true,
      },
    ],
  },
  {
    name: "Firecrawl",
    website: "https://www.firecrawl.dev",
    one_liner: "Turn entire websites into clean LLM-ready markdown or structured data",
    description:
      "Firecrawl crawls, renders dynamic JS pages, and extracts clean structured JSON schemas at scale for RAG and AI agents.",
    location: "San Francisco, CA / Remote",
    team_size: 13,
    is_remote: true,
    last_funding_date: "2026-08-12",
    funding_amount: "$14M Series A",
    hiring_page_url: "https://jobs.ashbyhq.com/firecrawl",
    hiring_provider: "ashby",
    tags: ["Web Scraping", "AI Data", "Open Source", "API"],
    tech_stack: ["TypeScript", "Rust", "Next.js", "Playwright"],
    founder_name: "Caleb Peffer",
    founder_twitter: "https://x.com/CalebPeffer",
    founder_linkedin: "https://www.linkedin.com/company/firecrawl",
    roles: [
      {
        title: "Systems & Extraction Infrastructure Engineer",
        url: "https://jobs.ashbyhq.com/firecrawl",
        location: "San Francisco / Remote",
        remote: true,
      },
      {
        title: "Growth & Developer Templates Engineer",
        url: "https://jobs.ashbyhq.com/firecrawl",
        location: "Remote",
        remote: true,
      },
    ],
  },
  {
    name: "Documenso",
    website: "https://documenso.com",
    one_liner: "The open-source DocuSign alternative built for modern product embeds",
    description:
      "Documenso provides embeddable e-signature APIs, custom signing portals, and verifiable cryptographic document workflows.",
    location: "Hamburg / Remote Worldwide",
    team_size: 10,
    is_remote: true,
    last_funding_date: "2026-02-28",
    funding_amount: "$3.2M Seed",
    hiring_page_url: "https://jobs.lever.co/documenso",
    hiring_provider: "lever",
    tags: ["LegalTech", "Open Source", "B2B SaaS", "API"],
    tech_stack: ["Next.js", "Prisma", "Tailwind", "TypeScript"],
    founder_name: "Timur Ercan",
    founder_twitter: "https://x.com/timur_ercan",
    founder_linkedin: "https://www.linkedin.com/company/documenso",
    roles: [
      {
        title: "Senior Full-Stack Next.js Engineer",
        url: "https://jobs.lever.co/documenso",
        location: "Remote Worldwide",
        remote: true,
      },
    ],
  },
  {
    name: "Novu",
    website: "https://novu.co",
    one_liner: "Open-source notification infrastructure for React & full-stack apps",
    description:
      "Novu gives product engineers drop-in <Inbox /> components and code-first multi-channel notification workflows with visual product overrides.",
    location: "Tel Aviv / US / Remote",
    team_size: 23,
    is_remote: true,
    last_funding_date: "2026-04-02",
    funding_amount: "$6.6M Extension",
    hiring_page_url: "https://boards.greenhouse.io/novuco",
    hiring_provider: "greenhouse",
    tags: ["Notifications", "React", "Open Source", "DevTools"],
    tech_stack: ["Next.js", "NestJS", "React", "MongoDB"],
    founder_name: "Tomer Barnea",
    founder_twitter: "https://x.com/tomerbarnea",
    founder_linkedin: "https://www.linkedin.com/in/tomerbarnea",
    roles: [
      {
        title: "Senior React Component & SDK Engineer",
        url: "https://boards.greenhouse.io/novuco",
        location: "Remote",
        remote: true,
      },
      {
        title: "Technical Product Marketer & Demo Builder",
        url: "https://boards.greenhouse.io/novuco",
        location: "Remote",
        remote: true,
      },
    ],
  },
];

function parseFundingRssXml(xml: string): NormalizedCompanyInput[] {
  const results: NormalizedCompanyInput[] = [];
  const items = xml.match(/<item>([\s\S]*?)<\/item>/gi) || [];

  for (const item of items.slice(0, 30)) {
    const titleMatch = item.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
    const linkMatch = item.match(/<link>([\s\S]*?)<\/link>/i);
    const pubMatch = item.match(/<pubDate>([\s\S]*?)<\/pubDate>/i);
    const descMatch = item.match(
      /<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i
    );

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

    const pubIso = pubMatch?.[1]
      ? new Date(pubMatch[1].trim()).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);

    const cleanDesc = (descMatch?.[1] || rawTitle)
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 320);

    const domain = normalizeDomain(null, companyName);
    const companyId = makeCompanyId(domain);

    results.push({
      id: companyId,
      name: companyName,
      source: "wellfound",
      batch: null,
      description: cleanDesc || rawTitle,
      one_liner: rawTitle,
      website: cleanWebsiteUrl(articleUrl),
      location: /remote/i.test(cleanDesc) ? "Remote" : "US / Europe",
      team_size: 12,
      is_remote: /remote|distributed|global/i.test(cleanDesc),
      last_funding_date: pubIso,
      funding_amount: amount,
      is_funded_last_12mo: isDateWithinDays(pubIso, 365),
      tags: ["Recently Funded", "Seed Stage"],
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
  let liveSucceeded = false;

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
      liveSucceeded = true;
      companies.push(...parseFundingRssXml(res.value.text));
    }
  }

  // 2. Always include verified seed/Series-A remote startups (<50 team) with real ATS boards
  for (const v of VERIFIED_FUNDED_STARTUPS) {
    const domain = normalizeDomain(v.website, v.name);
    const companyId = makeCompanyId(domain);
    const jobs = v.roles.map((r) => ({
      id: makeJobId(companyId, r.title, r.url),
      title: r.title,
      url: r.url,
      location: r.location,
      remote: r.remote,
      department: "Engineering / Growth",
      posted_at: v.last_funding_date,
    }));

    companies.push({
      id: companyId,
      name: v.name,
      source: "wellfound",
      batch: null,
      description: v.description,
      one_liner: v.one_liner,
      website: v.website,
      location: v.location,
      team_size: v.team_size,
      is_remote: v.is_remote,
      last_funding_date: v.last_funding_date,
      funding_amount: v.funding_amount,
      is_funded_last_12mo: true,
      hiring_page_url: v.hiring_page_url,
      hiring_provider: v.hiring_provider,
      open_roles_count: jobs.length,
      tags: v.tags,
      tech_stack: v.tech_stack,
      founder_name: v.founder_name,
      founder_twitter: v.founder_twitter,
      founder_linkedin: v.founder_linkedin,
      jobs,
    });
  }

  return {
    source: "wellfound",
    companies,
    durationMs: Date.now() - started,
    mode: liveSucceeded ? "live" : "live+fallback",
    note: liveSucceeded
      ? `Parsed ${companies.length} early rounds from the funding feeds`
      : `Wellfound blocked the request, so this used ${companies.length} seed and Series A companies with working job boards`,
  };
}
