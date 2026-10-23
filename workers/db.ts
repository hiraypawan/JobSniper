import { D1Database, D1PreparedStatement, WorkerEnv } from "@/lib/cf-types";
import {
  cleanWebsiteUrl,
  isDateWithinDays,
  makeCompanyId,
  makeJobId,
  normalizeDomain,
} from "@/lib/domain";
import { computeSniperScore } from "@/lib/scoring";
import {
  Company,
  CompanySource,
  DashboardStats,
  HiringProvider,
  JobPosting,
  NormalizedCompanyInput,
  OutreachStatus,
  SyncSourceSummary,
} from "@/lib/types";

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS companies (
    id TEXT PRIMARY KEY,
    domain TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    source TEXT NOT NULL,
    sources_json TEXT NOT NULL DEFAULT '[]',
    batch TEXT,
    description TEXT NOT NULL DEFAULT '',
    one_liner TEXT NOT NULL DEFAULT '',
    website TEXT NOT NULL,
    yc_url TEXT,
    logo_url TEXT,
    location TEXT,
    team_size INTEGER,
    is_remote INTEGER NOT NULL DEFAULT 0,
    last_funding_date TEXT,
    funding_amount TEXT,
    is_funded_last_12mo INTEGER NOT NULL DEFAULT 0,
    hiring_page_url TEXT,
    hiring_provider TEXT,
    open_roles_count INTEGER NOT NULL DEFAULT 0,
    tags_json TEXT NOT NULL DEFAULT '[]',
    tech_stack_json TEXT NOT NULL DEFAULT '[]',
    founder_name TEXT,
    founder_twitter TEXT,
    founder_linkedin TEXT,
    founder_email TEXT,
    company_linkedin_url TEXT,
    company_email TEXT,
    contact_checked_at TEXT,
    sniper_score INTEGER NOT NULL DEFAULT 50,
    outreach_status TEXT NOT NULL DEFAULT 'new',
    outreach_notes TEXT NOT NULL DEFAULT '',
    pitched_at TEXT,
    enriched_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_companies_funded ON companies(is_funded_last_12mo)`,
  `CREATE INDEX IF NOT EXISTS idx_companies_remote ON companies(is_remote)`,
  `CREATE INDEX IF NOT EXISTS idx_companies_roles ON companies(open_roles_count)`,
  `CREATE INDEX IF NOT EXISTS idx_companies_source ON companies(source)`,
  `CREATE INDEX IF NOT EXISTS idx_companies_batch ON companies(batch)`,
  `CREATE INDEX IF NOT EXISTS idx_companies_score ON companies(sniper_score DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_companies_outreach ON companies(outreach_status)`,
  `CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    location TEXT,
    remote INTEGER NOT NULL DEFAULT 0,
    department TEXT,
    description TEXT,
    posted_at TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_jobs_company_id ON jobs(company_id)`,
  `CREATE TABLE IF NOT EXISTS http_cache (
    cache_key TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    content_type TEXT NOT NULL DEFAULT 'application/json',
    expires_at INTEGER NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS sync_runs (
    id TEXT PRIMARY KEY,
    mode TEXT NOT NULL,
    started_at TEXT NOT NULL,
    completed_at TEXT NOT NULL,
    duration_ms INTEGER NOT NULL,
    total_fetched INTEGER NOT NULL DEFAULT 0,
    total_upserted INTEGER NOT NULL DEFAULT 0,
    enriched_count INTEGER NOT NULL DEFAULT 0,
    sources_report_json TEXT NOT NULL DEFAULT '[]'
  )`,
];

let schemaReadyForDb = new WeakSet<object>();

export async function ensureSchema(db: D1Database): Promise<void> {
  if (schemaReadyForDb.has(db as unknown as object)) return;
  for (const sql of SCHEMA_STATEMENTS) {
    await db.prepare(sql).run();
  }
  // Additive schema upgrade for databases created before job descriptions were
  // stored. Probe the column instead of relying on SQLite PRAGMA support in D1.
  try {
    await db.prepare("SELECT description FROM jobs LIMIT 0").all();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/no such column.*description/i.test(message)) throw error;
    try {
      await db.prepare("ALTER TABLE jobs ADD COLUMN description TEXT").run();
    } catch (alterError) {
      // Concurrent first requests can both observe the old schema; a duplicate
      // column means the other request completed the same additive upgrade.
      const alterMessage =
        alterError instanceof Error ? alterError.message : String(alterError);
      if (!/duplicate column/i.test(alterMessage)) throw alterError;
    }
  }

  // Add source-site contact fields to existing D1 databases without requiring
  // a separate paid service or a destructive migration.
  for (const [column, type] of [
    ["company_linkedin_url", "TEXT"],
    ["company_email", "TEXT"],
    ["contact_checked_at", "TEXT"],
    ["follow_up_at", "TEXT"],
  ] as const) {
    try {
      await db.prepare(`SELECT ${column} FROM companies LIMIT 0`).all();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!new RegExp(`no such column.*${column}`, "i").test(message)) throw error;
      try {
        await db.prepare(`ALTER TABLE companies ADD COLUMN ${column} ${type}`).run();
      } catch (alterError) {
        const alterMessage = alterError instanceof Error ? alterError.message : String(alterError);
        if (!/duplicate column/i.test(alterMessage)) throw alterError;
      }
    }
  }

  // Launch-event metadata and TrustMRR revenue evidence are additive. In
  // particular, launch_date is source publication/listing time, never updated_at.
  for (const [column, type] of [
    ["launch_date", "TEXT"],
    ["launch_source", "TEXT"],
    ["launch_url", "TEXT"],
    ["trustmrr_mrr", "REAL"],
    ["trustmrr_last30", "REAL"],
    ["trustmrr_total", "REAL"],
  ] as const) {
    try {
      await db.prepare(`SELECT ${column} FROM companies LIMIT 0`).all();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!new RegExp(`no such column.*${column}`, "i").test(message)) throw error;
      try {
        await db.prepare(`ALTER TABLE companies ADD COLUMN ${column} ${type}`).run();
      } catch (alterError) {
        const alterMessage = alterError instanceof Error ? alterError.message : String(alterError);
        if (!/duplicate column/i.test(alterMessage)) throw alterError;
      }
    }
  }
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_companies_launch_date ON companies(launch_date DESC)").run();

  // Remove legacy generated roles and unsupported seed metadata once. Verified
  // ATS refreshes can repopulate actual postings without losing CRM status.
  const staleRoleMigration = "cleanup-unverified-seed-roles-v1";
  const completedMigration = await db
    .prepare("SELECT cache_key FROM http_cache WHERE cache_key = ?")
    .bind(staleRoleMigration)
    .first<{ cache_key: string }>();
  if (!completedMigration) {
    const now = new Date().toISOString();
    await db.batch([
      db.prepare(
        `UPDATE companies
         SET open_roles_count = 0, enriched_at = NULL, sniper_score = 50
         WHERE EXISTS (
           SELECT 1 FROM jobs
           WHERE jobs.company_id = companies.id
             AND (
               (companies.sources_json LIKE '%wellfound%' AND jobs.url = companies.hiring_page_url)
               OR (companies.sources_json LIKE '%hn_hiring%' AND jobs.title IN (
                 'Senior TypeScript Ecosystem & Sync Engineer (Remote)',
                 'Developer Experience & Example Apps Engineer',
                 'Founding Distributed Systems & SDK Engineer',
                 'Founding Solutions & Developer Growth Engineer',
                 'Senior Applied AI & Graph Memory Engineer',
                 'Full-Stack Cloud Console Engineer (Next.js)',
                 'Senior Design & Frontend Product Engineer',
                 'Rust / TypeScript Runtime Engineer'
               ))
               OR (companies.sources_json LIKE '%yc%' AND jobs.title IN (
                 'Founding AI / Systems Engineer',
                 'Founding Full-Stack Engineer',
                 'Founding GTM & Growth Lead',
                 'Product Engineer (Frontend / Design)'
               ))
               OR (companies.sources_json LIKE '%workatastartup%' AND (
                 jobs.title IN (
                   'Founding AI Product Engineer (Remote)',
                   'Founding Full-Stack Engineer (Remote)',
                   'Founding GTM / Growth Engineer',
                   'Senior Frontend & Design Engineer'
                 )
                 OR (jobs.title = 'Founding Engineer' AND jobs.url = companies.hiring_page_url)
               ))
             )
         )`
      ),
      db.prepare(
        `DELETE FROM jobs
         WHERE id IN (
           SELECT jobs.id FROM jobs
           JOIN companies ON companies.id = jobs.company_id
           WHERE (
             (companies.sources_json LIKE '%wellfound%' AND jobs.url = companies.hiring_page_url)
             OR (companies.sources_json LIKE '%hn_hiring%' AND jobs.title IN (
               'Senior TypeScript Ecosystem & Sync Engineer (Remote)',
               'Developer Experience & Example Apps Engineer',
               'Founding Distributed Systems & SDK Engineer',
               'Founding Solutions & Developer Growth Engineer',
               'Senior Applied AI & Graph Memory Engineer',
               'Full-Stack Cloud Console Engineer (Next.js)',
               'Senior Design & Frontend Product Engineer',
               'Rust / TypeScript Runtime Engineer'
             ))
             OR (companies.sources_json LIKE '%yc%' AND jobs.title IN (
               'Founding AI / Systems Engineer',
               'Founding Full-Stack Engineer',
               'Founding GTM & Growth Lead',
               'Product Engineer (Frontend / Design)'
             ))
             OR (companies.sources_json LIKE '%workatastartup%' AND (
               jobs.title IN (
                 'Founding AI Product Engineer (Remote)',
                 'Founding Full-Stack Engineer (Remote)',
                 'Founding GTM / Growth Engineer',
                 'Senior Frontend & Design Engineer'
               )
               OR (jobs.title = 'Founding Engineer' AND jobs.url = companies.hiring_page_url)
             ))
           )
         )`
      ),
      db.prepare(
        `UPDATE companies
         SET last_funding_date = NULL,
             funding_amount = NULL,
             is_funded_last_12mo = 0,
             sniper_score = 50
         WHERE source = 'yc'`
      ),
      db.prepare(
        `UPDATE companies
         SET name = 'Unverified YC directory record',
             domain = lower(replace(id, '_', '-')) || '.invalid',
             description = '',
             one_liner = '',
             website = '',
             location = NULL,
             team_size = NULL,
             is_remote = 0,
             last_funding_date = NULL,
             funding_amount = NULL,
             is_funded_last_12mo = 0,
             hiring_page_url = NULL,
             hiring_provider = NULL,
             open_roles_count = 0,
             founder_name = NULL,
             founder_twitter = NULL,
             founder_linkedin = NULL,
             founder_email = NULL,
             enriched_at = NULL,
             sniper_score = 50,
             outreach_status = CASE WHEN outreach_status = 'new' THEN 'archived' ELSE outreach_status END
         WHERE source = 'yc' AND domain = 'ycombinator.com'`
      ),
      db.prepare(
        `UPDATE companies
         SET location = NULL,
             is_remote = 0,
             last_funding_date = NULL,
             funding_amount = NULL,
             is_funded_last_12mo = 0,
             sniper_score = 50
         WHERE source = 'workatastartup'`
      ),
      db.prepare(
        `UPDATE companies
         SET location = NULL,
             team_size = NULL,
             is_remote = 0,
             last_funding_date = NULL,
             funding_amount = NULL,
             is_funded_last_12mo = 0,
             founder_name = NULL,
             founder_twitter = NULL,
             founder_linkedin = NULL,
             founder_email = NULL,
             enriched_at = NULL,
             sniper_score = 50
         WHERE source IN ('producthunt', 'indie')`
      ),
      db.prepare(
        `UPDATE companies
         SET description = '',
             one_liner = '',
             batch = NULL,
             location = NULL,
             team_size = NULL,
             is_remote = 0,
             last_funding_date = NULL,
             funding_amount = NULL,
             is_funded_last_12mo = 0,
             tags_json = '[]',
             tech_stack_json = '[]',
             founder_name = NULL,
             founder_twitter = NULL,
             founder_linkedin = NULL,
             founder_email = NULL,
             hiring_page_url = NULL,
             hiring_provider = NULL,
             open_roles_count = 0,
             enriched_at = NULL,
             sniper_score = 50
         WHERE sources_json LIKE '%hn_hiring%'
           AND domain IN ('electric-sql.com', 'hatchet.run', 'getzep.com', 'encore.dev')`
      ),
      db.prepare(
        `UPDATE companies
         SET outreach_status = 'archived', updated_at = ?
         WHERE outreach_status = 'new'
           AND ((source = 'producthunt' AND lower(website) LIKE '%producthunt.com%')
             OR (source = 'indie' AND (lower(website) LIKE '%news.ycombinator.com%' OR lower(website) LIKE '%github.com%'))
             OR (source = 'wellfound' AND (
               lower(website) LIKE '%finsmes.com%'
               OR lower(website) LIKE '%eu-startups.com%'
               OR lower(website) LIKE '%techcrunch.com%'
             )))`
      ).bind(now),
      db.prepare(
        `UPDATE companies
         SET domain = lower(replace(id, '_', '-')) || '.invalid',
             website = '',
             description = '',
             one_liner = '',
             location = NULL,
             team_size = NULL,
             is_remote = 0,
             last_funding_date = NULL,
             funding_amount = NULL,
             is_funded_last_12mo = 0,
             founder_name = NULL,
             founder_twitter = NULL,
             founder_linkedin = NULL,
             founder_email = NULL,
             hiring_page_url = NULL,
             hiring_provider = NULL,
             open_roles_count = 0,
             sniper_score = 50,
             enriched_at = NULL
         WHERE (source = 'producthunt' AND lower(website) LIKE '%producthunt.com%')
            OR (source = 'indie' AND (lower(website) LIKE '%news.ycombinator.com%' OR lower(website) LIKE '%github.com%'))
            OR (source = 'wellfound' AND (
              lower(website) LIKE '%finsmes.com%'
              OR lower(website) LIKE '%eu-startups.com%'
              OR lower(website) LIKE '%techcrunch.com%'
            ))`
      ),
      db.prepare(
        `UPDATE companies
         SET batch = NULL,
             description = '',
             one_liner = '',
             location = NULL,
             team_size = NULL,
             is_remote = 0,
             last_funding_date = NULL,
             funding_amount = NULL,
             is_funded_last_12mo = 0,
             hiring_page_url = NULL,
             hiring_provider = NULL,
             open_roles_count = 0,
             tags_json = '[]',
             tech_stack_json = '[]',
             founder_name = NULL,
             founder_twitter = NULL,
             founder_linkedin = NULL,
             founder_email = NULL,
             enriched_at = NULL,
             sniper_score = 50
         WHERE sources_json LIKE '%wellfound%'
           AND hiring_page_url IS NOT NULL`
      ),
      db.prepare(
        `INSERT OR IGNORE INTO http_cache (cache_key, payload, content_type, expires_at, updated_at)
         VALUES (?, 'done', 'text/plain', 4102444800000, ?)`
      ).bind(staleRoleMigration, now),
    ]);
  }
  schemaReadyForDb.add(db as unknown as object);
}

interface RawCompanyRow {
  id: string;
  domain: string;
  name: string;
  source: CompanySource;
  sources_json: string;
  batch: string | null;
  description: string;
  one_liner: string;
  website: string;
  yc_url: string | null;
  logo_url: string | null;
  location: string | null;
  team_size: number | null;
  is_remote: number;
  last_funding_date: string | null;
  funding_amount: string | null;
  is_funded_last_12mo: number;
  hiring_page_url: string | null;
  hiring_provider: HiringProvider;
  open_roles_count: number;
  tags_json: string;
  tech_stack_json: string;
  founder_name: string | null;
  founder_twitter: string | null;
  founder_linkedin: string | null;
  founder_email: string | null;
  company_linkedin_url: string | null;
  company_email: string | null;
  contact_checked_at: string | null;
  follow_up_at: string | null;
  launch_date: string | null;
  launch_source: string | null;
  launch_url: string | null;
  trustmrr_mrr: number | null;
  trustmrr_last30: number | null;
  trustmrr_total: number | null;
  sniper_score: number;
  outreach_status: OutreachStatus;
  outreach_notes: string;
  pitched_at: string | null;
  enriched_at: string | null;
  created_at: string;
  updated_at: string;
}

function safeJsonArray<T = string>(raw: string | null | undefined): T[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeContactText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function nameTokens(name: string): string[] {
  return normalizeContactText(name).split(/\s+/).filter((token) => token.length > 2);
}

function profileMatchesFounder(value: string | null, name: string, kind: "linkedin" | "twitter"): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const parts = url.pathname.split("/").filter(Boolean);
    const validHost = kind === "linkedin"
      ? host === "linkedin.com" && parts[0]?.toLowerCase() === "in"
      : ["x.com", "twitter.com"].includes(host);
    if (!validHost || !parts[1]) return false;
    const handle = normalizeContactText(parts[1]).replace(/\s/g, "");
    const tokens = nameTokens(name);
    return tokens.length > 0 && tokens.every((token) => handle.includes(token));
  } catch {
    return false;
  }
}

function emailMatchesFounder(value: string | null, name: string, companyDomain: string): boolean {
  if (!value) return false;
  const match = value.trim().match(/^([^@\s]+)@([^@\s]+)$/);
  if (!match) return false;
  const emailDomain = match[2].toLowerCase().replace(/^www\./, "");
  const normalizedCompanyDomain = companyDomain.toLowerCase().replace(/^www\./, "");
  if (
    emailDomain !== normalizedCompanyDomain &&
    !emailDomain.endsWith(`.${normalizedCompanyDomain}`)
  ) return false;
  const local = normalizeContactText(match[1]).replace(/\s/g, "");
  const genericAliases = new Set([
    "hello", "info", "contact", "team", "support", "sales", "jobs",
    "careers", "press", "privacy", "legal", "admin", "billing", "office",
    "recruiting", "noreply", "no-reply",
  ]);
  if (genericAliases.has(local)) return false;
  const tokens = nameTokens(name);
  return tokens.length > 0 && tokens.every((token) => local.includes(token));
}

export function mapCompanyRow(row: RawCompanyRow, jobs?: JobPosting[]): Company {
  const sources = safeJsonArray<CompanySource>(row.sources_json);
  // HN comments identify the person posting a hiring ad, not necessarily the
  // founder. Do not expose that author as a founder contact.
  const authorBasedSources: CompanySource[] = ["hn_hiring", "producthunt", "indie"];
  const contactName = sources.some((source) => authorBasedSources.includes(source))
    ? null
    : row.founder_name;
  const founderEmail = contactName && emailMatchesFounder(row.founder_email, contactName, row.domain)
    ? row.founder_email
    : null;
  const founderLinkedin = contactName && profileMatchesFounder(row.founder_linkedin, contactName, "linkedin")
    ? row.founder_linkedin
    : null;
  const founderTwitter = contactName && profileMatchesFounder(row.founder_twitter, contactName, "twitter")
    ? row.founder_twitter
    : null;
  return {
    id: row.id,
    domain: row.domain,
    name: row.name,
    source: row.source,
    sources: sources.length > 0 ? sources : [row.source],
    batch: row.batch,
    description: row.description,
    one_liner: row.one_liner,
    website: row.website,
    yc_url: row.yc_url,
    logo_url: row.logo_url,
    location: row.location,
    team_size: row.team_size,
    is_remote: Boolean(row.is_remote),
    last_funding_date: row.last_funding_date,
    funding_amount: row.funding_amount,
    is_funded_last_12mo: Boolean(row.is_funded_last_12mo),
    hiring_page_url: row.hiring_page_url,
    hiring_provider: row.hiring_provider,
    open_roles_count: row.open_roles_count || 0,
    tags: safeJsonArray<string>(row.tags_json),
    tech_stack: safeJsonArray<string>(row.tech_stack_json),
    founder_name: contactName,
    founder_twitter: founderTwitter,
    founder_linkedin: founderLinkedin,
    founder_email: founderEmail,
    company_linkedin_url: row.company_linkedin_url ?? null,
    company_email: row.company_email ?? null,
    contact_checked_at: row.contact_checked_at ?? null,
    follow_up_at: row.follow_up_at ?? null,
    launch_date: row.launch_date ?? null,
    launch_source: row.launch_source ?? null,
    launch_url: row.launch_url ?? null,
    trustmrr_mrr: row.trustmrr_mrr ?? null,
    trustmrr_last30: row.trustmrr_last30 ?? null,
    trustmrr_total: row.trustmrr_total ?? null,
    sniper_score: row.sniper_score || 50,
    outreach_status: row.outreach_status || "new",
    outreach_notes: row.outreach_notes || "",
    pitched_at: row.pitched_at,
    enriched_at: row.enriched_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    ...(jobs ? { jobs } : {}),
  };
}

function preferProvider(
  a: HiringProvider | undefined,
  b: HiringProvider | undefined
): HiringProvider {
  const rank: Record<string, number> = {
    greenhouse: 6,
    lever: 6,
    ashby: 6,
    workable: 5,
    breezy: 4,
    recruitee: 4,
    dover: 4,
    yc: 3,
    other: 2,
  };
  const scoreA = a ? rank[a] || 1 : 0;
  const scoreB = b ? rank[b] || 1 : 0;
  return scoreA >= scoreB ? a ?? null : b ?? null;
}

export async function deduplicateAndUpsertCompanies(
  env: WorkerEnv,
  rawInputs: NormalizedCompanyInput[]
): Promise<{ upsertedCount: number; jobsUpsertedCount: number }> {
  await ensureSchema(env.DB);
  const nowIso = new Date().toISOString();

  // Group and smart-merge across sources by normalized domain
  const mergedByDomain = new Map<
    string,
    NormalizedCompanyInput & {
      domain: string;
      sourcesSet: Set<CompanySource>;
      mergedJobs: Map<string, Omit<JobPosting, "company_id">>;
    }
  >();

  for (const item of rawInputs) {
    if (!item.name || !item.website) continue;
    const cleanedWebsite = cleanWebsiteUrl(item.website);
    if (!cleanedWebsite) continue;

    const domain = normalizeDomain(cleanedWebsite, item.name);
    const companyId = makeCompanyId(domain);
    const existing = mergedByDomain.get(domain);

    if (!existing) {
      const jobsMap = new Map<string, Omit<JobPosting, "company_id">>();
      for (const j of item.jobs || []) {
        const jId = makeJobId(companyId, j.title, j.url);
        jobsMap.set(jId, { ...j, id: jId });
      }
      mergedByDomain.set(domain, {
        ...item,
        id: companyId,
        website: cleanedWebsite,
        domain,
        sourcesSet: new Set([item.source]),
        mergedJobs: jobsMap,
      });
    } else {
      existing.sourcesSet.add(item.source);
      if (item.source === "yc") existing.source = "yc";
      existing.batch = existing.batch || item.batch || null;
      if (
        item.description &&
        item.description.length > (existing.description?.length || 0)
      ) {
        existing.description = item.description;
      }
      existing.one_liner = existing.one_liner || item.one_liner || "";
      existing.yc_url = existing.yc_url || item.yc_url || null;
      existing.logo_url = existing.logo_url || item.logo_url || null;
      existing.location = existing.location || item.location || null;
      existing.team_size = existing.team_size ?? item.team_size ?? null;
      existing.is_remote = Boolean(existing.is_remote || item.is_remote);
      existing.last_funding_date =
        item.last_funding_date &&
        (!existing.last_funding_date ||
          item.last_funding_date > existing.last_funding_date)
          ? item.last_funding_date
          : existing.last_funding_date;
      existing.funding_amount =
        (item.funding_amount &&
        !item.funding_amount.includes("YC Standard")
          ? item.funding_amount
          : existing.funding_amount || item.funding_amount) || null;
      existing.is_funded_last_12mo = Boolean(
        existing.is_funded_last_12mo || item.is_funded_last_12mo
      );

      const bestProv = preferProvider(
        existing.hiring_provider,
        item.hiring_provider
      );
      if (bestProv === item.hiring_provider && item.hiring_page_url) {
        existing.hiring_page_url = item.hiring_page_url;
      } else {
        existing.hiring_page_url =
          existing.hiring_page_url || item.hiring_page_url || null;
      }
      existing.hiring_provider = bestProv;

      existing.founder_name =
        existing.founder_name || item.founder_name || null;
      existing.founder_twitter =
        existing.founder_twitter || item.founder_twitter || null;
      existing.founder_linkedin =
        existing.founder_linkedin || item.founder_linkedin || null;
      existing.founder_email =
        existing.founder_email || item.founder_email || null;
      existing.company_linkedin_url =
        existing.company_linkedin_url || item.company_linkedin_url || null;
      existing.company_email =
        existing.company_email || item.company_email || null;
      existing.contact_checked_at =
        existing.contact_checked_at || item.contact_checked_at || null;
      if (item.launch_date && (!existing.launch_date || item.launch_date > existing.launch_date)) {
        existing.launch_date = item.launch_date;
        existing.launch_source = item.launch_source || null;
        existing.launch_url = item.launch_url || null;
      }
      existing.trustmrr_mrr = item.trustmrr_mrr ?? existing.trustmrr_mrr ?? null;
      existing.trustmrr_last30 = item.trustmrr_last30 ?? existing.trustmrr_last30 ?? null;
      existing.trustmrr_total = item.trustmrr_total ?? existing.trustmrr_total ?? null;

      existing.tags = Array.from(
        new Set([...(existing.tags || []), ...(item.tags || [])])
      ).slice(0, 8);
      existing.tech_stack = Array.from(
        new Set([...(existing.tech_stack || []), ...(item.tech_stack || [])])
      ).slice(0, 8);

      for (const j of item.jobs || []) {
        const jId = makeJobId(companyId, j.title, j.url);
        existing.mergedJobs.set(jId, { ...j, id: jId });
      }
    }
  }

  const statements: D1PreparedStatement[] = [];
  const companyStatementIndexes = new Set<number>();
  let upsertedCount = 0;
  let jobsUpsertedCount = 0;

  for (const [, record] of mergedByDomain) {
    const companyId = record.id!;
    const jobsList = Array.from(record.mergedJobs.values());
    const openRoles = Math.max(record.open_roles_count || 0, jobsList.length);
    const funded12mo = Boolean(
      record.is_funded_last_12mo || isDateWithinDays(record.last_funding_date, 365)
    );

    const sourcesArr = Array.from(record.sourcesSet);
    const { score } = computeSniperScore({
      batch: record.batch,
      last_funding_date: record.last_funding_date,
      funding_amount: record.funding_amount,
      is_funded_last_12mo: funded12mo,
      team_size: record.team_size,
      open_roles_count: openRoles,
      hiring_provider: record.hiring_provider ?? null,
      is_remote: record.is_remote,
      founder_name: record.founder_name,
      founder_twitter: record.founder_twitter,
      founder_linkedin: record.founder_linkedin,
      founder_email: record.founder_email,
      sources: sourcesArr,
    });

    companyStatementIndexes.add(statements.length);
    statements.push(
      env.DB.prepare(
        `INSERT INTO companies (
          id, domain, name, source, sources_json, batch, description, one_liner,
          website, yc_url, logo_url, location, team_size, is_remote,
          last_funding_date, funding_amount, is_funded_last_12mo,
          hiring_page_url, hiring_provider, open_roles_count,
          tags_json, tech_stack_json,
          founder_name, founder_twitter, founder_linkedin, founder_email,
          company_linkedin_url, company_email, contact_checked_at,
          launch_date, launch_source, launch_url,
          trustmrr_mrr, trustmrr_last30, trustmrr_total,
          sniper_score, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        )
        ON CONFLICT(domain) DO UPDATE SET
          name = excluded.name,
          source = CASE WHEN companies.source = 'yc' THEN 'yc' ELSE excluded.source END,
          sources_json = excluded.sources_json,
          batch = COALESCE(excluded.batch, companies.batch),
          description = CASE WHEN length(excluded.description) >= length(companies.description) THEN excluded.description ELSE companies.description END,
          one_liner = CASE WHEN excluded.one_liner != '' THEN excluded.one_liner ELSE companies.one_liner END,
          website = excluded.website,
          yc_url = COALESCE(excluded.yc_url, companies.yc_url),
          logo_url = COALESCE(excluded.logo_url, companies.logo_url),
          location = COALESCE(excluded.location, companies.location),
          team_size = COALESCE(excluded.team_size, companies.team_size),
          is_remote = MAX(companies.is_remote, excluded.is_remote),
          last_funding_date = COALESCE(excluded.last_funding_date, companies.last_funding_date),
          funding_amount = COALESCE(excluded.funding_amount, companies.funding_amount),
          is_funded_last_12mo = excluded.is_funded_last_12mo,
          hiring_page_url = COALESCE(excluded.hiring_page_url, companies.hiring_page_url),
          hiring_provider = COALESCE(excluded.hiring_provider, companies.hiring_provider),
          open_roles_count = MAX(companies.open_roles_count, excluded.open_roles_count),
          tags_json = CASE WHEN excluded.tags_json != '[]' THEN excluded.tags_json ELSE companies.tags_json END,
          tech_stack_json = CASE WHEN excluded.tech_stack_json != '[]' THEN excluded.tech_stack_json ELSE companies.tech_stack_json END,
          founder_name = COALESCE(excluded.founder_name, companies.founder_name),
          founder_twitter = COALESCE(excluded.founder_twitter, companies.founder_twitter),
          founder_linkedin = COALESCE(excluded.founder_linkedin, companies.founder_linkedin),
          founder_email = COALESCE(excluded.founder_email, companies.founder_email),
          company_linkedin_url = CASE WHEN companies.website IS NOT excluded.website THEN excluded.company_linkedin_url ELSE COALESCE(excluded.company_linkedin_url, companies.company_linkedin_url) END,
          company_email = CASE WHEN companies.website IS NOT excluded.website THEN excluded.company_email ELSE COALESCE(excluded.company_email, companies.company_email) END,
          contact_checked_at = CASE WHEN companies.website IS NOT excluded.website THEN excluded.contact_checked_at ELSE COALESCE(excluded.contact_checked_at, companies.contact_checked_at) END,
          launch_date = CASE WHEN excluded.launch_date IS NOT NULL AND (companies.launch_date IS NULL OR excluded.launch_date >= companies.launch_date) THEN excluded.launch_date ELSE companies.launch_date END,
          launch_source = CASE WHEN excluded.launch_date IS NOT NULL AND (companies.launch_date IS NULL OR excluded.launch_date >= companies.launch_date) THEN excluded.launch_source ELSE companies.launch_source END,
          launch_url = CASE WHEN excluded.launch_date IS NOT NULL AND (companies.launch_date IS NULL OR excluded.launch_date >= companies.launch_date) THEN excluded.launch_url ELSE companies.launch_url END,
          trustmrr_mrr = COALESCE(excluded.trustmrr_mrr, companies.trustmrr_mrr),
          trustmrr_last30 = COALESCE(excluded.trustmrr_last30, companies.trustmrr_last30),
          trustmrr_total = COALESCE(excluded.trustmrr_total, companies.trustmrr_total),
          sniper_score = MAX(companies.sniper_score, excluded.sniper_score),
          updated_at = excluded.updated_at
        WHERE companies.name IS NOT excluded.name
          OR companies.source IS NOT (CASE WHEN companies.source = 'yc' THEN 'yc' ELSE excluded.source END)
          OR companies.sources_json IS NOT excluded.sources_json
          OR companies.batch IS NOT COALESCE(excluded.batch, companies.batch)
          OR companies.description IS NOT (CASE WHEN length(excluded.description) >= length(companies.description) THEN excluded.description ELSE companies.description END)
          OR companies.one_liner IS NOT (CASE WHEN excluded.one_liner != '' THEN excluded.one_liner ELSE companies.one_liner END)
          OR companies.website IS NOT excluded.website
          OR companies.yc_url IS NOT COALESCE(excluded.yc_url, companies.yc_url)
          OR companies.logo_url IS NOT COALESCE(excluded.logo_url, companies.logo_url)
          OR companies.location IS NOT COALESCE(excluded.location, companies.location)
          OR companies.team_size IS NOT COALESCE(excluded.team_size, companies.team_size)
          OR companies.is_remote IS NOT MAX(companies.is_remote, excluded.is_remote)
          OR companies.last_funding_date IS NOT COALESCE(excluded.last_funding_date, companies.last_funding_date)
          OR companies.funding_amount IS NOT COALESCE(excluded.funding_amount, companies.funding_amount)
          OR companies.is_funded_last_12mo IS NOT excluded.is_funded_last_12mo
          OR companies.hiring_page_url IS NOT COALESCE(excluded.hiring_page_url, companies.hiring_page_url)
          OR companies.hiring_provider IS NOT COALESCE(excluded.hiring_provider, companies.hiring_provider)
          OR companies.open_roles_count IS NOT MAX(companies.open_roles_count, excluded.open_roles_count)
          OR companies.tags_json IS NOT (CASE WHEN excluded.tags_json != '[]' THEN excluded.tags_json ELSE companies.tags_json END)
          OR companies.tech_stack_json IS NOT (CASE WHEN excluded.tech_stack_json != '[]' THEN excluded.tech_stack_json ELSE companies.tech_stack_json END)
          OR companies.founder_name IS NOT COALESCE(excluded.founder_name, companies.founder_name)
          OR companies.founder_twitter IS NOT COALESCE(excluded.founder_twitter, companies.founder_twitter)
          OR companies.founder_linkedin IS NOT COALESCE(excluded.founder_linkedin, companies.founder_linkedin)
          OR companies.founder_email IS NOT COALESCE(excluded.founder_email, companies.founder_email)
          OR companies.company_linkedin_url IS NOT (CASE WHEN companies.website IS NOT excluded.website THEN excluded.company_linkedin_url ELSE COALESCE(excluded.company_linkedin_url, companies.company_linkedin_url) END)
          OR companies.company_email IS NOT (CASE WHEN companies.website IS NOT excluded.website THEN excluded.company_email ELSE COALESCE(excluded.company_email, companies.company_email) END)
          OR companies.contact_checked_at IS NOT (CASE WHEN companies.website IS NOT excluded.website THEN excluded.contact_checked_at ELSE COALESCE(excluded.contact_checked_at, companies.contact_checked_at) END)
          OR companies.launch_date IS NOT (CASE WHEN excluded.launch_date IS NOT NULL AND (companies.launch_date IS NULL OR excluded.launch_date >= companies.launch_date) THEN excluded.launch_date ELSE companies.launch_date END)
          OR companies.launch_source IS NOT (CASE WHEN excluded.launch_date IS NOT NULL AND (companies.launch_date IS NULL OR excluded.launch_date >= companies.launch_date) THEN excluded.launch_source ELSE companies.launch_source END)
          OR companies.launch_url IS NOT (CASE WHEN excluded.launch_date IS NOT NULL AND (companies.launch_date IS NULL OR excluded.launch_date >= companies.launch_date) THEN excluded.launch_url ELSE companies.launch_url END)
          OR companies.trustmrr_mrr IS NOT COALESCE(excluded.trustmrr_mrr, companies.trustmrr_mrr)
          OR companies.trustmrr_last30 IS NOT COALESCE(excluded.trustmrr_last30, companies.trustmrr_last30)
          OR companies.trustmrr_total IS NOT COALESCE(excluded.trustmrr_total, companies.trustmrr_total)
          OR companies.sniper_score IS NOT MAX(companies.sniper_score, excluded.sniper_score)`
      ).bind(
        companyId,
        record.domain,
        record.name,
        record.source,
        JSON.stringify(sourcesArr),
        record.batch ?? null,
        record.description,
        record.one_liner || "",
        record.website,
        record.yc_url ?? null,
        record.logo_url ?? null,
        record.location ?? null,
        record.team_size ?? null,
        record.is_remote ? 1 : 0,
        record.last_funding_date ?? null,
        record.funding_amount ?? null,
        funded12mo ? 1 : 0,
        record.hiring_page_url ?? null,
        record.hiring_provider ?? null,
        openRoles,
        JSON.stringify(record.tags || []),
        JSON.stringify(record.tech_stack || []),
        record.founder_name ?? null,
        record.founder_twitter ?? null,
        record.founder_linkedin ?? null,
        record.founder_email ?? null,
        record.company_linkedin_url ?? null,
        record.company_email ?? null,
        record.contact_checked_at ?? null,
        record.launch_date ?? null,
        record.launch_source ?? null,
        record.launch_url ?? null,
        record.trustmrr_mrr ?? null,
        record.trustmrr_last30 ?? null,
        record.trustmrr_total ?? null,
        score,
        nowIso,
        nowIso
      )
    );

    for (const job of jobsList) {
      statements.push(
        env.DB.prepare(
          `INSERT INTO jobs (id, company_id, title, url, location, remote, department, description, posted_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             title = excluded.title,
             url = excluded.url,
             location = COALESCE(excluded.location, jobs.location),
             remote = MAX(jobs.remote, excluded.remote),
             department = COALESCE(excluded.department, jobs.department),
             description = COALESCE(excluded.description, jobs.description),
             posted_at = COALESCE(excluded.posted_at, jobs.posted_at)
           WHERE jobs.title IS NOT excluded.title
             OR jobs.url IS NOT excluded.url
             OR jobs.location IS NOT COALESCE(excluded.location, jobs.location)
             OR jobs.remote IS NOT MAX(jobs.remote, excluded.remote)
             OR jobs.department IS NOT COALESCE(excluded.department, jobs.department)
             OR jobs.description IS NOT COALESCE(excluded.description, jobs.description)
             OR jobs.posted_at IS NOT COALESCE(excluded.posted_at, jobs.posted_at)`
        ).bind(
          job.id,
          companyId,
          job.title,
          job.url,
          job.location ?? null,
          job.remote ? 1 : 0,
          job.department ?? null,
          job.description ?? null,
          job.posted_at ?? null,
          nowIso
        )
      );
    }
  }

  // Execute in safe D1 chunks of 80 statements per batch and count actual row
  // changes (not the number of upsert attempts) for truthful quota reporting.
  const CHUNK = 80;
  for (let i = 0; i < statements.length; i += CHUNK) {
    const results = await env.DB.batch(statements.slice(i, i + CHUNK));
    results.forEach((result, offset) => {
      const changedRows = Number(result.meta?.changes || 0);
      if (companyStatementIndexes.has(i + offset)) upsertedCount += changedRows;
      else jobsUpsertedCount += changedRows;
    });
  }

  // Daily rolling aging sweep: automatically sunset `is_funded_last_12mo` when older than 380 days
  const cutoffIso = new Date(
    Date.now() - 380 * 24 * 60 * 60 * 1000
  )
    .toISOString()
    .slice(0, 10);
  await env.DB.prepare(
    `UPDATE companies
     SET is_funded_last_12mo = 0
     WHERE last_funding_date IS NOT NULL
       AND last_funding_date < ?
       AND is_funded_last_12mo != 0
       AND COALESCE(batch, '') NOT IN ('W25', 'S25')`
  )
    .bind(cutoffIso)
    .run();

  return {
    upsertedCount,
    jobsUpsertedCount,
  };
}

export interface CompanyQueryFilters {
  source?: string;
  batch?: string;
  ats?: string;
  pipeline?: string;
  remote?: boolean;
  hiring?: boolean;
  funded12mo?: boolean;
  fresh14d?: boolean;
  launchOnly?: boolean;
  launchWindow?: string;
  earningOnly?: boolean;
  smallTeam?: boolean;
  search?: string;
  sort?: string;
  page?: number;
  limit?: number;
}

export async function queryCompanies(
  env: WorkerEnv,
  filters: CompanyQueryFilters
): Promise<{
  companies: Company[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}> {
  await ensureSchema(env.DB);
  const where: string[] = [];
  const params: unknown[] = [];

  if (filters.source && filters.source !== "all") {
    where.push("(source = ? OR sources_json LIKE ?)");
    params.push(filters.source, `%"${filters.source}"%`);
  }

  if (filters.batch && filters.batch !== "all") {
    where.push("batch = ?");
    params.push(filters.batch);
  }

  if (filters.ats && filters.ats !== "all") {
    where.push("hiring_provider = ?");
    params.push(filters.ats);
  }

  if (filters.funded12mo) {
    where.push("is_funded_last_12mo = 1");
  }

  if (filters.fresh14d) {
    const cutoff14d = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    where.push("(last_funding_date IS NOT NULL AND last_funding_date >= ?)");
    params.push(cutoff14d);
  }

  if (filters.launchOnly) {
    where.push("launch_date IS NOT NULL");
  }

  if (filters.launchOnly && filters.launchWindow && filters.launchWindow !== "all") {
    const daysByWindow: Record<string, number> = { "1d": 1, "7d": 7, "30d": 30, "365d": 365 };
    const days = daysByWindow[filters.launchWindow];
    if (days) {
      where.push("launch_date >= ?");
      params.push(new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString());
    }
  }

  if (filters.earningOnly) {
    where.push("(COALESCE(trustmrr_mrr, 0) > 0 OR COALESCE(trustmrr_last30, 0) > 0 OR COALESCE(trustmrr_total, 0) > 0)");
  }

  if (filters.remote) {
    where.push("is_remote = 1");
  }

  if (filters.hiring) {
    where.push("(open_roles_count > 0 OR hiring_page_url IS NOT NULL)");
  }

  if (filters.smallTeam) {
    where.push("(team_size IS NOT NULL AND team_size >= 1 AND team_size <= 15)");
  }

  if (filters.pipeline && filters.pipeline !== "all") {
    if (filters.pipeline === "followup_due") {
      const threeDaysAgo = new Date(
        Date.now() - 3 * 24 * 60 * 60 * 1000
      ).toISOString();
      where.push(
        "(outreach_status IN ('pitched', 'demo_sent') AND pitched_at IS NOT NULL AND pitched_at <= ?)"
      );
      params.push(threeDaysAgo);
    } else {
      where.push("outreach_status = ?");
      params.push(filters.pipeline);
    }
  } else {
    // Hide archived leads by default unless explicitly viewing archived tab
    where.push("outreach_status != 'archived'");
  }

  if (filters.search && filters.search.trim()) {
    const q = `%${filters.search.trim()}%`;
    where.push(
      `(name LIKE ? OR description LIKE ? OR one_liner LIKE ? OR domain LIKE ? OR tags_json LIKE ? OR location LIKE ? OR founder_name LIKE ? OR EXISTS (SELECT 1 FROM jobs j WHERE j.company_id = companies.id AND j.title LIKE ?))`
    );
    params.push(q, q, q, q, q, q, q, q);
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

  let orderSql = filters.launchOnly
    ? "ORDER BY launch_date DESC, COALESCE(trustmrr_last30, 0) DESC, COALESCE(trustmrr_mrr, 0) DESC"
    : "ORDER BY sniper_score DESC, COALESCE(last_funding_date, '2000-01-01') DESC, open_roles_count DESC";
  if (!filters.launchOnly && filters.sort === "newest") {
    orderSql =
      "ORDER BY COALESCE(last_funding_date, '2000-01-01') DESC, sniper_score DESC";
  } else if (!filters.launchOnly && filters.sort === "roles") {
    orderSql = "ORDER BY open_roles_count DESC, sniper_score DESC";
  } else if (!filters.launchOnly && filters.sort === "smallest_team") {
    orderSql =
      "ORDER BY CASE WHEN team_size IS NULL OR team_size = 0 THEN 9999 ELSE team_size END ASC, sniper_score DESC";
  }

  const page = Math.max(1, filters.page || 1);
  const limit = Math.min(120, Math.max(12, filters.limit || 48));
  const offset = (page - 1) * limit;

  const countRow = await env.DB.prepare(
    `SELECT COUNT(*) AS cnt FROM companies ${whereSql}`
  )
    .bind(...params)
    .first<{ cnt: number }>();

  const total = Number(countRow?.cnt || 0);

  const listRes = await env.DB.prepare(
    `SELECT * FROM companies ${whereSql} ${orderSql} LIMIT ? OFFSET ?`
  )
    .bind(...params, limit, offset)
    .all<RawCompanyRow>();

  const rows = listRes.results || [];
  const companyIds = rows.map((r) => r.id);
  const jobsByCompany = new Map<string, JobPosting[]>();

  if (companyIds.length > 0) {
    const placeholders = companyIds.map(() => "?").join(",");
    const jobsRes = await env.DB.prepare(
      `SELECT id, company_id, title, url, location, remote, department, posted_at
       FROM jobs WHERE company_id IN (${placeholders})`
    )
      .bind(...companyIds)
      .all<{
        id: string;
        company_id: string;
        title: string;
        url: string;
        location: string | null;
        remote: number;
        department: string | null;
        posted_at: string | null;
      }>();

    for (const jr of jobsRes.results || []) {
      const list = jobsByCompany.get(jr.company_id) || [];
      list.push({
        id: jr.id,
        company_id: jr.company_id,
        title: jr.title,
        url: jr.url,
        location: jr.location,
        remote: Boolean(jr.remote),
        department: jr.department,
        posted_at: jr.posted_at,
      });
      jobsByCompany.set(jr.company_id, list);
    }
  }

  const companies = rows.map((r) =>
    mapCompanyRow(r, jobsByCompany.get(r.id) || [])
  );

  return {
    companies,
    total,
    page,
    limit,
    hasMore: offset + companies.length < total,
  };
}

export async function getCompanyById(
  env: WorkerEnv,
  id: string
): Promise<Company | null> {
  await ensureSchema(env.DB);
  const row = await env.DB.prepare("SELECT * FROM companies WHERE id = ?")
    .bind(id)
    .first<RawCompanyRow>();
  if (!row) return null;

  const jobsRes = await env.DB.prepare(
    `SELECT id, company_id, title, url, location, remote, department, description, posted_at
     FROM jobs WHERE company_id = ? ORDER BY remote DESC, title ASC`
  )
    .bind(id)
    .all<{
      id: string;
      company_id: string;
      title: string;
      url: string;
      location: string | null;
      remote: number;
      department: string | null;
      description: string | null;
      posted_at: string | null;
    }>();

  const jobs: JobPosting[] = (jobsRes.results || []).map((jr) => ({
    id: jr.id,
    company_id: jr.company_id,
    title: jr.title,
    url: jr.url,
    location: jr.location,
    remote: Boolean(jr.remote),
    department: jr.department,
    description: jr.description,
    posted_at: jr.posted_at,
  }));

  return mapCompanyRow(row, jobs);
}

export async function updateCompanyOutreach(
  env: WorkerEnv,
  id: string,
  patch: {
    outreach_status?: OutreachStatus;
    outreach_notes?: string;
  }
): Promise<Company | null> {
  await ensureSchema(env.DB);
  const current = await getCompanyById(env, id);
  if (!current) return null;

  const nextStatus = patch.outreach_status ?? current.outreach_status;
  const nextNotes = patch.outreach_notes ?? current.outreach_notes;
  const nowIso = new Date().toISOString();

  let pitchedAt = current.pitched_at;
  if (
    (nextStatus === "pitched" || nextStatus === "demo_sent") &&
    !pitchedAt
  ) {
    pitchedAt = nowIso;
  } else if (nextStatus === "new" || nextStatus === "saved") {
    pitchedAt = null;
  }

  if (
    nextStatus === current.outreach_status &&
    nextNotes === current.outreach_notes &&
    pitchedAt === current.pitched_at
  ) {
    return current;
  }

  await env.DB.prepare(
    `UPDATE companies
     SET outreach_status = ?, outreach_notes = ?, pitched_at = ?, updated_at = ?
     WHERE id = ?`
  )
    .bind(nextStatus, nextNotes, pitchedAt, nowIso, id)
    .run();

  return getCompanyById(env, id);
}

export async function getDashboardStats(
  env: WorkerEnv
): Promise<DashboardStats> {
  await ensureSchema(env.DB);

  const totals = await env.DB.prepare(
    `SELECT
      COUNT(*) AS totalCompanies,
      SUM(CASE WHEN is_funded_last_12mo = 1 THEN 1 ELSE 0 END) AS fundedLast12Mo,
      SUM(CASE WHEN open_roles_count > 0 OR hiring_page_url IS NOT NULL THEN 1 ELSE 0 END) AS hiringNow,
      SUM(CASE WHEN is_remote = 1 THEN 1 ELSE 0 END) AS remoteCompanies,
      SUM(CASE WHEN sniper_score >= 80 THEN 1 ELSE 0 END) AS hotLeadsCount,
      SUM(COALESCE(open_roles_count, 0)) AS totalOpenRoles
     FROM companies
     WHERE outreach_status != 'archived'`
  ).first<{
    totalCompanies: number;
    fundedLast12Mo: number;
    hiringNow: number;
    remoteCompanies: number;
    hotLeadsCount: number;
    totalOpenRoles: number;
  }>();

  const statusRows = await env.DB.prepare(
    "SELECT outreach_status, COUNT(*) AS cnt FROM companies GROUP BY outreach_status"
  ).all<{ outreach_status: OutreachStatus; cnt: number }>();

  const pipelineCounts: Record<OutreachStatus, number> = {
    new: 0,
    saved: 0,
    pitched: 0,
    demo_sent: 0,
    replied: 0,
    applied: 0,
    archived: 0,
  };
  for (const r of statusRows.results || []) {
    if (r.outreach_status in pipelineCounts) {
      pipelineCounts[r.outreach_status] = Number(r.cnt);
    }
  }

  const threeDaysAgo = new Date(
    Date.now() - 3 * 24 * 60 * 60 * 1000
  ).toISOString();
  const followUpRow = await env.DB.prepare(
    `SELECT COUNT(*) AS cnt FROM companies
     WHERE outreach_status IN ('pitched', 'demo_sent')
       AND pitched_at IS NOT NULL AND pitched_at <= ?`
  )
    .bind(threeDaysAgo)
    .first<{ cnt: number }>();

  const sourceRows = await env.DB.prepare(
    `SELECT source_json.value AS source, COUNT(DISTINCT companies.id) AS cnt
     FROM companies,
          json_each(
            CASE
              WHEN json_valid(companies.sources_json) THEN
                CASE
                  WHEN json_array_length(companies.sources_json) > 0 THEN companies.sources_json
                  ELSE json_array(companies.source)
                END
              ELSE json_array(companies.source)
            END
          ) AS source_json
     WHERE companies.outreach_status != 'archived'
     GROUP BY source_json.value`
  ).all<{ source: string; cnt: number }>();
  const bySource: Record<string, number> = {};
  for (const r of sourceRows.results || []) {
    bySource[r.source] = Number(r.cnt);
  }

  const batchRows = await env.DB.prepare(
    "SELECT batch, COUNT(*) AS cnt FROM companies WHERE batch IS NOT NULL AND outreach_status != 'archived' GROUP BY batch"
  ).all<{ batch: string; cnt: number }>();
  const byBatch: Record<string, number> = {};
  for (const r of batchRows.results || []) {
    byBatch[r.batch] = Number(r.cnt);
  }

  const provRows = await env.DB.prepare(
    "SELECT hiring_provider, COUNT(*) AS cnt FROM companies WHERE hiring_provider IS NOT NULL AND outreach_status != 'archived' GROUP BY hiring_provider"
  ).all<{ hiring_provider: string; cnt: number }>();
  const byProvider: Record<string, number> = {};
  for (const r of provRows.results || []) {
    byProvider[r.hiring_provider] = Number(r.cnt);
  }

  const lastRun = await env.DB.prepare(
    "SELECT completed_at, sources_report_json FROM sync_runs ORDER BY completed_at DESC LIMIT 1"
  ).first<{ completed_at: string; sources_report_json: string }>();

  return {
    totalCompanies: Number(totals?.totalCompanies || 0),
    fundedLast12Mo: Number(totals?.fundedLast12Mo || 0),
    hiringNow: Number(totals?.hiringNow || 0),
    remoteCompanies: Number(totals?.remoteCompanies || 0),
    hotLeadsCount: Number(totals?.hotLeadsCount || 0),
    totalOpenRoles: Number(totals?.totalOpenRoles || 0),
    pipelineCounts,
    followUpDueCount: Number(followUpRow?.cnt || 0),
    bySource,
    byBatch,
    byProvider,
    lastSyncedAt: lastRun?.completed_at || null,
    lastSyncSummary: safeJsonArray<SyncSourceSummary>(
      lastRun?.sources_report_json
    ),
  };
}

export async function recordSyncRun(
  env: WorkerEnv,
  run: {
    mode: string;
    startedAt: string;
    completedAt: string;
    durationMs: number;
    totalFetched: number;
    totalUpserted: number;
    enrichedCount: number;
    sourcesReport: SyncSourceSummary[];
  }
): Promise<void> {
  await ensureSchema(env.DB);
  const id = `sync_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  await env.DB.prepare(
    `INSERT INTO sync_runs (
      id, mode, started_at, completed_at, duration_ms,
      total_fetched, total_upserted, enriched_count, sources_report_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      run.mode,
      run.startedAt,
      run.completedAt,
      run.durationMs,
      run.totalFetched,
      run.totalUpserted,
      run.enrichedCount,
      JSON.stringify(run.sourcesReport)
    )
    .run();

  if (env.CACHE) {
    try {
      await env.CACHE.put("last_sync_at", run.completedAt, {
        expirationTtl: 86400 * 7,
      });
    } catch {
      // Optional KV mirror ignore
    }
  }
}
