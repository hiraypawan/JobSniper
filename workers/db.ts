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

export function mapCompanyRow(row: RawCompanyRow, jobs?: JobPosting[]): Company {
  const sources = safeJsonArray<CompanySource>(row.sources_json);
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
    founder_name: row.founder_name,
    founder_twitter: row.founder_twitter,
    founder_linkedin: row.founder_linkedin,
    founder_email: row.founder_email,
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
  let jobsCount = 0;

  for (const [, record] of mergedByDomain) {
    const companyId = record.id!;
    const jobsList = Array.from(record.mergedJobs.values());
    const openRoles = Math.max(record.open_roles_count || 0, jobsList.length);
    const recentBatchSet = new Set([
      "F26",
      "S26",
      "X26",
      "W26",
      "F25",
      "S25",
      "X25",
      "W25",
    ]);
    const funded12mo = Boolean(
      record.is_funded_last_12mo ||
        (record.batch && recentBatchSet.has(record.batch)) ||
        isDateWithinDays(record.last_funding_date, 365)
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

    statements.push(
      env.DB.prepare(
        `INSERT INTO companies (
          id, domain, name, source, sources_json, batch, description, one_liner,
          website, yc_url, logo_url, location, team_size, is_remote,
          last_funding_date, funding_amount, is_funded_last_12mo,
          hiring_page_url, hiring_provider, open_roles_count,
          tags_json, tech_stack_json,
          founder_name, founder_twitter, founder_linkedin, founder_email,
          sniper_score, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?,
          ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?
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
          sniper_score = MAX(companies.sniper_score, excluded.sniper_score),
          updated_at = excluded.updated_at`
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
        score,
        nowIso,
        nowIso
      )
    );

    for (const job of jobsList) {
      jobsCount++;
      statements.push(
        env.DB.prepare(
          `INSERT INTO jobs (id, company_id, title, url, location, remote, department, posted_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             title = excluded.title,
             url = excluded.url,
             location = COALESCE(excluded.location, jobs.location),
             remote = MAX(jobs.remote, excluded.remote),
             department = COALESCE(excluded.department, jobs.department),
             posted_at = COALESCE(excluded.posted_at, jobs.posted_at)`
        ).bind(
          job.id,
          companyId,
          job.title,
          job.url,
          job.location ?? null,
          job.remote ? 1 : 0,
          job.department ?? null,
          job.posted_at ?? null,
          nowIso
        )
      );
    }
  }

  // Execute in safe D1 chunks of 80 statements per batch
  const CHUNK = 80;
  for (let i = 0; i < statements.length; i += CHUNK) {
    await env.DB.batch(statements.slice(i, i + CHUNK));
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
       AND COALESCE(batch, '') NOT IN ('W25', 'S25')`
  )
    .bind(cutoffIso)
    .run();

  return {
    upsertedCount: mergedByDomain.size,
    jobsUpsertedCount: jobsCount,
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

  let orderSql =
    "ORDER BY sniper_score DESC, COALESCE(last_funding_date, '2000-01-01') DESC, open_roles_count DESC";
  if (filters.sort === "newest") {
    orderSql =
      "ORDER BY COALESCE(last_funding_date, '2000-01-01') DESC, sniper_score DESC";
  } else if (filters.sort === "roles") {
    orderSql = "ORDER BY open_roles_count DESC, sniper_score DESC";
  } else if (filters.sort === "smallest_team") {
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
    `SELECT id, company_id, title, url, location, remote, department, posted_at
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
    "SELECT source, COUNT(*) AS cnt FROM companies WHERE outreach_status != 'archived' GROUP BY source"
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
